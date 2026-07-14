"use client"

import type { ApiOperation, ApiOperationGroup } from "@/lib/openapi"
import { useEnvironment } from "@/components/environment-provider"
import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  Container,
  FolderClosedIcon,
  HomeIcon,
  PlugIcon,
  PlusIcon,
  RadioTowerIcon,
  Trash2Icon,
  WifiIcon,
} from "lucide-react"
import * as React from "react"

import Logo from "@/assets/logo.svg"
import type { SavedResponseSummary } from "@/components/api-reference/types"
import type {
  PersistedCustomRequest,
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "@/lib/api-reference-actions"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
import { groupCustomRequestsByTransport } from "@/lib/request-model"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  selectedOperationId: string | null
  searchQuery: string
  savedResponses: SavedResponseSummary[]
  customRequests: PersistedCustomRequest[]
  selectedSavedResponseId?: string | null
  selectedRequestId?: string | null
  activePage?: "workspace" | "environment"
  onSelectOverview: () => void
  onSelectEnvironment: () => void
  onSearchQueryChange: (query: string) => void
  onSelectOperation: (operation: ApiOperation) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
  onDeleteCustomRequest: (request: PersistedCustomRequest) => void
  onCreateCustomRequest: (input: {
    name: string
    method: RequestMethod
    transport: RequestTransport
    mode: RequestMode
    url: string
  }) => Promise<PersistedCustomRequest | null>
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
}

