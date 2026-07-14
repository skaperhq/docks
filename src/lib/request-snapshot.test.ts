import { describe, expect, test } from "vitest"
import type { SavedRequestSnapshot } from "@/components/api-reference/types"
import { requestDraftFromSnapshot } from "./request-snapshot"

describe("requestDraftFromSnapshot", () => {
  test("restores params, headers, and all body fields", () => {
    const snapshot: SavedRequestSnapshot = {
      method: "POST",
      transport: "http",
      mode: "standard",
      url: "https://api.example.com/search?q=skaper",
      params: [{ key: "q", value: "skaper", description: "" }],
      headers: [{ key: "X-Tenant", value: "docs", description: "" }],
      body: {
        mode: "raw",
        contentType: "application/json",
        value: '{"saved":true}',
        formDataRows: [{ key: "name", value: "Skaper", description: "" }],
        urlEncodedRows: [{ key: "page", value: "1", description: "" }],
      },
      environment: null,
      sentAt: "2026-07-13T00:00:00.000Z",
    }

    const draft = requestDraftFromSnapshot(snapshot)

    expect(draft).toEqual({
      params: snapshot.params,
      headers: snapshot.headers,
      body: snapshot.body,
    })
    expect(draft.params).not.toBe(snapshot.params)
    expect(draft.body).not.toBe(snapshot.body)
  })
})
