# Knowledge build

Run `docks knowledge build [--workspace ID] [--url SOURCE]`. `SOURCE` may be an HTTP(S) URL or a project-local JSON/YAML file; passing it saves the source in `.docks/config.json` and selects direct mode even when `DATABASE_URL` exists. With no database, the graph contains OpenAPI knowledge. PostgreSQL enriches it with workspace collections, requests, environments, variables, and response metadata.

The build writes `graph.json`, `DOCKS_REPORT.md`, `manifest.json`, and progressive references under the configured output directory. A direct-source manifest tracks the document hash; a database manifest tracks the workspace revision. Every knowledge command revalidates this marker and atomically rebuilds stale output. Remote OpenAPI checks request fresh content with no-cache semantics. `knowledge status` performs the rebuild when needed and reports `refreshed: true`.

Response bodies are excluded by default. Use `--include-response-bodies` only when the user requests body-level knowledge and warn that deterministic redaction cannot guarantee removal of unknown personal data.

Writes are atomic; do not edit generated files as source data.
