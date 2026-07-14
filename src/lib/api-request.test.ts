import { describe, expect, test } from "vitest"
import { buildFetchRequest, buildRequestUrl } from "./api-request"
import type { RequestDraft } from "@/components/api-reference/types"

const resolveVariables = (text: string) =>
  text.replaceAll("{{access_token}}", "token-123").replaceAll("{{id}}", "42")

describe("buildFetchRequest", () => {
  test("resolves path params, query params, headers, and snapshots", () => {
    const draft = createDraft({
      params: [
        {
          key: "id",
          value: "{{id}}",
          description: "",
          location: "path",
        },
        {
          key: "include",
          value: "profile",
          description: "",
          location: "query",
        },
      ],
      headers: [
        {
          key: "Authorization",
          value: "Bearer {{access_token}}",
          description: "Bearer token",
        },
      ],
    })

    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/users/{id}",
      method: "POST",
      draft,
      resolveVariables,
      environment: {
        id: "dev",
        name: "Development",
        baseUrl: "https://api.example.com",
      },
      sentAt: "2026-06-30T00:00:00.000Z",
    })

    expect(request.url).toBe("https://api.example.com/users/42?include=profile")
    expect(request.headers.get("authorization")).toBe("Bearer token-123")
    expect(request.requestSnapshot.headers[0]?.value).toBe("Bearer token-123")
    expect(request.requestSnapshot.params[0]?.value).toBe("42")
    expect(request.requestSnapshot.sentAt).toBe("2026-06-30T00:00:00.000Z")
  })

  test("sends raw bodies with the selected content type", () => {
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/login",
      method: "POST",
      draft: createDraft({
        body: {
          mode: "raw",
          contentType: "application/json",
          value: '{"token":"{{access_token}}"}',
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(request.body).toBe('{"token":"token-123"}')
    expect(request.headers.get("content-type")).toBe("application/json")
    expect(request.requestSnapshot.body.value).toBe('{"token":"token-123"}')
  })

  test("sends urlencoded bodies from enabled rows", () => {
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/search",
      method: "POST",
      draft: createDraft({
        body: {
          mode: "x-www-form-urlencoded",
          contentType: "application/x-www-form-urlencoded",
          value: "",
          urlEncodedRows: [
            { key: "q", value: "hello", description: "" },
            { key: "skip", value: "nope", description: "", enabled: false },
          ],
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(request.body).toBeInstanceOf(URLSearchParams)
    expect(String(request.body)).toBe("q=hello")
    expect(request.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded"
    )
  })

  test("replaces a stale generated content type for urlencoded bodies", () => {
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/search",
      method: "POST",
      draft: createDraft({
        headers: [
          { key: "Content-Type", value: "application/json", description: "" },
        ],
        body: {
          mode: "x-www-form-urlencoded",
          contentType: "application/x-www-form-urlencoded",
          value: "",
          urlEncodedRows: [{ key: "q", value: "docs", description: "" }],
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(request.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded"
    )
  })

  test("sends form-data rows without forcing a content-type header", () => {
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/upload",
      method: "POST",
      draft: createDraft({
        headers: [
          {
            key: "Content-Type",
            value: "multipart/form-data",
            description: "",
          },
        ],
        body: {
          mode: "form-data",
          contentType: "multipart/form-data",
          value: "",
          formDataRows: [{ key: "name", value: "avatar", description: "" }],
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(request.body).toBeInstanceOf(FormData)
    expect((request.body as FormData).get("name")).toBe("avatar")
    expect(request.headers.has("content-type")).toBe(false)
  })

  test("sends binary bodies with their file content type", () => {
    const payload = new Blob(["binary payload"], {
      type: "application/octet-stream",
    })
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/upload",
      method: "POST",
      draft: createDraft({
        body: {
          mode: "binary",
          contentType: "application/octet-stream",
          value: "",
          binaryFileName: "payload.bin",
          binaryFile: payload,
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(request.body).toBe(payload)
    expect(request.headers.get("content-type")).toBe("application/octet-stream")
    expect(request.requestSnapshot.body.binaryFileName).toBe("payload.bin")
    expect(request.requestSnapshot.body.binaryFile).toBeUndefined()
  })

  test("omits body for none mode and GET requests", () => {
    const noneRequest = buildFetchRequest({
      baseUrl: "https://api.example.com/ping",
      method: "POST",
      draft: createDraft({
        body: { mode: "none", contentType: "application/json", value: "" },
      }),
      resolveVariables,
      environment: null,
    })
    const getRequest = buildFetchRequest({
      baseUrl: "https://api.example.com/upload",
      method: "GET",
      draft: createDraft({
        body: {
          mode: "raw",
          contentType: "application/json",
          value: '{"ignored":true}',
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(noneRequest.body).toBeUndefined()
    expect(getRequest.body).toBeUndefined()
  })

  test("uses the body editor content type for raw bodies", () => {
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/events",
      method: "POST",
      draft: createDraft({
        headers: [
          {
            key: "Content-Type",
            value: "application/problem+json",
            description: "",
          },
        ],
        body: {
          mode: "raw",
          contentType: "application/json",
          value: "{}",
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(request.headers.get("content-type")).toBe("application/json")
  })

  test("omits disabled and unnamed header rows", () => {
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/ping",
      method: "GET",
      draft: createDraft({
        headers: [
          { key: "X-Enabled", value: "yes", description: "" },
          {
            key: "X-Disabled",
            value: "no",
            description: "",
            enabled: false,
          },
          { key: "  ", value: "ignored", description: "" },
        ],
      }),
      resolveVariables,
      environment: null,
    })

    expect(Array.from(request.headers.entries())).toEqual([
      ["x-enabled", "yes"],
    ])
    expect(request.requestSnapshot.headers).toHaveLength(1)
  })

  test("omits a binary body when no file has been selected", () => {
    const request = buildFetchRequest({
      baseUrl: "https://api.example.com/upload",
      method: "POST",
      draft: createDraft({
        body: {
          mode: "binary",
          contentType: "application/octet-stream",
          value: "",
        },
      }),
      resolveVariables,
      environment: null,
    })

    expect(request.body).toBeUndefined()
    expect(request.headers.has("content-type")).toBe(false)
  })
})

describe("buildRequestUrl", () => {
  test("encodes path values and preserves existing query and hash parts", () => {
    const url = buildRequestUrl(
      "https://api.example.com/files/{path}?existing=1#preview",
      [
        {
          key: "path",
          value: "reports/July 2026",
          description: "",
          location: "path",
        },
        { key: "tag", value: "one", description: "", location: "query" },
        { key: "tag", value: "two", description: "", location: "query" },
      ]
    )

    expect(url).toBe(
      "https://api.example.com/files/reports%2FJuly%202026?existing=1&tag=one&tag=two#preview"
    )
  })

  test("supports colon path parameters and ignores disabled query rows", () => {
    const url = buildRequestUrl("https://api.example.com/users/:id", [
      {
        key: "id",
        value: "user@example.com",
        description: "",
        location: "path",
      },
      {
        key: "debug",
        value: "true",
        description: "",
        location: "query",
        enabled: false,
      },
    ])

    expect(url).toBe("https://api.example.com/users/user%40example.com")
  })
})

test("resolves variables in the base URL before applying params", () => {
  const request = buildFetchRequest({
    baseUrl: "https://api.example.com/users/{{id}}",
    method: "GET",
    draft: createDraft({
      params: [{ key: "view", value: "full", description: "" }],
    }),
    resolveVariables,
    environment: null,
  })

  expect(request.url).toBe("https://api.example.com/users/42?view=full")
})

function createDraft(patch: Partial<RequestDraft> = {}): RequestDraft {
  return {
    params: [],
    headers: [],
    body: {
      mode: "raw",
      contentType: "application/json",
      value: "",
      formDataRows: [],
      urlEncodedRows: [],
    },
    ...patch,
  }
}
