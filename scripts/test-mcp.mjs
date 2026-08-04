import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { createDocksMcp, __testing } from "../dist/package/mcp.js"

const execFileAsync = promisify(execFile)

const upstream = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost")
  response.setHeader("content-type", "application/json")
  response.end(
    JSON.stringify({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: {
        authorization: request.headers.authorization,
        tenant: request.headers["x-tenant-id"],
        apiClient: request.headers["x-api-client"],
        requestId: request.headers["x-request-id"],
        notAllowed: request.headers["x-not-allowed"],
        mcpProtocol: request.headers["mcp-protocol-version"],
      },
    })
  )
})
await listen(upstream)
const upstreamOrigin = originOf(upstream)

const document = {
  openapi: "3.1.0",
  info: { title: "MCP Test API", version: "1.0.0" },
  servers: [{ url: `${upstreamOrigin}/v1` }],
  components: {
    securitySchemes: {
      ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
  paths: {
    "/echo/{id}": {
      get: {
        operationId: "getEcho",
        summary: "Get echo",
        tags: ["Echo"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "X-Request-ID", in: "header", schema: { type: "string" } },
          { name: "X-API-Key", in: "header", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Echo response",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
      post: {
        operationId: "createEcho",
        summary: "Create echo",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { 200: { description: "Created" } },
      },
    },
    "/events": {
      get: {
        operationId: "events",
        responses: {
          200: {
            description: "Events",
            content: { "text/event-stream": {} },
          },
        },
      },
    },
  },
}

let customRequestName = "Workspace status"
let knowledgeReads = 0
const knowledge = {
  async getCustomRequests() {
    knowledgeReads += 1
    return [
      {
        id: "workspace-status",
        collectionId: "external-services",
        name: customRequestName,
        method: "GET",
        transport: "http",
        mode: "standard",
        url: `${upstreamOrigin}/custom-status`,
        draft: {
          params: [
            {
              key: "check",
              value: "ready",
              description: "Status check",
              enabled: true,
            },
          ],
          headers: [
            {
              key: "Authorization",
              value: "Bearer persisted-secret",
              description: "API credential",
              enabled: true,
            },
          ],
          body: { mode: "none", contentType: "", value: "" },
        },
      },
    ]
  },
}

assert.throws(
  () => __testing.normalizeForwarding({ Authorization: "authorization" }),
  /cannot be forwarded/
)
assert.throws(
  () => __testing.normalizeForwarding({ "x-safe": "host" }),
  /cannot be forwarded/
)

const mcpHttpServer = createServer(async (request, response) => {
  if (request.url !== "/mcp") {
    response.statusCode = 404
    response.end()
    return
  }
  await mcp.nodeHandler(request, response)
})
await listen(mcpHttpServer)
const mcpOrigin = originOf(mcpHttpServer)
const mcpPort = new URL(mcpOrigin).port

const mcp = await createDocksMcp({
  openapi: document,
  knowledge,
  mcpBearerToken: "mcp-secret",
  allowedHosts: [`127.0.0.1:${mcpPort}`],
  clientHeaders: {
    forward: {
      "x-docks-api-authorization": "authorization",
      "x-tenant-id": "x-tenant-id",
    },
  },
  apiHeaders: async ({ operation, forwardedHeaders }) => {
    assert.equal(
      operation.key.startsWith("GET ") || operation.key.startsWith("custom:"),
      true
    )
    assert.equal(forwardedHeaders.authorization, "Bearer upstream-secret")
    assert.equal(forwardedHeaders["x-tenant-id"], "tenant-123")
    return { "x-api-client": "docks-test", "x-tenant-id": "host-tenant" }
  },
  execution: { allowedOrigins: [upstreamOrigin] },
})

const unauthorized = await fetch(`${mcpOrigin}/mcp`, { method: "POST" })
assert.equal(unauthorized.status, 401)

const transport = new StreamableHTTPClientTransport(
  new URL(`${mcpOrigin}/mcp`),
  {
    requestInit: {
      headers: {
        Authorization: "Bearer mcp-secret",
        "X-Docks-API-Authorization": "Bearer upstream-secret",
        "X-Tenant-ID": "tenant-123",
        "X-Not-Allowed": "must-not-leak",
      },
    },
  }
)
const client = new Client({ name: "docks-test", version: "1.0.0" })
await client.connect(transport)

const tools = await client.listTools()
assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
  "call_api",
  "get_api_operation",
  "get_api_overview",
  "search_api",
])

const resources = await client.listResources()
assert.ok(
  resources.resources.some(
    (resource) => resource.uri === "docks://api/overview"
  )
)
assert.ok(
  resources.resources.some((resource) => resource.uri.includes("GET%20%2Fecho"))
)

const search = await client.callTool({
  name: "search_api",
  arguments: { query: "echo" },
})
assert.equal(search.isError, undefined)
assert.equal(search.structuredContent.results.length, 2)

const customSearch = await client.callTool({
  name: "search_api",
  arguments: { query: "Workspace status" },
})
assert.equal(customSearch.structuredContent.results.length, 1)
assert.equal(
  customSearch.structuredContent.results[0].key,
  "custom:workspace-status"
)
assert.equal(customSearch.structuredContent.results[0].source, "custom")

const multiTermCustomSearch = await client.callTool({
  name: "search_api",
  arguments: { query: "external-services GET status" },
})
assert.equal(multiTermCustomSearch.structuredContent.results.length, 1)
assert.equal(
  multiTermCustomSearch.structuredContent.results[0].key,
  "custom:workspace-status"
)

const customDetail = await client.callTool({
  name: "get_api_operation",
  arguments: { operation: "custom:workspace-status" },
})
assert.equal(customDetail.structuredContent.source, "custom")
assert.doesNotMatch(JSON.stringify(customDetail), /persisted-secret/)

const deniedCustomModel = __testing.addCustomOperations(
  __testing.createApiModel(document, document),
  await knowledge.getCustomRequests()
)
await assert.rejects(
  __testing.executeOperation({
    model: deniedCustomModel,
    operationName: "custom:workspace-status",
    parameters: {},
    forwardedHeaders: new Headers(),
    execution: __testing.normalizeExecutionOptions(),
  }),
  (error) => error.code === "ORIGIN_NOT_ALLOWED"
)

customRequestName = "Fresh workspace status"
const refreshedSearch = await client.callTool({
  name: "search_api",
  arguments: { query: "Fresh workspace status" },
})
assert.equal(refreshedSearch.structuredContent.results.length, 1)
assert.ok(knowledgeReads >= 4)

const detail = await client.callTool({
  name: "get_api_operation",
  arguments: { operation: "getEcho" },
})
assert.equal(detail.structuredContent.key, "GET /echo/{id}")

const call = await client.callTool({
  name: "call_api",
  arguments: {
    operation: "getEcho",
    parameters: {
      path: { id: "abc" },
      query: { q: "hello" },
      header: { "x-request-id": "request-1" },
    },
  },
})
assert.equal(call.isError, undefined)
assert.equal(call.structuredContent.status, 200)
assert.deepEqual(call.structuredContent.body, {
  method: "GET",
  path: "/v1/echo/abc",
  query: { q: "hello" },
  headers: {
    authorization: "Bearer upstream-secret",
    tenant: "host-tenant",
    apiClient: "docks-test",
    requestId: "request-1",
  },
})

const customCall = await client.callTool({
  name: "call_api",
  arguments: { operation: "custom:workspace-status" },
})
assert.equal(customCall.isError, undefined)
assert.equal(customCall.structuredContent.body.path, "/custom-status")
assert.deepEqual(customCall.structuredContent.body.query, { check: "ready" })
assert.equal(
  customCall.structuredContent.body.headers.authorization,
  "Bearer upstream-secret"
)

const toolCredential = await client.callTool({
  name: "call_api",
  arguments: {
    operation: "getEcho",
    parameters: {
      path: { id: "abc" },
      header: { "X-API-Key": "model-secret" },
    },
  },
})
assert.equal(toolCredential.isError, true)
assert.equal(toolCredential.structuredContent.code, "INVALID_INPUT")

const denied = await client.callTool({
  name: "call_api",
  arguments: { operation: "createEcho", body: { hello: "world" } },
})
assert.equal(denied.isError, true)
assert.equal(denied.structuredContent.code, "OPERATION_NOT_ALLOWED")

const stream = await client.callTool({
  name: "call_api",
  arguments: { operation: "events" },
})
assert.equal(stream.isError, true)
assert.equal(stream.structuredContent.code, "UNSUPPORTED_OPERATION")

const tempDirectory = await mkdtemp(join(tmpdir(), "docks-mcp-"))
const yamlPath = join(tempDirectory, "openapi.yaml")
const schemasPath = join(tempDirectory, "schemas.yaml")
await writeFile(
  schemasPath,
  "User:\n  type: object\n  properties:\n    name:\n      type: string\n    manager:\n      $ref: '#/User'\n"
)
await writeFile(
  yamlPath,
  "openapi: 3.0.3\ninfo:\n  title: YAML API\n  version: 1.0.0\npaths: {}\ncomponents:\n  schemas:\n    User:\n      $ref: './schemas.yaml#/User'\n"
)
const yamlMcp = await createDocksMcp({ openapi: yamlPath })
assert.equal(yamlMcp.model.info.title, "YAML API")
assert.equal(yamlMcp.model.document.components.schemas.User.type, "object")
assert.match(
  JSON.stringify(yamlMcp.model.document.components.schemas.User),
  /"\$ref":"#\/User"/
)
await yamlMcp.close()

const stdioTransport = new StdioClientTransport({
  command: process.execPath,
  args: [
    new URL("../dist/package/cli.js", import.meta.url).pathname,
    "mcp",
    yamlPath,
  ],
  stderr: "pipe",
})
const stdioClient = new Client({ name: "docks-stdio-test", version: "1.0.0" })
await stdioClient.connect(stdioTransport)
const stdioTools = await stdioClient.listTools()
assert.equal(stdioTools.tools.length, 4)
await stdioClient.close()

const cliPath = new URL("../dist/package/cli.js", import.meta.url).pathname
const dryRun = await execFileAsync(process.execPath, [
  cliPath,
  "add",
  "vscode",
  "https://api.example.com/mcp",
  "--name",
  "acme-api",
  "--dry-run",
])
assert.match(dryRun.stdout, /"name": "acme-api"/)
assert.match(dryRun.stdout, /"type": "http"/)
assert.match(dryRun.stdout, /https:\/\/api\.example\.com\/mcp/)

const databaseDryRun = await execFileAsync(process.execPath, [
  cliPath,
  "db",
  "migrate",
  "--dry-run",
])
assert.match(databaseDryRun.stdout, /CREATE SCHEMA IF NOT EXISTS skaper/)
assert.doesNotMatch(databaseDryRun.stdout, /\bpublic\s*\./i)

const fakeCodePath = join(tempDirectory, "fake-code.mjs")
const fakeCodeOutput = join(tempDirectory, "code-arguments.json")
await writeFile(
  fakeCodePath,
  "#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(process.env.DOCKS_TEST_CODE_OUTPUT, JSON.stringify(process.argv.slice(2)))\n"
)
await chmod(fakeCodePath, 0o755)
const installed = await execFileAsync(
  process.execPath,
  [
    cliPath,
    "add",
    "vscode",
    "https://api.example.com/mcp",
    "--name",
    "acme-api",
  ],
  {
    env: {
      ...process.env,
      DOCKS_VSCODE_COMMAND: fakeCodePath,
      DOCKS_TEST_CODE_OUTPUT: fakeCodeOutput,
    },
  }
)
assert.match(installed.stdout, /Added "acme-api" to VS Code/)
const codeArguments = JSON.parse(await readFile(fakeCodeOutput, "utf8"))
assert.equal(codeArguments[0], "--add-mcp")
assert.deepEqual(JSON.parse(codeArguments[1]), {
  name: "acme-api",
  type: "http",
  url: "https://api.example.com/mcp",
})

await client.close()
await mcp.close()
await close(mcpHttpServer)
await close(upstream)

console.log(
  "MCP tools, HTTP transport, execution, and header forwarding tests passed"
)

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
}

function originOf(server) {
  const address = server.address()
  assert.ok(address && typeof address === "object")
  return `http://127.0.0.1:${address.port}`
}
