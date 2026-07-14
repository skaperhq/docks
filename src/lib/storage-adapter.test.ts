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

  test("keeps application-provided Postgres adapters dependency-free", async () => {
    const { createPostgresStorageAdapter } = await import("./storage-adapter")
    const adapter = { kind: "postgres" } as unknown as StorageAdapter

    expect(createPostgresStorageAdapter(adapter)).toBe(adapter)
  })
})
