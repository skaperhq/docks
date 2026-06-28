"use client"

import type { ApiOperation } from "@/lib/openapi"
import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  Container,
  FileSearchIcon,
  FolderClosedIcon,
} from "lucide-react"
import * as React from "react"

import Logo from "@/assets/logo.svg"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  onSearchQueryChange: (query: string) => void
  onRequestOnlyChange: (requestOnly: boolean) => void
  onSelectOperation: (operation: ApiOperation) => void
}

export function AppSidebar({
  selectedOperationId,
  searchQuery,
  requestOnly,
  onSearchQueryChange,
  onRequestOnlyChange,
  onSelectOperation,
  ...props
}: AppSidebarProps) {
  const groups = React.useMemo(
    () => getOperationGroups({ query: searchQuery, requestOnly }),
    [searchQuery, requestOnly]
  )
  const endpointCount = apiOperations.length

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

        <SidebarGroup className="mt-1 px-2 py-1">
          <SidebarGroupContent className="flex flex-col gap-2">
            <label className="relative block">
              <SidebarInput
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                className="bg-sidebar-accent text-sidebar-foreground h-8 rounded-md border-sidebar-border placeholder:text-muted-foreground"
                placeholder="Search requests"
                aria-label="Search API requests"
              />
            </label>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="p-0.5 px-2 pt-1">
          <button className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <Container className="w-4 text-sidebar-foreground/60" />
            <span className="truncate text-[13px] font-normal">
              Environment
            </span>
          </button>
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
                <span className="truncate text-[13px] font-normal">
                  Rest
                </span>
                <span className="ml-auto text-[10px] text-sidebar-foreground/60 tabular-nums">
                  {endpointCount}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
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
                          <div className="flex flex-col py-1">
                            {group.operations.map((operation) => (
                              <OperationItem
                                key={operation.id}
                                operation={operation}
                                isActive={operation.id === selectedOperationId}
                                onSelectOperation={onSelectOperation}
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
  onSelectOperation,
}: {
  operation: ApiOperation
  isActive: boolean
  onSelectOperation: (operation: ApiOperation) => void
}) {
  return (
    <button
      type="button"
      data-operation-id={operation.id}
      onClick={() => onSelectOperation(operation)}
      className={cn(
        "flex min-h-8 w-full items-center gap-0.5 rounded-none py-1 pr-2 pl-8 text-left transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
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

