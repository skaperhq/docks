import { describe, expect, test } from "vitest"
import type { SavedRequestSnapshot } from "@/components/api-reference/types"
import { buildCurlCommand } from "./request-curl"

describe("buildCurlCommand", () => {
  test("includes the resolved URL, enabled headers, and raw body", () => {
    const command = buildCurlCommand(
      createSnapshot({
        method: "POST",
        url: "https://api.example.com/users?include=profile",
        headers: [
          { key: "Content-Type", value: "application/json", description: "" },
          { key: "X-Skip", value: "no", description: "", enabled: false },
        ],
        body: {
          mode: "raw",
          contentType: "application/json",
          value: `{"name":"O'Reilly"}`,
        },
      })
    )

    expect(command).toContain("--request POST")
    expect(command).toContain("'https://api.example.com/users?include=profile'")
    expect(command).toContain("'Content-Type: application/json'")
    expect(command).not.toContain("X-Skip")
    expect(command).toContain("O'\\''Reilly")
  })

  test("serializes form and urlencoded rows", () => {
    const form = buildCurlCommand(
      createSnapshot({
        method: "POST",
        body: {
          mode: "form-data",
          contentType: "multipart/form-data",
          value: "",
          formDataRows: [{ key: "name", value: "Skaper", description: "" }],
        },
      })
    )
    const encoded = buildCurlCommand(
      createSnapshot({
        method: "POST",
        body: {
          mode: "x-www-form-urlencoded",
          contentType: "application/x-www-form-urlencoded",
          value: "",
          urlEncodedRows: [{ key: "q", value: "api docs", description: "" }],
        },
      })
    )

    expect(form).toContain("--form 'name=Skaper'")
    expect(encoded).toContain("--data-urlencode 'q=api docs'")
  })

  test("shows the actual URL-only native EventSource request", () => {
    const command = buildCurlCommand(
      createSnapshot({
        mode: "sse",
        method: "GET",
        headers: [{ key: "Authorization", value: "Bearer x", description: "" }],
        body: {
          mode: "raw",
          contentType: "application/json",
          value: "ignored",
        },
      })
    )

    expect(command).toBe(
      "curl --request GET \\\n  'https://api.example.com/items'"
    )
    expect(command).not.toContain("Authorization")
    expect(command).not.toContain("ignored")
  })
})

function createSnapshot(
  patch: Partial<SavedRequestSnapshot> = {}
): SavedRequestSnapshot {
  return {
    method: "GET",
    transport: "http",
    mode: "standard",
    url: "https://api.example.com/items",
    params: [],
    headers: [],
    body: { mode: "none", contentType: "application/json", value: "" },
    environment: null,
    sentAt: "2026-07-13T00:00:00.000Z",
    ...patch,
  }
}
