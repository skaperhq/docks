import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  createDocksPostgres,
  migrateDocksPostgres,
  __testing,
} from "./postgres-runtime.mjs"
import { docksUI } from "../dist/package/index.js"

async function main() {
  const migration = await readFile(
    new URL("../migrations/0001_initial.sql", import.meta.url),
    "utf8"
  )
  __testing.validateMigrationSql(migration, "0001_initial.sql")
  const folderMigration = await readFile(
    new URL("../migrations/0002_custom_request_folders.sql", import.meta.url),
    "utf8"
  )
  __testing.validateMigrationSql(
    folderMigration,
    "0002_custom_request_folders.sql"
  )
  assert.throws(
    () =>
      __testing.validateMigrationSql(
        "CREATE TABLE public.bad (id int);",
        "bad.sql"
      ),
    /outside skaper/
  )
  assert.throws(
    () =>
      __testing.validateMigrationSql("CREATE TABLE bad (id int);", "bad.sql"),
    /unqualified/
  )
  assert.throws(
    () =>
      __testing.validateMigrationSql("CREATE EXTENSION pgcrypto;", "bad.sql"),
    /database-wide/
  )
  assert.doesNotMatch(migration, /\bpublic\s*\./i)
  assert.doesNotMatch(migration, /\b(?:extension|grant|revoke|search_path)\b/i)
  for (const match of migration.matchAll(
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s(]+)/gi
  )) {
    assert.match(match[1], /^skaper\./)
  }
  for (const match of migration.matchAll(
    /CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s]+)\s+ON\s+([^\s(]+)/gi
  )) {
    assert.doesNotMatch(match[1], /\./)
    assert.match(match[2], /^skaper\./)
  }

  const dryRun = await migrateDocksPostgres({
    client: { query() {} },
    dryRun: true,
  })
  assert.deepEqual(dryRun.pending, [
    "0001_initial",
    "0002_custom_request_folders",
    "0003_agent_knowledge",
  ])
  assert.match(dryRun.sql, /CREATE SCHEMA IF NOT EXISTS skaper/)

  const pool = new AuthPool()
  const unsafeClient = {
    async unsafe(text, params) {
      return pool.query(text, params)
    },
  }
  const unsafePostgres = await createDocksPostgres({
    pool: unsafeClient,
    workspaceId: "test-workspace-unsafe",
    password: "correct horse battery staple",
  })
  assert.equal(unsafePostgres.__docksPostgres, true)

  const postgres = await createDocksPostgres({
    pool,
    workspaceId: "test-workspace",
    path: "/docs/_storage",
    password: "correct horse battery staple",
    sessionTtlMs: 60_000,
  })

  assert.throws(
    () =>
      docksUI({
        url: "/openapi.json",
        workspaceId: "test-workspace",
        database: 123,
      }),
    /database option/
  )

  const passwordlessPool = new AuthPool()
  const passwordless = await createDocksPostgres({
    pool: passwordlessPool,
    workspaceId: "passwordless-workspace",
    path: "/docs/_storage",
  })
  const endpoint = "http://docs.test/docs/_storage"
  const passwordlessSession = await passwordless.handler(
    storageRequest(endpoint, { action: "session" })
  )
  assert.equal(passwordlessSession.status, 200)
  assert.deepEqual(await passwordlessSession.json(), { authenticated: true })
  const sourceDocument = {
    openapi: "3.1.0",
    info: { title: "Knowledge", version: "1.0.0" },
    paths: {},
  }
  const firstSync = await passwordless.handler(
    storageRequest(endpoint, {
      action: "syncOpenApiSource",
      data: {
        url: "https://api.example/openapi.json",
        document: sourceDocument,
      },
    })
  )
  assert.equal(firstSync.status, 200)
  assert.equal((await firstSync.json()).changed, true)
  assert.equal(passwordlessPool.revision, 1)
  const secondSync = await passwordless.handler(
    storageRequest(endpoint, {
      action: "syncOpenApiSource",
      data: {
        url: "https://api.example/openapi.json",
        document: sourceDocument,
      },
    })
  )
  assert.equal((await secondSync.json()).changed, false)
  assert.equal(passwordlessPool.revision, 1)
  const crossOrigin = await postgres.handler(
    storageRequest(endpoint, { action: "session" }, "https://attacker.test")
  )
  assert.equal(crossOrigin.status, 403)

  const unauthenticated = await postgres.handler(
    storageRequest(endpoint, { action: "session" })
  )
  assert.equal(unauthenticated.status, 401)

  const wrongPassword = await postgres.handler(
    storageRequest(endpoint, { action: "login", password: "wrong" })
  )
  assert.equal(wrongPassword.status, 401)

  const login = await postgres.handler(
    storageRequest(endpoint, {
      action: "login",
      password: "correct horse battery staple",
    })
  )
  assert.equal(login.status, 200)
  const cookie = login.headers.get("set-cookie")
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  assert.doesNotMatch(cookie, /correct horse battery staple/)

  const queriesBeforeWorkspace = pool.queries.length
  const workspace = await postgres.handler(
    storageRequest(endpoint, { action: "getApiWorkspace" }, endpoint, cookie)
  )
  assert.equal(workspace.status, 200)
  assert.deepEqual(await workspace.json(), {
    savedResponses: [],
    collections: [],
    customRequests: [],
    responsePanelHeight: 360,
  })
  const workspaceQueries = pool.queries.slice(queriesBeforeWorkspace)
  assert.equal(workspaceQueries.length, 1)
  assert.doesNotMatch(workspaceQueries[0], /from skaper\.request_tabs/)
  assert.doesNotMatch(workspaceQueries[0], /request_snapshot|\bresult\b/)
  assert.equal(
    pool.queries.some((sql) =>
      sql.startsWith("delete from skaper.workspace_sessions where expires_at")
    ),
    false
  )

  const logout = await postgres.handler(
    storageRequest(endpoint, { action: "logout" }, endpoint, cookie)
  )
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/)

  await runOptionalIntegrationTest()
  console.log(
    "PostgreSQL isolation, authentication, and package wiring tests passed"
  )
}

