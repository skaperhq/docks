# Skaper

Skaper is a self-contained OpenAPI documentation, API request UI, and MCP server for Node.js routes. Mount the browser workspace in your app or give coding agents and custom agent frameworks controlled access to the same API knowledge.

## Install

```bash
npm install @skaper/docks
```

Skaper does not require a React component, a CSS import, or static asset hosting in the consuming project.

## MCP server

Skaper turns an OpenAPI 3.0 or 3.1 document into four stable MCP tools:

- `get_api_overview`
- `search_api`
- `get_api_operation`
- `call_api`

It also exposes overview, source document, and operation resources under
`skaper://api/*`. The server accepts JSON or YAML from a local file, an HTTP(S)
URL, or an object supplied through the library API.

### Add a hosted MCP to VS Code

When an API already hosts Skaper's Streamable HTTP endpoint, add it to VS Code
with one command:

```bash
npx @skaper/docks add vscode https://api.example.com/mcp
```

Use `--name acme-api` to choose the server name. The command uses VS Code's
native MCP installer and does not start a local process or require the OpenAPI
file on the developer's machine. Preview the generated definition without
installing it with `--dry-run`.

Do not put credentials in the URL or command. Authentication options will be
configured separately so tokens are not stored in shell history.

### Coding agents and stdio

The CLI defaults to stdio, which is the simplest option for coding agents:

```json
{
  "mcpServers": {
    "acme-api": {
      "command": "npx",
      "args": [
        "-y",
        "@skaper/docks",
        "mcp",
        "./openapi.yaml",
        "--api-header-env",
        "authorization=ACME_API_AUTHORIZATION"
      ],
      "env": {
        "ACME_API_AUTHORIZATION": "Bearer ..."
      }
    }
  }
}
```

Pass server-controlled API credentials from environment variables without
putting them in model tool arguments:

```bash
skaper mcp ./openapi.yaml \
  --api-header-env authorization=ACME_API_AUTHORIZATION
```

Read-only HTTP methods (`GET`, `HEAD`, and `OPTIONS`) are executable by default.
Enable writes deliberately with repeatable `--allow-method` or
`--allow-operation` options.

### Self-hosted Streamable HTTP

```bash
export SKAPER_MCP_TOKEN="replace-me"

skaper mcp ./openapi.yaml \
  --transport http \
  --host 0.0.0.0 \
  --mcp-token-env SKAPER_MCP_TOKEN
```

The endpoint defaults to `http://127.0.0.1:3210/mcp`. Non-loopback servers
require a bearer token unless `--allow-unauthenticated` is explicitly set.
For production OAuth, put the endpoint behind your application middleware or an
OAuth-aware reverse proxy.

### Controlled client header forwarding

Headers received from LangChain or another HTTP MCP client are not forwarded
automatically. Select and optionally rename each allowed header:

```ts
import { createSkaperMcp } from "@skaper/docks/mcp"

const mcp = await createSkaperMcp({
  openapi: "./openapi.yaml",
  clientHeaders: {
    forward: {
      "x-skaper-api-authorization": "authorization",
      "x-tenant-id": "x-tenant-id",
    },
  },
  apiHeaders: async ({ operation, forwardedHeaders }) => ({
    "x-api-client": "skaper",
  }),
})
```

Use a separate header for the upstream token. The MCP `Authorization` header is
reserved for authenticating the MCP request and cannot be forwarded:

```py
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({
    "acme": {
        "transport": "http",
        "url": "https://mcp.example.com/mcp",
        "headers": {
            "Authorization": "Bearer MCP_ACCESS_TOKEN",
            "X-Skaper-API-Authorization": "Bearer UPSTREAM_API_TOKEN",
            "X-Tenant-ID": "tenant_123",
        },
    }
})
```

Server-configured `apiHeaders` override forwarded values. Hop-by-hop headers,
cookies, proxy headers, MCP protocol headers, and forwarding metadata are always
blocked and credentials are never returned in tool output.

### Mount in Hono or Express

```ts
import { createSkaperMcp } from "@skaper/docks/mcp"

const mcp = await createSkaperMcp({
  openapi: "./openapi.yaml",
  baseUrl: "https://api.example.com",
  mcpBearerToken: process.env.SKAPER_MCP_TOKEN,
})

// Hono / Web Request
app.all("/mcp", (context) => mcp.fetch(context.req.raw))

// Express / Node HTTP
expressApp.all("/mcp", mcp.nodeHandler)
```

