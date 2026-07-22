// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { apiOperations } from "@/lib/openapi"
import type { PersistedCustomRequest } from "@/lib/api-reference-actions"
import { RequestSearchCommand } from "./request-search-command"

afterEach(cleanup)

const originalResizeObserver = globalThis.ResizeObserver
const originalScrollIntoView = Element.prototype.scrollIntoView

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver
  Element.prototype.scrollIntoView = originalScrollIntoView
})

const customRequest = {
  id: "custom-1",
  name: "Custom webhook",
  method: "POST",
  transport: "http",
  mode: "standard",
  url: "https://example.com/webhook",
  collectionId: "root",
  position: 0,
  draft: {
    params: [],
    headers: [],
    body: { mode: "none", contentType: "", value: "" },
  },
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
} satisfies PersistedCustomRequest

function renderSearch() {
  const callbacks = {
    onSelectOverview: vi.fn(),
    onSelectEnvironment: vi.fn(),
    onSelectOperation: vi.fn(),
    onSelectCustomRequest: vi.fn(),
  }
  render(
    <RequestSearchCommand customRequests={[customRequest]} {...callbacks} />
  )
  return callbacks
}

describe("RequestSearchCommand", () => {
  test.each([
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true },
  ])("opens with the supported keyboard shortcuts", (modifiers) => {
    renderSearch()

    fireEvent.keyDown(document, { key: "k", ...modifiers })

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(
      screen.getByPlaceholderText("Search pages and requests…")
    ).toBeTruthy()
  })

  test("filters and selects an OpenAPI operation", async () => {
    const callbacks = renderSearch()
    fireEvent.click(
      screen.getByRole("button", { name: "Search API pages and requests" })
    )

    const operation = apiOperations.find(
      (item) => item.id === "POST /auth/login"
    )!
    fireEvent.change(
      screen.getByPlaceholderText("Search pages and requests…"),
      {
        target: { value: operation.summary },
      }
    )
    fireEvent.click(await screen.findByText(operation.summary))

    expect(callbacks.onSelectOperation).toHaveBeenCalledWith(operation)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("selects a custom request", async () => {
    const callbacks = renderSearch()
    fireEvent.click(
      screen.getByRole("button", { name: "Search API pages and requests" })
    )
    fireEvent.change(
      screen.getByPlaceholderText("Search pages and requests…"),
      {
        target: { value: "Custom webhook" },
      }
    )
    fireEvent.click(await screen.findByText("Custom webhook"))

    expect(callbacks.onSelectCustomRequest).toHaveBeenCalledWith(customRequest)
  })
})
