import type { Dispatch, SetStateAction } from "react"

import type {
  RequestDraft,
  ResponseState,
  SavedRequestSnapshot,
  ServerSentEvent,
  WebSocketConnectionStatus,
  WebSocketFrame,
} from "@/components/api-reference/types"
import {
  createRelayWebSocket,
  getRelayedResponseCookies,
  getRelayedResponseUrl,
} from "@/lib/relay"
import { openSseConnection } from "@/lib/sse/sse-request"
import type { WorkspaceRequest } from "@/lib/workspace-request"

type ResponseStateMap = Partial<Record<string, ResponseState>>
type WebSocketConnectionStateMap = Partial<
  Record<string, WebSocketConnectionStatus>
>

export type ActiveStream = {
  id: string
  close: () => void
  send?: (message: string) => boolean
  clear?: () => void
}

function createStreamSnapshot({
  request,
  url,
  draft,
  environment,
}: {
  request: WorkspaceRequest
  url: string
  draft: RequestDraft
  environment: SavedRequestSnapshot["environment"]
}): SavedRequestSnapshot {
  return {
    method: request.method,
    transport: request.transport,
    mode: request.mode,
    url,
    params: draft.params,
    headers: draft.headers,
    body: draft.body,
    environment,
    sentAt: new Date().toISOString(),
  }
}

function createStreamResult({
  status,
  statusText,
  url,
  startedAt,
  bodyText,
  websocketFrames,
}: {
  status: number
  statusText: string
  url: string
  startedAt: number
  bodyText: string
  websocketFrames?: WebSocketFrame[]
}) {
  return {
    status,
    statusText,
    ok: status === 101 || (status >= 200 && status < 400),
    durationMs: Math.round(performance.now() - startedAt),
    sizeBytes: new Blob([bodyText]).size,
    contentType: "text/plain; charset=utf-8",
    bodyText,
    headers: [],
    cookies: [],
    url,
    websocketFrames,
  }
}

export function connectWebSocketRequest({
  request,
  url,
  headers,
  draft,
  startedAt,
  setRequestSnapshotByOperationId,
  setResponseStateByOperationId,
  setWebSocketConnectionStateByOperationId,
  activeStreamRef,
  environment,
}: {
  request: WorkspaceRequest
  url: string
  headers: Headers
  draft: RequestDraft
  startedAt: number
  setRequestSnapshotByOperationId: Dispatch<
    SetStateAction<Partial<Record<string, SavedRequestSnapshot>>>
  >
  setResponseStateByOperationId: Dispatch<SetStateAction<ResponseStateMap>>
  setWebSocketConnectionStateByOperationId: Dispatch<
    SetStateAction<WebSocketConnectionStateMap>
  >
  activeStreamRef: { current: ActiveStream | null }
  environment: SavedRequestSnapshot["environment"]
}) {
  const wsUrl = url.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
  const relaySocket = createRelayWebSocket(wsUrl, headers)
  const socket = relaySocket.socket
  socket.binaryType = "arraybuffer"
  let connectionReady = false
  let terminalError = false
  let bodyText = "[connecting] WebSocket connection started\n"
  let frames: WebSocketFrame[] = []
  let frameSequence = 0

  const publishResult = (status: number, statusText: string) => {
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: createStreamResult({
          status,
          statusText,
          url: wsUrl,
          startedAt,
          bodyText,
          websocketFrames: frames,
        }),
      },
    }))
  }

  const appendFrame = (
    direction: WebSocketFrame["direction"],
    data: string
  ) => {
    const timestamp = Date.now()
    frameSequence += 1
    frames = [
      ...frames,
      {
        id: `${timestamp}-${frameSequence}`,
        direction,
        data,
        sizeBytes: new TextEncoder().encode(data).byteLength,
        timestamp,
      },
    ]
  }

  const stream: ActiveStream = {
    id: request.id,
    close: () => socket.close(),
    send: (message) => {
      if (socket.readyState !== WebSocket.OPEN || !connectionReady) {
        return false
      }

      socket.send(message)
      bodyText += `[sent] ${message}\n`
      appendFrame("outgoing", message)
      publishResult(101, "Connected")
      return true
    },
  }
  activeStreamRef.current = stream
  setRequestSnapshotByOperationId((snapshots) => ({
    ...snapshots,
    [request.id]: createStreamSnapshot({
      request,
      url: wsUrl,
      draft,
      environment,
    }),
  }))

  const markConnected = () => {
    if (activeStreamRef.current !== stream) {
      socket.close()
      return
    }

    connectionReady = true
    bodyText += "[open] Connected\n"
    setWebSocketConnectionStateByOperationId((states) => ({
      ...states,
      [request.id]: "connected",
    }))
    publishResult(101, "Connected")
  }

  socket.onopen = () => {
    if (relaySocket.waitsForRelay) {
      relaySocket.beginRelayHandshake()
      return
    }
    markConnected()
  }

  socket.onmessage = async (event) => {
    if (relaySocket.waitsForRelay && !connectionReady) {
      const control = relaySocket.isRelayControlMessage(event.data)
      if (control === "ready") {
        markConnected()
      } else if (control === "error") {
        terminalError = true
        setResponseStateByOperationId((states) => ({
          ...states,
          [request.id]: {
            status: "error",
            error: relaySocket.relayError(),
            durationMs: Math.round(performance.now() - startedAt),
          },
        }))
        socket.close()
      }
      return
    }

    const message = await webSocketMessageToText(event.data)
    if (activeStreamRef.current !== stream) {
      return
    }

    bodyText += `[message] ${message}\n`
    appendFrame("incoming", message)
    publishResult(101, "Connected")
  }

  socket.onerror = () => {
    if (activeStreamRef.current !== stream) {
      return
    }

    terminalError = true
    setWebSocketConnectionStateByOperationId((states) => ({
      ...states,
      [request.id]: "disconnected",
    }))
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "error",
        error: relaySocket.waitsForRelay
          ? relaySocket.relayError()
          : "WebSocket connection failed.",
        durationMs: Math.round(performance.now() - startedAt),
      },
    }))
  }

  socket.onclose = (event) => {
    if (activeStreamRef.current !== stream) {
      return
    }

    bodyText += `[close] code=${event.code} reason=${event.reason || "none"}\n`
    activeStreamRef.current = null
    setWebSocketConnectionStateByOperationId((states) => ({
      ...states,
      [request.id]: "disconnected",
    }))
    if (terminalError) return
    publishResult(
      event.wasClean ? 200 : 499,
      event.wasClean ? "Disconnected" : "Disconnected Unexpectedly"
    )
  }
}

