import { beforeEach, describe, expect, test, vi } from "vitest"
import type { StorageAdapter } from "./storage-adapter"

describe("storage adapter configuration", () => {
  beforeEach(() => {
    // Reloading the module gives each test a fresh process-wide adapter slot.
    vi.resetModules()
  })

  test("reports an unconfigured adapter and throws a useful error", async () => {
    const storage = await import("./storage-adapter")

    expect(storage.isDocksStorageAdapterConfigured()).toBe(false)
    expect(() => storage.getDocksStorageAdapter()).toThrow(
      /storage adapter has not been initialized/i
    )
  })

  test("returns the adapter installed by the host application", async () => {
    const storage = await import("./storage-adapter")
    const adapter = { kind: "test" } as unknown as StorageAdapter

    storage.setDocksStorageAdapter(adapter)

    expect(storage.isDocksStorageAdapterConfigured()).toBe(true)
    expect(storage.getDocksStorageAdapter()).toBe(adapter)
  })

  test("caches hydrated sidebar data for seamless route transitions", async () => {
    const storage = await import("./storage-adapter")
    const actions = await import("./api-reference-actions")
    const workspace = {
      savedResponses: [],
      collections: [
        {
          id: "payments",
          name: "Payments",
          position: 0,
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      customRequests: [],
      responsePanelHeight: 360,
    }
    const adapter = {
      getApiWorkspace: vi.fn().mockResolvedValue(workspace),
    } as unknown as StorageAdapter
    storage.setDocksStorageAdapter(adapter)

    expect(actions.getCachedApiSidebarWorkspace()).toBeUndefined()
    await expect(actions.getApiWorkspace()).resolves.toBe(workspace)
    expect(actions.getCachedApiSidebarWorkspace()).toEqual({
      savedResponses: workspace.savedResponses,
      collections: workspace.collections,
      customRequests: workspace.customRequests,
    })
  })
})
