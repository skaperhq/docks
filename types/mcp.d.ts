import type { IncomingMessage, ServerResponse } from "node:http"

export type DocksOpenApiDocument = Record<string, unknown>

export type DocksOpenApiSource = string | URL | DocksOpenApiDocument

export type DocksOperationSummary = {
  source: "openapi" | "custom"
  key: string
  operationId?: string
  method: string
  path: string
  summary: string
  tags: string[]
  executable: boolean
}

export type DocksApiHeadersContext = {
  operation: DocksOperationSummary
  /** Client headers selected and renamed by clientHeaders.forward. */
  forwardedHeaders: Record<string, string>
}

export type DocksHeadersInit =
  HeadersInit | Record<string, string | string[] | undefined>

export type DocksMcpOptions = {
  /** OpenAPI 3.0 or 3.1 URL, JSON/YAML file, URL object, or document object. */
  openapi: DocksOpenApiSource
  /** Optional MCP server display name. */
  name?: string
  /** Optional absolute API server URL overriding the OpenAPI servers array. */
  baseUrl?: string
  /** Server-side headers used only while retrieving a remote OpenAPI document. */
  openapiHeaders?: DocksHeadersInit
  /** Explicit incoming MCP HTTP header forwarding and renaming rules. */
  clientHeaders?: {
    forward?: Record<string, string>
  }
  /** Server-controlled API headers. These override forwarded and documented headers. */
  apiHeaders?:
    | DocksHeadersInit
    | ((
        context: DocksApiHeadersContext
      ) => DocksHeadersInit | Promise<DocksHeadersInit>)
  /** Simple bearer protection for the HTTP MCP handler. */
  mcpBearerToken?: string
  /** Custom HTTP MCP authorization. Cannot be combined with mcpBearerToken. */
  authorizeMcpRequest?: (
    request: Request
  ) => boolean | Response | Promise<boolean | Response>
  /** Optional exact Host header allowlist enabling DNS-rebinding protection. */
  allowedHosts?: string[]
  /** Live custom API knowledge source, such as createDocksPostgres(). */
  knowledge?: {
    getCustomRequests: () => Promise<unknown[]>
  }
  execution?: {
    /** Replaces the default GET, HEAD, OPTIONS allowlist. */
    allowedMethods?: string[]
    /** Additional allowed operationIds or canonical METHOD /path keys. */
    allowedOperations?: string[]
    /** Exact HTTP(S) origins permitted for workspace custom requests. */
    allowedOrigins?: string[]
    /** Upstream timeout in milliseconds. Defaults to 30000. */
    timeoutMs?: number
    /** Maximum returned response bytes. Defaults to 1048576. */
    maxResponseBytes?: number
  }
}

export type DocksMcp = {
  /** The loaded, immutable API model. */
  readonly model: unknown
  /** Stateless Streamable HTTP handler for Web Request runtimes such as Hono. */
  fetch: (request: Request) => Promise<Response>
  /** Stateless Streamable HTTP handler for Node.js and Express. */
  nodeHandler: (
    request: IncomingMessage,
    response: ServerResponse
  ) => Promise<void>
  /** Connects the MCP server to stdin/stdout. May be called once. */
  connectStdio: () => Promise<void>
  /** Closes active MCP server connections. */
  close: () => Promise<void>
}

export declare function createDocksMcp(
  options: DocksMcpOptions
): Promise<DocksMcp>
