import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto"
import { readFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback)
const MIGRATION_LOCK_ID = 1_934_195_275
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const SESSION_CACHE_TTL_MS = 30 * 1000
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MUTATING_ACTIONS = new Set([
  "saveEnvironment",
  "deleteEnvironment",
  "saveVariable",
  "deleteVariable",
  "bulkSyncEnvironments",
  "upsertRequestTab",
  "deleteRequestTab",
  "saveWorkspaceSetting",
  "saveResponse",
  "deleteSavedResponse",
  "createCollection",
  "createCollectionWithRequests",
  "updateCollection",
  "deleteCollection",
  "upsertCustomRequest",
  "deleteCustomRequest",
])
const STORAGE_ACTIONS = new Set([
  "getEnvironments",
  "getApiWorkspace",
  "getSavedResponse",
  ...MUTATING_ACTIONS,
])

const runtimeDirectory = dirname(fileURLToPath(import.meta.url))
const migrationDirectory = resolve(
  runtimeDirectory,
  basename(runtimeDirectory) === "scripts" ? "../migrations" : "migrations"
)
const migrations = [
  { version: "0001_initial", file: "0001_initial.sql" },
  {
    version: "0002_custom_request_folders",
    file: "0002_custom_request_folders.sql",
  },
]

export async function migrateSkaperPostgres({ client, dryRun = false } = {}) {
  assertQueryable(client, "migrateSkaperPostgres client")
  const loaded = await Promise.all(
    migrations.map(async (migration) => {
      const sql = await readFile(
        resolve(migrationDirectory, migration.file),
        "utf8"
      )
      validateMigrationSql(sql, migration.file)
      return { ...migration, sql }
    })
  )

  if (dryRun) {
    return {
      applied: [],
      pending: loaded.map((migration) => migration.version),
      sql: loaded.map((migration) => migration.sql).join("\n\n"),
    }
  }

  return withClient(client, async (connection) => {
    const applied = []
    await connection.query("BEGIN")
    try {
      await connection.query("SELECT pg_advisory_xact_lock($1)", [
        MIGRATION_LOCK_ID,
      ])
      await connection.query("CREATE SCHEMA IF NOT EXISTS skaper")
      await connection.query(`
        CREATE TABLE IF NOT EXISTS skaper.schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      for (const migration of loaded) {
        const existing = await connection.query(
          "SELECT version FROM skaper.schema_migrations WHERE version = $1",
          [migration.version]
        )
        if (existing.rows.length) continue
        await connection.query(migration.sql)
        await connection.query(
          "INSERT INTO skaper.schema_migrations (version) VALUES ($1)",
          [migration.version]
        )
        applied.push(migration.version)
      }
      await connection.query("COMMIT")
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {})
      throw error
    }
    return {
      applied,
      pending: [],
    }
  })
}

export async function createSkaperPostgres(options = {}) {
  const { pool } = options
  assertQueryable(pool, "createSkaperPostgres pool")
  const workspaceId = normalizeNonEmpty(options.workspaceId, "workspaceId")
  const path = normalizePath(options.path ?? "/_skaper/storage")
  const password = normalizeNonEmpty(options.password, "password")
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
  const origin = options.origin
    ? normalizeOrigin(options.origin, "origin")
    : undefined
  if (!Number.isInteger(sessionTtlMs) || sessionTtlMs <= 0) {
    throw new TypeError("sessionTtlMs must be a positive integer.")
  }

  await ensureWorkspace(pool, workspaceId)
  await synchronizePassword(pool, workspaceId, password)
  const storageAdapter = await createPostgresStorageAdapter({
    pool,
    workspaceId,
    workspaceExists: true,
  })

  const result = {
    __skaperPostgres: true,
    path,
    workspaceId,
    storageAdapter,
    async getCustomRequests() {
      const customRequests = await pool.query(
        `SELECT id, collection_id, name, method, transport, mode, url, folder,
                draft, position, created_at, updated_at
           FROM skaper.custom_requests
          WHERE workspace_id = $1
          ORDER BY position, id`,
        [workspaceId]
      )
      return customRequests.rows.map(mapCustomRequest)
    },
  }
  result.handler = createStorageHandler({
    path,
    pool,
    workspaceId,
    sessionTtlMs,
    origin,
    storageAdapter,
  })
  return result
}

export async function createPostgresStorageAdapter({
  pool,
  workspaceId,
  workspaceExists = false,
}) {
  assertQueryable(pool, "createPostgresStorageAdapter pool")
  const scope = normalizeNonEmpty(workspaceId, "workspaceId")
  let workspaceReady = workspaceExists ? Promise.resolve() : null

  function ensureWorkspaceReady() {
    if (!workspaceReady) {
      workspaceReady = ensureWorkspace(pool, scope).catch((error) => {
        workspaceReady = null
        throw error
      })
    }
    return workspaceReady
  }

  return {
    async getEnvironments() {
      const result = await pool.query(
        `SELECT environment.id, environment.name, environment.base_url,
                COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', variable.id,
                      'key', variable.key,
                      'value', variable.value,
                      'enabled', variable.enabled,
                      'isSecret', variable.is_secret,
                      'description', variable.description
                    ) ORDER BY variable.position, variable.id
                  ) FILTER (WHERE variable.id IS NOT NULL),
                  '[]'::jsonb
                ) AS variables
           FROM skaper.environments AS environment
           LEFT JOIN skaper.environment_variables AS variable
             ON variable.workspace_id = environment.workspace_id
            AND variable.environment_id = environment.id
          WHERE environment.workspace_id = $1
          GROUP BY environment.id, environment.name, environment.base_url
          ORDER BY environment.name, environment.id`,
        [scope]
      )
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        variables: parseJson(row.variables) ?? [],
      }))
    },

    async saveEnvironment({ data }) {
      await ensureWorkspaceReady()
      await pool.query(
        `INSERT INTO skaper.environments
           (workspace_id, id, name, base_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, id) DO UPDATE SET
           name = EXCLUDED.name,
           base_url = EXCLUDED.base_url,
           updated_at = CURRENT_TIMESTAMP`,
        [scope, data.id, data.name, data.baseUrl]
      )
      return { success: true }
    },

    async deleteEnvironment({ data: id }) {
      await pool.query(
        "DELETE FROM skaper.environments WHERE workspace_id = $1 AND id = $2",
        [scope, id]
      )
      return { success: true }
    },

    async saveVariable({ data }) {
      const environment = await pool.query(
        "SELECT id FROM skaper.environments WHERE workspace_id = $1 AND id = $2",
        [scope, data.envId]
      )
      if (!environment.rows.length) return { success: false }
      const nextPosition = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS position
           FROM skaper.environment_variables
          WHERE workspace_id = $1 AND environment_id = $2`,
        [scope, data.envId]
      )
      const variable = data.variable
      await pool.query(
        `INSERT INTO skaper.environment_variables
           (workspace_id, environment_id, id, key, value, enabled, is_secret, description, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id, environment_id, id) DO UPDATE SET
           key = EXCLUDED.key,
           value = EXCLUDED.value,
           enabled = EXCLUDED.enabled,
           is_secret = EXCLUDED.is_secret,
           description = EXCLUDED.description,
           updated_at = CURRENT_TIMESTAMP`,
        [
          scope,
          data.envId,
          variable.id,
          variable.key,
          variable.value,
          variable.enabled,
          variable.isSecret ?? false,
          variable.description ?? "",
          Number(nextPosition.rows[0]?.position ?? 0),
        ]
      )
      return { success: true }
    },

    async deleteVariable({ data }) {
      const deleted = await pool.query(
        `DELETE FROM skaper.environment_variables
          WHERE workspace_id = $1 AND environment_id = $2 AND id = $3`,
        [scope, data.envId, data.varId]
      )
      return { success: deleted.rowCount > 0 }
    },

    async bulkSyncEnvironments({ data: environments }) {
      await ensureWorkspaceReady()
      await withClient(pool, async (connection) => {
        await connection.query("BEGIN")
        try {
          for (const environment of environments) {
            await connection.query(
              `INSERT INTO skaper.environments
                 (workspace_id, id, name, base_url)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (workspace_id, id) DO UPDATE SET
                 name = EXCLUDED.name,
                 base_url = EXCLUDED.base_url,
                 updated_at = CURRENT_TIMESTAMP`,
              [scope, environment.id, environment.name, environment.baseUrl]
            )
            await connection.query(
              `DELETE FROM skaper.environment_variables
                WHERE workspace_id = $1 AND environment_id = $2`,
              [scope, environment.id]
            )
            for (const [
              position,
              variable,
            ] of environment.variables.entries()) {
              await connection.query(
                `INSERT INTO skaper.environment_variables
                   (workspace_id, environment_id, id, key, value, enabled, is_secret, description, position)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (workspace_id, environment_id, id) DO UPDATE SET
                   key = EXCLUDED.key,
                   value = EXCLUDED.value,
                   enabled = EXCLUDED.enabled,
                   is_secret = EXCLUDED.is_secret,
                   description = EXCLUDED.description,
                   position = EXCLUDED.position,
                   updated_at = CURRENT_TIMESTAMP`,
                [
                  scope,
                  environment.id,
                  variable.id,
                  variable.key,
                  variable.value,
                  variable.enabled,
                  variable.isSecret ?? false,
                  variable.description ?? "",
                  position,
                ]
              )
            }
          }
          await connection.query("COMMIT")
        } catch (error) {
          await connection.query("ROLLBACK").catch(() => {})
          throw error
        }
      })
      return { success: true }
    },

    async getApiWorkspace() {
      const result = await pool.query(
        `SELECT
           COALESCE((
             SELECT jsonb_agg(to_jsonb(tab_row) ORDER BY tab_row.position, tab_row.operation_id)
               FROM (
                 SELECT operation_id, request_tab, draft, position, updated_at
                   FROM skaper.request_tabs
                  WHERE workspace_id = $1
               ) AS tab_row
           ), '[]'::jsonb) AS request_tabs,
           COALESCE((
             SELECT jsonb_agg(to_jsonb(response_row) ORDER BY response_row.created_at DESC)
               FROM (
                 SELECT id, operation_id, method, path, name, status, ok,
                        duration_ms, size_bytes, content_type, created_at
                   FROM skaper.saved_responses
                  WHERE workspace_id = $1
                  ORDER BY created_at DESC
                  LIMIT 100
               ) AS response_row
           ), '[]'::jsonb) AS saved_responses,
           COALESCE((
             SELECT jsonb_object_agg(setting.key, setting.value)
               FROM skaper.workspace_settings AS setting
              WHERE setting.workspace_id = $1
           ), '{}'::jsonb) AS settings,
           COALESCE((
             SELECT jsonb_agg(to_jsonb(collection_row) ORDER BY collection_row.position, collection_row.id)
               FROM (
                 SELECT id, name, position, created_at, updated_at
                   FROM skaper.collections
                  WHERE workspace_id = $1
               ) AS collection_row
           ), '[]'::jsonb) AS collections,
           COALESCE((
             SELECT jsonb_agg(to_jsonb(custom_row) ORDER BY custom_row.position, custom_row.id)
               FROM (
                 SELECT id, collection_id, name, method, transport, mode, url, folder,
                        draft, position, created_at, updated_at
                   FROM skaper.custom_requests
                  WHERE workspace_id = $1
               ) AS custom_row
           ), '[]'::jsonb) AS custom_requests`,
        [scope]
      )
      const row = result.rows[0] ?? {}
      const tabs = parseJson(row.request_tabs) ?? []
      const responses = parseJson(row.saved_responses) ?? []
      const settings = parseJson(row.settings) ?? {}
      const collections = parseJson(row.collections) ?? []
      const customRequests = parseJson(row.custom_requests) ?? []
      const settingMap = new Map(Object.entries(settings))
      const persistedHeight = Number(settingMap.get("response_panel_height"))
      return {
        requestTabs: tabs.map((row) => ({
          operationId: row.operation_id,
          requestTab: normalizeRequestTab(row.request_tab),
          draft: parseJson(row.draft),
          position: row.position,
          updatedAt: toIso(row.updated_at),
        })),
        savedResponses: responses.map(mapSavedResponse),
        collections: collections.map((row) => ({
          id: row.id,
          name: row.name,
          position: row.position,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        })),
        customRequests: customRequests.map(mapCustomRequest),
        responsePanelHeight: Number.isFinite(persistedHeight)
          ? persistedHeight
          : 360,
      }
    },

    async upsertRequestTab({ data }) {
      await ensureWorkspaceReady()
      await pool.query(
        `INSERT INTO skaper.request_tabs
           (workspace_id, operation_id, request_tab, draft, position)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (workspace_id, operation_id) DO UPDATE SET
           request_tab = EXCLUDED.request_tab,
           draft = EXCLUDED.draft,
           position = EXCLUDED.position,
           updated_at = CURRENT_TIMESTAMP`,
        [
          scope,
          data.operationId,
          data.requestTab,
          json(data.draft),
          data.position,
        ]
      )
      return { success: true }
    },

    async deleteRequestTab({ data: operationId }) {
      await pool.query(
        "DELETE FROM skaper.request_tabs WHERE workspace_id = $1 AND operation_id = $2",
        [scope, operationId]
      )
      return { success: true }
    },

    async saveWorkspaceSetting({ data }) {
      await ensureWorkspaceReady()
      await pool.query(
        `INSERT INTO skaper.workspace_settings (workspace_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = CURRENT_TIMESTAMP`,
        [scope, data.key, data.value]
      )
      return { success: true }
    },

    async saveResponse({ data }) {
      await ensureWorkspaceReady()
      const createdAt = new Date().toISOString()
      const id = createId()
      const saved = {
        id,
        operationId: data.operationId,
        method: data.method,
        path: data.path,
        name: data.name,
        status: data.result.status,
        ok: data.result.ok,
        durationMs: data.result.durationMs,
        sizeBytes: data.result.sizeBytes,
        contentType: data.result.contentType,
        createdAt,
        requestSnapshot: data.requestSnapshot,
        result: data.result,
      }
      await pool.query(
        `INSERT INTO skaper.saved_responses
           (workspace_id, id, operation_id, method, path, name, status, ok,
            duration_ms, size_bytes, content_type, request_snapshot, result, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 $12::jsonb, $13::jsonb, $14)`,
        [
          scope,
          id,
          saved.operationId,
          saved.method,
          saved.path,
          saved.name,
          saved.status,
          saved.ok,
          saved.durationMs,
          saved.sizeBytes,
          saved.contentType,
          json(saved.requestSnapshot),
          json(saved.result),
          createdAt,
        ]
      )
      return saved
    },

    async deleteSavedResponse({ data }) {
      await pool.query(
        "DELETE FROM skaper.saved_responses WHERE workspace_id = $1 AND id = $2",
        [scope, data.id]
      )
      return { success: true }
    },

    async getSavedResponse({ data: id }) {
      const result = await pool.query(
        "SELECT * FROM skaper.saved_responses WHERE workspace_id = $1 AND id = $2",
        [scope, id]
      )
      return result.rows[0] ? mapSavedResponse(result.rows[0]) : null
    },

    async createCollection({ data }) {
      await ensureWorkspaceReady()
      await pool.query(
        `INSERT INTO skaper.collections
           (workspace_id, id, name, position, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          scope,
          data.id,
          data.name,
          data.position,
          data.createdAt,
          data.updatedAt,
        ]
      )
      return data
    },

    async createCollectionWithRequests({ data }) {
      await ensureWorkspaceReady()
      return withClient(pool, async (connection) => {
        await connection.query("BEGIN")
        try {
          await connection.query(
            `INSERT INTO skaper.collections
               (workspace_id, id, name, position, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              scope,
              data.collection.id,
              data.collection.name,
              data.collection.position,
              data.collection.createdAt,
              data.collection.updatedAt,
            ]
          )
          for (const request of data.requests) {
            await upsertCustomRequestRow(connection, scope, request)
          }
          await connection.query("COMMIT")
          return data
        } catch (error) {
          await connection.query("ROLLBACK").catch(() => {})
          throw error
        }
      })
    },

    async updateCollection({ data }) {
      const result = await pool.query(
        `UPDATE skaper.collections
            SET name = $3, position = $4, updated_at = $5
          WHERE workspace_id = $1 AND id = $2`,
        [scope, data.id, data.name, data.position, data.updatedAt]
      )
      if (!result.rowCount)
        throw new Error(`Collection ${data.id} was not found.`)
      return data
    },

    async deleteCollection({ data: id }) {
      await pool.query(
        "DELETE FROM skaper.collections WHERE workspace_id = $1 AND id = $2",
        [scope, id]
      )
      return { success: true }
    },

    async upsertCustomRequest({ data }) {
      await ensureWorkspaceReady()
      await upsertCustomRequestRow(pool, scope, data)
      return data
    },

    async deleteCustomRequest({ data: id }) {
      await pool.query(
        "DELETE FROM skaper.custom_requests WHERE workspace_id = $1 AND id = $2",
        [scope, id]
      )
      return { success: true }
    },
  }
}

