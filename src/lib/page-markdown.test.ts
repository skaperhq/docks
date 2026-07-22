import { describe, expect, test } from "vitest"
import type {
  RequestDraft,
  ResponseState,
} from "@/components/api-reference/types"
import { apiInfo, apiOperations } from "./openapi"
import {
  buildApiOverviewMarkdown,
  buildRequestPageMarkdown,
} from "./page-markdown"

const draft: RequestDraft = {
  params: [
    {
      key: "include",
      value: "profile|settings",
      description: "Included data",
      location: "query",
      enabled: true,
    },
    {
      key: "disabled",
      value: "hidden",
      description: "",
      location: "query",
      enabled: false,
    },
  ],
  headers: [
    {
      key: "Authorization",
      value: "Bearer {{accessToken}}",
      description: "Bearer token",
      enabled: true,
    },
  ],
  body: {
    mode: "raw",
    contentType: "application/json",
    value: '{"message":"contains ``` fence"}',
  },
}

const successResponse: ResponseState = {
  status: "success",
  result: {
    status: 200,
    statusText: "OK",
    ok: true,
    durationMs: 42,
    sizeBytes: 17,
    contentType: "application/json",
    bodyText: '{"ok":true}',
    headers: [{ key: "content-type", value: "application/json" }],
    cookies: [{ key: "session", value: "abc" }],
    url: "https://api.example.com/current",
    websocketFrames: [
      {
        id: "frame-1",
        direction: "incoming",
        data: "ready|now",
        sizeBytes: 9,
        timestamp: Date.UTC(2026, 6, 18),
      },
    ],
  },
}

describe("page Markdown", () => {
  test("builds an overview from the configured OpenAPI document", () => {
    const markdown = buildApiOverviewMarkdown()

    expect(markdown).toContain(`# ${apiInfo.title}`)
    expect(markdown).toContain("## Servers")
    expect(markdown).toContain("## Authentication")
    expect(markdown).toContain("## Operations")
    expect(markdown).not.toContain("Scalar Galaxy")
    expect(markdown).not.toContain("Saved responses")
  })

  test("includes documented API content, literal request input, body, and latest response", () => {
    const operation = apiOperations.find(
      (item) => item.requestSchema && item.responses.length > 0
    )
    expect(operation).toBeTruthy()

    const markdown = buildRequestPageMarkdown({
      title: operation!.summary,
      method: operation!.method,
      displayPath: operation!.path,
      transport: "http",
      mode: operation!.requestMode,
      requestUrl: "https://api.example.com/current",
      draft,
      curlCommand:
        "curl --request POST 'https://api.example.com/current' --header 'Authorization: Bearer {{accessToken}}'",
      operation,
      responseState: successResponse,
    })

    expect(markdown).toContain("## Documented Request Parameters")
    expect(markdown).toContain("## Current Request Input")
    expect(markdown).toContain("profile\\|settings")
    expect(markdown).not.toContain("hidden")
    expect(markdown).toContain("Bearer {{accessToken}}")
    expect(markdown).toContain("## Request Body")
    expect(markdown).toContain("contains ``` fence")
    expect(markdown).toContain("````json")
    expect(markdown).toContain("### Documented request schema")
    expect(markdown).toContain("## Documented Responses")
    expect(markdown).toContain("## Latest Received Response")
    expect(markdown).toContain("| session | abc |")
    expect(markdown).toContain("ready\\|now")
    expect(markdown).toContain('{"ok":true}')
  })

  test("documents custom form and binary request inputs without OpenAPI responses", () => {
    const formMarkdown = buildRequestPageMarkdown({
      title: "Upload",
      method: "POST",
      displayPath: "/upload",
      transport: "http",
      mode: "standard",
      requestUrl: "https://api.example.com/upload",
      draft: {
        params: [],
        headers: [],
        body: {
          mode: "form-data",
          contentType: "multipart/form-data",
          value: "",
          formDataRows: [
            {
              key: "files",
              value: "",
              description: "",
              type: "file",
              fileNames: ["first.png", "second.png"],
            },
          ],
        },
      },
      responseState: { status: "idle" },
    })

    expect(formMarkdown).toContain("first.png, second.png")
    expect(formMarkdown).toContain("No documented responses.")
    expect(formMarkdown).not.toContain("Latest Received Response")

    const binaryMarkdown = buildRequestPageMarkdown({
      title: "Binary upload",
      method: "POST",
      displayPath: "/binary",
      transport: "http",
      mode: "standard",
      requestUrl: "/binary",
      draft: {
        params: [],
        headers: [],
        body: {
          mode: "binary",
          contentType: "application/octet-stream",
          value: "",
          binaryFileName: "archive.zip",
        },
      },
      responseState: { status: "idle" },
    })
    expect(binaryMarkdown).toContain("archive.zip")
  })

  test("includes request errors as the latest result", () => {
    const markdown = buildRequestPageMarkdown({
      title: "Failed request",
      method: "GET",
      displayPath: "/failed",
      transport: "http",
      mode: "standard",
      requestUrl: "/failed",
      draft: {
        params: [],
        headers: [],
        body: { mode: "none", contentType: "", value: "" },
      },
      responseState: {
        status: "error",
        error: "Network unavailable",
        durationMs: 8,
      },
    })

    expect(markdown).toContain("## Latest Received Response")
    expect(markdown).toContain("Network unavailable")
  })
})