function storageRequest(url, body, origin = url, cookie) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(origin).origin,
      ...(cookie ? { cookie: cookie.split(";", 1)[0] } : {}),
    },
    body: JSON.stringify(body),
  })
}

class AuthPool {
  credentials
  migrations = new Set()
  revision = 0
  sourceHash
  sessions = new Map()
  queries = []

  async query(text, values = []) {
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase()
    this.queries.push(sql)
    if (sql === "begin" || sql === "commit" || sql === "rollback") {
      return { rows: [], rowCount: 0 }
    }
    if (
      sql.startsWith("select pg_advisory_xact_lock") ||
      sql.startsWith("create schema if not exists skaper") ||
      sql.startsWith("create table if not exists skaper.schema_migrations") ||
      sql.startsWith("alter table skaper.")
    ) {
      return { rows: [], rowCount: 0 }
    }
    if (sql.startsWith("select version from skaper.schema_migrations")) {
      return {
        rows: this.migrations.has(values[0]) ? [{ version: values[0] }] : [],
      }
    }
    if (sql.startsWith("insert into skaper.schema_migrations")) {
      this.migrations.add(values[0])
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith("insert into skaper.workspaces")) {
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith("select document_hash from skaper.api_sources")) {
      return {
        rows: this.sourceHash ? [{ document_hash: this.sourceHash }] : [],
      }
    }
    if (sql.startsWith("insert into skaper.api_sources")) {
      this.sourceHash = values[2]
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith("update skaper.workspaces set revision")) {
      this.revision += 1
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith("select password_salt, password_hash")) {
      return { rows: this.credentials ? [this.credentials] : [] }
    }
    if (sql.startsWith("insert into skaper.workspace_credentials")) {
      this.credentials = { password_salt: values[1], password_hash: values[2] }
      this.passwordHash = values[2]
      return { rows: [], rowCount: 1 }
    }
    if (
      sql.startsWith(
        "delete from skaper.workspace_sessions where workspace_id = $1 and token_hash"
      )
    ) {
      this.sessions.delete(Buffer.from(values[1]).toString("hex"))
      return { rows: [], rowCount: 1 }
    }
    if (
      sql.startsWith("delete from skaper.workspace_sessions where expires_at")
    ) {
      const now = Date.now()
      for (const [key, expiry] of this.sessions) {
        if (new Date(expiry).getTime() <= now) this.sessions.delete(key)
      }
      return { rows: [], rowCount: 0 }
    }
    if (sql.startsWith("delete from skaper.workspace_sessions")) {
      this.sessions.clear()
      return { rows: [], rowCount: 0 }
    }
    if (sql.startsWith("insert into skaper.workspace_sessions")) {
      this.sessions.set(Buffer.from(values[1]).toString("hex"), values[2])
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith("select 1 from skaper.workspace_sessions")) {
      return {
        rows: this.sessions.has(Buffer.from(values[1]).toString("hex"))
          ? [{ "?column?": 1 }]
          : [],
      }
    }
    if (
      sql.includes("from skaper.request_tabs") ||
      sql.includes("from skaper.saved_responses") ||
      sql.includes("from skaper.workspace_settings") ||
      sql.includes("from skaper.collections") ||
      sql.includes("from skaper.custom_requests")
    ) {
      return { rows: [], rowCount: 0 }
    }
    throw new Error(`Unexpected test query: ${sql}`)
  }
}

