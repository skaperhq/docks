# Docks

Docks is a self-contained OpenAPI documentation and request workspace for Node.js routes. It provides isolated, session-only request tabs, optional shared PostgreSQL persistence, and a project-local agent skill backed by a persistent API knowledge graph. The graph can be built directly from OpenAPI without a database.

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

For a shared workspace and workspace-enriched agent knowledge, pass the PostgreSQL URL directly. Docks owns pooling, idempotent migrations, workspace initialization, and storage routing.

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

## Agent skill and knowledge graph

Install the project-local `/docks` Agent Skill:

```bash
npx @skaper/docks install
```

The default target is `.agents/skills/docks`; use `--global` for `~/.agents/skills/docks`. The installer refuses to replace modified skill files unless `--force` is supplied.

Project configuration lives at `.docks/config.json`. It stores environment-variable names and allowlists, never credentials:

```json
{
  "url": null,
  "databaseUrlEnv": "DATABASE_URL",
  "workspaceId": null,
  "knowledgeOutput": "docks-out",
  "actions": {
    "allowedOrigins": [],
    "allowedMethods": ["GET", "HEAD", "OPTIONS"],
    "allowedOperations": [],
    "headerEnvironment": {},
    "timeoutMs": 30000,
    "maxResponseBytes": 1048576
  }
}
```

Build and query deterministic artifacts:

```bash
docks knowledge build --url ./openapi.json
docks knowledge status
docks knowledge query "Which operation returns a User?"
docks knowledge explain getUser
docks knowledge path getUser User
```

`--url` accepts an HTTP(S) URL or a project-local JSON/YAML file and saves the source in `.docks/config.json`. A configured `url` selects direct, database-free mode even when `DATABASE_URL` exists in the shell. It can be omitted when one conventional `openapi.*` or `swagger.*` file exists at the project root. PostgreSQL is optional: without it the graph contains OpenAPI operations, schemas, auth schemes, and tags; with it Docks also includes collections, custom requests, environments, non-secret variables, and saved-response metadata.

Artifacts are generated atomically under `docks-out/`. Every knowledge command revalidates the source before reading the graph. Direct HTTP sources are fetched with no-cache semantics and rebuilt when the document hash changes; database-backed graphs are rebuilt when the workspace revision changes. `knowledge status` also refreshes stale output and reports whether it rebuilt. Response bodies are excluded unless `--include-response-bodies` is explicitly supplied.

Knowledge commands return compact JSON intended to be consumed directly by agents. `query` returns ranked nodes with operation parameters, response-schema summaries, and relationships; use `explain` with an exact returned node ID for detail and `path` to verify traversal. Agents should not grep generated graph or terminal-output files.

## Controlled upstream actions

Configure exact origins, methods, operations, and environment-backed headers:

```bash
docks actions configure \
  --allow-origin https://api.example.com \
  --allow-operation createInvoice \
  --header-env authorization=API_AUTHORIZATION
```

Actions resolve operations from the knowledge graph and cannot accept arbitrary URLs:

```bash
docks action run getInvoice \
  --parameters-json '{"path":{"id":"inv_123"}}'
```

Mutating methods must be allowlisted and require explicit user approval plus `--confirmed-write`. Credentials are read only from configured environment variables and are never stored in arguments, configuration values, graph artifacts, or output. Use `--save-response` only when the result should deliberately be persisted and advance the workspace revision.

SSE, WebSocket, multipart/binary upload, streaming execution, cross-origin redirects, oversized responses, and unsafe agent-supplied headers are rejected.

## Operations

Migrations normally run automatically. For diagnostics or managed deployment workflows:

```bash
docks db migrate
docks db migrate --dry-run
```

All tables remain in the qualified `skaper` schema. The legacy `skaper.request_tabs` table is retained for migration compatibility but is no longer read or written by active adapters.

## Relay

`createDocksRelay` remains available for browser requests that must reach exact, explicitly allowed cross-origin destinations. The relay is independent of agent actions and keeps its existing origin, private-network, HTTP, and WebSocket controls.
