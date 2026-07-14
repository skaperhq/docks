import { buildRequestUrl } from "./api-request"
import type { KeyValueRow } from "@/components/api-reference/types"

export function buildSseUrl({
  baseUrl,
  params,
  resolveVariables,
}: {
  baseUrl: string
  params: KeyValueRow[]
  resolveVariables: (text: string) => string
}) {
  return buildRequestUrl(
    resolveVariables(baseUrl),
    params.map((param) => ({
      ...param,
      key: resolveVariables(param.key),
      value: resolveVariables(param.value),
    }))
  )
}

/** Opens a native EventSource connection and exposes a minimal close handle. */
export function openSseConnection({
  url,
  onOpen,
  onMessage,
  onError,
}: {
  url: string
  onOpen: () => void
  onMessage: (data: string) => void
  onError: () => void
}) {
  const source = new EventSource(url)
  source.onopen = onOpen
  source.onmessage = (event) => onMessage(String(event.data))
  source.onerror = onError

  return { close: () => source.close() }
}

export function closeActiveStream(
  activeStreamRef: { current: { id: string; close: () => void } | null },
  requestId: string
) {
  if (activeStreamRef.current?.id !== requestId) {
    return false
  }

  activeStreamRef.current.close()
  activeStreamRef.current = null
  return true
}
