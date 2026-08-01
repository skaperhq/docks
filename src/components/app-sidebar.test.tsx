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
        customRequests={[]}
        onSelectOverview={vi.fn()}
        onSelectEnvironment={vi.fn()}
        onSelectOperation={vi.fn()}
        onSelectSavedResponse={vi.fn()}
        onDeleteSavedResponse={vi.fn()}
        onDeleteCustomRequest={vi.fn()}
        onCreateCustomRequest={async () => null}
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
})
