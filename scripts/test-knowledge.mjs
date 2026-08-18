import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import {
  buildKnowledge,
  explainKnowledgeNode,
  findKnowledgePath,
  knowledgeStatus,
  openKnowledgeDatabase,
  queryKnowledge,
  runUpstreamAction,
} from "./knowledge-runtime.mjs"

const run = promisify(execFile)
const root = await mkdtemp(join(tmpdir(), "docks-knowledge-test-"))

async function testKnowledgeBuild(projectRoot) {
  const pool = new KnowledgePool()
  const config = createConfig()
  const first = await buildKnowledge({ pool, config, root: projectRoot })
  assert.ok(
    first.graph.nodes.some((node) => node.id === "operation:GET /users/{id}")
  )
  assert.ok(first.graph.edges.some((edge) => edge.relation === "uses_schema"))
  assert.ok(
    first.graph.edges.every((edge) =>
      ["EXTRACTED", "INFERRED", "AMBIGUOUS"].includes(edge.confidence)
    )
  )
  const serialized = JSON.stringify(first.graph)
  assert.doesNotMatch(serialized, /database-secret|response-secret/)
  assert.doesNotMatch(serialized, /bodyText/)
  assert.match(
    await readFile(join(projectRoot, ".gitignore"), "utf8"),
    /docks-out\//
  )

  const second = await buildKnowledge({ pool, config, root: projectRoot })
  assert.deepEqual(second.graph, first.graph)
  const status = await knowledgeStatus({ pool, config, root: projectRoot })
  assert.equal(status.stale, false)
  await rm(join(projectRoot, "docks-out", "graph.json"))
  assert.equal(
    (await knowledgeStatus({ pool, config, root: projectRoot })).stale,
    true
  )
  await buildKnowledge({ pool, config, root: projectRoot })
  await assert.rejects(
    knowledgeStatus({
      pool: {
        async query() {
          return {
            rows: [
              { id: "one", revision: 1 },
              { id: "two", revision: 1 },
            ],
          }
        },
      },
      config,
      root: projectRoot,
    }),
    /multiple Docks workspaces.*one, two/
  )
  pool.revision += 1
  assert.equal(
    (await knowledgeStatus({ pool, config, root: projectRoot })).stale,
    true
  )

  const withBodies = await buildKnowledge({
    pool,
    config,
    root: projectRoot,
    includeResponseBodies: true,
  })
  const response = withBodies.graph.nodes.find(
    (node) => node.type === "saved_response"
  )
  assert.match(response.attributes.result.bodyText, /\[REDACTED\]/)
  assert.doesNotMatch(JSON.stringify(response), /response-secret/)

  const results = queryKnowledge(withBodies.graph, "get user")
  assert.equal(results[0].type, "operation")
  const explained = explainKnowledgeNode(withBodies.graph, "getUser")
  assert.equal(explained.node.attributes.operationId, "getUser")
  const path = findKnowledgePath(
    withBodies.graph,
    "workspace:test-workspace",
    "schema:User"
  )
  assert.ok(path.path.length >= 3)
}

