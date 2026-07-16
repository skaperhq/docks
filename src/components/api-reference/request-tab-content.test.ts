import { describe, expect, test } from "vitest"
import { requestTabs, websocketRequestTabs } from "./request-tab-content"

describe("request tabs", () => {
  test("keeps authorization in Headers instead of a separate tab", () => {
    expect(requestTabs).toEqual(["Docs", "Params", "Headers", "Body"])
    expect(requestTabs).not.toContain("Authorization")
  })

  test("replaces Body with Message for WebSocket requests", () => {
    expect(websocketRequestTabs).toEqual([
      "Docs",
      "Message",
      "Params",
      "Headers",
    ])
    expect(websocketRequestTabs).not.toContain("Body")
  })
})
