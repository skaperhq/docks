import { describe, expect, test } from "vitest"
import { getRequestTabCloseResult } from "./request-tabs"

describe("getRequestTabCloseResult", () => {
  test("selects the nearest tab when the active tab is closed", () => {
    expect(
      getRequestTabCloseResult({
        openOperationIds: ["GET /users", "POST /users"],
        activeOperationId: "GET /users",
        closedOperationId: "GET /users",
      })
    ).toEqual({
      openOperationIds: ["POST /users"],
      nextOperationId: "POST /users",
      shouldShowOverview: false,
    })
  })

  test("allows the final active tab to close", () => {
    expect(
      getRequestTabCloseResult({
        openOperationIds: ["GET /users"],
        activeOperationId: "GET /users",
        closedOperationId: "GET /users",
      })
    ).toEqual({
      openOperationIds: [],
      nextOperationId: undefined,
      shouldShowOverview: true,
    })
  })

  test("keeps the current selection when an inactive tab is closed", () => {
    expect(
      getRequestTabCloseResult({
        openOperationIds: ["GET /users", "POST /users"],
        activeOperationId: "POST /users",
        closedOperationId: "GET /users",
      })
    ).toEqual({
      openOperationIds: ["POST /users"],
      nextOperationId: undefined,
      shouldShowOverview: false,
    })
  })
})
