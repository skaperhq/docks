import { afterEach, describe, expect, test, vi } from "vitest"
import { createHttpStorageAdapter, getRuntimeStorageUrl } from "./http-storage"

describe("authenticated HTTP storage", () => {
  afterEach(() => {
    globalThis.__DOCKS_STORAGE_URL__ = undefined
    vi.unstubAllGlobals()
  })

  test("reads the server-injected same-origin path", () => {
    globalThis.__DOCKS_STORAGE_URL__ = "/docs/_storage"
    expect(getRuntimeStorageUrl()).toBe("/docs/_storage")

    globalThis.__DOCKS_STORAGE_URL__ = "https://other.test/storage"
    expect(getRuntimeStorageUrl()).toBeUndefined()
  })

  test("maps storage calls onto authenticated JSON actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ customRequests: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const adapter = createHttpStorageAdapter("/docs/_storage")

    await adapter.getApiWorkspace()

    expect(fetchMock).toHaveBeenCalledWith("/docs/_storage", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "getApiWorkspace" }),
    })
  })

  test("forwards atomic collection imports", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ collection: {}, requests: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const adapter = createHttpStorageAdapter("/docs/_storage")
    const data = {
      collection: {
        id: "api",
        name: "API",
        position: 0,
        createdAt: "now",
        updatedAt: "now",
      },
      requests: [],
    }

    await adapter.createCollectionWithRequests({ data })

    expect(fetchMock).toHaveBeenCalledWith(
      "/docs/_storage",
      expect.objectContaining({
        body: JSON.stringify({ action: "createCollectionWithRequests", data }),
      })
    )
  })

  test("surfaces server authorization errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      )
    )
    const adapter = createHttpStorageAdapter("/docs/_storage")

    await expect(adapter.getEnvironments()).rejects.toThrow("Unauthorized")
  })
})
