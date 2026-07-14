import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const DB_NAME = "skaper-docks"

describe("IndexedDB workspace migration", () => {
  beforeEach(async () => {
    vi.resetModules()
    await deleteDatabase()
  })

  afterEach(async () => {
    await deleteDatabase()
  })

  test("upgrades legacy SSE records from version 2 to version 3", async () => {
    await createVersionTwoDatabase()
    const { openSkaperDb } = await import("./indexed-db")
    const db = await openSkaperDb()
    const transaction = db.transaction(
      ["custom_requests", "saved_responses"],
      "readonly"
    )
    const customRequest = await requestResult<Record<string, unknown>>(
      transaction.objectStore("custom_requests").get("legacy-sse")
    )
    const savedResponse = await requestResult<Record<string, unknown>>(
      transaction.objectStore("saved_responses").get("saved-sse")
    )

    expect(db.version).toBe(3)
    expect(customRequest).toMatchObject({
      id: "legacy-sse",
      collectionId: "http-custom",
      transport: "http",
      mode: "sse",
      method: "GET",
    })
    expect(savedResponse.requestSnapshot).toMatchObject({
      method: "GET",
      transport: "http",
      mode: "sse",
    })
    db.close()
  })
})

function createVersionTwoDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      const customRequests = db.createObjectStore("custom_requests", {
        keyPath: "id",
      })
      customRequests.createIndex("collectionId", "collectionId")
      customRequests.put({
        id: "legacy-sse",
        collectionId: "sse-custom",
        name: "Events",
        method: "POST",
        transport: "sse",
        url: "https://api.example.com/events",
        draft: {
          params: [],
          headers: [],
          body: { mode: "none", contentType: "", value: "" },
        },
        position: 0,
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
      })
      const savedResponses = db.createObjectStore("saved_responses", {
        keyPath: "id",
      })
      savedResponses.createIndex("createdAt", "createdAt")
      savedResponses.put({
        id: "saved-sse",
        operationId: "custom:legacy-sse",
        method: "SSE",
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
      })
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("Database deletion was blocked"))
  })
}

function requestResult<T>(request: IDBRequest) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}
