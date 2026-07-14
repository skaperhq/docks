// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { RequestBodyDraft } from "./types"
import { BODY_MODES, BodyPanel, RAW_BODY_TYPES } from "./body-panel"

vi.mock("./body-editor", () => ({
  BodyEditor: ({ value }: { value: string }) => (
    <textarea value={value} readOnly />
  ),
}))

afterEach(cleanup)

const baseBody: RequestBodyDraft = {
  mode: "raw",
  contentType: "application/json",
  value: "{}",
}

describe("BodyPanel", () => {
  test("exposes the requested body modes and raw formats", () => {
    expect(BODY_MODES.map((mode) => mode.label)).toEqual([
      "none",
      "form-data",
      "x-www-form-urlencoded",
      "raw",
      "binary",
      "GraphQL",
    ])
    expect(RAW_BODY_TYPES.map((type) => type.label)).toEqual([
      "Text",
      "JavaScript",
      "JSON",
      "HTML",
      "XML",
    ])
  })

  test("shows the format selector only for raw bodies", () => {
    const { rerender } = render(
      <BodyPanel body={baseBody} onBodyChange={vi.fn()} />
    )

    expect(screen.getByRole("combobox", { name: "Raw body type" })).toBeTruthy()

    rerender(
      <BodyPanel
        body={{ ...baseBody, mode: "form-data" }}
        onBodyChange={vi.fn()}
      />
    )

    expect(screen.queryByRole("combobox", { name: "Raw body type" })).toBeNull()
  })

  test("renders separate GraphQL query and variables editors", () => {
    render(
      <BodyPanel
        body={{
          ...baseBody,
          mode: "graphql",
          graphqlQuery: "query Viewer { viewer { id } }",
          graphqlVariables: '{"includeProfile":true}',
        }}
        onBodyChange={vi.fn()}
      />
    )

    expect(screen.getByText("Query")).toBeTruthy()
    expect(screen.getByText("GraphQL Variables")).toBeTruthy()
    expect(screen.getAllByRole("textbox")).toHaveLength(2)
  })
})
