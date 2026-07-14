// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { apiOperations } from "@/lib/openapi"
import { DocsPanel } from "./docs-panel"

vi.mock("./body-editor", () => ({
  BodyEditor: ({ value, readOnly }: { value: string; readOnly?: boolean }) => (
    <pre data-testid="body-editor" data-read-only={String(readOnly)}>
      {value}
    </pre>
  ),
}))

afterEach(cleanup)

describe("DocsPanel", () => {
  test("shows cURL and response examples in read-only editors", () => {
    const operation = apiOperations.find((item) =>
      item.responses.some(
        (response) =>
          response.code === "200" && response.contentTypes.length > 0
      )
    )
    expect(operation).toBeTruthy()

    render(
      <DocsPanel
        operation={operation!}
        curlCommand="curl --request GET 'https://api.example.com/health'"
      />
    )

    const editors = screen.getAllByTestId("body-editor")
    expect(editors.length).toBeGreaterThanOrEqual(2)
    expect(editors.every((editor) => editor.dataset.readOnly === "true")).toBe(
      true
    )
    expect(editors[0]?.textContent).toContain("curl --request GET")
  })
})
