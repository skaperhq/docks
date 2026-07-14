import { describe, expect, test } from "vitest"
import {
  apiOperations,
  formatSchema,
  getOpenApiRequestMode,
  getOperationGroups,
} from "./openapi"

describe("OpenAPI model", () => {
  test("creates request operations with stable identifiers", () => {
    expect(apiOperations.length).toBeGreaterThan(0)
    expect(apiOperations).toContainEqual(
      expect.objectContaining({
        id: "POST /auth/login",
        method: "POST",
        path: "/auth/login",
      })
    )
    expect(new Set(apiOperations.map((operation) => operation.id)).size).toBe(
      apiOperations.length
    )
  })

  test("filters operation groups by searchable OpenAPI metadata", () => {
    const groups = getOperationGroups({ query: "login", requestOnly: false })
    const matchingIds = groups.flatMap((group) =>
      group.operations.map((operation) => operation.id)
    )

    expect(matchingIds).toContain("POST /auth/login")
    expect(
      groups.every((group) =>
        group.operations.every((operation) =>
          operation.searchText.includes("login")
        )
      )
    ).toBe(true)
  })

  test("limits request-only groups to operations with a body schema", () => {
    const operations = getOperationGroups({
      query: "",
      requestOnly: true,
    }).flatMap((group) => group.operations)

    expect(operations.length).toBeGreaterThan(0)
    expect(operations.every((operation) => operation.requestSchema)).toBe(true)
  })

  test("formats schema constraints for documentation tables", () => {
    expect(
      formatSchema({
        type: "object",
        required: ["email"],
        properties: {
          email: {
            type: "string",
            format: "email",
            description: "Account email",
            minLength: 3,
          },
        },
      })
    ).toEqual([
      expect.objectContaining({
        name: "email",
        required: true,
        type: "string<email>",
        description: "Account email",
        minLength: 3,
      }),
    ])
  })

  test("detects GET event streams as native SSE mode", () => {
    expect(
      getOpenApiRequestMode("GET", [
        {
          code: "200",
          description: "Events",
          contentTypes: ["Text/Event-Stream; charset=utf-8"],
          example: null,
        },
      ])
    ).toEqual({ requestMode: "sse", hasEventStreamResponse: true })
  })

  test("flags non-GET event streams without selecting native SSE mode", () => {
    expect(
      getOpenApiRequestMode("POST", [
        {
          code: "200",
          description: "Events",
          contentTypes: ["text/event-stream"],
          example: null,
        },
      ])
    ).toEqual({ requestMode: "standard", hasEventStreamResponse: true })
  })
})
