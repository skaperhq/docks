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
import type { ResponseState, ServerSentEvent } from "./types"

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

const sseEvents: ServerSentEvent[] = [
  {
    sequence: 1,
    eventId: "2",
    eventName: "message",
    data: "payload two",
    receivedAt: Date.UTC(2026, 6, 16, 0, 29, 27, 418),
  },
  {
    sequence: 2,
    eventId: "1",
    eventName: "custom-one",
    data: "payload one",
    receivedAt: Date.UTC(2026, 6, 16, 0, 29, 26, 418),
  },
]

const sseResult = {
  ...successResponse.result,
  statusText: "Streaming",
  contentType: "text/event-stream",
  bodyText: "id: 2\ndata: payload two\n\n",
  sseEvents,
}

const sseResponse: ResponseState = {
  status: "success",
  result: sseResult,
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

  test("shows SSE events in a default EventStream tab", () => {
    renderResponse({ mode: "sse", response: sseResponse })

    expect(
      screen
        .getByRole("tab", { name: "EventStream" })
        .getAttribute("data-state")
    ).toBe("active")
    expect(screen.getByRole("columnheader", { name: /ID/ })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: /Type/ })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: /Data/ })).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: /Time/ })).toBeTruthy()
    expect(screen.getByText("payload one")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Body" })).toBeTruthy()
  })

  test("filters SSE events with case-insensitive regex and rejects invalid patterns", () => {
    renderResponse({ mode: "sse", response: sseResponse })
    const filter = screen.getByRole("textbox", {
      name: "Filter SSE events using regex",
    })

    fireEvent.change(filter, { target: { value: "CUSTOM-ONE" } })
    expect(screen.getByText("payload one")).toBeTruthy()
    expect(screen.queryByText("payload two")).toBeNull()

    fireEvent.change(filter, { target: { value: "payload two|^1$" } })
    expect(screen.getByText("payload one")).toBeTruthy()
    expect(screen.getByText("payload two")).toBeTruthy()

    fireEvent.change(filter, { target: { value: "invalid(" } })
    expect(filter.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("Invalid regular expression.")).toBeTruthy()
    expect(screen.queryByText("payload one")).toBeNull()
  })

  test("sorts SSE columns and toggles their direction", () => {
    renderResponse({ mode: "sse", response: sseResponse })

    const eventRows = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent)

    expect(eventRows()[0]).toContain("payload one")
    fireEvent.click(
      screen.getByRole("button", { name: "Sort SSE events by ID" })
    )
    expect(eventRows()[0]).toContain("payload one")
    fireEvent.click(
      screen.getByRole("button", { name: "Sort SSE events by ID" })
    )
    expect(eventRows()[0]).toContain("payload two")
  })

  test("clears captured SSE events and allows new events to arrive", () => {
    function Harness() {
      const [events, setEvents] = React.useState(sseEvents)

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setEvents([
                {
                  sequence: 3,
                  eventId: "3",
                  eventName: "message",
                  data: "payload three",
                  receivedAt: Date.UTC(2026, 6, 16, 0, 29, 28, 418),
                },
              ])
            }
          >
            Append SSE event
          </button>
          <ResponseBar
            response={{
              status: "success",
              result: { ...sseResult, sseEvents: events },
            }}
            mode="sse"
            height={360}
            onHeightChange={vi.fn()}
            onHeightCommit={vi.fn()}
            onSaveResponse={vi.fn()}
            onClearSseEvents={() => setEvents([])}
            saveDefaultName="GET events"
          />
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Clear SSE events" }))
    expect(screen.queryByText("payload one")).toBeNull()
    expect(screen.getByText("No server-sent events captured.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Append SSE event" }))
    expect(screen.getByText("payload three")).toBeTruthy()
  })

  test("keeps legacy SSE bodies available without inventing structured events", () => {
    renderResponse({
      mode: "sse",
      response: {
        status: "success",
        result: {
          ...successResponse.result,
          contentType: "text/event-stream",
          bodyText: "[event] legacy payload\n",
        },
      },
    })

    expect(
      screen.getByText(
        "Structured events were not captured for this saved response. Use Body to inspect the legacy stream."
      )
    ).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Body" })).toBeTruthy()
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
