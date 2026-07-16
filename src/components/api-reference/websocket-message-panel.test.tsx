// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { WebSocketMessagePanel } from "./websocket-message-panel"
import type { RequestBodyDraft } from "./types"

vi.mock("./body-editor", () => ({
  BodyEditor: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (value: string) => void
  }) => (
    <textarea
      aria-label="Message editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

const body: RequestBodyDraft = {
  mode: "raw",
  contentType: "text/plain",
  value: "hello socket",
}

afterEach(cleanup)

describe("WebSocketMessagePanel", () => {
  test("only sends a message while connected", () => {
    const onSend = vi.fn()
    const { rerender } = render(
      <WebSocketMessagePanel
        body={body}
        connectionStatus="disconnected"
        onBodyChange={vi.fn()}
        onSend={onSend}
      />
    )

    expect(
      (
        screen.getByRole("button", {
          name: "Send WebSocket message",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)

    rerender(
      <WebSocketMessagePanel
        body={body}
        connectionStatus="connected"
        onBodyChange={vi.fn()}
        onSend={onSend}
      />
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Send WebSocket message" })
    )

    expect(onSend).toHaveBeenCalledOnce()
  })

  test("stores composer text as a raw WebSocket message", () => {
    const onBodyChange = vi.fn()
    render(
      <WebSocketMessagePanel
        body={{ ...body, value: "" }}
        connectionStatus="connected"
        onBodyChange={onBodyChange}
        onSend={vi.fn()}
      />
    )

    fireEvent.change(screen.getByRole("textbox", { name: "Message editor" }), {
      target: { value: '{"ping":true}' },
    })

    expect(onBodyChange).toHaveBeenCalledWith({
      ...body,
      value: '{"ping":true}',
    })
  })
})
