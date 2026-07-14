import { describe, expect, test } from "vitest"
import type { PersistedCustomRequest } from "./api-reference-actions"
import {
  groupCustomRequestsByTransport,
  normalizeRequestConfiguration,
} from "./request-model"

describe("request model", () => {
  test("forces native SSE requests to HTTP GET", () => {
    expect(
      normalizeRequestConfiguration({
        transport: "http",
        mode: "sse",
        method: "POST",
      })
    ).toEqual({ transport: "http", mode: "sse", method: "GET" })
  })

  test("clears SSE mode when switching to WebSocket", () => {
    expect(
      normalizeRequestConfiguration({
        transport: "websocket",
        mode: "sse",
        method: "PATCH",
      })
    ).toEqual({ transport: "websocket", mode: "standard", method: "GET" })
  })

  test("groups standard and SSE requests together under HTTP", () => {
    const requests = [
      createRequest({ id: "standard", mode: "standard" }),
      createRequest({ id: "events", mode: "sse" }),
      createRequest({ id: "socket", transport: "websocket" }),
    ]
    const groups = groupCustomRequestsByTransport(requests, "")

    expect(groups.get("http")?.map((request) => request.id)).toEqual([
      "standard",
      "events",
    ])
    expect(groups.get("websocket")?.map((request) => request.id)).toEqual([
      "socket",
    ])
    expect(groupCustomRequestsByTransport(requests, "sse").get("http")).toEqual(
      [expect.objectContaining({ id: "events" })]
    )
  })
})

function createRequest(
  patch: Partial<PersistedCustomRequest>
): PersistedCustomRequest {
  return {
    id: "request",
    collectionId: "http-custom",
    name: "Request",
    method: "GET",
    transport: "http",
    mode: "standard",
    url: "https://api.example.com",
    draft: {
      params: [],
      headers: [],
      body: { mode: "none", contentType: "", value: "" },
    },
    position: 0,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ...patch,
  }
}
