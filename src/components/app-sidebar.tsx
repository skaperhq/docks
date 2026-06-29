"use client"

import type { ApiOperation } from "@/lib/openapi"
import { Link } from "@tanstack/react-router"
import { useEnvironment } from "@/components/environment-provider"
import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  Container,
  FileSearchIcon,
  FolderClosedIcon,
  Trash2Icon,
} from "lucide-react"
import * as React from "react"

import Logo from "@/assets/logo.svg"
import type { SavedResponseSummary } from "@/components/api-reference/types"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { apiOperations, getOperationGroups } from "@/lib/openapi"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  selectedOperationId: string
  searchQuery: string
  requestOnly: boolean
  savedResponses: SavedResponseSummary[]
  selectedSavedResponseId?: string | null
  onSearchQueryChange: (query: string) => void
  onRequestOnlyChange: (requestOnly: boolean) => void
  onSelectOperation: (operation: ApiOperation) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
}

export function AppSidebar({
  selectedOperationId,
  searchQuery,
  requestOnly,
  savedResponses,
  selectedSavedResponseId,
  onSearchQueryChange,
  onRequestOnlyChange,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
  ...props
}: AppSidebarProps) {
  const { environments, activeEnvironmentId, setActiveEnvironmentId } =
    useEnvironment()
  const groups = React.useMemo(
    () => getOperationGroups({ query: searchQuery, requestOnly }),
    [searchQuery, requestOnly]
  )
  const endpointCount = apiOperations.length
  const savedResponsesByOperation = React.useMemo(() => {
    const map = new Map<string, SavedResponseSummary>()
    for (const response of savedResponses) {
      if (!map.has(response.operationId)) {
        map.set(response.operationId, response)
      }
    }
    return map
  }, [savedResponses])

  return (
    <Sidebar {...props}>
      <SidebarContent>
        <div className="flex items-end gap-2 px-2.5 pt-3">
          <div className="rounded-sm bg-primary p-1">
            <img src={Logo} className="size-5" alt="" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-normal text-sidebar-foreground">
              Skaper
            </div>
          </div>
        </div>

        <SidebarGroup className="mt-2 px-2 py-0">
          <SidebarGroupContent className="flex flex-col gap-1">
            <Select
              value={activeEnvironmentId || ""}
              onValueChange={setActiveEnvironmentId}
            >
              <SelectTrigger
                className="h-8 w-full text-[13px]"
                aria-label="Select active environment"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Environments</SelectLabel>
                  {environments.map((env) => (
                    <SelectItem key={env.id} value={env.id}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-1 px-2 py-1">
          <SidebarGroupContent className="flex flex-col gap-2">
            <label className="relative block">
              <SidebarInput
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                className="h-8 rounded-md border-sidebar-border bg-sidebar-accent text-sidebar-foreground placeholder:text-muted-foreground"
                placeholder="Search requests"
                aria-label="Search API requests"
              />
            </label>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="p-0.5 px-2 pt-1">
          <Link
            to="/environment"
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&.active]:bg-sidebar-accent [&.active]:font-medium [&.active]:text-sidebar-accent-foreground"
          >
            <Container className="w-4 text-sidebar-foreground/60" />
            <span className="truncate text-[13px] font-normal">
              Environment
            </span>
          </Link>
        </SidebarGroup>

        <SidebarGroup className="p-0.5 px-2 pt-0">
          <Collapsible
            defaultOpen
            className="group/api [&[data-state=open]>button>svg:first-child]:rotate-90"
          >
            <CollapsibleTrigger asChild>
              <button
                data-testid="api-root-toggle"
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRightIcon className="w-4 transition-transform" />
                <ArrowLeftRightIcon className="w-4 text-sidebar-foreground/60" />
                <span className="truncate text-[13px] font-normal">Rest</span>
                <span className="ml-auto text-[10px] text-sidebar-foreground/60 tabular-nums">
                  {endpointCount}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-5 border-l border-sidebar-border/80 pl-2">
                <SidebarMenu className="gap-0.5 pt-1">
                  {groups.length > 0 ? (
                    groups.map((group) => (
                      <SidebarMenuItem key={group.name}>
                        <Collapsible
                          className="group/folder [&[data-state=open]>button>svg:first-child]:rotate-90"
                          defaultOpen={group.operations.some(
                            (operation) => operation.id === selectedOperationId
                          )}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              data-api-group={group.name}
                              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[15px] font-medium text-sidebar-foreground/90 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ChevronRightIcon className="w-4 transition-transform" />
                              <FolderClosedIcon className="w-4 text-sidebar-foreground/60" />
                              <span className="truncate text-[13px] font-normal">
                                {group.name}
                              </span>
                              <span className="ml-auto text-[11px] text-sidebar-foreground/60 tabular-nums">
                                {group.operations.length}
                              </span>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-5 flex flex-col border-l border-sidebar-border/80 py-1 pl-2">
                              {group.operations.map((operation) => (
                                <OperationItem
                                  key={operation.id}
                                  operation={operation}
                                  isActive={
                                    operation.id === selectedOperationId
                                  }
                                  savedResponse={savedResponsesByOperation.get(
                                    operation.id
                                  )}
                                  selectedSavedResponseId={
                                    selectedSavedResponseId
                                  }
                                  onSelectOperation={onSelectOperation}
                                  onSelectSavedResponse={onSelectSavedResponse}
                                  onDeleteSavedResponse={onDeleteSavedResponse}
                                />
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuItem>
                    ))
                  ) : (
                    <SidebarMenuItem>
                      <div className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/60">
                        <FileSearchIcon />
                        <span>No matching requests</span>
                      </div>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function OperationItem({
  operation,
  isActive,
  savedResponse,
  selectedSavedResponseId,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
}: {
  operation: ApiOperation
  isActive: boolean
  savedResponse?: SavedResponseSummary
  selectedSavedResponseId?: string | null
  onSelectOperation: (operation: ApiOperation) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
}) {
  const savedResponseIsActive =
    savedResponse?.id !== undefined &&
    savedResponse.id === selectedSavedResponseId
  const [savedResponseOpen, setSavedResponseOpen] = React.useState(
    Boolean(savedResponse && (isActive || savedResponseIsActive))
  )

  React.useEffect(() => {
    if (savedResponse && (isActive || savedResponseIsActive)) {
      setSavedResponseOpen(true)
    }
  }, [isActive, savedResponse, savedResponseIsActive])

  if (!savedResponse) {
    return (
      <button
        type="button"
        data-operation-id={operation.id}
        onClick={() => onSelectOperation(operation)}
        className={cn(
          "flex min-h-8 w-full items-center gap-0.5 rounded-none py-1 pr-2 pl-2 text-left transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <span
          className={cn(
            "w-10 shrink-0 text-[10px] font-semibold tabular-nums",
            getMethodClassName(operation.method)
          )}
        >
          {operation.method}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-sidebar-foreground">
          {operation.displayPath}
        </span>
      </button>
    )
  }

  return (
    <Collapsible
      open={savedResponseOpen}
      onOpenChange={setSavedResponseOpen}
      className="group/operation"
    >
      <div
        className={cn(
          "flex min-h-8 w-full items-center rounded-none py-1 pr-2 pl-0 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive &&
            !savedResponseIsActive &&
            "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`${savedResponseOpen ? "Collapse" : "Expand"} saved response for ${operation.displayPath}`}
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]/operation:rotate-90" />
          </button>
        </CollapsibleTrigger>
        <button
          type="button"
          data-operation-id={operation.id}
          onClick={() => onSelectOperation(operation)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <span
            className={cn(
              "w-10 shrink-0 text-[10px] font-semibold tabular-nums",
              getMethodClassName(operation.method)
            )}
          >
            {operation.method}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-sidebar-foreground">
            {operation.displayPath}
          </span>
        </button>
      </div>

      <CollapsibleContent>
        <div
          className={cn(
            "group/response ml-6 flex min-h-8 items-center gap-1 rounded-md border-l border-sidebar-border/80 py-1 pr-1 pl-5 transition-colors",
            savedResponseIsActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <button
            type="button"
            onClick={() => onSelectSavedResponse(savedResponse)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="inline-flex h-4 shrink-0 items-center rounded-[2px] border border-sidebar-foreground/50 px-0.5 text-[10px] leading-none font-semibold text-sidebar-foreground/70">
              e.g.
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {savedResponse.name || operation.displayPath}
            </span>
          </button>
          <button
            type="button"
            aria-label={`Delete saved response for ${operation.displayPath}`}
            onClick={() => onDeleteSavedResponse(savedResponse)}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-sidebar-foreground/50 opacity-0 outline-none group-hover/response:opacity-100 hover:bg-sidebar-accent hover:text-rose-500 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function getMethodClassName(method: ApiOperation["method"]) {
  switch (method) {
    case "GET":
      return "text-emerald-600 dark:text-emerald-400"
    case "POST":
      return "text-amber-600 dark:text-amber-400"
    case "PUT":
    case "PATCH":
      return "text-blue-600 dark:text-blue-400"
    case "DELETE":
      return "text-rose-600 dark:text-rose-400"
    default:
      return "text-sidebar-foreground/60"
  }
}
