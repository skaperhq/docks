import type {
  PersistedCustomRequest,
  RequestMode,
  RequestTransport,
} from "@/lib/api-reference-actions"
import type { ApiOperation } from "@/lib/openapi"

export type WorkspaceRequest = {
  id: string
  method: string
  displayPath: string
  tag: string
  summary: string
  requestUrl: string
  transport: RequestTransport
  mode: RequestMode
  isOpenApi: boolean
  hasEventStreamResponse: boolean
  operation?: ApiOperation
  customRequest?: PersistedCustomRequest
}

export function defaultUrlForRequest(
  transport: RequestTransport,
  mode: RequestMode
) {
  if (transport === "websocket") return "wss://api.example.com/socket"
  if (mode === "sse") return "https://api.example.com/events"
  return "https://api.example.com/resource"
}
