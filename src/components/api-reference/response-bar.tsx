import {
  BracesIcon,
  CopyIcon,
  SaveIcon,
  SearchIcon,
  WrapTextIcon,
} from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BodyEditor } from "./body-editor"
import type { BodyEditorHandle } from "./body-editor"
import type { ResponseHeader, ResponseState } from "./types"
import { prettyPrintJson } from "./utils"

export function ResponseBar({
  response,
  height,
  onHeightChange,
  onHeightCommit,
  onSaveResponse,
  saveDefaultName,
  saveDisabled = false,
  showSave = true,
  curlCommand = "",
}: {
  response: ResponseState
  height: number
  onHeightChange: (height: number) => void
  onHeightCommit: (height: number) => void
  onSaveResponse: (name: string) => void
  saveDefaultName: string
  saveDisabled?: boolean
  showSave?: boolean
  curlCommand?: string
}) {
  const result = response.status === "success" ? response.result : undefined
  const isLoading = response.status === "loading"
  const error = response.status === "error" ? response.error : undefined
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState(saveDefaultName)
  const [lineWrapping, setLineWrapping] = React.useState(false)
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
      defaultValue="Body"
      style={{ height }}
      className="relative shrink-0 gap-0 overflow-hidden rounded-t-lg border border-b-0 border-border bg-background text-foreground shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
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
          <TabsList variant="default" className="shrink-0 rounded-md">
            <TabsTrigger value="Body" className="">
              Body
            </TabsTrigger>
            <TabsTrigger value="Cookies">Cookies</TabsTrigger>
            <TabsTrigger value="Headers">
              Headers{" "}
              {result ? (
                <span className="text-emerald-500">
                  ({result.headers.length})
                </span>
              ) : null}
            </TabsTrigger>
            {curlCommand ? (
              <TabsTrigger value="Request">Request</TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
          {showSave ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0 gap-2 rounded-md bg-background px-3"
              onClick={() => setSaveDialogOpen(true)}
              disabled={!result || saveDisabled}
              aria-label="Save response"
            >
              <SaveIcon className="size-4" />
              Save
            </Button>
          ) : null}
          {isLoading ? (
            <span className="rounded-md bg-blue-500/10 px-3 py-1 font-normal text-blue-500">
              Sending...
            </span>
          ) : result ? (
            <>
              <span
                className={
                  result.ok
                    ? "rounded-md bg-emerald-500/10 px-3 py-1 font-normal text-emerald-600 dark:text-emerald-400"
                    : "rounded-md bg-rose-500/10 px-3 py-1 font-normal text-rose-600 dark:text-rose-400"
                }
              >
                {result.status}{" "}
                {result.statusText || statusLabel(result.status)}
              </span>
              <span>•</span>
              <span>{result.durationMs} ms</span>
              <span>•</span>
              <span>{formatBytes(result.sizeBytes)}</span>
            </>
          ) : error ? (
            <span className="rounded-md bg-rose-500/10 px-3 py-1 font-medium text-rose-500">
              Request failed
            </span>
          ) : (
            <span className="text-muted-foreground">No response yet</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
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
        {curlCommand ? (
          <TabsContent value="Request" className="m-0 flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between px-7 text-sm text-muted-foreground">
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
          className="absolute right-4 bottom-4 z-50 rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
        >
          {toastMessage}
        </div>
      ) : null}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Response</DialogTitle>
            <DialogDescription>
              Name this response snapshot before saving it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmedName = saveName.trim()
              if (!trimmedName) {
                return
              }
              onSaveResponse(trimmedName)
              setSaveDialogOpen(false)
            }}
          >
            <Input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              autoFocus
              placeholder="Response name"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!saveName.trim() || saveDisabled}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
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
    <div className="flex h-11 items-center justify-between px-7 text-muted-foreground">
      <div className="flex items-center gap-5">
        <Button variant="secondary" className="h-8 gap-2 rounded-md px-3">
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
