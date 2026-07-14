import { afterEach, describe, expect, test, vi } from "vitest"
import {
  buildSseUrl,
  closeActiveStream,
  openSseConnection,
} from "./sse-request"

describe("SSE requests", () => {
  afterEach(() => vi.unstubAllGlobals())

  test("resolves path and enabled query variables", () => {
    const url = buildSseUrl({
      baseUrl: "https://{{host}}/events/{channel}",
      params: [
        {
          key: "channel",
          value: "{{channel}}",
          description: "",
          location: "path",
        },
        {
          key: "token",
          value: "{{token}}",
          description: "",
          location: "query",
        },
        {
          key: "disabled",
          value: "1",
          description: "",
          location: "query",
          enabled: false,
        },
      ],
      resolveVariables: (value) =>
        value
          .replaceAll("{{host}}", "api.example.com")
          .replaceAll("{{channel}}", "updates/all")
          .replaceAll("{{token}}", "abc"),
    })

    expect(url).toBe("https://api.example.com/events/updates%2Fall?token=abc")
  })

  test("forwards fetch lifecycle events and closes the connection", async () => {
    let resolveResponse: any
    const responsePromise = new Promise((resolve) => {
      resolveResponse = resolve
    })

    const fetchMock = vi.fn().mockImplementation(() => responsePromise)
    vi.stubGlobal("fetch", fetchMock)

    const onOpen = vi.fn()
    const onMessage = vi.fn()
    const onError = vi.fn()

    const connection = openSseConnection({
      url: "https://api.example.com/events",
      method: "POST",
      headers: { Authorization: "Bearer x" },
      body: '{"foo":"bar"}',
      onOpen,
      onMessage,
      onError,
    })

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/events", {
      method: "POST",
      headers: {
        Authorization: "Bearer x",
        Accept: "text/event-stream",
      },
      body: '{"foo":"bar"}',
      signal: expect.any(AbortSignal),
    })

    let controller: ReadableStreamDefaultController | undefined
    const stream = new ReadableStream({
      start(c) {
        controller = c
      },
    })

    resolveResponse({
      ok: true,
      body: stream,
    })

    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(onOpen).toHaveBeenCalledOnce()

    const encoder = new TextEncoder()
    controller!.enqueue(encoder.encode("data: message 1\n\ndata: message 2\n\n"))

    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(onMessage).toHaveBeenCalledWith("message 1")
    expect(onMessage).toHaveBeenCalledWith("message 2")

    connection.close()
    controller!.close()
  })

  test("closes only the stream owned by the closing tab", () => {
    const close = vi.fn()
    const activeStreamRef = { current: { id: "events", close } }

    expect(closeActiveStream(activeStreamRef, "other")).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(closeActiveStream(activeStreamRef, "events")).toBe(true)
    expect(close).toHaveBeenCalledOnce()
    expect(activeStreamRef.current).toBeNull()
  })
})
