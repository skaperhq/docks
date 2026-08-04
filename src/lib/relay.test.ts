// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest"
import { getRelayedResponseUrl, shouldRelayRequest, docksFetch } from "./relay"

describe("browser relay transport", () => {
  afterEach(() => {
    globalThis.__DOCKS_RELAY__ = undefined
    vi.unstubAllGlobals()
  })

  test("uses direct fetch for same-origin requests", async () => {
    globalThis.__DOCKS_RELAY__ = { path: "/docs/_relay", token: "secret" }
    const response = new Response("ok")
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal("fetch", fetchMock)

    const target = `${window.location.origin}/api/users`
    await docksFetch(target, { method: "GET" })

    expect(shouldRelayRequest(target)).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(target, { method: "GET" })
  })

  test("encodes cross-origin URL, method, and headers for the relay", async () => {
    globalThis.__DOCKS_RELAY__ = { path: "/docs/_relay", token: "secret" }
    const response = new Response("ok")
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal("fetch", fetchMock)

    await docksFetch("https://api.example.com/users", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: '{"name":"Ada"}',
    })

    expect(shouldRelayRequest("https://api.example.com/users")).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [relayPath, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(relayPath).toBe("/docs/_relay")
    expect(init.method).toBe("POST")
    expect(init.body).toBe('{"name":"Ada"}')
    const headers = new Headers(init.headers)
    expect(headers.get("x-docks-relay-token")).toBe("secret")

    const metadata = decodeMetadata(headers.get("x-docks-relay-request") ?? "")
    expect(metadata).toEqual({
      url: "https://api.example.com/users",
      method: "POST",
      headers: [["authorization", "Bearer token"]],
    })
  })

  test("keeps the upstream response URL available to the UI", () => {
    const metadata = encodeMetadata({ url: "https://api.example.com/final" })
    const response = new Response("ok", {
      headers: { "x-docks-relay-response": metadata },
    })

    expect(
      getRelayedResponseUrl(response, "https://api.example.com/start")
    ).toBe("https://api.example.com/final")
  })
})

function encodeMetadata(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function decodeMetadata(value: string) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  const binary = atob(padded)
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0))
    )
  ) as unknown
}
