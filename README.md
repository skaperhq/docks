# Skaper

Skaper is a self-contained OpenAPI documentation and API request UI for Node.js routes. Give it the URL of an OpenAPI JSON document and mount the returned handler in your server.

## Install

```bash
npm install @skaper/docks
```

Skaper does not require a React component, a CSS import, or static asset hosting in the consuming project.

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
