# Skaper

Skaper is an API documentation and request workspace for OpenAPI specs. The MVP is designed to mount as a route inside a Node.js API, with browser-first persistence so developers can add docs without provisioning a database.

## MVP Storage Model

The default storage is IndexedDB:

- request tabs
- edited request params, headers, and bodies
- environments and variables
- saved responses
- response panel preferences

IndexedDB keeps the package lightweight because it does not need a writable server filesystem, migrations, or native install steps. It is scoped to the user's browser profile, which is usually the right default for API docs embedded in a developer's app.

## Bring Your Own Storage

Package consumers can replace the default browser storage with their own adapter. This is the hook for a Postgres-backed implementation without making Skaper depend on a Postgres driver:

```ts
import {
  createPostgresStorageAdapter,
  setDocksStorageAdapter,
} from "just-skaper/storage"

setDocksStorageAdapter(
  createPostgresStorageAdapter({
    async getApiWorkspace() {
      // read collections, custom requests, tabs, and saved responses
    },
    async upsertCustomRequest({ data }) {
      // write to your Postgres tables
      return data
    },
    // implement the rest of the StorageAdapter contract
  })
)
```

The adapter boundary keeps Skaper npm-friendly: IndexedDB works out of the box for embedded docs, while teams that need shared persistence can pass a Postgres implementation from their application layer.

## Request Protocols

HTTP requests support standard request/response behavior and Server-Sent Events (SSE). SSE is stored as HTTP with `mode: "sse"` and uses the browser's native `EventSource`, so it is GET-only and sends URL/query parameters and browser-managed cookies rather than custom headers or a request body. WebSocket remains a separate transport.

## Current App

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
```

The app currently renders the mock OpenAPI spec from `src/data/mock-openapi.json`. The next package step is to load the spec from route configuration instead of importing a fixed JSON file.

## Contributing

Run `npm test` for the unit suite and `npm run typecheck` before opening a pull request. Public APIs use TSDoc comments so their contracts appear in editors and generated documentation; implementation comments are reserved for behavior that is not clear from the code itself.

## License

MIT
