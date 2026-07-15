import "fake-indexeddb/auto"
import { describe, expect, test } from "vitest"
import { createIndexedDbStorageAdapter } from "./indexed-db-storage"

describe("workspace-scoped IndexedDB storage", () => {
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
})
