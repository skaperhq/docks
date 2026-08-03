// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { AppSidebar } from "./app-sidebar"
import { SidebarProvider } from "./ui/sidebar"
import { apiOperations } from "@/lib/openapi"

vi.mock("@/components/environment-provider", () => ({
  useEnvironment: () => ({
    environments: [
      {
        id: "default",
        name: "Default",
        baseUrl: "https://example.com",
        variables: [],
      },
    ],
    activeEnvironmentId: "default",
    setActiveEnvironmentId: vi.fn(),
  }),
}))

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}))

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(cleanup)

function SidebarUnderTest({
  activePage = "environment",
  selectedOperationId = null,
}: {
  activePage?: "workspace" | "environment"
  selectedOperationId?: string | null
} = {}) {
  return (
    <SidebarProvider>
      <AppSidebar
        activePage={activePage}
        selectedOperationId={selectedOperationId}
        selectedRequestId={null}
        savedResponses={[]}
        collections={[]}
        customRequests={[]}
        onSelectOverview={vi.fn()}
        onSelectEnvironment={vi.fn()}
        onSelectOperation={vi.fn()}
        onSelectSavedResponse={vi.fn()}
        onDeleteSavedResponse={vi.fn()}
        onDeleteCustomRequest={vi.fn()}
        onDeleteCollection={vi.fn()}
        onCreateCustomRequest={async () => null}
        onImportOpenApi={async () => null}
        onSelectCustomRequest={vi.fn()}
      />
    </SidebarProvider>
  )
}

