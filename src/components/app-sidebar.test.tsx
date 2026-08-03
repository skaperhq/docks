// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { AppSidebar } from "./app-sidebar"
import { SidebarProvider } from "./ui/sidebar"

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
})

afterEach(cleanup)

function SidebarUnderTest() {
  return (
    <SidebarProvider>
      <AppSidebar
        activePage="environment"
        selectedOperationId={null}
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

  test("renders imported collections with OpenAPI tag folders", () => {
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
          customRequests={[request]}
          onSelectOverview={vi.fn()}
          onSelectEnvironment={vi.fn()}
          onSelectOperation={vi.fn()}
          onSelectSavedResponse={vi.fn()}
          onDeleteSavedResponse={vi.fn()}
          onDeleteCustomRequest={vi.fn()}
          onCreateCustomRequest={async () => null}
          onImportOpenApi={async () => null}
          onSelectCustomRequest={vi.fn()}
        />
      </SidebarProvider>
    )

    expect(screen.getByText("Payments API")).toBeTruthy()
    expect(screen.getByText("Payments")).toBeTruthy()
    expect(screen.getByText("Create payment")).toBeTruthy()
  })
})
