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

  test("forwards EventSource lifecycle events and closes the connection", () => {
    const instance = installFakeEventSource()
    const onOpen = vi.fn()
    const onMessage = vi.fn()
    const onError = vi.fn()
    const connection = openSseConnection({
      url: "https://api.example.com/events",
      onOpen,
      onMessage,
      onError,
    })

    instance.onopen?.(new Event("open"))
    instance.onmessage?.(new MessageEvent("message", { data: "hello" }))
    instance.onerror?.(new Event("error"))
    connection.close()

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onMessage).toHaveBeenCalledWith("hello")
    expect(onError).toHaveBeenCalledOnce()
    expect(instance.close).toHaveBeenCalledOnce()
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

function installFakeEventSource() {
  const instance = {
    onopen: null as ((event: Event) => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    close: vi.fn(),
  }
  vi.stubGlobal(
    "EventSource",
    class {
      onopen = instance.onopen
      onmessage = instance.onmessage
      onerror = instance.onerror
      close = instance.close

      constructor(_url: string) {
        Object.defineProperties(instance, {
          onopen: {
            get: () => this.onopen,
            set: (value) => {
              this.onopen = value
            },
          },
          onmessage: {
            get: () => this.onmessage,
            set: (value) => {
              this.onmessage = value
            },
          },
          onerror: {
            get: () => this.onerror,
            set: (value) => {
              this.onerror = value
            },
          },
        })
      }
    }
  )
  return instance
}
