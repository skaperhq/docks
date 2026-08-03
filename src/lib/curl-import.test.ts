import { describe, expect, test } from "vitest"
import { parseCurlCommand, tokenizeCurl } from "./curl-import"

describe("parseCurlCommand", () => {
  test("imports a multiline JSON request with quoted headers and query values", () => {
    const parsed = parseCurlCommand(`curl --request POST \\
      'https://api.example.com/users?include=profile&include=teams' \\
      --header 'Authorization: Bearer token' \\
      --header 'Content-Type: application/json' \\
      --data-raw '{"name":"O'\\''Reilly"}'`)

    expect(parsed.method).toBe("POST")
    expect(parsed.url).toBe("https://api.example.com/users")
    expect(parsed.name).toBe("POST /users")
    expect(parsed.draft.params.map((row) => row.value)).toEqual([
      "profile",
      "teams",
    ])
    expect(parsed.draft.headers[0]).toMatchObject({
      key: "Authorization",
      value: "Bearer token",
    })
    expect(parsed.draft.body).toMatchObject({
      mode: "raw",
      contentType: "application/json",
      value: `{"name":"O'Reilly"}`,
    })
  })

  test("supports compact options, inferred POST, auth, and cookies", () => {
    const parsed = parseCurlCommand(
      "curl -uuser:pass -bsid=123 -dname=Skaper -dactive=true https://api.example.com/users"
    )

    expect(parsed.method).toBe("POST")
    expect(parsed.draft.body.mode).toBe("x-www-form-urlencoded")
    expect(parsed.draft.body.urlEncodedRows).toHaveLength(2)
    expect(parsed.draft.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "Authorization",
          value: "Basic dXNlcjpwYXNz",
        }),
        expect.objectContaining({ key: "Cookie", value: "sid=123" }),
      ])
    )
  })

  test("moves data to query parameters for --get", () => {
    const parsed = parseCurlCommand(
      "curl --get --data-urlencode 'q=api docs' https://api.example.com/search"
    )

    expect(parsed.method).toBe("GET")
    expect(parsed.draft.params).toEqual([
      expect.objectContaining({ key: "q", value: "api docs" }),
    ])
    expect(parsed.draft.body.mode).toBe("none")
  })

  test("imports form fields and reports file references", () => {
    const parsed = parseCurlCommand(
      "curl -F 'name=Skaper' -F 'document=@report.pdf' https://api.example.com/upload"
    )

    expect(parsed.draft.body.mode).toBe("form-data")
    expect(parsed.draft.body.formDataRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "name", value: "Skaper" }),
        expect.objectContaining({
          key: "document",
          type: "file",
          fileName: "report.pdf",
        }),
      ])
    )
    expect(parsed.warnings.join(" ")).toMatch(/report\.pdf/)
  })

  test("keeps shell substitutions as literal text", () => {
    const tokens = tokenizeCurl(
      "curl 'https://example.com/$(whoami)' -H 'X-Test: `id`'"
    )
    expect(tokens).toEqual([
      "curl",
      "https://example.com/$(whoami)",
      "-H",
      "X-Test: `id`",
    ])
  })

  test("rejects malformed commands", () => {
    expect(() => parseCurlCommand("curl -H 'broken")).toThrow(/unclosed quote/i)
    expect(() => parseCurlCommand("curl -X TRACE https://example.com")).toThrow(
      /unsupported http method/i
    )
    expect(() => parseCurlCommand("curl -X GET")).toThrow(
      /does not contain a url/i
    )
  })
})
