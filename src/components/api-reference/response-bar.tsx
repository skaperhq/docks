import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  BracesIcon,
  CopyIcon,
  LoaderCircleIcon,
  SaveIcon,
  SearchIcon,
  Trash2Icon,
  WrapTextIcon,
} from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BodyEditor } from "./body-editor"
import type { BodyEditorHandle } from "./body-editor"
import type {
  ResponseHeader,
  ResponseState,
  ServerSentEvent,
  WebSocketFrame,
} from "./types"
import { prettyPrintJson } from "./utils"

export function ResponseBar({
  response,
  transport = "http",
  mode = "standard",
  height,
  onHeightChange,
  onHeightCommit,
  onSaveResponse,
  onClearSseEvents,
  saveDefaultName,
  saveDisabled = false,
  showSave = true,
  curlCommand = "",
}: {
  response: ResponseState
  transport?: "http" | "websocket"
  mode?: "standard" | "sse"
  height: number
  onHeightChange: (height: number) => void
  onHeightCommit: (height: number) => void
  onSaveResponse: (name: string) => Promise<void> | void
  onClearSseEvents?: () => void
  saveDefaultName: string
  saveDisabled?: boolean
  showSave?: boolean
  curlCommand?: string
}) {
  const isWebSocket = transport === "websocket"
  const isSse = transport === "http" && mode === "sse"
  const result = response.status === "success" ? response.result : undefined
  const isLoading = response.status === "loading"
  const error = response.status === "error" ? response.error : undefined
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState(saveDefaultName)
  const [lineWrapping, setLineWrapping] = React.useState(false)
  const [activeResponseTab, setActiveResponseTab] = React.useState(
    isWebSocket ? "Messages" : isSse ? "EventStream" : "Body"
  )
  const [toastMessage, setToastMessage] = React.useState("")
  const bodyEditorRef = React.useRef<BodyEditorHandle>(null)
  const toastTimerRef = React.useRef<number | null>(null)
  const bodyText = result
    ? formatResponseBody(result.bodyText, result.contentType)
    : error
      ? JSON.stringify({ error }, null, 2)
      : ""

  React.useEffect(() => {
    if (!saveDialogOpen) {
      setSaveName(saveDefaultName)
    }
  }, [saveDefaultName, saveDialogOpen])

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    setActiveResponseTab(
      isWebSocket ? "Messages" : isSse ? "EventStream" : "Body"
    )
  }, [isSse, isWebSocket])

  const showToast = React.useCallback((message: string) => {
    setToastMessage(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToastMessage(""), 2200)
  }, [])

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(successMessage)
    } catch {
      showToast("Could not copy to clipboard")
    }
  }

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()

    const startY = event.clientY
    const startHeight = height

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextHeight = clampHeight(startHeight + startY - moveEvent.clientY)
      onHeightChange(nextHeight)
    }

    function handlePointerUp(upEvent: PointerEvent) {
      const nextHeight = clampHeight(startHeight + startY - upEvent.clientY)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      onHeightCommit(nextHeight)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  return (
    <Tabs
      value={activeResponseTab}
      onValueChange={setActiveResponseTab}
      style={{ height }}
      className="relative shrink-0 gap-0 overflow-hidden border border-b-0 border-l-0 border-border bg-background text-foreground"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize response panel"
        onPointerDown={handleResizePointerDown}
        className="absolute inset-x-0 top-0 z-10 h-2 -translate-y-1 cursor-row-resize touch-none"
      />
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3">
        <div className="min-w-0 overflow-x-auto">
          <TabsList variant="default" className="shrink-0 rounded-none">
            {isWebSocket ? (
              <TabsTrigger value="Messages" className="rounded-none">
                Messages{" "}
                {result?.websocketFrames?.length ? (
                  <span>({result.websocketFrames.length})</span>
                ) : null}
              </TabsTrigger>
            ) : (
              <>
                {isSse ? (
                  <TabsTrigger value="EventStream" className="rounded-none">
                    EventStream
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="Body" className="rounded-none">
                  Body
                </TabsTrigger>
                <TabsTrigger value="Cookies" className="rounded-none">
                  Cookies
                </TabsTrigger>
                <TabsTrigger value="Headers" className="rounded-none">
                  Headers{" "}
                  {result ? <span>({result.headers.length})</span> : null}
                </TabsTrigger>
              </>
            )}
            {curlCommand ? (
              <TabsTrigger value="Request" className="rounded-none">
                Request
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
          {showSave ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0 gap-2 rounded-none bg-background px-3 font-mono uppercase"
              onClick={() => setSaveDialogOpen(true)}
              disabled={!result || saveDisabled}
              aria-label="Save response"
            >
              {saveDisabled ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <SaveIcon className="size-4" />
              )}
              {saveDisabled ? "Saving…" : "Save"}
            </Button>
          ) : null}
          {isLoading ? (
            <span className="rounded-md bg-muted px-3 py-1 font-normal text-muted-foreground">
              {isWebSocket || isSse ? "Connecting..." : "Sending..."}
            </span>
          ) : result ? (
            <>
              <span
                className={
                  result.ok || (isWebSocket && result.status === 101)
                    ? "rounded-none bg-emerald-500/10 px-3 py-1 font-mono font-normal text-emerald-600 uppercase dark:text-emerald-400"
                    : "rounded-none bg-rose-500/10 px-3 py-1 font-mono font-normal text-rose-600 uppercase dark:text-rose-400"
                }
              >
                {result.status}{" "}
                {result.statusText || statusLabel(result.status)}
              </span>
              <span>•</span>
              <span className="font-mono">{result.durationMs} ms</span>
              <span>•</span>
              <span className="font-mono">{formatBytes(result.sizeBytes)}</span>
            </>
          ) : error ? (
            <span className="rounded-none bg-rose-500/10 px-3 py-1 font-mono font-medium text-rose-500 uppercase">
              Request failed
            </span>
          ) : (
            <span className="text-muted-foreground">No response yet</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isWebSocket ? (
          <TabsContent value="Messages" className="m-0 h-full">
            <WebSocketMessagesView
              frames={result?.websocketFrames ?? []}
              isConnecting={isLoading}
            />
          </TabsContent>
        ) : (
          <>
            {isSse ? (
              <TabsContent value="EventStream" className="m-0 h-full">
                <SseEventsView
                  events={result?.sseEvents}
                  hasResponse={Boolean(result)}
                  isConnecting={isLoading}
                  onClear={onClearSseEvents}
                />
              </TabsContent>
            ) : null}
            <TabsContent value="Body" className="m-0 flex h-full flex-col">
              <ResponseBodyToolbar
                contentType={result?.contentType}
                bodyText={bodyText}
                lineWrapping={lineWrapping}
                onLineWrappingChange={setLineWrapping}
                onSearch={() => bodyEditorRef.current?.openSearch()}
                onCopy={() => copyText(bodyText, "Response copied")}
              />
              <ResponseCodeView
                text={
                  bodyText ||
                  (isLoading
                    ? '{\n  "status": "sending"\n}'
                    : '{\n  "status": "idle"\n}')
                }
                contentType={result?.contentType}
                lineWrapping={lineWrapping}
                ref={bodyEditorRef}
              />
            </TabsContent>
          </>
        )}
        {!isWebSocket ? (
          <>
            <TabsContent value="Cookies" className="m-0 h-full">
              <HeaderList
                emptyMessage="No cookies were exposed by this response."
                headers={result?.cookies ?? []}
              />
            </TabsContent>
            <TabsContent value="Headers" className="m-0 h-full">
              <HeaderList
                emptyMessage="Send a request to inspect response headers."
                headers={result?.headers ?? []}
              />
            </TabsContent>
          </>
        ) : null}
        {curlCommand ? (
          <TabsContent value="Request" className="m-0 flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between border-b px-7 text-sm text-muted-foreground">
              <span>cURL for the request that produced this response</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => copyText(curlCommand, "cURL copied")}
                aria-label="Copy request cURL"
              >
                <CopyIcon className="size-4" />
              </Button>
            </div>
            <BodyEditor
              value={curlCommand}
              contentType="text/x-shellscript"
              readOnly
            />
          </TabsContent>
        ) : null}
      </div>

      {toastMessage ? (
        <div
          role="status"
          className="absolute right-4 bottom-4 z-50 rounded-none border border-border bg-popover px-3 py-2 text-sm text-popover-foreground"
        >
          {toastMessage}
        </div>
      ) : null}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono uppercase">
              Save Response
            </DialogTitle>
            <DialogDescription>
              Name this response snapshot before saving it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault()
              const trimmedName = saveName.trim()
              if (!trimmedName || saveDisabled) {
                return
              }
              await onSaveResponse(trimmedName)
              setSaveDialogOpen(false)
            }}
          >
            <Input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              autoFocus
              placeholder="Response name"
              className="rounded-none"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none font-mono uppercase"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={!saveName.trim() || saveDisabled}
                className="rounded-none font-mono uppercase"
              >
                {saveDisabled ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : null}
                {saveDisabled ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}

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

function SseEventsView({
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

function createEventFilter(filter: string) {
  if (!filter) {
    return { regex: null, isValid: true }
  }

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
  if (sortKey === "receivedAt") {
    return left.receivedAt - right.receivedAt
  }

  return left[sortKey].localeCompare(right[sortKey])
}

function WebSocketMessagesView({
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
                          className="size-3.5 shrink-0 text-destructive"
                          aria-label="Received"
                        />
                      ) : (
                        <ArrowUpIcon
                          className="size-3.5 shrink-0 text-primary"
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

function ResponseBodyToolbar({
  contentType,
  bodyText,
  lineWrapping,
  onLineWrappingChange,
  onSearch,
  onCopy,
}: {
  contentType?: string
  bodyText: string
  lineWrapping: boolean
  onLineWrappingChange: (lineWrapping: boolean) => void
  onSearch: () => void
  onCopy: () => void
}) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-border px-3 text-muted-foreground">
      <div className="flex items-center gap-5">
        <Button
          variant="secondary"
          className="h-8 gap-2 rounded-none px-3 font-mono uppercase"
        >
          <BracesIcon className="size-4" />
          {contentType?.includes("json") ? "JSON" : "Text"}
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => onLineWrappingChange(!lineWrapping)}
          aria-pressed={lineWrapping}
        >
          <WrapTextIcon className="size-4" />
          <span className="sr-only">Toggle line wrap</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onSearch}
        >
          <SearchIcon className="size-4" />
          <span className="sr-only">Search response</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onCopy}
          disabled={!bodyText}
        >
          <CopyIcon className="size-4" />
          <span className="sr-only">Copy response</span>
        </Button>
      </div>
    </div>
  )
}

const ResponseCodeView = React.forwardRef<
  BodyEditorHandle,
  {
    text: string
    contentType?: string
    lineWrapping: boolean
  }
>(function ResponseCodeView({ text, contentType, lineWrapping }, ref) {
  return (
    <BodyEditor
      ref={ref}
      value={text}
      contentType={contentType}
      readOnly
      lineWrapping={lineWrapping}
    />
  )
})

function HeaderList({
  headers,
  emptyMessage,
}: {
  headers: ResponseHeader[]
  emptyMessage: string
}) {
  if (headers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-[18rem_minmax(0,1fr)] border-b border-border text-sm">
        {headers.map((header) => (
          <div key={`${header.key}-${header.value}`} className="contents">
            <div className="border-r border-border px-7 py-3 text-muted-foreground">
              {header.key}
            </div>
            <div className="px-7 py-3 text-foreground">{header.value}</div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

function formatResponseBody(bodyText: string, contentType: string) {
  if (!bodyText.trim()) {
    return ""
  }

  if (contentType.includes("json")) {
    return prettyPrintJson(bodyText)
  }

  return bodyText
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kilobytes = bytes / 1024
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`
}

function statusLabel(status: number) {
  if (status >= 200 && status < 300) return "OK"
  if (status >= 300 && status < 400) return "Redirect"
  if (status === 404) return "Not Found"
  if (status >= 400 && status < 500) return "Client Error"
  if (status >= 500) return "Server Error"
  return "Response"
}

function clampHeight(height: number) {
  const maxHeight =
    typeof window === "undefined" ? 720 : Math.round(window.innerHeight * 0.75)
  return Math.min(Math.max(height, 220), Math.max(maxHeight, 220))
}