function createStorageHandler({
  path,
  pool,
  workspaceId,
  sessionTtlMs,
  origin,
  storageAdapter,
}) {
  const sessionCache = new Map()

  return async function storageHandler(input, output) {
    try {
      const requestSource = input?.req?.raw ?? input
      const request =
        requestSource instanceof Request
          ? requestSource
          : await toWebRequest(requestSource)
      const response = await handleStorageRequest(request, {
        path,
        pool,
        workspaceId,
        sessionTtlMs,
        origin,
        storageAdapter,
        sessionCache,
      })
      if (output) return writeNodeResponse(output, response)
      return response
    } catch (error) {
      const response = jsonResponse(
        error instanceof HttpError ? error.status : 500,
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
      if (output) return writeNodeResponse(output, response)
      return response
    }
  }
}

async function handleStorageRequest(request, context) {
  const url = new URL(request.url)
  if (url.pathname !== context.path)
    return jsonResponse(404, { error: "Not found" })
  if (request.method !== "POST")
    return jsonResponse(405, { error: "Method not allowed" })
  if (!isSameOrigin(request, context.origin)) {
    return jsonResponse(403, { error: "Cross-origin request rejected" })
  }

  const payload = await readJsonBody(request)
  if (payload.action === "login") {
    if (typeof payload.password !== "string") {
      return jsonResponse(400, { error: "Password is required" })
    }
    const valid = await verifyPassword(
      context.pool,
      context.workspaceId,
      payload.password
    )
    if (!valid) return jsonResponse(401, { error: "Invalid password" })
    const token = randomBytes(32).toString("base64url")
    const expiresAt = new Date(Date.now() + context.sessionTtlMs)
    await context.pool.query(
      `INSERT INTO skaper.workspace_sessions (workspace_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [context.workspaceId, hashToken(token), expiresAt]
    )
    cacheSession(context.sessionCache, token, expiresAt)
    return jsonResponse(
      200,
      { authenticated: true, expiresAt: expiresAt.toISOString() },
      {
        "set-cookie": createSessionCookie(
          context.path,
          token,
          expiresAt,
          new URL(context.origin ?? url.origin).protocol === "https:"
        ),
      }
    )
  }

  const token = readSessionCookie(request, context.path)
  const authenticated = token
    ? await validateSession(
        context.pool,
        context.workspaceId,
        token,
        context.sessionCache
      )
    : false
  if (payload.action === "session") {
    return authenticated
      ? jsonResponse(200, { authenticated: true })
      : jsonResponse(401, { authenticated: false })
  }
  if (!authenticated) return jsonResponse(401, { error: "Unauthorized" })

  if (payload.action === "logout") {
    context.sessionCache.delete(hashTokenKey(token))
    await context.pool.query(
      `DELETE FROM skaper.workspace_sessions
        WHERE workspace_id = $1 AND token_hash = $2`,
      [context.workspaceId, hashToken(token)]
    )
    return jsonResponse(
      200,
      { authenticated: false },
      {
        "set-cookie": clearSessionCookie(
          context.path,
          new URL(context.origin ?? url.origin).protocol === "https:"
        ),
      }
    )
  }
  if (!STORAGE_ACTIONS.has(payload.action)) {
    return jsonResponse(400, { error: "Unknown storage action" })
  }
  const method = context.storageAdapter[payload.action]
  const result =
    payload.action === "getEnvironments" || payload.action === "getApiWorkspace"
      ? await method.call(context.storageAdapter)
      : await method.call(context.storageAdapter, { data: payload.data })
  return jsonResponse(200, result)
}

async function ensureWorkspace(client, workspaceId) {
  await client.query(
    `INSERT INTO skaper.workspaces (id)
     VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    [workspaceId]
  )
}

async function synchronizePassword(client, workspaceId, password) {
  const existing = await client.query(
    `SELECT password_salt, password_hash
       FROM skaper.workspace_credentials
      WHERE workspace_id = $1`,
    [workspaceId]
  )
  if (existing.rows[0]) {
    const candidate = await derivePassword(
      password,
      existing.rows[0].password_salt
    )
    if (safeEqual(candidate, existing.rows[0].password_hash)) return
  }
  const salt = randomBytes(16)
  const digest = await derivePassword(password, salt)
  await withClient(client, async (connection) => {
    await connection.query("BEGIN")
    try {
      await connection.query(
        `INSERT INTO skaper.workspace_credentials
           (workspace_id, password_salt, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id) DO UPDATE SET
           password_salt = EXCLUDED.password_salt,
           password_hash = EXCLUDED.password_hash,
           updated_at = CURRENT_TIMESTAMP`,
        [workspaceId, salt, digest]
      )
      await connection.query(
        "DELETE FROM skaper.workspace_sessions WHERE workspace_id = $1",
        [workspaceId]
      )
      await connection.query("COMMIT")
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {})
      throw error
    }
  })
}

async function verifyPassword(client, workspaceId, password) {
  const result = await client.query(
    `SELECT password_salt, password_hash
       FROM skaper.workspace_credentials
      WHERE workspace_id = $1`,
    [workspaceId]
  )
  if (!result.rows[0]) return false
  const candidate = await derivePassword(password, result.rows[0].password_salt)
  return safeEqual(candidate, result.rows[0].password_hash)
}

async function validateSession(client, workspaceId, token, sessionCache) {
  const tokenKey = hashTokenKey(token)
  const cachedUntil = sessionCache.get(tokenKey)
  if (cachedUntil && cachedUntil > Date.now()) return true
  sessionCache.delete(tokenKey)

  const result = await client.query(
    `SELECT expires_at FROM skaper.workspace_sessions
      WHERE workspace_id = $1 AND token_hash = $2
        AND expires_at > CURRENT_TIMESTAMP`,
    [workspaceId, hashToken(token)]
  )
  if (!result.rows[0]) return false
  cacheSession(sessionCache, token, result.rows[0].expires_at)
  return true
}

function cacheSession(sessionCache, token, expiresAt) {
  const expiry = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiry)) return
  sessionCache.set(
    hashTokenKey(token),
    Math.min(expiry, Date.now() + SESSION_CACHE_TTL_MS)
  )
}

