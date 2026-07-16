import { describe, expect, test } from "vitest"
import { apiOperations } from "./openapi"
import type { ApiOperation } from "./openapi"
import {
  createOperationRequestBodyDraft,
  getRequestBodyMode,
  normalizeOperationRequestDraft,
} from "./request-body"

describe("OpenAPI request body initialization", () => {
  test("selects the editor mode from the request media type", () => {
    expect(getRequestBodyMode("multipart/form-data")).toBe("form-data")
    expect(
      getRequestBodyMode("application/x-www-form-urlencoded; charset=utf-8")
    ).toBe("x-www-form-urlencoded")
    expect(getRequestBodyMode("application/json")).toBe("raw")
    expect(getRequestBodyMode("")).toBe("none")
  })

  test("creates form-data rows and marks binary properties as files", () => {
    const body = createOperationRequestBodyDraft(
      createOperation({
        requestContentTypes: ["multipart/form-data"],
        requestSchema: {
          type: "object",
          required: ["file"],
          properties: {
            file: {
              type: "string",
              format: "binary",
              description: "Audio sample",
            },
            attempt: { type: "integer", default: 1 },
          },
        },
        requestExample: { file: "string", attempt: 0 },
      })
    )

    expect(body).toMatchObject({
      mode: "form-data",
      contentType: "multipart/form-data",
      value: "",
    })
    expect(body.formDataRows).toEqual([
      expect.objectContaining({
        key: "file",
        value: "",
        type: "file",
        required: true,
        description: "Audio sample",
      }),
      expect.objectContaining({
        key: "attempt",
        value: "1",
        type: "integer",
      }),
    ])
  })

  test("initializes a real multipart OpenAPI operation as form-data", () => {
    const uploadOperation = apiOperations.find(
      (operation) => operation.id === "POST /user/profile-picture"
    )

    expect(uploadOperation).toBeDefined()
    expect(createOperationRequestBodyDraft(uploadOperation)).toMatchObject({
      mode: "form-data",
      contentType: "multipart/form-data",
      formDataRows: [
        expect.objectContaining({ key: "file", type: "file", required: true }),
      ],
    })
  })

  test("repairs a persisted legacy raw multipart draft", () => {
    const operation = createOperation({
      requestContentTypes: ["multipart/form-data"],
      requestSchema: {
        type: "object",
        properties: {
          file: { type: "string", format: "binary" },
        },
      },
      requestExample: { file: "string" },
    })
    const draft = normalizeOperationRequestDraft(operation, {
      params: [],
      headers: [],
      body: {
        mode: "raw",
        contentType: "multipart/form-data",
        value: '{"file":"string"}',
        formDataRows: [],
      },
    })

    expect(draft.body.mode).toBe("form-data")
    expect(draft.body.value).toBe("")
    expect(draft.body.formDataRows).toEqual([
      expect.objectContaining({ key: "file", type: "file" }),
    ])
  })

  test("preserves a body mode explicitly selected by the user", () => {
    const operation = createOperation({
      requestContentTypes: ["multipart/form-data"],
    })
    const draft = {
      params: [],
      headers: [],
      body: {
        mode: "none",
        contentType: "multipart/form-data",
        value: "",
      },
    }

    expect(normalizeOperationRequestDraft(operation, draft)).toBe(draft)
  })
})

function createOperation(patch: Partial<ApiOperation>): ApiOperation {
  return {
    id: "POST /upload",
    method: "POST",
    path: "/upload",
    displayPath: "upload",
    tag: "Files",
    summary: "Upload file",
    parameters: [],
    queryParameters: [],
    pathParameters: [],
    headerParameters: [],
    hasAuth: false,
    requestBodyRequired: true,
    requestContentTypes: [],
    requestExample: null,
    responseCodes: [],
    responses: [],
    requestMode: "standard",
    hasEventStreamResponse: false,
    requestUrl: "/upload",
    searchText: "upload",
    ...patch,
  }
}
