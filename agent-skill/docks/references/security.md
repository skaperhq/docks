# Action security

- Operations must resolve from the generated graph; arbitrary URLs are forbidden.
- Final origins must appear in `actions.allowedOrigins`.
- `GET`, `HEAD`, and `OPTIONS` are enabled by default. Other methods need a method or exact-operation allowlist and `--confirmed-write`.
- Credentials come only from configured environment mappings and override other headers. Never disclose their values.
- Agent-provided authorization, cookie, proxy, host, forwarding, and hop-by-hop headers are blocked.
- Cross-origin redirects, SSE, WebSockets, multipart or binary uploads, streaming, oversized responses, and unsupported response content types are rejected.
- Response cookies and sensitive headers are removed before output.