async function runOptionalIntegrationTest() {
  const connectionString = process.env.DOCKS_TEST_DATABASE_URL
  if (!connectionString) return
  const { Pool } = await import("pg")
  const database = new Pool({ connectionString })
  try {
    const before = await snapshotNonSkaperObjects(database)
    const first = await migrateDocksPostgres({ client: database })
    const second = await migrateDocksPostgres({ client: database })
    const after = await snapshotNonSkaperObjects(database)
    assert.deepEqual(after, before)
    assert.ok(
      first.applied.length === 0 || first.applied.includes("0001_initial")
    )
    assert.deepEqual(second.applied, [])
    const objects = await database.query(
      `SELECT n.nspname AS schema_name, c.relname AS object_name
         FROM pg_catalog.pg_class AS c
         JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'skaper'
        ORDER BY c.relkind, c.relname`
    )
    assert.ok(objects.rows.some((row) => row.object_name === "custom_requests"))
  } finally {
    await database.end()
  }
}

async function snapshotNonSkaperObjects(database) {
  const [relations, functions, extensions, roles, privileges, schemas] =
    await Promise.all([
      database.query(
        `SELECT n.nspname, c.relname, c.relkind
           FROM pg_catalog.pg_class AS c
           JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname <> 'skaper'
          ORDER BY n.nspname, c.relname, c.relkind`
      ),
      database.query(
        `SELECT n.nspname, p.proname, p.prokind, p.proargtypes::text
           FROM pg_catalog.pg_proc AS p
           JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
          WHERE n.nspname <> 'skaper'
          ORDER BY n.nspname, p.proname, p.prokind, p.proargtypes::text`
      ),
      database.query(
        `SELECT extname, extversion, extnamespace
           FROM pg_catalog.pg_extension
          ORDER BY extname`
      ),
      database.query(
        `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin
           FROM pg_catalog.pg_roles
          ORDER BY rolname`
      ),
      database.query(
        `SELECT grantor, grantee, table_schema, table_name, privilege_type
           FROM information_schema.table_privileges
          WHERE table_schema <> 'skaper'
          ORDER BY grantor, grantee, table_schema, table_name, privilege_type`
      ),
      database.query(
        `SELECT nspname, nspowner, nspacl::text
           FROM pg_catalog.pg_namespace
          WHERE nspname <> 'skaper'
          ORDER BY nspname`
      ),
    ])
  return {
    relations: relations.rows,
    functions: functions.rows,
    extensions: extensions.rows,
    roles: roles.rows,
    privileges: privileges.rows,
    schemas: schemas.rows,
  }
}

await main()