export function AppSidebar({
  selectedOperationId,
  searchQuery,
  savedResponses,
  customRequests,
  selectedSavedResponseId,
  selectedRequestId,
  activePage = "workspace",
  onSelectOverview,
  onSelectEnvironment,
  onSearchQueryChange,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
  onDeleteCustomRequest,
  onCreateCustomRequest,
  onSelectCustomRequest,
  ...props
}: AppSidebarProps) {
  const { environments, activeEnvironmentId, setActiveEnvironmentId } =
    useEnvironment()
  const isOverviewRoute = activePage === "workspace"
  const [requestDialogOpen, setRequestDialogOpen] = React.useState(false)
  const [newRequestName, setNewRequestName] = React.useState("")
  const [newRequestUrl, setNewRequestUrl] = React.useState("")
  const [newRequestMethod, setNewRequestMethod] =
    React.useState<RequestMethod>("GET")
  const [newRequestTransport, setNewRequestTransport] =
    React.useState<RequestTransport>("http")
  const [newRequestMode, setNewRequestMode] =
    React.useState<RequestMode>("standard")
  const [httpOpen, setHttpOpen] = React.useState(false)
  const [websocketOpen, setWebsocketOpen] = React.useState(false)
  const groups = React.useMemo(
    () => getOperationGroups({ query: searchQuery, requestOnly: false }),
    [searchQuery]
  )
  const endpointCount = apiOperations.length
  const savedResponsesByOperation = React.useMemo(() => {
    const map = new Map<string, SavedResponseSummary[]>()
    for (const response of savedResponses) {
      map.set(response.operationId, [
        ...(map.get(response.operationId) ?? []),
        response,
      ])
    }
    return map
  }, [savedResponses])
  const customRequestsByTransport = React.useMemo(() => {
    return groupCustomRequestsByTransport(customRequests, searchQuery)
  }, [customRequests, searchQuery])

  React.useEffect(() => {
    if (
      activePage !== "workspace" ||
      (!selectedOperationId && !selectedRequestId)
    ) {
      setHttpOpen(false)
      setWebsocketOpen(false)
      return
    }

    const selectedCustomRequest = customRequests.find(
      (request) => getCustomRequestKey(request.id) === selectedRequestId
    )
    const transport = selectedCustomRequest?.transport ?? "http"
    setHttpOpen(transport === "http")
    setWebsocketOpen(transport === "websocket")
  }, [activePage, customRequests, selectedOperationId, selectedRequestId])

  return (
    <Sidebar {...props}>
      <SidebarContent>
        <div className="flex items-center gap-2 px-2.5 pt-3">
          <div className="rounded-sm bg-primary p-1">
            <img src={Logo} className="size-5" alt="" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-normal text-sidebar-foreground">
              Skaper
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setRequestDialogOpen(true)}
            aria-label="Create custom request"
            title="Create custom request"
          >
            <PlusIcon className="size-4" />
          </Button>
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
            <Button
              type="button"
              onClick={() => setRequestDialogOpen(true)}
              className="w-full text-xs"
            >
              <PlusIcon className="size-3.5" />
              Add request
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="p-0.5 px-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onSelectOverview}
            aria-current={
              isOverviewRoute &&
              selectedOperationId === null &&
              selectedRequestId === null
                ? "page"
                : undefined
            }
            className={cn(
              "w-full justify-start gap-2 px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isOverviewRoute &&
                selectedOperationId === null &&
                selectedRequestId === null &&
                "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            )}
          >
            <HomeIcon className="w-4 text-sidebar-foreground/60" />
            <span className="truncate text-[13px] font-normal">Overview</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onSelectEnvironment}
            className={cn(
              "w-full justify-start gap-2 px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              activePage === "environment" &&
                "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            )}
          >
            <Container className="w-4 text-sidebar-foreground/60" />
            <span className="truncate text-[13px] font-normal">
              Environment
            </span>
          </Button>
        </SidebarGroup>

        <SidebarGroup className="p-0.5 px-2 pt-0">
          <TransportSection
            label="HTTP"
            icon={
              <ArrowLeftRightIcon className="w-4 text-sidebar-foreground/60" />
            }
            count={
              endpointCount +
              (customRequestsByTransport.get("http")?.length ?? 0)
            }
            open={httpOpen}
            onOpenChange={setHttpOpen}
            openApiContent={
              <OpenApiRequestTree
                groups={groups}
                selectedOperationId={selectedOperationId}
                savedResponsesByOperation={savedResponsesByOperation}
                selectedSavedResponseId={selectedSavedResponseId}
                onSelectOperation={onSelectOperation}
                onSelectSavedResponse={onSelectSavedResponse}
                onDeleteSavedResponse={onDeleteSavedResponse}
              />
            }
            customRequests={customRequestsByTransport.get("http") ?? []}
            selectedRequestId={selectedRequestId}
            onSelectCustomRequest={onSelectCustomRequest}
            onDeleteCustomRequest={onDeleteCustomRequest}
          />
          <TransportSection
            label="WebSocket"
            icon={<PlugIcon className="w-4 text-sidebar-foreground/60" />}
            count={customRequestsByTransport.get("websocket")?.length ?? 0}
            open={websocketOpen}
            onOpenChange={setWebsocketOpen}
            openApiContent={<EmptyProtocolFolder label="WebSocket" />}
            customRequests={customRequestsByTransport.get("websocket") ?? []}
            selectedRequestId={selectedRequestId}
            onSelectCustomRequest={onSelectCustomRequest}
            onDeleteCustomRequest={onDeleteCustomRequest}
          />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Request</DialogTitle>
            <DialogDescription>
              Add a custom request alongside the generated OpenAPI workspace.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!newRequestName.trim()) return
              const request = await onCreateCustomRequest({
                name: newRequestName.trim(),
                method: newRequestMethod,
                transport: newRequestTransport,
                mode: newRequestMode,
                url: newRequestUrl.trim(),
              })
              if (request) {
                onSelectCustomRequest(request)
              }
              setNewRequestName("")
              setNewRequestUrl("")
              setNewRequestMethod("GET")
              setNewRequestTransport("http")
              setNewRequestMode("standard")
              setRequestDialogOpen(false)
            }}
          >
            <Input
              value={newRequestName}
              onChange={(event) => setNewRequestName(event.target.value)}
              placeholder="New request"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={newRequestTransport}
                onValueChange={(value) => {
                  const transport = value as RequestTransport
                  setNewRequestTransport(transport)
                  setNewRequestMode("standard")
                  setNewRequestMethod("GET")
                }}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue aria-label="Request transport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="websocket">WebSocket</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newRequestMode}
                onValueChange={(value) => {
                  const mode = value as RequestMode
                  setNewRequestMode(mode)
                  if (mode === "sse") setNewRequestMethod("GET")
                }}
                disabled={newRequestTransport !== "http"}
              >
                <SelectTrigger className="h-9 w-full" aria-label="HTTP mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="sse">Server-sent events</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select
              value={newRequestMethod}
              onValueChange={(value) =>
                setNewRequestMethod(value as RequestMethod)
              }
              disabled={
                newRequestTransport !== "http" || newRequestMode === "sse"
              }
            >
              <SelectTrigger className="h-9 w-full" aria-label="HTTP method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "GET",
                  "POST",
                  "PUT",
                  "PATCH",
                  "DELETE",
                  "HEAD",
                  "OPTIONS",
                ].map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newRequestUrl}
              onChange={(event) => setNewRequestUrl(event.target.value)}
              placeholder={
                newRequestTransport === "websocket"
                  ? "wss://example.com/socket"
                  : newRequestMode === "sse"
                    ? "https://example.com/events"
                    : "https://api.example.com/resource"
              }
            />
            <DialogFooter>
              <Button type="submit" disabled={!newRequestName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}