async function testDirectOpenApiKnowledge(projectRoot) {
  const directRoot = await mkdtemp(join(projectRoot, "direct-"))
  const source = join(directRoot, "openapi.yaml")
  await writeFile(
    source,
    `openapi: 3.1.0
info:
  title: Direct API
  version: 1.0.0
servers:
  - url: https://direct.example
paths:
  /health:
    get:
      operationId: getHealth
      responses:
        "200":
          description: Healthy
`
  )
  const config = createConfig()
  assert.equal(
    await openKnowledgeDatabase(config, {}),
    null,
    "a missing database environment variable should select direct mode"
  )
  assert.equal(
    await openKnowledgeDatabase(
      { ...config, url: "openapi.yaml" },
      { DATABASE_URL: "postgresql://unused.example/database" }
    ),
    null,
    "an explicit OpenAPI source should take precedence over DATABASE_URL"
  )
  const built = await buildKnowledge({
    pool: null,
    config,
    root: directRoot,
  })
  assert.equal(built.manifest.sourceMode, "openapi")
  assert.equal(built.manifest.revision, null)
  assert.ok(
    built.graph.nodes.some(
      (node) => node.attributes?.operationId === "getHealth"
    )
  )
  assert.equal(
    (await knowledgeStatus({ pool: null, config, root: directRoot })).stale,
    false
  )
  const environment = { ...process.env }
  delete environment.DATABASE_URL
  const cli = resolve("dist/package/cli.js")
  await run(
    process.execPath,
    [cli, "knowledge", "build", "--url", "openapi.yaml"],
    { cwd: directRoot, env: environment }
  )
  const initialManifest = JSON.parse(
    await readFile(join(directRoot, "docks-out", "manifest.json"), "utf8")
  )
  await writeFile(
    source,
    `${await readFile(source, "utf8")}  /ready:\n    get:\n      operationId: getReadiness\n      summary: Readiness check\n      responses:\n        "200":\n          description: Ready\n`
  )
  assert.equal(
    (await knowledgeStatus({ pool: null, config, root: directRoot })).stale,
    true
  )
  const queried = await run(
    process.execPath,
    [cli, "knowledge", "query", "readiness"],
    { cwd: directRoot, env: environment }
  )
  const queryOutput = JSON.parse(queried.stdout)
  assert.equal(queryOutput.query, "readiness")
  assert.ok(
    queryOutput.results.some(
      (result) => result.operationId === "getReadiness"
    )
  )
  assert.doesNotMatch(queried.stdout, /searchText/)
  assert.ok(Buffer.byteLength(queried.stdout) < 20_000)
  const refreshedManifest = JSON.parse(
    await readFile(join(directRoot, "docks-out", "manifest.json"), "utf8")
  )
  assert.notEqual(refreshedManifest.documentHash, initialManifest.documentHash)
  assert.equal(
    JSON.parse(
      await readFile(join(directRoot, ".docks", "config.json"), "utf8")
    ).url,
    "openapi.yaml"
  )
  await writeFile(
    source,
    (await readFile(source, "utf8")).replace(
      "version: 1.0.0",
      "version: 1.0.1"
    )
  )
  const statusResult = await run(
    process.execPath,
    [cli, "knowledge", "status"],
    { cwd: directRoot, env: environment }
  )
  const statusOutput = JSON.parse(statusResult.stdout)
  assert.equal(statusOutput.refreshed, true)
  assert.equal(statusOutput.stale, false)
  assert.notEqual(
    statusOutput.manifest.documentHash,
    refreshedManifest.documentHash
  )
}

async function testRemoteOpenApiRefresh(projectRoot) {
  let revision = 1
  let noCacheRequests = 0
  const server = createServer((request, response) => {
    if (
      request.headers["cache-control"]?.includes("no-cache") &&
      request.headers.pragma === "no-cache"
    ) {
      noCacheRequests += 1
    }
    response.setHeader("content-type", "application/json")
    response.setHeader("cache-control", "public, max-age=3600")
    response.end(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Remote API", version: String(revision) },
        servers: [{ url: "https://remote.example" }],
        paths: {
          [revision === 1 ? "/original" : "/updated"]: {
            get: {
              operationId: revision === 1 ? "getOriginal" : "getUpdated",
              summary: revision === 1 ? "Original" : "Updated source",
              responses: { 200: { description: "OK" } },
            },
          },
        },
      })
    )
  })
  await new Promise((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise)
  )
  try {
    const address = server.address()
    assert.ok(address && typeof address === "object")
    const remoteRoot = await mkdtemp(join(projectRoot, "remote-"))
    const cli = resolve("dist/package/cli.js")
    const environment = { ...process.env }
    delete environment.DATABASE_URL
    await run(
      process.execPath,
      [
        cli,
        "knowledge",
        "build",
        "--url",
        `http://127.0.0.1:${address.port}/openapi.json`,
      ],
      { cwd: remoteRoot, env: environment }
    )
    revision = 2
    const queried = await run(
      process.execPath,
      [cli, "knowledge", "query", "updated source"],
      { cwd: remoteRoot, env: environment }
    )
    const output = JSON.parse(queried.stdout)
    assert.ok(
      output.results.some((result) => result.operationId === "getUpdated")
    )
    assert.ok(noCacheRequests >= 2)
  } finally {
    await new Promise((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise()))
    )
  }
}

