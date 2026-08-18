# Upstream actions

Configure non-secret allowlists with `docks actions configure`. Header mappings use `--header-env header=ENV_NAME`; only the environment-variable name is stored.

Run a documented operation with:

```text
docks action run <operation> \
  --parameters-json '{"path":{},"query":{},"header":{}}' \
  [--body-file path] [--content-type type] [--workspace ID]
```

For mutating methods, present the resolved operation, method/URL, input summary, credential header names, and side-effect warning. Only after explicit approval, repeat the command with `--confirmed-write`.

Use `--save-response` only on explicit request. It deliberately mutates the workspace and advances its revision.
