// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { RequestTabStrip } from "./request-tab-strip"

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Toggle sidebar</button>,
}))

afterEach(cleanup)

describe("RequestTabStrip", () => {
  test("uses horizontal overflow and closes the requested tab", () => {
    const onCloseOperation = vi.fn()
    render(
      <RequestTabStrip
        activeOperationId="one"
        operations={[
          { id: "one", method: "GET", displayPath: "/one" },
          { id: "two", method: "POST", displayPath: "/two" },
        ]}
        onSelectOperation={vi.fn()}
        onCloseOperation={onCloseOperation}
      />
    )

    const tabList = screen.getByLabelText("Open request tabs")
    expect(tabList.className).toContain("overflow-x-auto")
    expect(
      screen.getByLabelText("Open /one tab").parentElement?.className
    ).toContain("shrink-0")

    fireEvent.click(screen.getByLabelText("Close /one tab"))
    expect(onCloseOperation).toHaveBeenCalledWith("one")
  })
})
