import { describe, expect, test } from "vitest"
import {
  migrateCustomRequestsV3,
  migrateSavedResponseV3,
} from "./storage-migrations"

describe("workspace v3 migration", () => {
  test("moves legacy SSE requests after existing HTTP requests", () => {
    const requests: Parameters<typeof migrateCustomRequestsV3>[0] = [
      createLegacyRequest({ id: "http", transport: "http", position: 0 }),
      createLegacyRequest({
        id: "sse",
        transport: "sse",
        collectionId: "sse-custom",
        method: "POST",
        position: 0,
      }),
      createLegacyRequest({
        id: "socket",
        transport: "websocket",
        position: 0,
      }),
    ]

    const migrated = migrateCustomRequestsV3(requests)

    expect(migrated.find((request) => request.id === "http")).toMatchObject({
      transport: "http",
      mode: "standard",
      position: 0,
    })
    expect(migrated.find((request) => request.id === "sse")).toMatchObject({
      id: "sse",
      collectionId: "http-custom",
      transport: "http",
      mode: "sse",
      method: "GET",
      position: 1,
    })
  })

  test("normalizes legacy SSE saved snapshots without losing response data", () => {
    const response = createLegacySavedResponse()
    const migrated = migrateSavedResponseV3(response)

    expect(migrated.id).toBe("saved-1")
    expect(migrated.result.bodyText).toBe("event payload")
    expect(migrated.requestSnapshot).toMatchObject({
      method: "GET",
      transport: "http",
      mode: "sse",
      url: "https://api.example.com/events",
    })
  })
})

function createLegacyRequest(
  patch: Partial<Parameters<typeof migrateCustomRequestsV3>[0][number]>
): Parameters<typeof migrateCustomRequestsV3>[0][number] {
  return {
    id: "request",
    collectionId: "http-custom",
    name: "Request",
    method: "GET",
    transport: "http",
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

function createLegacySavedResponse(): Parameters<
  typeof migrateSavedResponseV3
>[0] {
  return {
    id: "saved-1",
    operationId: "custom:events",
    method: "SSE",
    path: "Events",
    name: "Events stream",
    status: 200,
    ok: true,
    durationMs: 10,
    sizeBytes: 13,
    contentType: "text/event-stream",
    createdAt: "2026-07-13T00:00:00.000Z",
    requestSnapshot: {
      method: "SSE",
      url: "https://api.example.com/events",
      params: [],
      headers: [],
      body: { mode: "none", contentType: "", value: "" },
      environment: null,
      sentAt: "2026-07-13T00:00:00.000Z",
    },
    result: {
      status: 200,
      statusText: "Streaming",
      ok: true,
      durationMs: 10,
      sizeBytes: 13,
      contentType: "text/event-stream",
      bodyText: "event payload",
      headers: [],
      cookies: [],
      url: "https://api.example.com/events",
    },
  }
}
