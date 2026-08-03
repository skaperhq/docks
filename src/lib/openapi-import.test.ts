import { describe, expect, test } from "vitest"
import { parseOpenApiImport } from "./openapi-import"

describe("parseOpenApiImport", () => {
  test("imports YAML operations with servers, parameters, security, and bodies", () => {
    const preview = parseOpenApiImport(`
openapi: 3.1.0
info:
  title: Payments API
  version: 1.0.0
servers:
  - url: https://{region}.example.com/v1
    variables:
      region:
        default: eu
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  schemas:
    Payment:
      type: object
      required: [amount]
      properties:
        amount:
          type: number
          example: 12.5
paths:
  /payments/{paymentId}:
    parameters:
      - name: paymentId
        in: path
        required: true
        schema:
          type: string
    post:
      summary: Update payment
      tags: [Payments]
      parameters:
        - name: expand
          in: query
          schema:
            type: string
            default: receipt
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Payment'
      responses:
        '200':
          description: OK
`)

    expect(preview.title).toBe("Payments API")
    expect(preview.tagCount).toBe(1)
    expect(preview.requests).toHaveLength(1)
    expect(preview.requests[0]).toMatchObject({
      name: "Update payment",
      method: "POST",
      folder: "Payments",
      url: "https://eu.example.com/v1/payments/{paymentId}",
    })
    expect(preview.requests[0]?.draft.params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "paymentId", value: "{{paymentId}}" }),
        expect.objectContaining({ key: "expand", value: "receipt" }),
      ])
    )
    expect(preview.requests[0]?.draft.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "Authorization",
          value: "Bearer {{bearerAuth}}",
        }),
        expect.objectContaining({
          key: "Content-Type",
          value: "application/json",
        }),
      ])
    )
    expect(preview.requests[0]?.draft.body.value).toContain('"amount": 12.5')
  })

  test("uses operation servers, merges overridden parameters, and detects SSE", () => {
    const preview = parseOpenApiImport(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Events", version: "1" },
        servers: [{ url: "https://root.example.com" }],
        paths: {
          "/events": {
            parameters: [
              { name: "cursor", in: "query", schema: { default: "old" } },
            ],
            get: {
              servers: [{ url: "https://stream.example.com" }],
              parameters: [
                { name: "cursor", in: "query", schema: { default: "new" } },
              ],
              responses: {
                200: {
                  description: "events",
                  content: { "text/event-stream; charset=utf-8": {} },
                },
              },
            },
          },
        },
      })
    )

    expect(preview.requests[0]).toMatchObject({
      mode: "sse",
      url: "https://stream.example.com/events",
      folder: "Other",
    })
    expect(preview.requests[0]?.draft.params).toEqual([
      expect.objectContaining({ key: "cursor", value: "new" }),
    ])
  })

  test("supports the workspace ws extension and warns for skipped and external refs", () => {
    const preview = parseOpenApiImport(`
openapi: 3.0.3
info: { title: Socket API, version: 1 }
paths:
  /socket:
    ws:
      tags: [Realtime]
      responses: {}
  /trace:
    trace:
      responses: {}
  /external:
    get:
      parameters:
        - $ref: './parameters.yaml#/Cursor'
      responses: {}
`)

    expect(preview.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transport: "websocket", folder: "Realtime" }),
      ])
    )
    expect(preview.skippedOperations).toBe(1)
    expect(preview.warnings.join(" ")).toMatch(/TRACE.*external reference/i)
  })

  test("guards recursive schema examples", () => {
    const preview = parseOpenApiImport(`
openapi: 3.1.0
info: { title: Tree, version: 1 }
components:
  schemas:
    Node:
      type: object
      properties:
        name: { type: string }
        child: { $ref: '#/components/schemas/Node' }
paths:
  /nodes:
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Node' }
      responses: {}
`)

    expect(preview.requests[0]?.draft.body.value).toContain('"name": "string"')
  })

  test("rejects invalid or unsupported documents", () => {
    expect(() => parseOpenApiImport("[]")).toThrow(/must be an object/i)
    expect(() => parseOpenApiImport('{"swagger":"2.0","paths":{}}')).toThrow(
      /only openapi 3\.0 and 3\.1/i
    )
    expect(() => parseOpenApiImport('{"openapi":"3.1.0","paths":{}}')).toThrow(
      /no supported operations/i
    )
  })
})