function TransportSection({
  label,
  icon,
  count,
  open,
  onOpenChange,
  openApiContent,
  customRequests,
  selectedRequestId,
  onSelectCustomRequest,
  onDeleteCustomRequest,
}: {
  label: string
  icon: React.ReactNode
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  openApiContent: React.ReactNode
  customRequests: PersistedCustomRequest[]
  selectedRequestId?: string | null
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
  onDeleteCustomRequest: (request: PersistedCustomRequest) => void
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="group/protocol [&[data-state=open]>button>svg:first-child]:rotate-90"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2 px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronRightIcon className="w-4 transition-transform" />
          {icon}
          <span className="truncate text-[13px] font-normal">{label}</span>
          <span className="ml-auto text-[11px] text-sidebar-foreground/60 tabular-nums">
            {count}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 border-l border-sidebar-border/80 pl-2">
          {openApiContent}
          <FolderSection
            label="Custom"
            count={customRequests.length}
            defaultOpen={customRequests.some(
              (request) => selectedRequestId === getCustomRequestKey(request.id)
            )}
          >
            <div className="ml-5 flex flex-col border-l border-sidebar-border/80 py-1 pl-2">
              {customRequests.length > 0 ? (
                customRequests.map((request) => (
                  <CustomRequestItem
                    key={request.id}
                    request={request}
                    isActive={
                      selectedRequestId === getCustomRequestKey(request.id)
                    }
                    onSelectCustomRequest={onSelectCustomRequest}
                    onDeleteCustomRequest={onDeleteCustomRequest}
                  />
                ))
              ) : (
                <div className="px-2 py-1.5 text-[12px] text-sidebar-foreground/50">
                  No custom requests
                </div>
              )}
            </div>
          </FolderSection>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function FolderSection({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/fixed-folder [&[data-state=open]>button>svg:first-child]:rotate-90"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2 px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronRightIcon className="w-4 transition-transform" />
          <FolderClosedIcon className="w-4 text-sidebar-foreground/60" />
          <span className="truncate text-[13px]">{label}</span>
          <span className="ml-auto text-[11px] text-sidebar-foreground/60 tabular-nums">
            {count}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

function OpenApiRequestTree({
  groups,
  selectedOperationId,
  savedResponsesByOperation,
  selectedSavedResponseId,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
}: {
  groups: ApiOperationGroup[]
  selectedOperationId: string | null
  savedResponsesByOperation: Map<string, SavedResponseSummary[]>
  selectedSavedResponseId?: string | null
  onSelectOperation: (operation: ApiOperation) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
}) {
  return (
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
                <Button
                  type="button"
                  variant="ghost"
                  data-api-group={group.name}
                  className="h-9 w-full justify-start gap-2 px-2 font-medium text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <ChevronRightIcon className="w-4 transition-transform" />
                  <FolderClosedIcon className="w-4 text-sidebar-foreground/60" />
                  <span className="truncate text-[13px] font-normal">
                    {group.name}
                  </span>
                  <span className="ml-auto text-[11px] text-sidebar-foreground/60 tabular-nums">
                    {group.operations.length}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-5 flex flex-col border-l border-sidebar-border/80 py-1 pl-2">
                  {group.operations.map((operation) => (
                    <OperationItem
                      key={operation.id}
                      operation={operation}
                      isActive={operation.id === selectedOperationId}
                      savedResponses={savedResponsesByOperation.get(
                        operation.id
                      )}
                      selectedSavedResponseId={selectedSavedResponseId}
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
            <span>No matching OpenAPI requests</span>
          </div>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  )
}

function EmptyProtocolFolder({ label }: { label: string }) {
  return (
    <div className="px-2 py-1.5 text-[12px] text-sidebar-foreground/50">
      No {label} requests in the OpenAPI document.
    </div>
  )
}

function CustomRequestItem({
  request,
  isActive,
  onSelectCustomRequest,
  onDeleteCustomRequest,
}: {
  request: PersistedCustomRequest
  isActive: boolean
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
  onDeleteCustomRequest: (request: PersistedCustomRequest) => void
}) {
  return (
    <div
      className={cn(
        "group/custom-request flex min-h-8 w-full items-center gap-1.5 rounded-md py-1 pr-1 pl-2 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        data-custom-request-id={request.id}
        onClick={() => onSelectCustomRequest(request)}
        className="h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-none px-0 py-0 font-normal hover:bg-transparent"
      >
        <span
          className={cn(
            "w-10 shrink-0 text-[10px] font-semibold tabular-nums",
            getTransportClassName(
              request.transport,
              request.mode,
              request.method
            )
          )}
        >
          {request.mode === "sse"
            ? "SSE"
            : request.transport === "http"
              ? request.method
              : "WS"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-sidebar-foreground">
          {request.name}
        </span>
        {request.transport === "websocket" ? (
          <WifiIcon className="size-3.5 text-sidebar-foreground/45" />
        ) : request.mode === "sse" ? (
          <RadioTowerIcon className="size-3.5 text-sidebar-foreground/45" />
        ) : null}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${request.name}`}
        onClick={() => onDeleteCustomRequest(request)}
        className="shrink-0 text-sidebar-foreground/45 opacity-0 group-hover/custom-request:opacity-100 hover:bg-sidebar-accent hover:text-destructive focus-visible:opacity-100"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  )
}

function OperationItem({
  operation,
  isActive,
  savedResponses,
  selectedSavedResponseId,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
}: {
  operation: ApiOperation
  isActive: boolean
  savedResponses?: SavedResponseSummary[]
  selectedSavedResponseId?: string | null
  onSelectOperation: (operation: ApiOperation) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
}) {
  const savedResponseItems = savedResponses ?? []
  const savedResponseIsActive = savedResponseItems.some(
    (response) => response.id === selectedSavedResponseId
  )
  const [savedResponseOpen, setSavedResponseOpen] = React.useState(
    Boolean(
      savedResponseItems.length > 0 && (isActive || savedResponseIsActive)
    )
  )

  React.useEffect(() => {
    if (savedResponseItems.length > 0 && (isActive || savedResponseIsActive)) {
      setSavedResponseOpen(true)
    }
  }, [isActive, savedResponseItems.length, savedResponseIsActive])

  if (savedResponseItems.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        data-operation-id={operation.id}
        onClick={() => onSelectOperation(operation)}
        className={cn(
          "min-h-8 w-full justify-start gap-0.5 rounded-md py-1 pr-2 pl-2 font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <span
          className={cn(
            "w-10 shrink-0 text-[10px] font-semibold tabular-nums",
            operation.requestMode === "sse"
              ? "text-violet-600 dark:text-violet-400"
              : getMethodClassName(operation.method)
          )}
        >
          {operation.requestMode === "sse" ? "SSE" : operation.method}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-sidebar-foreground">
          {operation.displayPath}
        </span>
      </Button>
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
          "flex min-h-8 w-full items-center rounded-md py-1 pr-2 pl-0 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive &&
            !savedResponseIsActive &&
            "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${savedResponseOpen ? "Collapse" : "Expand"} saved responses for ${operation.displayPath}`}
            className="mr-1 size-5 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]/operation:rotate-90" />
          </Button>
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="ghost"
          data-operation-id={operation.id}
          onClick={() => onSelectOperation(operation)}
          className="h-auto min-w-0 flex-1 justify-start gap-0.5 rounded-none px-0 py-0 font-normal hover:bg-transparent"
        >
          <span
            className={cn(
              "w-10 shrink-0 text-[10px] font-semibold tabular-nums",
              operation.requestMode === "sse"
                ? "text-violet-600 dark:text-violet-400"
                : getMethodClassName(operation.method)
            )}
          >
            {operation.requestMode === "sse" ? "SSE" : operation.method}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-sidebar-foreground">
            {operation.displayPath}
          </span>
        </Button>
      </div>

      <CollapsibleContent>
        <div className="ml-2 flex flex-col gap-0.5 border-l border-sidebar-border/80 py-1 pl-3">
          {savedResponseItems.map((savedResponse) => {
            const responseIsActive =
              savedResponse.id === selectedSavedResponseId

            return (
              <div
                key={savedResponse.id}
                className={cn(
                  "group/response flex min-h-8 items-center gap-1 rounded-md py-1 pr-1 pl-2 transition-colors",
                  responseIsActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSelectSavedResponse(savedResponse)}
                  className="h-auto min-w-0 flex-1 justify-start gap-2 rounded-none px-0 py-0 font-normal hover:bg-transparent"
                >
                  <span className="inline-flex h-4 shrink-0 items-center rounded-xs border border-sidebar-foreground/50 px-0.5 text-[10px] leading-none font-semibold text-sidebar-foreground/70">
                    e.g.
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {savedResponse.name}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete saved response ${savedResponse.name}`}
                  onClick={() => onDeleteSavedResponse(savedResponse)}
                  className="shrink-0 text-sidebar-foreground/50 opacity-0 group-hover/response:opacity-100 hover:bg-sidebar-accent hover:text-destructive focus-visible:opacity-100"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function getMethodClassName(method: string) {
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

function getTransportClassName(
  transport: RequestTransport,
  mode: RequestMode,
  method: RequestMethod
) {
  if (transport === "websocket") {
    return "text-sky-600 dark:text-sky-400"
  }

  if (mode === "sse") {
    return "text-violet-600 dark:text-violet-400"
  }

  return getMethodClassName(method)
}

function getCustomRequestKey(id: string) {
  return `custom:${id}`
}
