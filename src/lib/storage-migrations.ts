import type {
  PersistedCustomRequest,
  PersistedSavedResponse,
  RequestMode,
  RequestTransport,
} from "./api-reference-actions"

type LegacyRequestTransport = RequestTransport | "sse"

type LegacyCustomRequest = Omit<
  PersistedCustomRequest,
  "transport" | "mode"
> & {
  transport: LegacyRequestTransport
  mode?: RequestMode
}

type LegacySavedResponse = Omit<PersistedSavedResponse, "requestSnapshot"> & {
  requestSnapshot: Omit<
    PersistedSavedResponse["requestSnapshot"],
    "transport" | "mode"
  > & {
    transport?: LegacyRequestTransport
    mode?: RequestMode
  }
}

/** Converts legacy SSE transport records into HTTP requests with SSE mode. */
export function migrateCustomRequestsV3(
  requests: LegacyCustomRequest[]
): PersistedCustomRequest[] {
  const orderedHttpRequests = [
    ...sortRequests(requests.filter((request) => request.transport === "http")),
    ...sortRequests(requests.filter((request) => request.transport === "sse")),
  ]
  const httpPositions = new Map(
    orderedHttpRequests.map((request, position) => [request.id, position])
  )

  return requests.map((request) => {
    if (request.transport === "sse") {
      return {
        ...request,
        collectionId: "http-custom",
        method: "GET",
        transport: "http",
        mode: "sse",
        position: httpPositions.get(request.id) ?? request.position,
      }
    }

    const transport: RequestTransport = request.transport

    return {
      ...request,
      transport,
      method: transport === "websocket" ? "GET" : request.method,
      mode: transport === "http" ? (request.mode ?? "standard") : "standard",
      position:
        transport === "http"
          ? (httpPositions.get(request.id) ?? request.position)
          : request.position,
    }
  })
}

/** Adds explicit transport and mode metadata to historical request snapshots. */
export function migrateSavedResponseV3(
  response: LegacySavedResponse
): PersistedSavedResponse {
  const snapshot = response.requestSnapshot
  const legacyMethod = snapshot.method.toUpperCase()
  const transport: RequestTransport =
    snapshot.transport === "websocket" || legacyMethod === "WS"
      ? "websocket"
      : "http"
  const mode: RequestMode =
    snapshot.transport === "sse" ||
    snapshot.mode === "sse" ||
    legacyMethod === "SSE"
      ? "sse"
      : "standard"

  return {
    ...response,
    requestSnapshot: {
      ...snapshot,
      method:
        legacyMethod === "SSE" || legacyMethod === "WS"
          ? "GET"
          : snapshot.method,
      transport,
      mode,
    },
  }
}

function sortRequests(requests: LegacyCustomRequest[]) {
  return [...requests].sort(
    (a, b) =>
      a.position - b.position ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id)
  )
}
