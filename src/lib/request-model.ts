import type {
  PersistedCustomRequest,
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "./api-reference-actions"

export function normalizeRequestConfiguration({
  transport,
  mode,
  method,
}: {
  transport: RequestTransport
  mode: RequestMode
  method: RequestMethod
}) {
  const normalizedMode: RequestMode =
    transport === "websocket" ? "standard" : mode

  return {
    transport,
    mode: normalizedMode,
    method:
      transport === "websocket" ? "GET" : method,
  }
}

export function groupCustomRequestsByTransport(
  requests: PersistedCustomRequest[],
  query: string
) {
  const groups = new Map<RequestTransport, PersistedCustomRequest[]>([
    ["http", []],
    ["websocket", []],
  ])
  const normalizedQuery = query.trim().toLowerCase()

  for (const request of requests) {
    if (
      normalizedQuery &&
      !`${request.name} ${request.url} ${request.method} ${request.transport} ${request.mode}`
        .toLowerCase()
        .includes(normalizedQuery)
    ) {
      continue
    }

    groups.get(request.transport)?.push(request)
  }

  return groups
}
