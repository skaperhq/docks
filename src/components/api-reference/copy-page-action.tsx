"use client"

import * as React from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileTextIcon,
} from "lucide-react"
import { BodyEditor } from "./body-editor"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type CopyStatus = "idle" | "copied" | "error"

export function CopyPageAction({
  markdown,
  title,
}: {
  markdown: string
  title: string
}) {
  const [viewerOpen, setViewerOpen] = React.useState(false)
  const [copyStatus, setCopyStatus] = React.useState<CopyStatus>("idle")
  const resetTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    }
  }, [])

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyStatus("copied")
    } catch {
      setCopyStatus("error")
    }

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => setCopyStatus("idle"), 2000)
  }

  const statusMessage =
    copyStatus === "copied"
      ? "Markdown copied to clipboard."
      : copyStatus === "error"
        ? "Could not copy Markdown."
        : ""

  return (
    <>
      <div
        className="inline-flex items-center"
        role="group"
        aria-label="Page Markdown actions"
      >
        <Button
          type="button"
          variant="outline"
          className="rounded-none border-r-0 font-mono uppercase"
          onClick={copyMarkdown}
        >
          {copyStatus === "copied" ? (
            <CheckIcon data-icon="inline-start" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          {copyStatus === "copied" ? "Copied" : "Copy page"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="-ml-px rounded-none"
              aria-label="More page Markdown actions"
            >
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48 rounded-none">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setViewerOpen(true)}>
                <FileTextIcon />
                View as Markdown
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </span>

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title} Markdown</DialogTitle>
            <DialogDescription>
              This is the complete Markdown representation of the current page.
            </DialogDescription>
          </DialogHeader>
          <div className="h-[min(65vh,42rem)] overflow-hidden rounded-none border">
            <BodyEditor
              value={markdown}
              contentType="text/markdown"
              readOnly
              lineWrapping
              className="h-full"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={copyMarkdown}
              className="rounded-none font-mono uppercase"
            >
              {copyStatus === "copied" ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copyStatus === "copied" ? "Copied" : "Copy Markdown"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