function validateMigrationSql(sql, file) {
  const withoutComments = sql.replace(/--[^\n]*/g, " ")
  if (
    /\b(?:public|information_schema|pg_catalog)\s*\./i.test(withoutComments)
  ) {
    throw new Error(`${file} references a schema outside skaper.`)
  }
  if (
    /\b(?:EXTENSION|ROLE|DATABASE|GRANT|REVOKE|DEFAULT\s+PRIVILEGES|SEARCH_PATH)\b/i.test(
      withoutComments
    )
  ) {
    throw new Error(`${file} contains a database-wide operation.`)
  }
  const schemaStatements =
    withoutComments.match(
      /CREATE\s+SCHEMA(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s;]+)/gi
    ) ?? []
  if (schemaStatements.some((statement) => !/\bskaper\s*$/i.test(statement))) {
    throw new Error(`${file} creates a schema other than skaper.`)
  }
  for (const match of withoutComments.matchAll(
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s(]+)/gi
  )) {
    if (!match[1].toLowerCase().startsWith("skaper.")) {
      throw new Error(`${file} contains an unqualified persistent object.`)
    }
  }
  for (const match of withoutComments.matchAll(
    /CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s]+)\s+ON\s+([^\s(]+)/gi
  )) {
    if (
      match[1].includes(".") ||
      !match[2].toLowerCase().startsWith("skaper.")
    ) {
      throw new Error(
        `${file} contains an index outside a qualified skaper table.`
      )
    }
  }
}