`createSkaperMcp` also accepts `openapiHeaders`, `allowedHosts`, a custom
`authorizeMcpRequest`, and execution limits. API calls are restricted to the
configured or documented server origin, same-origin redirects, a 30-second
timeout, and a 1 MiB response by default. SSE, WebSocket, binary upload, and
multipart file execution are intentionally rejected in the first MCP release.

### Container recipe

The package does not publish an official image yet. A minimal deployment can run
the CLI directly:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY openapi.yaml ./openapi.yaml
RUN npm install --omit=dev @skaper/docks
EXPOSE 3210
CMD ["./node_modules/.bin/skaper", "mcp", "./openapi.yaml", "--transport", "http", "--host", "0.0.0.0", "--mcp-token-env", "SKAPER_MCP_TOKEN"]
```

## Hono

```ts
import { Hono } from "hono"
import { skaperUI } from "@skaper/docks"

const swagger = new Hono()

swagger.get("/", skaperUI({ url: "/docs/openapi.json" }))
```

You can also mount the handler directly on an existing app:

```ts
app.get("/docs", skaperUI({ url: "/docs/openapi.json" }))
```

## Express

```ts
import express from "express"
import { skaperUI } from "@skaper/docks"

const app = express()

app.get("/docs", skaperUI({ url: "/docs/openapi.json" }))
```

The configured URL is fetched by the browser, so it can be relative to the host application or an absolute URL with the appropriate CORS policy. For APIs that cannot enable CORS, configure the same-origin relay below.

## Cross-origin relay

The relay is opt-in and restricted to explicitly allowed upstream origins. Skaper continues to call same-origin APIs directly; only cross-origin OpenAPI, HTTP, SSE, and WebSocket traffic uses the relay.

### Express

```ts
import express from "express"
import { createSkaperRelay, skaperUI } from "@skaper/docks"

const app = express()
const relay = createSkaperRelay({
  path: "/docs/_relay",
  allowedOrigins: ["https://api.example.com"],
})

app.get(
  "/docs",
  skaperUI({
    url: "https://api.example.com/openapi.json",
    relay,
  })
)
app.post(relay.path, relay.handler)

const server = app.listen(3000)
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname
  if (pathname === relay.path) relay.handleUpgrade(request, socket, head)
})
```

Mount the relay before catch-all raw body parsers. It uses an opaque request body so normal JSON and URL-encoded parsers do not consume API payloads.

### Hono on Node.js

```ts
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { createSkaperRelay, skaperUI } from "@skaper/docks"

const app = new Hono()
const relay = createSkaperRelay({
  path: "/docs/_relay",
  allowedOrigins: ["https://api.example.com"],
})

app.get(
  "/docs",
  skaperUI({
    url: "https://api.example.com/openapi.json",
    relay,
  })
)
app.post(relay.path, relay.handler)

const server = serve({ fetch: app.fetch, port: 3000 })
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname
  if (pathname === relay.path) relay.handleUpgrade(request, socket, head)
})
```

`app.post(relay.path, relay.handler)` handles only that exact path; it does not intercept application API routes. The upgrade callback must likewise dispatch by pathname when the host already has WebSocket routes.

Allowlist entries are exact origins. An `https://` entry also authorizes the corresponding `wss://` endpoint. Private and localhost origins work when explicitly listed. Dynamic destinations can use `allowDestination`; callback-authorized private networks additionally require `allowPrivateNetwork: true`.

Protect deployed documentation and its relay using the host application's real authentication and rate limiting. The optional Skaper UI password is a convenience lock, not server-side authorization.

## Options

```ts
skaperUI({
  url: "/docs/openapi.json",
  title: "Acme API",
  workspaceId: "acme-api",
  nonce: "your-csp-nonce",
  relay,
})
```

- `url` is required and points to the OpenAPI JSON document.
- `title` sets the generated HTML document title.
- `workspaceId` is a stable identifier for this API's browser data. Skaper
  derives one from the host project and OpenAPI URL by default; set it
  explicitly when multiple apps are launched from the same project directory.
- `nonce` applies a Content Security Policy nonce to the embedded style and module script.
- `relay` enables automatic cross-origin execution using a relay returned by `createSkaperRelay`.

Skaper serves one complete HTML document. Its browser code and visual styles are embedded in that document, so there is no CSS or JavaScript asset for the host application to import or serve.

Request tabs, environments, variables, saved responses, and response preferences use a workspace-scoped IndexedDB database in the developer's browser. Different repositories do not share data even when they reuse the same localhost origin. No server database or writable filesystem is required.

## Development

```bash
npm run dev
npm run lint
npm run typecheck
npm test
```

Create an installable tarball with:

```bash
npm run package
```

## License

MIT
