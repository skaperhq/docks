// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { apiOperations } from "@/lib/openapi"
import { DocsPanel, getCodeBlockHeight, ResponseSchema } from "./docs-panel"

vi.mock("./body-editor", () => ({
  BodyEditor: ({
    value,
    readOnly,
    lineWrapping,
  }: {
    value: string
    readOnly?: boolean
    lineWrapping?: boolean
  }) => (
    <pre
      data-testid="body-editor"
      data-read-only={String(readOnly)}
      data-line-wrapping={String(lineWrapping)}
    >
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
    expect(editors[0]?.dataset.lineWrapping).toBe("true")
    expect(screen.getByRole("button", { name: "Copy cURL" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Copy example value" })
    ).toBeTruthy()
    expect(
      document.querySelector('[data-slot="accordion-content"] > div')?.className
    ).not.toContain("--radix-accordion-content-height")
  })

  test("sizes read-only code blocks to their content with a maximum height", () => {
    expect(getCodeBlockHeight("first\nsecond")).toBe(78)
    expect(
      getCodeBlockHeight(Array.from({ length: 8 }, () => "line").join("\n"))
    ).toBe(204)
    expect(
      getCodeBlockHeight(Array.from({ length: 100 }, () => "line").join("\n"))
    ).toBe(360)
  })

  test("gives response schemas a bounded vertical scroll viewport", () => {
    const response = apiOperations
      .flatMap((item) => item.responses)
      .find((item) => item.schema)
    expect(response).toBeTruthy()

    render(<ResponseSchema response={response!} />)

    expect(
      screen.getByTestId("response-schema-scroll-area").className
    ).toContain("h-80")
    expect(screen.getByRole("table").className).toContain("min-w-208")
  })
})
