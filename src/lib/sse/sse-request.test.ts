import { afterEach, describe, expect, test, vi } from "vitest"
import {
  buildSseUrl,
  closeActiveStream,
  createSseParser,
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

  test("parses event metadata, multiline data, comments, and carried IDs", () => {
    const onEvent = vi.fn()
    const parser = createSseParser(onEvent)

    parser.push(
      ": keepalive\r\nevent: inventory.updated\r\nid: 7\r\ndata: first line\r\ndata: second line\r\nretry: 1000\r\nunknown: ignored\r\n\r\n"
    )
    parser.push("id: invalid\0id\ndata: next\n\n")

    expect(onEvent).toHaveBeenNthCalledWith(1, {
      eventId: "7",
      eventName: "inventory.updated",
      data: "first line\nsecond line",
    })
    expect(onEvent).toHaveBeenNthCalledWith(2, {
      eventId: "7",
      eventName: "message",
      data: "next",
    })
  })

  test("handles arbitrary chunks and CR-only event boundaries", () => {
    const onEvent = vi.fn()
    const parser = createSseParser(onEvent)

    parser.push("event: up")
    parser.push("date\rid: 4\rdata: split")
    parser.push(" across chunks\r")
    parser.push("\r")

    expect(onEvent).toHaveBeenCalledWith({
      eventId: "4",
      eventName: "update",
      data: "split across chunks",
    })
  })

  test("does not dispatch an event without a terminating blank line", () => {
    const onEvent = vi.fn()
    const parser = createSseParser(onEvent)

    parser.push("data: incomplete")
    parser.finish()

    expect(onEvent).not.toHaveBeenCalled()
  })

  test("forwards response metadata, raw chunks, parsed events, and completion", async () => {
    let resolveResponse: any
    const responsePromise = new Promise((resolve) => {
      resolveResponse = resolve
    })

    const fetchMock = vi.fn().mockImplementation(() => responsePromise)
    vi.stubGlobal("fetch", fetchMock)

    const onOpen = vi.fn()
    const onChunk = vi.fn()
    const onEvent = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    const connection = openSseConnection({
      url: "https://api.example.com/events",
      method: "POST",
      headers: { Authorization: "Bearer x" },
      body: '{"foo":"bar"}',
      onOpen,
      onChunk,
      onEvent,
      onComplete,
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

    const response = new Response(stream, {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "text/event-stream" },
    })
    resolveResponse(response)

    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(onOpen).toHaveBeenCalledWith(response)

    const encoder = new TextEncoder()
    const encoded = encoder.encode(
      "event: greeting\nid: 1\ndata: hello 🌍\n\ndata: message 2\n\n"
    )
    const emojiStart = encoded.indexOf(0xf0)
    controller!.enqueue(encoded.slice(0, emojiStart + 2))
    controller!.enqueue(encoded.slice(emojiStart + 2))
    controller!.close()

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce())

    expect(onEvent).toHaveBeenNthCalledWith(1, {
      eventId: "1",
      eventName: "greeting",
      data: "hello 🌍",
    })
    expect(onEvent).toHaveBeenNthCalledWith(2, {
      eventId: "1",
      eventName: "message",
      data: "message 2",
    })
    expect(
      onChunk.mock.calls.reduce(
        (total, [, byteLength]) => total + byteLength,
        0
      )
    ).toBe(encoded.byteLength)
    expect(onChunk.mock.calls.map(([text]) => text).join("")).toBe(
      new TextDecoder().decode(encoded)
    )
    expect(onError).not.toHaveBeenCalled()

    connection.close()
  })

  test("reports non-successful responses as errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    )
    const onError = vi.fn()

    openSseConnection({
      url: "https://api.example.com/events",
      onOpen: vi.fn(),
      onEvent: vi.fn(),
      onError,
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError.mock.calls[0][0]).toEqual(
      new Error("HTTP error! Status: 503")
    )
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
