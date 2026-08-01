import { buildRequestUrl } from "../api-request"
import { skaperFetch } from "../relay"
import type { KeyValueRow } from "@/components/api-reference/types"

export type ParsedServerSentEvent = {
  eventId: string
  eventName: string
  data: string
}

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
  onChunk,
  onEvent,
  onComplete,
  onError,
}: {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
  onOpen: (response: Response) => void
  onChunk?: (text: string, byteLength: number) => void
  onEvent: (event: ParsedServerSentEvent) => void
  onComplete?: () => void
  onError: (error: unknown) => void
}) {
  const abortController = new AbortController()

  skaperFetch(url, {
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
      onOpen(response)

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("Response body is not readable.")
      }

      const decoder = new TextDecoder()
      const parser = createSseParser(onEvent)

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        onChunk?.(text, value.byteLength)
        if (text) {
          parser.push(text)
        }
      }

      const finalText = decoder.decode()
      if (finalText) {
        onChunk?.(finalText, 0)
      }
      parser.finish(finalText)
      onComplete?.()
    })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }
      onError(error)
    })

  return { close: () => abortController.abort() }
}

/** Parses an SSE text stream incrementally according to the EventSource format. */
export function createSseParser(
  onEvent: (event: ParsedServerSentEvent) => void
) {
  let lineBuffer = ""
  let dataLines: string[] = []
  let eventName = ""
  let lastEventId = ""
  let discardLeadingLineFeed = false

  function dispatchEvent() {
    if (dataLines.length === 0) {
      eventName = ""
      return
    }

    onEvent({
      eventId: lastEventId,
      eventName: eventName || "message",
      data: dataLines.join("\n"),
    })
    dataLines = []
    eventName = ""
  }

  function processLine(line: string) {
    if (!line) {
      dispatchEvent()
      return
    }

    if (line.startsWith(":")) {
      return
    }

    const colonIndex = line.indexOf(":")
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
    let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1)
    if (value.startsWith(" ")) {
      value = value.slice(1)
    }

    if (field === "data") {
      dataLines.push(value)
      return
    }

    if (field === "event") {
      eventName = value
      return
    }

    if (field === "id" && !value.includes("\0")) {
      lastEventId = value
    }
  }

  function processLines(final: boolean) {
    let lineStart = 0
    let index = 0

    while (index < lineBuffer.length) {
      const character = lineBuffer[index]
      if (character !== "\r" && character !== "\n") {
        index += 1
        continue
      }

      processLine(lineBuffer.slice(lineStart, index))
      const isCarriageReturn = character === "\r"
      const hasLineFeed = isCarriageReturn && lineBuffer[index + 1] === "\n"
      index += hasLineFeed ? 2 : 1
      discardLeadingLineFeed =
        isCarriageReturn &&
        !hasLineFeed &&
        index === lineBuffer.length &&
        !final
      lineStart = index
    }

    lineBuffer = lineBuffer.slice(lineStart)
    if (final && lineBuffer) {
      processLine(lineBuffer)
      lineBuffer = ""
    }
  }

  return {
    push(text: string) {
      if (discardLeadingLineFeed) {
        if (text.startsWith("\n")) {
          text = text.slice(1)
        }
        discardLeadingLineFeed = false
      }
      lineBuffer += text
      processLines(false)
    },
    finish(text = "") {
      lineBuffer += text
      processLines(true)
    },
  }
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