async function withClient(pool, callback) {
  if (typeof pool.connect !== "function") return callback(pool)
  const connection = await pool.connect()
  try {
    return await callback(connection)
  } finally {
    connection.release?.()
  }
}

async function derivePassword(password, salt) {
  return Buffer.from(await scrypt(password, Buffer.from(salt), 64))
}

function safeEqual(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function hashToken(token) {
  return createHash("sha256").update(token).digest()
}

function hashTokenKey(token) {
  return hashToken(token).toString("hex")
}

function sessionCookieName(path) {
  return `skaper_session_${createHash("sha256").update(path).digest("hex").slice(0, 12)}`
}

function createSessionCookie(path, token, expiresAt, secure) {
  return `${sessionCookieName(path)}=${token}; Path=${path}; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`
}

function clearSessionCookie(path, secure) {
  return `${sessionCookieName(path)}=; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`
}

function readSessionCookie(request, path) {
  const name = sessionCookieName(path)
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim()
    }
  }
  return undefined
}

function isSameOrigin(request, configuredOrigin) {
  const origin = request.headers.get("origin")
  return Boolean(
    origin && origin === (configuredOrigin ?? new URL(request.url).origin)
  )
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_BODY_BYTES)
    throw new HttpError(413, "Request body is too large")
  const text = await request.text()
  if (Buffer.byteLength(text) > MAX_BODY_BYTES)
    throw new HttpError(413, "Request body is too large")
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error()
    return value
  } catch {
    throw new HttpError(400, "Request body must be a JSON object")
  }
}

