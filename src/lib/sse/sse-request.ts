import { buildRequestUrl } from "../api-request"
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

/** Opens a fetch connection to stream SSE events and exposes a close handle. */
export function openSseConnection({
  url,
  method = "GET",
  headers = {},
  body,
  onOpen,
  onMessage,
  onError,
}: {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
  onOpen: () => void
  onMessage: (data: string) => void
  onError: (error: any) => void
}) {
  const abortController = new AbortController()

  fetch(url, {
    method,
    headers: {
      ...headers,
      Accept: "text/event-stream",
    },
    body,
    signal: abortController.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      onOpen()

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("Response body is not readable.")
      }

      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() || ""

        for (const block of blocks) {
          const lines = block.split(/\r?\n/)
          for (const line of lines) {
            if (line.startsWith("data:")) {
              const data = line.slice(5).replace(/^\s+/, "")
              onMessage(data)
            }
          }
        }
      }
    })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }
      onError(error)
    })

  return { close: () => abortController.abort() }
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
