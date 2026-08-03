// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { RequestImportDialog } from "./request-import-dialog"

afterEach(cleanup)

describe("RequestImportDialog", () => {
  test("previews and imports a cURL request only after confirmation", async () => {
    const onCreateRequest = vi.fn().mockImplementation(async (input) => ({
      ...input,
      id: "curl-request",
      collectionId: "http-custom",
      position: 0,
      createdAt: "now",
      updatedAt: "now",
    }))
    const onSelect = vi.fn()
    render(
      <RequestImportDialog
        open
        onOpenChange={vi.fn()}
        collectionNames={[]}
        onCreateRequest={onCreateRequest}
        onImportOpenApi={vi.fn()}
        onSelectCustomRequest={onSelect}
      />
    )

    activateTab("cURL")
    fireEvent.change(screen.getByLabelText("cURL command"), {
      target: {
        value:
          "curl -X POST -H 'Content-Type: application/json' -d '{\"ok\":true}' 'https://api.example.com/items?q=one'",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }))

    expect(onCreateRequest).not.toHaveBeenCalled()
    expect(screen.getByLabelText<HTMLInputElement>("Request name").value).toBe(
      "POST /items"
    )
    expect(screen.getByText("1 parameters")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Import request" }))
    await waitFor(() => expect(onCreateRequest).toHaveBeenCalledTimes(1))
    expect(onCreateRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "POST /items",
        method: "POST",
        draft: expect.objectContaining({
          body: expect.objectContaining({ mode: "raw" }),
        }),
      })
    )
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "curl-request" })
    )
  })

  test("loads an OpenAPI file, previews a unique collection name, and imports", async () => {
    const onImportOpenApi = vi.fn().mockResolvedValue([
      {
        id: "health",
        collectionId: "example",
        name: "Health",
        method: "GET",
        transport: "http",
        mode: "standard",
        url: "/health",
        draft: {
          params: [],
          headers: [],
          body: { mode: "none", contentType: "", value: "" },
        },
        position: 0,
        createdAt: "now",
        updatedAt: "now",
      },
    ])
    render(
      <RequestImportDialog
        open
        onOpenChange={vi.fn()}
        collectionNames={["Example API"]}
        onCreateRequest={vi.fn()}
        onImportOpenApi={onImportOpenApi}
        onSelectCustomRequest={vi.fn()}
      />
    )

    activateTab("OpenAPI")
    const file = {
      name: "example.yaml",
      text: async () => `
openapi: 3.1.0
info: { title: Example API, version: 1 }
paths:
  /health:
    get:
      summary: Health
      tags: [System]
      responses: {}
`,
    }
    fireEvent.change(screen.getByLabelText("OpenAPI file"), {
      target: { files: [file] },
    })
    await waitFor(() =>
      expect(
        screen.getByLabelText<HTMLTextAreaElement>("JSON or YAML").value
      ).toContain("Example API")
    )
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }))

    expect(screen.getByText("Example API (2)")).toBeTruthy()
    expect(screen.getByText("1 operations")).toBeTruthy()
    expect(onImportOpenApi).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Import 1 requests" }))
    await waitFor(() => expect(onImportOpenApi).toHaveBeenCalledTimes(1))
    expect(onImportOpenApi).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Example API (2)",
        requests: [expect.objectContaining({ folder: "System" })],
      })
    )
  })

  test("keeps malformed source available while showing an inline error", () => {
    render(
      <RequestImportDialog
        open
        onOpenChange={vi.fn()}
        collectionNames={[]}
        onCreateRequest={vi.fn()}
        onImportOpenApi={vi.fn()}
        onSelectCustomRequest={vi.fn()}
      />
    )

    activateTab("cURL")
    fireEvent.change(screen.getByLabelText("cURL command"), {
      target: { value: "curl -H 'broken" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }))

    expect(screen.getByRole("alert").textContent).toMatch(/unclosed quote/i)
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("cURL command").value
    ).toBe("curl -H 'broken")
  })
})

function activateTab(name: string) {
  const tab = screen.getByRole("tab", { name })
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false })
}