function jsonResponse(status, value, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  })
}

function mapSavedResponse(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    method: row.method,
    path: row.path,
    name: row.name,
    status: row.status,
    ok: row.ok,
    durationMs: Number(row.duration_ms),
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    createdAt: toIso(row.created_at),
    requestSnapshot: parseJson(row.request_snapshot),
    result: parseJson(row.result),
  }
}

function mapCustomRequest(row) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    name: row.name,
    method: row.method,
    transport: row.transport,
    mode: row.mode,
    url: row.url,
    folder: row.folder ?? undefined,
    draft: parseJson(row.draft),
    position: row.position,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

async function upsertCustomRequestRow(connection, workspaceId, data) {
  await connection.query(
    `INSERT INTO skaper.custom_requests
       (workspace_id, id, collection_id, name, method, transport, mode, url,
        folder, draft, position, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
     ON CONFLICT (workspace_id, id) DO UPDATE SET
       collection_id = EXCLUDED.collection_id,
       name = EXCLUDED.name,
       method = EXCLUDED.method,
       transport = EXCLUDED.transport,
       mode = EXCLUDED.mode,
       url = EXCLUDED.url,
       folder = EXCLUDED.folder,
       draft = EXCLUDED.draft,
       position = EXCLUDED.position,
       updated_at = EXCLUDED.updated_at`,
    [
      workspaceId,
      data.id,
      data.collectionId,
      data.name,
      data.method,
      data.transport,
      data.mode,
      data.url,
      data.folder ?? null,
      json(data.draft),
      data.position,
      data.createdAt,
      data.updatedAt,
    ]
  )
}