async function webSocketMessageToText(data: unknown) {
  if (typeof data === "string") {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data)
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.text()
  }

  return String(data)
}

export function connectSseRequest({
  request,
  url,
  headers,
  body,
  requestSnapshot,
  startedAt,
  setRequestSnapshotByOperationId,
  setResponseStateByOperationId,
  activeStreamRef,
}: {
  request: WorkspaceRequest
  url: string
  headers: Headers
  body: BodyInit | undefined
  requestSnapshot: SavedRequestSnapshot
  startedAt: number
  setRequestSnapshotByOperationId: Dispatch<
    SetStateAction<Partial<Record<string, SavedRequestSnapshot>>>
  >
  setResponseStateByOperationId: Dispatch<SetStateAction<ResponseStateMap>>
  activeStreamRef: { current: ActiveStream | null }
}) {
  let bodyText = ""
  let sizeBytes = 0
  let sequence = 0
  let sseEvents: ServerSentEvent[] = []
  let responseMetadata:
    | {
        status: number
        statusText: string
        ok: boolean
        contentType: string
        headers: { key: string; value: string }[]
        cookies: { key: string; value: string }[]
        url: string
      }
    | undefined
  setRequestSnapshotByOperationId((snapshots) => ({
    ...snapshots,
    [request.id]: requestSnapshot,
  }))

  const updateStream = (statusText = "Streaming") => {
    const metadata = responseMetadata
    if (!metadata) {
      return
    }

    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: {
          ...metadata,
          statusText,
          durationMs: Math.round(performance.now() - startedAt),
          sizeBytes,
          bodyText,
          sseEvents,
        },
      },
    }))
  }

  const headersRecord: Record<string, string> = {}
  headers.forEach((value, key) => {
    headersRecord[key] = value
  })

  const stream: ActiveStream = {
    id: request.id,
    close: () => connection.close(),
    clear: () => {
      sseEvents = []
      updateStream()
    },
  }

  const connection = openSseConnection({
    url,
    method: requestSnapshot.method,
    headers: headersRecord,
    body,
    onOpen: (response) => {
      if (activeStreamRef.current !== stream) {
        connection.close()
        return
      }

      const responseHeaders = Array.from(response.headers.entries())
        .map(([key, value]) => ({ key, value }))
        .filter((header) => !header.key.startsWith("x-skaper-relay-"))
      const relayedCookies = getRelayedResponseCookies(response)
      responseMetadata = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get("content-type") ?? "",
        headers: responseHeaders,
        cookies:
          relayedCookies.length > 0
            ? relayedCookies
            : responseHeaders.filter((header) =>
                header.key.toLowerCase().includes("cookie")
              ),
        url: getRelayedResponseUrl(response, url),
      }
      updateStream()
    },
    onChunk: (text, byteLength) => {
      if (activeStreamRef.current !== stream) {
        return
      }

      bodyText += text
      sizeBytes += byteLength
      updateStream()
    },
    onEvent: (event) => {
      if (activeStreamRef.current !== stream) {
        return
      }

      sequence += 1
      sseEvents = [
        ...sseEvents,
        {
          sequence,
          eventId: event.eventId,
          eventName: event.eventName,
          data: event.data,
          receivedAt: Date.now(),
        },
      ]
      updateStream()
    },
    onComplete: () => {
      if (activeStreamRef.current !== stream) {
        return
      }

      activeStreamRef.current = null
      updateStream("Complete")
    },
    onError: (err) => {
      if (activeStreamRef.current !== stream) {
        return
      }

      activeStreamRef.current = null
      const errMsg = err instanceof Error ? err.message : String(err)
      setResponseStateByOperationId((states) => ({
        ...states,
        [request.id]: {
          status: "error",
          error: errMsg,
          durationMs: Math.round(performance.now() - startedAt),
        },
      }))
    },
  })
  activeStreamRef.current = stream
}