async function testActions() {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/redirect")) {
      response.statusCode = 302
      response.setHeader("location", "https://other.example/resource")
      response.end()
      return
    }
    if (request.url?.startsWith("/slow")) {
      setTimeout(() => {
        response.setHeader("content-type", "application/json")
        response.end("{}")
      }, 150)
      return
    }
    if (request.url?.startsWith("/events")) {
      response.setHeader("content-type", "text/event-stream")
      response.end("data: ready\n\n")
      return
    }
    if (request.url?.startsWith("/large")) {
      response.setHeader("content-type", "text/plain")
      response.end("x".repeat(256))
      return
    }
    response.statusCode = request.method === "POST" ? 201 : 200
    response.setHeader("content-type", "application/json")
    response.setHeader("set-cookie", "session=secret")
    response.end(
      JSON.stringify({
        method: request.method,
        credential: request.headers["x-client"],
      })
    )
  })
  await new Promise((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise)
  )
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const origin = `http://127.0.0.1:${address.port}`
  const graph = {
    schemaVersion: 1,
    workspaceId: "test-workspace",
    nodes: [
      actionNode("GET /users/{id}", "getUser", "GET", `${origin}/users/{id}`),
      actionNode("POST /users", "createUser", "POST", `${origin}/users`, {
        requestBody: { required: true, content: { "application/json": {} } },
      }),
      actionNode("GET /large", "large", "GET", `${origin}/large`),
      actionNode("GET /redirect", "redirect", "GET", `${origin}/redirect`),
      actionNode("GET /slow", "slow", "GET", `${origin}/slow`),
      actionNode("GET /events", "events", "GET", `${origin}/events`),
    ],
    edges: [],
  }
  const config = createConfig({
    allowedOrigins: [origin],
    allowedOperations: ["createUser"],
    headerEnvironment: { "x-client": "DOCKS_TEST_CLIENT" },
    timeoutMs: 50,
    maxResponseBytes: 128,
  })
  process.env.DOCKS_TEST_CLIENT = "environment-value"
  try {
    const result = await runUpstreamAction({
      graph,
      config,
      selector: "getUser",
      parameters: { path: { id: "42" }, header: { "x-client": "agent-value" } },
    })
    assert.equal(result.status, 200)
    assert.equal(JSON.parse(result.bodyText).credential, "environment-value")
    assert.equal(
      result.headers.some((header) => header.key === "set-cookie"),
      false
    )
    const savedQueries = []
    await runUpstreamAction({
      graph,
      config,
      selector: "getUser",
      parameters: { path: { id: "42" } },
      saveResponse: true,
      workspaceId: "test-workspace",
      pool: {
        async query(text) {
          savedQueries.push(text)
          return { rows: [], rowCount: 1 }
        },
      },
    })
    assert.equal(savedQueries.length, 2)
    assert.match(savedQueries[0], /INSERT INTO skaper\.saved_responses/)
    assert.match(savedQueries[1], /revision = revision \+ 1/)
    await assert.rejects(
      runUpstreamAction({ graph, config, selector: "getUser", parameters: {} }),
      /required path parameter id/
    )
    await assert.rejects(
      runUpstreamAction({
        graph,
        config,
        selector: "getUser",
        parameters: { path: { id: "42" }, query: { hidden: "1" } },
      }),
      /Undocumented query parameter/
    )
    await assert.rejects(
      runUpstreamAction({
        graph,
        config,
        selector: "createUser",
        body: "{}",
        contentType: "application/json",
      }),
      /--confirmed-write/
    )
    await assert.rejects(
      runUpstreamAction({
        graph,
        config: {
          ...config,
          actions: { ...config.actions, allowedOperations: [] },
        },
        selector: "createUser",
        body: "{}",
        contentType: "application/json",
        confirmedWrite: true,
      }),
      /not allowlisted/
    )
    const created = await runUpstreamAction({
      graph,
      config,
      selector: "createUser",
      body: "{}",
      contentType: "application/json",
      confirmedWrite: true,
    })
    assert.equal(created.status, 201)
    await assert.rejects(
      runUpstreamAction({ graph, config, selector: "large" }),
      /maxResponseBytes/
    )
    await assert.rejects(
      runUpstreamAction({ graph, config, selector: "redirect" }),
      /Cross-origin redirects/
    )
    await assert.rejects(
      runUpstreamAction({ graph, config, selector: "slow" }),
      /timed out/
    )
    await assert.rejects(
      runUpstreamAction({ graph, config, selector: "events" }),
      /Unsupported upstream response content type/
    )
  } finally {
    delete process.env.DOCKS_TEST_CLIENT
    await new Promise((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise()))
    )
  }
}

async function testInstaller(projectRoot) {
  const cli = resolve("dist/package/cli.js")
  const environment = { ...process.env, HOME: projectRoot }
  await run(process.execPath, [cli, "install"], {
    cwd: projectRoot,
    env: environment,
  })
  const skill = join(projectRoot, ".agents", "skills", "docks", "SKILL.md")
  const installedSkill = await readFile(skill, "utf8")
  assert.match(installedSkill, /^---/)
  assert.match(installedSkill, /Do not grep, ripgrep/)
  await run(process.execPath, [cli, "install"], {
    cwd: projectRoot,
    env: environment,
  })
  await writeFile(skill, `${await readFile(skill, "utf8")}\nmodified\n`)
  await assert.rejects(
    run(process.execPath, [cli, "install"], {
      cwd: projectRoot,
      env: environment,
    })
  )
  await run(process.execPath, [cli, "install", "--force"], {
    cwd: projectRoot,
    env: environment,
  })
  await run(process.execPath, [cli, "uninstall"], {
    cwd: projectRoot,
    env: environment,
  })
  await assert.rejects(readFile(skill, "utf8"))
  await run(process.execPath, [cli, "install", "--global"], {
    cwd: projectRoot,
    env: environment,
  })
  assert.match(
    await readFile(
      join(projectRoot, ".agents", "skills", "docks", "SKILL.md"),
      "utf8"
    ),
    /# Docks/
  )
  await run(process.execPath, [cli, "uninstall", "--global"], {
    cwd: projectRoot,
    env: environment,
  })
}

