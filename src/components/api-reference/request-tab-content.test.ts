import { describe, expect, test } from "vitest"
import { requestTabs } from "./request-tab-content"

describe("request tabs", () => {
  test("keeps authorization in Headers instead of a separate tab", () => {
    expect(requestTabs).toEqual(["Docs", "Params", "Headers", "Body"])
    expect(requestTabs).not.toContain("Authorization")
  })
})
