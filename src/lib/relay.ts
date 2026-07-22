export type BrowserRelayConfig = {
  path: string
  token: string
}

type RelayRequestMetadata = {
  url: string
  method: string
  headers: Array<[string, string]>
}

declare global {
  var __SKAPER_RELAY__: BrowserRelayConfig | undefined
}

export function getBrowserRelayConfig() {
  return globalThis.__SKAPER_RELAY__
}

export function shouldRelayRequest(url: string) {
  const relay = getBrowserRelayConfig()
  if (!relay || typeof window === "undefined") {
    return false
  }

  const target = new URL(url, window.location.href)
  const targetProtocol =
    target.protocol === "ws:"
      ? "http:"
      : target.protocol === "wss:"
        ? "https:"
        : target.protocol
  return `${targetProtocol}//${target.host}` !== window.location.origin
}

export async function skaperFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const relay = getBrowserRelayConfig()
  if (!relay || !shouldRelayRequest(url)) {
    return fetch(url, init)
  }

  const targetHeaders = new Headers(init.headers)
  const metadata: RelayRequestMetadata = {
    url: new URL(url, window.location.href).toString(),
    method: init.method ?? "GET",
    headers: Array.from(targetHeaders.entries()),
  }
  const headers = new Headers({
    "content-type":
      typeof FormData !== "undefined" && init.body instanceof FormData
        ? "multipart/form-data"
        : "application/octet-stream",
    "x-skaper-relay-request": encodeRelayMetadata(metadata),
    "x-skaper-relay-token": relay.token,
  })

  // Let the browser add the multipart boundary; the server copies that exact
  // value to the upstream request when no explicit content type was supplied.
  if (typeof FormData !== "undefined" && init.body instanceof FormData) {
    headers.delete("content-type")
  }

  const response = await fetch(relay.path, {
    method: "POST",
    headers,
    body: init.body,
    signal: init.signal,
    credentials: "same-origin",
  })

  if (response.headers.has("x-skaper-relay-error")) {
    let message = `Relay request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the status-based message when an intermediary replaces the body.
    }
    throw new Error(message)
  }

  return response
}

export function getRelayedResponseUrl(response: Response, fallback: string) {
  const metadata = getRelayResponseMetadata(response)
  return typeof metadata?.url === "string"
    ? metadata.url
    : response.url || fallback
}

export function getRelayedResponseCookies(response: Response) {
  const metadata = getRelayResponseMetadata(response)
  if (!Array.isArray(metadata?.setCookies)) return []
  return metadata.setCookies.flatMap((value) =>
    typeof value === "string" ? [{ key: "set-cookie", value }] : []
  )
}

export function createRelayWebSocket(
  targetUrl: string,
  headers: Headers
): {
  socket: WebSocket
  waitsForRelay: boolean
  beginRelayHandshake: () => void
  isRelayControlMessage: (data: unknown) => "ready" | "error" | false
  relayError: () => string
} {
  const relay = getBrowserRelayConfig()
  const target = targetUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")

  if (!relay || !shouldRelayRequest(target)) {
    return {
      socket: new WebSocket(target),
      waitsForRelay: false,
      beginRelayHandshake: () => undefined,
      isRelayControlMessage: () => false,
      relayError: () => "WebSocket relay failed.",
    }
  }

  const relayUrl = new URL(relay.path, window.location.href)
  relayUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const socket = new WebSocket(relayUrl)
  let errorMessage = "WebSocket relay failed."

  return {
    socket,
    waitsForRelay: true,
    beginRelayHandshake: () => {
      socket.send(
        JSON.stringify({
          type: "skaper.connect",
          token: relay.token,
          request: {
            url: target,
            headers: Array.from(headers.entries()),
          },
        })
      )
    },
    isRelayControlMessage: (data) => {
      if (typeof data !== "string") return false
      try {
        const message = JSON.parse(data) as { type?: unknown; error?: unknown }
        if (message.type === "skaper.ready") return "ready"
        if (message.type === "skaper.error") {
          if (typeof message.error === "string") errorMessage = message.error
          return "error"
        }
      } catch {
        // Upstream application messages are not relay control frames.
      }
      return false
    },
    relayError: () => errorMessage,
  }
}

function encodeRelayMetadata(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function decodeRelayMetadata(value: string) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function getRelayResponseMetadata(response: Response) {
  const encoded = response.headers.get("x-skaper-relay-response")
  if (!encoded) return undefined
  try {
    return decodeRelayMetadata(encoded) as {
      url?: unknown
      setCookies?: unknown
    }
  } catch {
    return undefined
  }
}
