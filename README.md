# Skaper

Skaper is a self-contained OpenAPI documentation and API request UI for Node.js routes. Give it the URL of an OpenAPI JSON document and mount the returned handler in your server.

## Install

```bash
npm install skaper
```

Skaper does not require a React component, a CSS import, static asset hosting, or any runtime dependencies in the consuming project.

## Hono

```ts
import { Hono } from "hono"
import { skaperUI } from "skaper"

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
import { skaperUI } from "skaper"

const app = express()

app.get("/docs", skaperUI({ url: "/docs/openapi.json" }))
```

The configured URL is fetched by the browser, so it can be relative to the host application or an absolute URL with the appropriate CORS policy.

## Options

```ts
skaperUI({
  url: "/docs/openapi.json",
  title: "Acme API",
  workspaceId: "acme-api",
  nonce: "your-csp-nonce",
})
```

- `url` is required and points to the OpenAPI JSON document.
- `title` sets the generated HTML document title.
- `workspaceId` is a stable identifier for this API's browser data. Skaper
  derives one from the host project and OpenAPI URL by default; set it
  explicitly when multiple apps are launched from the same project directory.
- `nonce` applies a Content Security Policy nonce to the embedded style and module script.

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
