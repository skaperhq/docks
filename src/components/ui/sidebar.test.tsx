// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { Sidebar, SidebarProvider, SidebarRail } from "./sidebar"

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true)
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function ResizableSidebar() {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  )
}

describe("SidebarRail", () => {
  test("resizes the sidebar and preserves the width across remounts", () => {
    const view = render(<ResizableSidebar />)
    const rail = screen.getByLabelText("Resize sidebar")
    const wrapper = rail.closest('[data-slot="sidebar-wrapper"]') as HTMLElement
    const initialWidth = Number.parseInt(
      wrapper.style.getPropertyValue("--sidebar-width"),
      10
    )

    fireEvent.pointerDown(rail, { button: 0, clientX: initialWidth })
    fireEvent.pointerMove(rail, { clientX: 360 })
    fireEvent.pointerUp(rail, { clientX: 360 })
    fireEvent.click(rail)

    expect(wrapper.style.getPropertyValue("--sidebar-width")).toBe("360px")
    expect(window.localStorage.getItem("docks:sidebar-width")).toBe("360")
    expect(
      rail.closest<HTMLElement>('[data-slot="sidebar"]')?.dataset.state
    ).toBe("expanded")

    view.unmount()
    render(<ResizableSidebar />)

    expect(
      screen
        .getByLabelText("Resize sidebar")
        .closest<HTMLElement>('[data-slot="sidebar-wrapper"]')
        ?.style.getPropertyValue("--sidebar-width")
    ).toBe("360px")
  })

  test("keeps click-to-collapse behavior when the rail is not dragged", () => {
    render(<ResizableSidebar />)
    const rail = screen.getByLabelText("Resize sidebar")

    fireEvent.click(rail)

    expect(
      rail.closest<HTMLElement>('[data-slot="sidebar"]')?.dataset.state
    ).toBe("collapsed")
  })
})
