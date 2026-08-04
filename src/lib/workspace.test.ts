import { describe, expect, test } from "vitest"
import { getWorkspaceStorageKey } from "./workspace"

describe("workspace local storage keys", () => {
  test("isolates the same preference between workspaces", () => {
    expect(getWorkspaceStorageKey("repo-a", "ui-theme")).toBe(
      "docks:repo-a:ui-theme"
    )
    expect(getWorkspaceStorageKey("repo-b", "ui-theme")).not.toBe(
      getWorkspaceStorageKey("repo-a", "ui-theme")
    )
  })
})
