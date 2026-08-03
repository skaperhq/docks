import { describe, expect, test } from "vitest"
import type { ApiOperation, ApiParameter } from "@/lib/openapi"
import {
  formatBodyExample,
  getBgMethodClassName,
  getHeaderRows,
  getMethodClassName,
  normalizeKeyValueRow,
  parameterToRow,
  prettyPrintJson,
  restoreGeneratedHeaderTemplates,
  shouldCreateRow,
} from "./utils"

describe("API reference utilities", () => {
  test("turns path parameters into editable variable rows", () => {
    const parameter: ApiParameter = {
      name: "userId",
      location: "path",
      required: true,
      type: "string<uuid>",
      description: "User identifier",
    }

    expect(parameterToRow(parameter)).toMatchObject({
      key: "userId",
      value: "{{userId}}",
      required: true,
      type: "string<uuid>",
      location: "path",
    })
  })

  test("prefers an OpenAPI default over a generated path variable", () => {
    expect(
      parameterToRow({
        name: "page",
        location: "query",
        required: false,
        type: "integer",
        defaultValue: "1",
      }).value
    ).toBe("1")
  })

  test("derives content-type and custom header rows for a public API", () => {
    const operation = {
      hasAuth: false,
      securitySchemeNames: [],
      requestContentTypes: ["application/json"],
      headerParameters: [
        {
          name: "X-Tenant",
          location: "header",
          required: true,
          type: "string",
        },
      ],
    } as unknown as ApiOperation

    expect(getHeaderRows(operation).map((row) => row.key)).toEqual([
      "Content-Type",
      "X-Tenant",
    ])
    expect(getHeaderRows(operation)[0]?.value).toBe("application/json")
  })

  test("restores resolved generated bearer headers without changing custom templates", () => {
    expect(
      restoreGeneratedHeaderTemplates([
        {
          key: "Authorization",
          value: "Bearer resolved-secret",
          description: "Generated from bearerAuth security",
        },
        {
          key: "X-Tenant",
          value: "{{tenant_id}}",
          description: "",
        },
      ])
    ).toEqual([
      {
        key: "Authorization",
        value: "Bearer {{bearerAuth}}",
        description: "Generated from bearerAuth security",
      },
      {
        key: "X-Tenant",
        value: "{{tenant_id}}",
        description: "",
      },
    ])
  })

  test("formats object examples as readable JSON", () => {
    expect(formatBodyExample({ active: true })).toBe('{\n  "active": true\n}')
    expect(formatBodyExample(null)).toBe("")
  })

  test("pretty-prints valid JSON without damaging an incomplete draft", () => {
    expect(prettyPrintJson('{"name":"Skaper"}')).toBe(
      '{\n  "name": "Skaper"\n}'
    )
    expect(prettyPrintJson('{"name":')).toBe('{"name":')
  })

  test("creates a row only after the user enters meaningful content", () => {
    expect(shouldCreateRow({ key: "   ", value: "", description: "" })).toBe(
      false
    )
    expect(shouldCreateRow({ description: "Generated header" })).toBe(true)
    expect(shouldCreateRow({ type: "file" })).toBe(true)
  })

  test("defaults legacy rows to enabled without changing explicit state", () => {
    expect(
      normalizeKeyValueRow({ key: "A", value: "1", description: "" }).enabled
    ).toBe(true)
    expect(
      normalizeKeyValueRow({
        key: "B",
        value: "2",
        description: "",
        enabled: false,
      }).enabled
    ).toBe(false)
  })

  test("returns stable foreground and background styles for HTTP methods", () => {
    expect(getMethodClassName("GET")).toContain("emerald")
    expect(getBgMethodClassName("DELETE")).toContain("rose")
    expect(getMethodClassName("WS")).toContain("violet")
    expect(getBgMethodClassName("WS")).toContain("violet")
    expect(getMethodClassName("OPTIONS")).toBe("text-muted-foreground")
    expect(getBgMethodClassName("OPTIONS")).toContain("bg-muted")
  })
})
