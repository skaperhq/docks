import { describe, expect, test } from "vitest"
import {
  apiOperations,
  formatSchema,
  getEffectiveSecuritySchemeNames,
  getOpenApiRequestMode,
  getOperationGroups,
} from "./openapi"

describe("OpenAPI model", () => {
  test("creates request operations with stable identifiers", () => {
    expect(apiOperations.length).toBeGreaterThan(0)
    expect(apiOperations).toContainEqual(
      expect.objectContaining({
        id: "POST /api/teams",
        method: "POST",
        path: "/api/teams",
      })
    )
    expect(new Set(apiOperations.map((operation) => operation.id)).size).toBe(
      apiOperations.length
    )
  })

  test("parses custom ws endpoint correctly", () => {
    const wsOp = apiOperations.find(
      (op) => op.path === "/api/matches/{matchId}/live"
    )
    expect(wsOp).toBeDefined()
    expect(wsOp?.method).toBe("WS")
    expect(wsOp?.parameters).toContainEqual(
      expect.objectContaining({
        name: "matchId",
        location: "path",
        required: true,
      })
    )
  })

  test("filters operation groups by searchable OpenAPI metadata", () => {
    const groups = getOperationGroups({ query: "team", requestOnly: false })
    const matchingIds = groups.flatMap((group) =>
      group.operations.map((operation) => operation.id)
    )

    expect(matchingIds).toContain("POST /api/teams")
    expect(
      groups.every((group) =>
        group.operations.every((operation) =>
          operation.searchText.includes("team")
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

  test("inherits document security while allowing operations to disable it", () => {
    const documentSecurity = [{ bearerAuth: [] }]

    expect(
      getEffectiveSecuritySchemeNames(undefined, documentSecurity)
    ).toEqual(["bearerAuth"])
    expect(getEffectiveSecuritySchemeNames([], documentSecurity)).toEqual([])
    expect(
      getEffectiveSecuritySchemeNames(
        [{ apiKey: [] }, { bearerAuth: [], apiKey: [] }],
        documentSecurity
      )
    ).toEqual(["apiKey", "bearerAuth"])
  })
})