function actionNode(operationKey, operationId, method, url, extra = {}) {
  return {
    id: `operation:${operationKey}`,
    type: "operation",
    label: operationId,
    searchText: `${operationKey} ${operationId}`.toLowerCase(),
    attributes: {
      operationKey,
      operationId,
      method,
      url,
      transport: "http",
      mode: "standard",
      parameters:
        method === "GET" && operationId === "getUser"
          ? [
              { in: "path", name: "id", required: true },
              { in: "header", name: "x-client" },
            ]
          : [],
      ...extra,
    },
  }
}

function createConfig(actionOverrides = {}) {
  return {
    databaseUrlEnv: "DATABASE_URL",
    workspaceId: null,
    knowledgeOutput: "docks-out",
    actions: {
      allowedOrigins: [],
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      allowedOperations: [],
      headerEnvironment: {},
      timeoutMs: 1_000,
      maxResponseBytes: 1_048_576,
      ...actionOverrides,
    },
  }
}

class KnowledgePool {
  revision = 7

  async query(text) {
    const sql = text.replace(/\s+/g, " ").toLowerCase()
    if (sql.includes("from skaper.workspaces as workspace")) {
      return {
        rows: [
          {
            id: "test-workspace",
            revision: this.revision,
            updated_at: "2026-01-01T00:00:00.000Z",
            source_url: "https://api.example/openapi.json",
            document_hash: "document-hash",
          },
        ],
      }
    }
    if (sql.includes("from skaper.api_sources where")) {
      return {
        rows: [
          {
            source_url: "https://api.example/openapi.json",
            document_hash: "document-hash",
            synced_at: "2026-01-01T00:00:00.000Z",
            document: {
              openapi: "3.1.0",
              info: { title: "Users API", version: "1.0.0" },
              servers: [{ url: "https://api.example" }],
              paths: {
                "/users/{id}": {
                  get: {
                    operationId: "getUser",
                    summary: "Get user",
                    tags: ["Users"],
                    parameters: [{ in: "path", name: "id", required: true }],
                    responses: {
                      200: {
                        content: {
                          "application/json": {
                            schema: { $ref: "#/components/schemas/User" },
                          },
                        },
                      },
                    },
                  },
                },
              },
              components: { schemas: { User: { type: "object" } } },
            },
          },
        ],
      }
    }
    if (sql.includes("from skaper.environments where")) {
      return {
        rows: [
          {
            id: "env",
            name: "Development",
            base_url: "https://api.example",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }
    }
    if (sql.includes("from skaper.environment_variables")) {
      return {
        rows: [
          {
            environment_id: "env",
            id: "public",
            key: "region",
            value: "us",
            enabled: true,
            is_secret: false,
            description: "",
          },
          {
            environment_id: "env",
            id: "secret",
            key: "token",
            value: "database-secret",
            enabled: true,
            is_secret: true,
            description: "",
          },
        ],
      }
    }
    if (sql.includes("from skaper.collections where")) {
      return {
        rows: [
          {
            id: "collection",
            name: "Examples",
            position: 0,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }
    }
    if (sql.includes("from skaper.custom_requests")) return { rows: [] }
    if (sql.includes("from skaper.saved_responses")) {
      return {
        rows: [
          {
            id: "response",
            operation_id: "getUser",
            method: "GET",
            path: "/users/42",
            name: "Example",
            status: 200,
            ok: true,
            duration_ms: 10,
            size_bytes: 40,
            content_type: "application/json",
            request_snapshot: {},
            result: {
              bodyText: "database-secret",
              headers: [{ key: "authorization", value: "database-secret" }],
            },
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }
    }
    throw new Error(`Unexpected knowledge query: ${sql}`)
  }
}

try {
  await testKnowledgeBuild(root)
  await testDirectOpenApiKnowledge(root)
  await testRemoteOpenApiRefresh(root)
  await testActions()
  await testInstaller(root)
  console.log(
    "knowledge graph, controlled action, and skill installer tests passed"
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
