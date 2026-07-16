import { SendIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BodyEditor } from "./body-editor"
import type { RequestBodyDraft, WebSocketConnectionStatus } from "./types"

export function WebSocketMessagePanel({
  body,
  connectionStatus,
  onBodyChange,
  onSend,
}: {
  body: RequestBodyDraft
  connectionStatus: WebSocketConnectionStatus
  onBodyChange: (body: RequestBodyDraft) => void
  onSend: () => void
}) {
  const message = body.value
  const canSend = connectionStatus === "connected" && message.length > 0

  return (
    <section className="flex min-h-[calc(100svh-17rem)] flex-col overflow-hidden rounded-sm border border-border bg-background">
      <div className="relative flex min-h-64 flex-1">
        {!message ? (
          <span className="pointer-events-none absolute top-3 left-14 z-10 font-mono text-sm text-muted-foreground/70">
            Compose message
          </span>
        ) : null}
        <BodyEditor
          value={message}
          contentType={body.contentType}
          onChange={(value) =>
            onBodyChange({
              ...body,
              mode: "raw",
              contentType: body.contentType || "text/plain",
              value,
            })
          }
        />
      </div>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-3">
        <span className="text-xs text-muted-foreground">
          {connectionStatus === "connected"
            ? "Ready to send over the open WebSocket"
            : "Connect the WebSocket to send messages"}
        </span>
        <Button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send WebSocket message"
        >
          <SendIcon data-icon="inline-start" />
          Send
        </Button>
      </div>
    </section>
  )
}
