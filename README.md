# Docks

Docks is a self-contained OpenAPI documentation and request workspace for Node.js routes. It provides isolated, session-only request tabs and optional shared PostgreSQL persistence.

## Install

```bash
npm install @skaper/docks
```

Mount the UI with only the OpenAPI URL. Without `database`, Docks uses browser-local IndexedDB.

```ts
import { docksUI } from "@skaper/docks"

app.get(
  "/docs",
  docksUI({
    url: "/openapi.json",
  })
)
```

For a shared workspace, pass the PostgreSQL URL directly. Docks owns pooling, idempotent migrations, workspace initialization, and storage routing.

```ts
app.all(
  "/docs",
  docksUI({
    url: "/openapi.json",
    database: process.env.DATABASE_URL,
    title: "Billing API",
    password: process.env.DOCKS_PASSWORD,
  })
)
```

`url` is required. `database`, `title`, `nonce`, `password`, `workspaceId`, and `relay` are optional. If `password` is omitted, the host application is responsible for authentication and rate limiting on the Docks route. The default workspace ID is derived from the OpenAPI URL.

The handler accepts its storage actions as `POST` requests on the same mounted route. Use a route registration that handles both `GET` and `POST` when PostgreSQL is enabled.

## Request tabs

Every sidebar, search, overview, saved-response, or custom-request selection opens a new Docks tab instance. Drafts, response state, active panels, SSE streams, and WebSockets are isolated by instance and are not restored after reload.

Saved custom requests act as templates. Tab edits remain local until **Save changes** is selected. Updating one source does not change its other open clones. Deleting the source closes all derived tabs.

## Operations

Migrations normally run automatically. For diagnostics or managed deployment workflows:

```bash
docks db migrate
docks db migrate --dry-run
```

All tables remain in the qualified `skaper` schema. The legacy `skaper.request_tabs` table has been retired and dropped via migration.

## Relay

`createDocksRelay` remains available for browser requests that must reach exact, explicitly allowed cross-origin destinations. The relay keeps its existing origin, private-network, HTTP, and WebSocket controls.
