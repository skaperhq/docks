// @vitest-environment jsdom

import * as React from "react"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ResponseBar } from "./response-bar"
import type { ResponseState } from "./types"

const editorSpies = vi.hoisted(() => ({ openSearch: vi.fn() }))

vi.mock("./body-editor", async () => {
  const ReactModule = await import("react")
  return {
    BodyEditor: ReactModule.forwardRef(
      ({ value }: { value: string }, ref: React.ForwardedRef<unknown>) => {
        ReactModule.useImperativeHandle(ref, () => ({
          openSearch: editorSpies.openSearch,
        }))
        return <pre data-testid="body-editor">{value}</pre>
      }
    ),
  }
})

const successResponse: ResponseState = {
  status: "success",
  result: {
    status: 200,
    statusText: "OK",
    ok: true,
    durationMs: 12,
    sizeBytes: 15,
    contentType: "application/json",
    bodyText: '{"ok":true}',
    headers: [],
    cookies: [],
    url: "https://api.example.com/items?q=docs",
  },
}

beforeEach(() => {
  editorSpies.openSearch.mockClear()
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(cleanup)

describe("ResponseBar", () => {
  test("hides Save for a saved response and exposes its request cURL", () => {
    renderResponse({ showSave: false, curlCommand: "curl https://example.com" })

    expect(screen.queryByLabelText("Save response")).toBeNull()
    expect(screen.getByRole("tab", { name: "Request" })).toBeTruthy()
  })

  test("opens editor search and confirms response copies with a toast", async () => {
    renderResponse()

    fireEvent.click(screen.getByRole("button", { name: "Search response" }))
    expect(editorSpies.openSearch).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole("button", { name: "Copy response" }))
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Response copied")
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '{\n  "ok": true\n}'
    )
  })

  test("shows WebSocket frames as messages instead of a response body", () => {
    renderResponse({
      transport: "websocket",
      response: {
        status: "success",
        result: {
          ...successResponse.result,
          status: 101,
          statusText: "Connected",
          websocketFrames: [
            {
              id: "frame-1",
              direction: "incoming",
              data: '{"type":"notification.connected"}',
              sizeBytes: 33,
              timestamp: Date.UTC(2026, 6, 16, 0, 29, 26, 418),
            },
          ],
        },
      },
    })

    expect(screen.getByRole("tab", { name: "Messages (1)" })).toBeTruthy()
    expect(screen.queryByRole("tab", { name: "Body" })).toBeNull()
    expect(screen.getByText('{"type":"notification.connected"}')).toBeTruthy()
    expect(screen.getByTestId("body-editor").textContent).toContain(
      '"type": "notification.connected"'
    )
  })
})

function renderResponse(
  props: Partial<React.ComponentProps<typeof ResponseBar>> = {}
) {
  return render(
    <ResponseBar
      response={successResponse}
      height={360}
      onHeightChange={vi.fn()}
      onHeightCommit={vi.fn()}
      onSaveResponse={vi.fn()}
      saveDefaultName="GET items"
      {...props}
    />
  )
}
