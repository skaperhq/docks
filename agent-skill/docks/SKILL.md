---
name: docks
description: Build and query the project-local Docks API knowledge graph, explain relationships, find paths, and prepare tightly controlled upstream API calls. Use when answering questions about a Docks workspace, its OpenAPI operations and schemas, saved requests, collections, environments, or responses, or when the user asks to call a documented upstream API operation.
---

# Docks

Use `./node_modules/.bin/docks` from the project root. Use bare `docks` only for an intentional global package installation. If neither executable launches, report that Docks must be installed or reinstalled; do not search package files for another launcher and do not invoke the unrelated unscoped `docks` package. The CLI reads `.docks/config.json` and refreshes `docks-out/` from either the configured OpenAPI source or an optional PostgreSQL workspace. Never print database URLs or credential values.

## Workflow

1. Run `docks knowledge status`. This refreshes stale artifacts before returning. If no source is configured, locate the project OpenAPI file and run `docks knowledge build --url <project-local-file-or-http-url>`. If a database contains multiple workspaces, ask which ID to use and pass `--workspace ID`.
2. For API questions, use `docks knowledge query`, `explain`, or `path`. Every command revalidates the source and rebuilds stale artifacts automatically. Read [references/query.md](references/query.md).
3. For an explicit rebuild or response-body opt-in, read [references/build.md](references/build.md).
4. For an upstream request, read [references/actions.md](references/actions.md) and [references/security.md](references/security.md) before running it.

For API-knowledge questions, use only the Docks `query`, `explain`, and `path` commands as the retrieval interface. Do not grep, ripgrep, `jq`, `sed`, or directly search `graph.json`, generated references, OpenAPI files, source code, package files, or terminal-capture files to reconstruct an answer or locate a launcher. If `query` is insufficient, run `explain` on an exact returned node ID, then `path` for relationship traversal.

## Safety boundaries

- Execute only graph-resolved operations; do not construct arbitrary URLs.
- Never put credential values in prompts, commands, config files, artifacts, or output.
- Before any mutating method, show the resolved method and URL, parameter/body summary, credential header names, and a side-effect warning. Obtain explicit user approval, then pass `--confirmed-write`.
- Do not add `--save-response` unless the user explicitly asks to persist the result.
- Do not bypass origin, method, operation, redirect, timeout, size, upload, streaming, or header controls.
