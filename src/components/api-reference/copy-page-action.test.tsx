// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CopyPageAction } from "./copy-page-action"

vi.mock("./body-editor", () => ({
  BodyEditor: ({ value }: { value: string }) => <pre>{value}</pre>,
}))

afterEach(cleanup)

describe("CopyPageAction", () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
  })

  test("copies the current Markdown", async () => {
    render(<CopyPageAction markdown="# Current" title="Current" />)

    fireEvent.click(screen.getByRole("button", { name: "Copy page" }))

    expect(writeText).toHaveBeenCalledWith("# Current")
    expect(
      await screen.findByText("Markdown copied to clipboard.")
    ).toBeTruthy()
  })

  test("opens a read-only Markdown viewer from the menu", async () => {
    render(<CopyPageAction markdown="# Viewer content" title="Example" />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "More page Markdown actions" }),
      { button: 0, ctrlKey: false }
    )
    fireEvent.click(await screen.findByText("View as Markdown"))

    expect(await screen.findByRole("dialog")).toBeTruthy()
    expect(screen.getByText("Example Markdown")).toBeTruthy()
    expect(screen.getByText("# Viewer content")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Copy Markdown" }))
    expect(writeText).toHaveBeenCalledWith("# Viewer content")
  })
})
