import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  Trash2Icon,
} from "lucide-react"
import * as React from "react"
import { BodyEditor } from "./body-editor"
import type { ServerSentEvent, WebSocketFrame } from "./types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type SseSortKey = "eventId" | "eventName" | "data" | "receivedAt"
type SortDirection = "ascending" | "descending"

const sseColumns: {
  key: SseSortKey
  label: string
  className: string
}[] = [
  { key: "eventId", label: "ID", className: "w-40" },
  { key: "eventName", label: "Type", className: "w-40" },
  { key: "data", label: "Data", className: "min-w-96" },
  { key: "receivedAt", label: "Time", className: "w-40" },
]

export function SseEventsView({
  events,
  hasResponse,
  isConnecting,
  onClear,
}: {
  events?: ServerSentEvent[]
  hasResponse: boolean
  isConnecting: boolean
  onClear?: () => void
}) {
  const [filter, setFilter] = React.useState("")
  const [sortKey, setSortKey] = React.useState<SseSortKey>("receivedAt")
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>("ascending")
  const { regex, isValid } = createEventFilter(filter)
  const capturedEvents = events ?? []
  const filteredEvents = regex
    ? capturedEvents.filter(
        (event) =>
          regex.test(event.eventId) ||
          regex.test(event.eventName) ||
          regex.test(event.data)
      )
    : isValid
      ? capturedEvents
      : []
  const sortedEvents = [...filteredEvents].sort((left, right) => {
    const comparison = compareSseEvents(left, right, sortKey)
    if (comparison !== 0) {
      return sortDirection === "ascending" ? comparison : -comparison
    }
    return left.sequence - right.sequence
  })

  function changeSort(nextSortKey: SseSortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((direction) =>
        direction === "ascending" ? "descending" : "ascending"
      )
      return
    }

    setSortKey(nextSortKey)
    setSortDirection("ascending")
  }

  const emptyMessage = !isValid
    ? "Invalid regular expression."
    : filter
      ? "No events match this filter."
      : events === undefined && hasResponse
        ? "Structured events were not captured for this saved response. Use Body to inspect the legacy stream."
        : isConnecting
          ? "Waiting for server-sent events…"
          : "No server-sent events captured."

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          disabled={!onClear || capturedEvents.length === 0}
          aria-label="Clear SSE events"
        >
          <Trash2Icon />
        </Button>
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter using regex (example: https?)"
          aria-label="Filter SSE events using regex"
          aria-invalid={!isValid}
          className="h-7 max-w-sm rounded-none"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <Table className="min-w-4xl table-fixed font-mono text-xs">
          <TableHeader className="bg-muted/35">
            <TableRow className="hover:bg-transparent">
              {sseColumns.map((column) => {
                const isActive = sortKey === column.key

                return (
                  <TableHead
                    key={column.key}
                    className={column.className}
                    aria-sort={isActive ? sortDirection : "none"}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => changeSort(column.key)}
                      aria-label={`Sort SSE events by ${column.label}`}
                    >
                      {column.label}
                      <ArrowUpDownIcon data-icon="inline-end" />
                    </Button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEvents.length > 0 ? (
              sortedEvents.map((event) => (
                <TableRow key={event.sequence}>
                  <TableCell className="text-muted-foreground">
                    <span className="block truncate" title={event.eventId}>
                      {event.eventId || "—"}
                    </span>
                  </TableCell>
                  <TableCell>{event.eventName}</TableCell>
                  <TableCell>
                    <span className="block truncate" title={event.data}>
                      {event.data}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatFrameTime(event.receivedAt)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={sseColumns.length}
                  className="h-24 text-center font-sans text-sm whitespace-normal text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}

export function WebSocketMessagesView({
  frames,
  isConnecting,
}: {
  frames: WebSocketFrame[]
  isConnecting: boolean
}) {
  const [filter, setFilter] = React.useState("")
  const [selectedFrameId, setSelectedFrameId] = React.useState<string | null>(
    null
  )
  const normalizedFilter = filter.trim().toLowerCase()
  const filteredFrames = normalizedFilter
    ? frames.filter((frame) =>
        frame.data.toLowerCase().includes(normalizedFilter)
      )
    : frames
  const selectedFrame =
    frames.find((frame) => frame.id === selectedFrameId) ?? frames.at(0)

  React.useEffect(() => {
    if (!selectedFrameId && frames[0]) {
      setSelectedFrameId(frames[0].id)
    }
  }, [frames, selectedFrameId])

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(9rem,45%)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col border-b border-border">
        <div className="flex h-10 shrink-0 items-center border-b border-border bg-card px-3">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter messages"
            aria-label="Filter WebSocket messages"
            className="h-7 max-w-sm border-0 bg-muted/60 shadow-none focus-visible:ring-1"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem_8rem] border-b border-border bg-muted/35 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <span>Data</span>
          <span className="text-right">Length</span>
          <span className="text-right">Time</span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {filteredFrames.length > 0 ? (
            <div className="flex flex-col">
              {filteredFrames.map((frame) => {
                const isSelected = frame.id === selectedFrame?.id

                return (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => setSelectedFrameId(frame.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_6rem_8rem] items-center border-b border-border px-3 py-1.5 text-left font-mono text-xs hover:bg-muted/50",
                      isSelected && "bg-muted"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {frame.direction === "incoming" ? (
                        <ArrowDownIcon
                          className="shrink-0 text-destructive"
                          aria-label="Received"
                        />
                      ) : (
                        <ArrowUpIcon
                          className="shrink-0 text-primary"
                          aria-label="Sent"
                        />
                      )}
                      <span className="truncate">{frame.data}</span>
                    </span>
                    <span className="text-right font-mono tabular-nums">
                      {frame.sizeBytes}
                    </span>
                    <span className="text-right font-mono text-muted-foreground tabular-nums">
                      {formatFrameTime(frame.timestamp)}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-20 items-center justify-center px-4 text-sm text-muted-foreground">
              {normalizedFilter
                ? "No messages match this filter."
                : isConnecting
                  ? "Connecting to the WebSocket…"
                  : "No WebSocket messages yet."}
            </div>
          )}
        </ScrollArea>
      </div>
      <div className="min-h-0">
        {selectedFrame ? (
          <BodyEditor
            value={formatWebSocketFrameData(selectedFrame.data)}
            contentType={
              isJsonText(selectedFrame.data) ? "application/json" : "text/plain"
            }
            readOnly
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a message to inspect its payload.
          </div>
        )}
      </div>
    </div>
  )
}

function createEventFilter(filter: string) {
  if (!filter) return { regex: null, isValid: true }

  try {
    return { regex: new RegExp(filter, "i"), isValid: true }
  } catch {
    return { regex: null, isValid: false }
  }
}

function compareSseEvents(
  left: ServerSentEvent,
  right: ServerSentEvent,
  sortKey: SseSortKey
) {
  if (sortKey === "receivedAt") return left.receivedAt - right.receivedAt
  return left[sortKey].localeCompare(right[sortKey])
}

function formatFrameTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })}.${String(date.getMilliseconds()).padStart(3, "0")}`
}

function isJsonText(value: string) {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function formatWebSocketFrameData(value: string) {
  return isJsonText(value) ? JSON.stringify(JSON.parse(value), null, 2) : value
}