function normalizeRequestTab(value) {
  if (value === "Authorization") return "Headers"
  return ["Docs", "Message", "Params", "Headers", "Body"].includes(value)
    ? value
    : "Docs"
}

function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value
}

function json(value) {
  return JSON.stringify(value ?? null)
}

function toIso(value) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function createId() {
  return `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`
}

function assertQueryable(value, label) {
  if (!value || typeof value.query !== "function") {
    throw new TypeError(`${label} must provide query().`)
  }
}

function normalizeNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`)
  }
  return value.trim()
}

function normalizePath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new TypeError(
      "path must be an absolute path without a query or fragment."
    )
  }
  return value
}

function normalizeOrigin(value, label) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(`${label} must be an exact HTTP(S) origin.`)
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(`${label} must be an exact HTTP(S) origin.`)
  }
  return url.origin
}

async function toWebRequest(request) {
  const host = request.headers?.host ?? "localhost"
  const protocol = request.socket?.encrypted ? "https:" : "http:"
  const method = request.method ?? "GET"
  const init = { method, headers: request.headers }
  if (method !== "GET" && method !== "HEAD") {
    init.body = request
    init.duplex = "half"
  }
  return new Request(new URL(request.url ?? "/", `${protocol}//${host}`), init)
}

async function writeNodeResponse(response, webResponse) {
  response.statusCode = webResponse.status
  for (const [name, value] of webResponse.headers)
    response.setHeader(name, value)
  response.end(Buffer.from(await webResponse.arrayBuffer()))
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const __testing = {
  validateMigrationSql,
  sessionCookieName,
}
