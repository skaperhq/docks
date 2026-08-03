"use client"

import * as React from "react"
import {
  ArrowLeftRightIcon,
  ContainerIcon,
  HomeIcon,
  PlugIcon,
  RadioTowerIcon,
  SearchIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ApiOperation } from "@/lib/openapi"
import { apiOperations } from "@/lib/openapi"
import type { PersistedCustomRequest } from "@/lib/api-reference-actions"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { getBgMethodClassName, getMethodClassName } from "./api-reference/utils"

export function RequestSearchCommand({
  customRequests,
  onSelectOverview,
  onSelectEnvironment,
  onSelectOperation,
  onSelectCustomRequest,
}: {
  customRequests: PersistedCustomRequest[]
  onSelectOverview: () => void
  onSelectEnvironment: () => void
  onSelectOperation: (operation: ApiOperation) => void
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [shortcutLabel, setShortcutLabel] = React.useState("Ctrl K")

  React.useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
    setShortcutLabel(isMac ? "⌘ K" : "Ctrl K")
  }, [])

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return
      }

      event.preventDefault()
      setOpen((current) => !current)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const httpOperations = apiOperations.filter(
    (operation) => operation.requestMode !== "sse" && operation.method !== "WS"
  )
  const sseOperations = apiOperations.filter(
    (operation) => operation.requestMode === "sse"
  )
  const websocketOperations = apiOperations.filter(
    (operation) => operation.method === "WS"
  )

  function select(action: () => void) {
    action()
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start rounded-none"
        onClick={() => setOpen(true)}
        aria-label="Search API pages and requests"
      >
        <SearchIcon data-icon="inline-start" />
        <span className="min-w-0 flex-1 truncate text-left font-normal">
          Search requests
        </span>
        <kbd className="shrink-0 text-[10px] text-muted-foreground">
          {shortcutLabel}
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search API documentation"
        description="Search pages, OpenAPI operations, and custom requests."
        className="max-w-xl rounded-none!"
      >
        <CommandInput
          placeholder="Search pages and requests…"
          className="rouned-none"
        />
        <CommandList className="max-h-[min(60vh,32rem)]">
          <CommandEmpty>No matching pages or requests.</CommandEmpty>
          <CommandGroup heading="Pages">
            <CommandItem
              value="page overview api documentation home"
              onSelect={() => select(onSelectOverview)}
              className="rounded-none font-mono uppercase"
            >
              <HomeIcon />
              Overview
            </CommandItem>
            <CommandItem
              value="page environment servers variables"
              onSelect={() => select(onSelectEnvironment)}
              className="rounded-none font-mono uppercase"
            >
              <ContainerIcon />
              Environment
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <OperationCommandGroup
            heading="HTTP requests"
            icon={ArrowLeftRightIcon}
            operations={httpOperations}
            onSelect={(operation) => select(() => onSelectOperation(operation))}
          />
          <OperationCommandGroup
            heading="Server-sent events"
            icon={RadioTowerIcon}
            operations={sseOperations}
            onSelect={(operation) => select(() => onSelectOperation(operation))}
          />
          <OperationCommandGroup
            heading="WebSocket requests"
            icon={PlugIcon}
            operations={websocketOperations}
            onSelect={(operation) => select(() => onSelectOperation(operation))}
          />
          {customRequests.length > 0 ? (
            <CommandGroup heading="Custom requests">
              {customRequests.map((request) => (
                <CommandItem
                  key={request.id}
                  value={`custom ${request.id} ${request.name} ${request.url} ${request.method} ${request.transport} ${request.mode}`}
                  onSelect={() => select(() => onSelectCustomRequest(request))}
                >
                  <div
                    className={cn("px-2 font-mono text-xs", [
                      getMethodClassName(request.method),
                      getBgMethodClassName(request.method),
                    ])}
                  >
                    {request.transport === "websocket"
                      ? "WS"
                      : request.mode === "sse"
                        ? "SSE"
                        : request.method}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {request.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        {request.url}
                      </span>
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  )
}

function OperationCommandGroup({
  heading,
  icon,
  operations,
  onSelect,
}: {
  heading: string
  icon: LucideIcon
  operations: ApiOperation[]
  onSelect: (operation: ApiOperation) => void
}) {
  if (operations.length === 0) return null

  const Icon = icon

  return (
    <CommandGroup heading={heading}>
      {operations.map((operation) => (
        <CommandItem
          key={operation.id}
          value={`${operation.id} ${operation.searchText}`}
          onSelect={() => onSelect(operation)}
        >
          <Icon className="size-4" strokeWidth={1} />
          <div
            className={cn("px-2 font-mono text-xs", [
              getMethodClassName(operation.method),
              getBgMethodClassName(operation.method),
            ])}
          >
            {operation.method}
          </div>
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {operation.summary}{" "}
              <span className="text-xs text-muted-foreground">
                {operation.path}
              </span>
            </span>
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
