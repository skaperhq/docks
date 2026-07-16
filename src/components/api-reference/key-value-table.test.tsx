// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { KeyValueRow } from "./types"
import { KeyValueTable } from "./key-value-table"

afterEach(cleanup)

describe("form-data file values", () => {
  test("shows the empty Postman-style file selector", () => {
    renderTable([createFileRow()])

    expect(
      screen.getByRole("button", { name: "Select files for attachment" })
        .textContent
    ).toContain("Select files")
  })

  test("selects multiple files and removes them individually", () => {
    let rows = [createFileRow()]
    const onRowsChange = vi.fn((nextRows: KeyValueRow[]) => {
      rows = nextRows
    })
    const view = renderTable(rows, onRowsChange)
    const firstFile = new File(["first"], "adultSLP.txt", {
      type: "text/plain",
    })
    const secondFile = new File(["second"], "ConsentForm.pdf", {
      type: "application/pdf",
    })

    const selectFilesButton = screen.getByRole("button", {
      name: "Select files for attachment",
    })
    selectFilesButton.focus()
    expect(document.activeElement).toBe(selectFilesButton)

    fireEvent.change(screen.getByLabelText("File picker for attachment"), {
      target: { files: [firstFile, secondFile] },
    })

    expect(rows[0]?.files).toEqual([firstFile, secondFile])
    expect(rows[0]?.fileNames).toEqual(["adultSLP.txt", "ConsentForm.pdf"])

    view.rerender(
      <KeyValueTable
        title="Form Data"
        rows={rows}
        onRowsChange={onRowsChange}
        emptyMessage="No rows"
        allowFileValues
      />
    )

    expect(
      screen.getByRole("button", {
        name: "Expand 2 files for attachment",
      }).textContent
    ).toContain("2 files")
    expect(document.activeElement).not.toBe(selectFilesButton)

    fireEvent.focus(screen.getByRole("group", { name: "Files for attachment" }))

    const firstFileButton = screen.getByRole("button", {
      name: "Remove adultSLP.txt",
    })
    const secondFileButton = screen.getByRole("button", {
      name: "Remove ConsentForm.pdf",
    })
    expect(firstFileButton.parentElement).toBe(secondFileButton.parentElement)
    expect(firstFileButton.parentElement?.className).toContain("flex-col")

    fireEvent.click(firstFileButton)

    expect(rows[0]?.fileNames).toEqual(["ConsentForm.pdf"])
    expect(rows[0]?.files).toEqual([secondFile])
  })

  test("collapses multiple filenames into a compact count", () => {
    renderTable([
      createFileRow({
        value: "adultSLP.txt, ConsentForm.pdf",
        fileName: "adultSLP.txt",
        fileNames: ["adultSLP.txt", "ConsentForm.pdf"],
      }),
    ])

    expect(
      screen.getByRole("button", {
        name: "Expand 2 files for attachment",
      }).textContent
    ).toContain("2 files")

    const fileGroup = screen.getByRole("group", {
      name: "Files for attachment",
    })
    fireEvent.focus(fileGroup)
    expect(screen.getByText("adultSLP.txt")).toBeTruthy()
    expect(screen.getByText("ConsentForm.pdf")).toBeTruthy()

    fireEvent.blur(fileGroup, { relatedTarget: document.body })
    expect(
      screen.getByRole("button", {
        name: "Expand 2 files for attachment",
      }).textContent
    ).toContain("2 files")
  })
})

function renderTable(rows: KeyValueRow[], onRowsChange = vi.fn()) {
  return render(
    <KeyValueTable
      title="Form Data"
      rows={rows}
      onRowsChange={onRowsChange}
      emptyMessage="No rows"
      allowFileValues
    />
  )
}

function createFileRow(patch: Partial<KeyValueRow> = {}): KeyValueRow {
  return {
    key: "attachment",
    value: "",
    description: "Files to upload",
    type: "file",
    enabled: true,
    ...patch,
  }
}
