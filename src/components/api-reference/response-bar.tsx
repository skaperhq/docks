import {
  BracesIcon,
  CopyIcon,
  LinkIcon,
  LockIcon,
  SaveIcon,
  SearchIcon,
  WrapTextIcon,
} from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ResponseHeader, ResponseState } from "./types"
import { prettyPrintJson } from "./utils"

export function ResponseBar({
  response,
  height,
  onHeightChange,
  onHeightCommit,
  onSaveResponse,
  saveDisabled = false,
  isResponseSaved = false,
}: {
  response: ResponseState
  height: number
  onHeightChange: (height: number) => void
  onHeightCommit: (height: number) => void
  onSaveResponse: () => void
  saveDisabled?: boolean
  isResponseSaved?: boolean
}) {
  const result = response.status === "success" ? response.result : undefined
  const isLoading = response.status === "loading"
  const error = response.status === "error" ? response.error : undefined
  const bodyText = result
    ? formatResponseBody(result.bodyText, result.contentType)
    : error
      ? JSON.stringify({ error }, null, 2)
      : ""

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
      className="relative shrink-0 gap-0 border-t border-border bg-background text-foreground"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize response panel"
        onPointerDown={handleResizePointerDown}
        className="absolute inset-x-0 top-0 z-10 h-2 -translate-y-1 cursor-row-resize touch-none"
      />
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-2">
        <div className="flex h-full items-center gap-7">
          <TabsList variant="default">
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
          </TabsList>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Button
            type="button"
            variant="secondary"
            className="h-8 gap-2 rounded-md px-3"
            onClick={onSaveResponse}
            disabled={!result || saveDisabled || isResponseSaved}
            aria-label={
              isResponseSaved ? "Response already saved" : "Save response"
            }
            title={
              isResponseSaved ? "This response is already saved" : undefined
            }
          >
            {isResponseSaved ? (
              <LockIcon className="size-4" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            {isResponseSaved ? "Saved" : "Save"}
          </Button>
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
          <ResponseBodyToolbar contentType={result?.contentType} />
          <ResponseCodeView
            text={
              bodyText ||
              (isLoading
                ? '{\n  "status": "sending"\n}'
                : '{\n  "status": "idle"\n}')
            }
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
      </div>
    </Tabs>
  )
}

function ResponseBodyToolbar({ contentType }: { contentType?: string }) {
  return (
    <div className="flex h-11 items-center justify-between px-7 text-muted-foreground">
      <div className="flex items-center gap-5">
        <Button variant="secondary" className="h-8 gap-2 rounded-md px-3">
          <BracesIcon className="size-4" />
          {contentType?.includes("json") ? "JSON" : "Text"}
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-6">
          <WrapTextIcon className="size-4" />
          <span className="sr-only">Toggle line wrap</span>
        </Button>
        <Button variant="ghost" size="icon" className="size-6">
          <SearchIcon className="size-4" />
          <span className="sr-only">Search response</span>
        </Button>
        <Button variant="ghost" size="icon" className="size-6">
          <CopyIcon className="size-4" />
          <span className="sr-only">Copy response</span>
        </Button>
      </div>
    </div>
  )
}

function ResponseCodeView({ text }: { text: string }) {
  const lines = text.split("\n")

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] px-7 text-sm leading-7">
        {lines.map((line, index) => (
          <Line key={`${index}-${line}`} line={line} number={index + 1} />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function Line({ line, number }: { line: string; number: number }) {
  return (
    <>
      <div className="pr-7 text-right text-blue-700 select-none dark:text-sky-400">
        {number}
      </div>
      <pre className="min-w-0 whitespace-pre text-foreground">
        <code>{line}</code>
      </pre>
    </>
  )
}

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
