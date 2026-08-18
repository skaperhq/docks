# Knowledge queries

- Search: `docks knowledge query "question" [--workspace ID]`
- Explain one node: `docks knowledge explain "node" [--workspace ID]`
- Find a relationship path: `docks knowledge path "from" "to" [--workspace ID]`

The query output is compact JSON containing operation metadata, parameters, response schemas, and graph relationships. Use it directly as evidence. Preserve relationship confidence labels: `EXTRACTED`, `INFERRED`, and `AMBIGUOUS`.

Follow this fallback order:

1. Run `docks knowledge query "<the user's question>"`.
2. Run `docks knowledge explain "<exact returned node id>"` when more detail is required.
3. Run `docks knowledge path "<exact from id>" "<exact to id>"` to verify a relationship.
4. Refine the Docks query with an operation ID, method/path, schema, collection, environment, or exact node ID.

Do not search generated artifacts, OpenAPI source, project source, or terminal-output files with text-processing commands. Report that Docks did not return sufficient knowledge if the command sequence above cannot establish the answer.
