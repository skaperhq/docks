import "fake-indexeddb/auto"
import { describe, expect, test } from "vitest"
import { createIndexedDbStorageAdapter } from "./indexed-db-storage"

describe("workspace-scoped IndexedDB storage", () => {
  test("atomically stores imported collections and requests", async () => {
    const storage = createIndexedDbStorageAdapter("openapi-import")
    const collection = {
      id: "payments",
      name: "Payments API",
      position: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }
    const request = {
      id: "create-payment",
      collectionId: collection.id,
      name: "Create payment",
      method: "POST" as const,
      transport: "http" as const,
      mode: "standard" as const,
      url: "https://api.example.com/payments",
      folder: "Payments",
      draft: {
        params: [],
        headers: [],
        body: { mode: "none", contentType: "", value: "" },
      },
      position: 0,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    }

    await storage.createCollectionWithRequests({
      data: { collection, requests: [request] },
    })

    await expect(storage.getApiWorkspace()).resolves.toMatchObject({
      collections: [collection],
      customRequests: [request],
    })
  })

  test("rolls back a collection when one imported request cannot be stored", async () => {
    const storage = createIndexedDbStorageAdapter("failed-openapi-import")
    const collection = {
      id: "invalid",
      name: "Invalid API",
      position: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }
    const invalidRequest = {
      id: "invalid-request",
      collectionId: collection.id,
      name: "Invalid",
      method: "GET" as const,
      transport: "http" as const,
      mode: "standard" as const,
      url: "https://example.com",
      draft: {
        params: [],
        headers: [],
        body: {
          mode: "none",
          contentType: "",
          value: "",
          notCloneable: () => undefined,
        },
      },
      position: 0,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    }

    await expect(
      storage.createCollectionWithRequests({
        data: { collection, requests: [invalidRequest] },
      })
    ).rejects.toBeDefined()
    await expect(storage.getApiWorkspace()).resolves.toMatchObject({
      collections: [],
      customRequests: [],
    })
  })

  test("does not expose environments from another workspace", async () => {
    const workspaceA = createIndexedDbStorageAdapter("repo-a")
    const workspaceB = createIndexedDbStorageAdapter("repo-b")

    await workspaceA.bulkSyncEnvironments({
      data: [
        {
          id: "repo-a-local",
          name: "Repo A Local",
          baseUrl: "http://localhost:4100",
          variables: [],
        },
      ],
    })
    await workspaceB.bulkSyncEnvironments({
      data: [
        {
          id: "repo-b-local",
          name: "Repo B Local",
          baseUrl: "http://localhost:4200",
          variables: [],
        },
      ],
    })

    await expect(workspaceA.getEnvironments()).resolves.toEqual([
      expect.objectContaining({ id: "repo-a-local" }),
    ])
    await expect(workspaceB.getEnvironments()).resolves.toEqual([
      expect.objectContaining({ id: "repo-b-local" }),
    ])
  })

  test("rejects an empty workspace identifier", () => {
    expect(() => createIndexedDbStorageAdapter(" ")).toThrow(
      /workspaceId must be a non-empty string/i
    )
  })

  test("round-trips structured SSE events in saved responses", async () => {
    const storage = createIndexedDbStorageAdapter("sse-event-responses")

    const saved = await storage.saveResponse({
      data: {
        operationId: "custom:events",
        method: "GET",
        path: "/events",
        name: "Event capture",
        requestSnapshot: {
          method: "GET",
          transport: "http",
          mode: "sse",
          url: "https://api.example.com/events",
          params: [],
          headers: [],
          body: { mode: "none", contentType: "", value: "" },
          environment: null,
          sentAt: "2026-07-16T00:29:26.000Z",
        },
        result: {
          status: 200,
          statusText: "Complete",
          ok: true,
          durationMs: 1200,
          sizeBytes: 25,
          contentType: "text/event-stream",
          bodyText: "id: 1\ndata: ready\n\n",
          headers: [],
          cookies: [],
          url: "https://api.example.com/events",
          sseEvents: [
            {
              sequence: 1,
              eventId: "1",
              eventName: "message",
              data: "ready",
              receivedAt: Date.UTC(2026, 6, 16, 0, 29, 26, 418),
            },
          ],
        },
      },
    })

    await expect(
      storage.getSavedResponse({ data: saved.id })
    ).resolves.toMatchObject({
      result: {
        sseEvents: [
          {
            sequence: 1,
            eventId: "1",
            eventName: "message",
            data: "ready",
            receivedAt: Date.UTC(2026, 6, 16, 0, 29, 26, 418),
          },
        ],
      },
    })
  })
})