describe("AppSidebar", () => {
  test("keeps navigation folders open across unrelated parent updates", () => {
    const view = render(<SidebarUnderTest />)
    const httpTrigger = screen.getByText("HTTP").closest("button")

    expect(httpTrigger?.getAttribute("data-state")).toBe("closed")
    fireEvent.click(httpTrigger!)
    expect(httpTrigger?.getAttribute("data-state")).toBe("open")

    view.rerender(<SidebarUnderTest />)

    expect(
      screen.getByText("HTTP").closest("button")?.getAttribute("data-state")
    ).toBe("open")
  })

  test("keeps the active transport open when a selected request is removed", () => {
    const operation = apiOperations.find(
      (item) => item.requestMode !== "sse" && item.method !== "WS"
    )!
    const view = render(
      <SidebarUnderTest
        activePage="workspace"
        selectedOperationId={operation.id}
      />
    )

    expect(screen.getByText("HTTP").closest("button")?.dataset.state).toBe(
      "open"
    )

    view.rerender(<SidebarUnderTest activePage="workspace" />)

    expect(screen.getByText("HTTP").closest("button")?.dataset.state).toBe(
      "open"
    )
  })

  test("shows saved responses beneath a custom request", () => {
    const onSelectSavedResponse = vi.fn()
    const customRequest = {
      id: "custom-1",
      collectionId: "http-custom",
      name: "Create player",
      method: "POST" as const,
      transport: "http" as const,
      mode: "standard" as const,
      url: "https://example.com/players",
      draft: {
        params: [],
        headers: [],
        body: { mode: "none", contentType: "", value: "" },
      },
      position: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }
    const savedResponse = {
      id: "response-1",
      operationId: "custom:custom-1",
      method: "POST",
      path: "https://example.com/players",
      name: "Created player",
      status: 201,
      ok: true,
      durationMs: 24,
      sizeBytes: 42,
      contentType: "application/json",
      createdAt: "2026-08-02T00:01:00.000Z",
    }

    render(
      <SidebarProvider>
        <AppSidebar
          activePage="workspace"
          selectedOperationId={null}
          selectedRequestId="custom:custom-1"
          savedResponses={[savedResponse]}
          collections={[]}
          customRequests={[customRequest]}
          onSelectOverview={vi.fn()}
          onSelectEnvironment={vi.fn()}
          onSelectOperation={vi.fn()}
          onSelectSavedResponse={onSelectSavedResponse}
          onDeleteSavedResponse={vi.fn()}
          onDeleteCustomRequest={vi.fn()}
          onDeleteCollection={vi.fn()}
          onCreateCustomRequest={async () => null}
          onImportOpenApi={async () => null}
          onSelectCustomRequest={vi.fn()}
        />
      </SidebarProvider>
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open saved response Created player",
      })
    )
    expect(onSelectSavedResponse).toHaveBeenCalledWith(savedResponse)
  })

  test("renders imported collections with OpenAPI tag folders", async () => {
    const onDeleteCollection = vi.fn()
    const request = {
      id: "imported-1",
      collectionId: "payments-api",
      name: "Create payment",
      method: "POST" as const,
      transport: "http" as const,
      mode: "standard" as const,
      url: "https://api.example.com/payments",
      folder: "Payments",
      draft: {
        params: [],
        headers: [],
        body: { mode: "none", contentType: "", value: "" },
      },
      position: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }
    const inactiveFolderRequest = {
      ...request,
      id: "imported-2",
      name: "Create refund",
      url: "https://api.example.com/refunds",
      folder: "Refunds",
      position: 1,
    }

    render(
      <SidebarProvider>
        <AppSidebar
          activePage="workspace"
          selectedOperationId={null}
          selectedRequestId="custom:imported-1"
          savedResponses={[]}
          collections={[
            {
              id: "payments-api",
              name: "Payments API",
              position: 0,
              createdAt: request.createdAt,
              updatedAt: request.updatedAt,
            },
          ]}
          customRequests={[request, inactiveFolderRequest]}
          onSelectOverview={vi.fn()}
          onSelectEnvironment={vi.fn()}
          onSelectOperation={vi.fn()}
          onSelectSavedResponse={vi.fn()}
          onDeleteSavedResponse={vi.fn()}
          onDeleteCustomRequest={vi.fn()}
          onDeleteCollection={onDeleteCollection}
          onCreateCustomRequest={async () => null}
          onImportOpenApi={async () => null}
          onSelectCustomRequest={vi.fn()}
        />
      </SidebarProvider>
    )

    expect(screen.getByText("Payments API")).toBeTruthy()
    expect(screen.getByText("Payments")).toBeTruthy()
    const requestUrl = screen.getByText("https://api.example.com/payments")
    expect(requestUrl.dataset.slot).toBe("tooltip-trigger")
    expect(requestUrl.className).toContain("text-left")
    expect(requestUrl.closest("button")?.className).toContain("text-left")
    expect(
      requestUrl.closest("button")?.querySelector("span")?.className
    ).toContain("text-left")
    expect(requestUrl.parentElement?.parentElement?.className).toContain(
      "rounded-none"
    )
    expect(screen.queryByText("Create payment")).toBeNull()

    fireEvent.pointerMove(requestUrl, { pointerType: "mouse" })
    const urlTooltip = await screen.findByRole("tooltip")
    expect(urlTooltip.textContent).toContain(request.url)
    expect(urlTooltip.querySelector('[data-slot="tooltip-arrow"]')).toBeNull()

    const paymentsButton = screen.getByText("Payments").closest("button")!
    const refundsButton = screen.getByText("Refunds").closest("button")!
    expect(paymentsButton.className).toContain("rounded-none")
    expect(paymentsButton.querySelector("svg")?.className.baseVal).toContain(
      "rotate-90"
    )
    expect(refundsButton.querySelector("svg")?.className.baseVal).not.toContain(
      "rotate-90"
    )

    const deleteButton = screen.getByRole("button", {
      name: "Delete Payments API collection",
    })
    expect(deleteButton.className).toContain("absolute")
    expect(deleteButton.className).toContain("opacity-0")
    expect(
      deleteButton.parentElement?.querySelector('[data-slot="folder-count"]')
        ?.className
    ).toContain("group-hover/folder-row:opacity-0")

    fireEvent.click(deleteButton)
    expect(onDeleteCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: "payments-api" })
    )
  })
})
