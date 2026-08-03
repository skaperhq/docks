"use client"

import type { ApiOperation, ApiOperationGroup } from "@/lib/openapi"
import { useEnvironment } from "@/components/environment-provider"
import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  Container,
  FolderClosedIcon,
  HomeIcon,
  LoaderCircleIcon,
  PlugIcon,
  PlusIcon,
  RadioTowerIcon,
  SatelliteDish,
  Trash2Icon,
  WifiIcon,
} from "lucide-react"
import * as React from "react"

import Logo from "@/assets/logo.svg"
import type { SavedResponseSummary } from "@/components/api-reference/types"
import type {
  PersistedCollection,
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
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { apiOperations, getOperationGroups } from "@/lib/openapi"

import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { RequestSearchCommand } from "@/components/request-search-command"
import { RequestImportDialog } from "@/components/request-import-dialog"
import type {
  CreateRequestInput,
  ImportOpenApiInput,
} from "@/components/request-import-dialog"

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  selectedOperationId: string | null
  savedResponses: SavedResponseSummary[]
  collections: PersistedCollection[]
  customRequests: PersistedCustomRequest[]
  selectedSavedResponseId?: string | null
  loadingSavedResponseId?: string | null
  selectedRequestId?: string | null
  activePage?: "workspace" | "environment"
  onSelectOverview: () => void
  onSelectEnvironment: () => void
  onSelectOperation: (operation: ApiOperation) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
  onDeleteCustomRequest: (request: PersistedCustomRequest) => void
  onDeleteCollection: (collection: PersistedCollection) => void
  onCreateCustomRequest: (
    input: CreateRequestInput
  ) => Promise<PersistedCustomRequest | null>
  onImportOpenApi: (
    input: ImportOpenApiInput
  ) => Promise<PersistedCustomRequest[] | null>
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
}

export function AppSidebar({
  selectedOperationId,
  savedResponses,
  collections,
  customRequests,
  selectedSavedResponseId,
  loadingSavedResponseId,
  selectedRequestId,
  activePage = "workspace",
  onSelectOverview,
  onSelectEnvironment,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
  onDeleteCustomRequest,
  onDeleteCollection,
  onCreateCustomRequest,
  onImportOpenApi,
  onSelectCustomRequest,
  ...props
}: AppSidebarProps) {
  const { environments, activeEnvironmentId, setActiveEnvironmentId } =
    useEnvironment()
  const isOverviewRoute = activePage === "workspace"
  const [requestDialogOpen, setRequestDialogOpen] = React.useState(false)
  const [httpOpen, setHttpOpen] = React.useState(false)
  const [sseOpen, setSseOpen] = React.useState(false)
  const [websocketOpen, setWebsocketOpen] = React.useState(false)
  const groups = React.useMemo(
    () => getOperationGroups({ query: "", requestOnly: false }),
    []
  )
  const httpOpenApiGroups = React.useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        operations: g.operations.filter(
          (op) => op.requestMode !== "sse" && op.method !== "WS"
        ),
      }))
      .filter((g) => g.operations.length > 0)
  }, [groups])

  const sseOpenApiGroups = React.useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        operations: g.operations.filter((op) => op.requestMode === "sse"),
      }))
      .filter((g) => g.operations.length > 0)
  }, [groups])

  const websocketOpenApiGroups = React.useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        operations: g.operations.filter((op) => op.method === "WS"),
      }))
      .filter((g) => g.operations.length > 0)
  }, [groups])

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

  const customRequestsByGroup = React.useMemo(() => {
    const httpCustom: PersistedCustomRequest[] = []
    const sseCustom: PersistedCustomRequest[] = []
    const wsCustom: PersistedCustomRequest[] = []

    for (const request of customRequests) {
      if (request.transport === "websocket") {
        wsCustom.push(request)
      } else if (request.mode === "sse") {
        sseCustom.push(request)
      } else {
        httpCustom.push(request)
      }
    }

    return {
      http: httpCustom,
      sse: sseCustom,
      websocket: wsCustom,
    }
  }, [customRequests])

  const selectedCustomRequestProtocol = (() => {
    const selectedRequest = customRequests.find(
      (request) => getCustomRequestKey(request.id) === selectedRequestId
    )

    if (!selectedRequest) return null
    if (selectedRequest.transport === "websocket") return "websocket"
    if (selectedRequest.mode === "sse") return "sse"
    return "http"
  })()

  React.useEffect(() => {
    if (
      activePage !== "workspace" ||
      (!selectedOperationId && !selectedRequestId)
    ) {
      return
    }

    if (selectedOperationId) {
      const selectedOp = apiOperations.find(
        (op) => op.id === selectedOperationId
      )
      const isSse = selectedOp?.requestMode === "sse"
      const isWs = selectedOp?.method === "WS"
      if (isWs) setWebsocketOpen(true)
      else if (isSse) setSseOpen(true)
      else setHttpOpen(true)
      return
    }

    const isWs = selectedCustomRequestProtocol === "websocket"
    const isSse = selectedCustomRequestProtocol === "sse"
    if (isWs) setWebsocketOpen(true)
    else if (isSse) setSseOpen(true)
    else if (selectedCustomRequestProtocol === "http") setHttpOpen(true)
  }, [
    activePage,
    selectedCustomRequestProtocol,
    selectedOperationId,
    selectedRequestId,
  ])

  return (
    <TooltipProvider delayDuration={300}>
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
          </div>

          <SidebarGroup className="mt-2 px-2 py-0">
            <SidebarGroupContent className="flex flex-col gap-1">
              <Select
                value={activeEnvironmentId || ""}
                onValueChange={setActiveEnvironmentId}
              >
                <SelectTrigger
                  className="h-8 w-full rounded-none text-[13px]"
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
              <RequestSearchCommand
                customRequests={customRequests}
                onSelectOverview={onSelectOverview}
                onSelectEnvironment={onSelectEnvironment}
                onSelectOperation={onSelectOperation}
                onSelectCustomRequest={onSelectCustomRequest}
              />
              <Button
                type="button"
                onClick={() => setRequestDialogOpen(true)}
                className="w-full rounded-none font-mono text-sm font-normal uppercase"
              >
                <PlusIcon className="size-4" strokeWidth={2} />
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
                "w-full justify-start gap-2 rounded-none px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isOverviewRoute &&
                  selectedOperationId === null &&
                  selectedRequestId === null &&
                  "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              <HomeIcon className="w-4 text-sidebar-foreground/60" />
              <span className="truncate font-mono text-[13px] font-normal uppercase">
                Overview
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onSelectEnvironment}
              className={cn(
                "w-full justify-start gap-2 rounded-none px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                activePage === "environment" &&
                  "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              <Container className="w-4 text-sidebar-foreground/60" />
              <span className="truncate font-mono text-[13px] font-normal uppercase">
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
                httpOpenApiGroups.reduce(
                  (acc, g) => acc + g.operations.length,
                  0
                ) + customRequestsByGroup.http.length
              }
              open={httpOpen}
              onOpenChange={setHttpOpen}
              openApiContent={
                <OpenApiRequestTree
                  groups={httpOpenApiGroups}
                  selectedOperationId={selectedOperationId}
                  savedResponsesByOperation={savedResponsesByOperation}
                  selectedSavedResponseId={selectedSavedResponseId}
                  loadingSavedResponseId={loadingSavedResponseId}
                  onSelectOperation={onSelectOperation}
                  onSelectSavedResponse={onSelectSavedResponse}
                  onDeleteSavedResponse={onDeleteSavedResponse}
                />
              }
              customRequests={customRequestsByGroup.http}
              collections={collections}
              savedResponsesByOperation={savedResponsesByOperation}
              selectedRequestId={selectedRequestId}
              selectedSavedResponseId={selectedSavedResponseId}
              loadingSavedResponseId={loadingSavedResponseId}
              onSelectCustomRequest={onSelectCustomRequest}
              onSelectSavedResponse={onSelectSavedResponse}
              onDeleteSavedResponse={onDeleteSavedResponse}
              onDeleteCustomRequest={onDeleteCustomRequest}
              onDeleteCollection={onDeleteCollection}
            />
            <TransportSection
              label="SSE"
              icon={
                <SatelliteDish className="w-4 text-sidebar-foreground/60" />
              }
              count={
                sseOpenApiGroups.reduce(
                  (acc, g) => acc + g.operations.length,
                  0
                ) + customRequestsByGroup.sse.length
              }
              open={sseOpen}
              onOpenChange={setSseOpen}
              openApiContent={
                <OpenApiRequestTree
                  groups={sseOpenApiGroups}
                  selectedOperationId={selectedOperationId}
                  savedResponsesByOperation={savedResponsesByOperation}
                  selectedSavedResponseId={selectedSavedResponseId}
                  loadingSavedResponseId={loadingSavedResponseId}
                  onSelectOperation={onSelectOperation}
                  onSelectSavedResponse={onSelectSavedResponse}
                  onDeleteSavedResponse={onDeleteSavedResponse}
                />
              }
              customRequests={customRequestsByGroup.sse}
              collections={collections}
              savedResponsesByOperation={savedResponsesByOperation}
              selectedRequestId={selectedRequestId}
              selectedSavedResponseId={selectedSavedResponseId}
              loadingSavedResponseId={loadingSavedResponseId}
              onSelectCustomRequest={onSelectCustomRequest}
              onSelectSavedResponse={onSelectSavedResponse}
              onDeleteSavedResponse={onDeleteSavedResponse}
              onDeleteCustomRequest={onDeleteCustomRequest}
              onDeleteCollection={onDeleteCollection}
            />
            <TransportSection
              label="WebSocket"
              icon={<PlugIcon className="w-4 text-sidebar-foreground/60" />}
              count={
                websocketOpenApiGroups.reduce(
                  (acc, g) => acc + g.operations.length,
                  0
                ) + customRequestsByGroup.websocket.length
              }
              open={websocketOpen}
              onOpenChange={setWebsocketOpen}
              openApiContent={
                websocketOpenApiGroups.length > 0 ? (
                  <OpenApiRequestTree
                    groups={websocketOpenApiGroups}
                    selectedOperationId={selectedOperationId}
                    savedResponsesByOperation={savedResponsesByOperation}
                    selectedSavedResponseId={selectedSavedResponseId}
                    loadingSavedResponseId={loadingSavedResponseId}
                    onSelectOperation={onSelectOperation}
                    onSelectSavedResponse={onSelectSavedResponse}
                    onDeleteSavedResponse={onDeleteSavedResponse}
                  />
                ) : (
                  <EmptyProtocolFolder label="WebSocket" />
                )
              }
              customRequests={customRequestsByGroup.websocket}
              collections={collections}
              savedResponsesByOperation={savedResponsesByOperation}
              selectedRequestId={selectedRequestId}
              selectedSavedResponseId={selectedSavedResponseId}
              loadingSavedResponseId={loadingSavedResponseId}
              onSelectCustomRequest={onSelectCustomRequest}
              onSelectSavedResponse={onSelectSavedResponse}
              onDeleteSavedResponse={onDeleteSavedResponse}
              onDeleteCustomRequest={onDeleteCustomRequest}
              onDeleteCollection={onDeleteCollection}
            />
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <ThemeToggle />
        </SidebarFooter>
        <SidebarRail />
        <RequestImportDialog
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
          collectionNames={collections.map((collection) => collection.name)}
          onCreateRequest={onCreateCustomRequest}
          onImportOpenApi={onImportOpenApi}
          onSelectCustomRequest={onSelectCustomRequest}
        />
      </Sidebar>
    </TooltipProvider>
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
  collections,
  savedResponsesByOperation,
  selectedRequestId,
  selectedSavedResponseId,
  loadingSavedResponseId,
  onSelectCustomRequest,
  onSelectSavedResponse,
  onDeleteSavedResponse,
  onDeleteCustomRequest,
  onDeleteCollection,
}: {
  label: string
  icon: React.ReactNode
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  openApiContent: React.ReactNode
  customRequests: PersistedCustomRequest[]
  collections: PersistedCollection[]
  savedResponsesByOperation: Map<string, SavedResponseSummary[]>
  selectedRequestId?: string | null
  selectedSavedResponseId?: string | null
  loadingSavedResponseId?: string | null
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
  onDeleteCustomRequest: (request: PersistedCustomRequest) => void
  onDeleteCollection: (collection: PersistedCollection) => void
}) {
  const collectionIds = new Set(collections.map((collection) => collection.id))
  const manualRequests = customRequests.filter(
    (request) => !collectionIds.has(request.collectionId)
  )
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
          className="w-full justify-start gap-2 rounded-none px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronRightIcon className="w-4 transition-transform" />
          {icon}
          <span className="truncate font-mono text-[13px] font-normal uppercase">
            {label}
          </span>
          <span className="ml-auto font-mono text-[11px] text-sidebar-foreground/60 tabular-nums">
            {count}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 border-l border-sidebar-border/80 pl-2">
          {openApiContent}
          {collections.map((collection) => {
            const requests = customRequests.filter(
              (request) => request.collectionId === collection.id
            )
            return requests.length ? (
              <ImportedCollectionSection
                key={collection.id}
                collection={collection}
                requests={requests}
                savedResponsesByOperation={savedResponsesByOperation}
                selectedRequestId={selectedRequestId}
                selectedSavedResponseId={selectedSavedResponseId}
                loadingSavedResponseId={loadingSavedResponseId}
                onSelectCustomRequest={onSelectCustomRequest}
                onSelectSavedResponse={onSelectSavedResponse}
                onDeleteSavedResponse={onDeleteSavedResponse}
                onDeleteCustomRequest={onDeleteCustomRequest}
                onDeleteCollection={onDeleteCollection}
              />
            ) : null
          })}
          <FolderSection
            label="Custom"
            count={manualRequests.length}
            defaultOpen={manualRequests.some(
              (request) => selectedRequestId === getCustomRequestKey(request.id)
            )}
          >
            <div className="ml-5 flex flex-col border-l border-sidebar-border/80 py-1 pl-2">
              {manualRequests.length > 0 ? (
                manualRequests.map((request) => (
                  <CustomRequestItem
                    key={request.id}
                    request={request}
                    isActive={
                      selectedRequestId === getCustomRequestKey(request.id)
                    }
                    savedResponses={savedResponsesByOperation.get(
                      getCustomRequestKey(request.id)
                    )}
                    selectedSavedResponseId={selectedSavedResponseId}
                    loadingSavedResponseId={loadingSavedResponseId}
                    onSelectCustomRequest={onSelectCustomRequest}
                    onSelectSavedResponse={onSelectSavedResponse}
                    onDeleteSavedResponse={onDeleteSavedResponse}
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

function ImportedCollectionSection({
  collection,
  requests,
  savedResponsesByOperation,
  selectedRequestId,
  selectedSavedResponseId,
  loadingSavedResponseId,
  onSelectCustomRequest,
  onSelectSavedResponse,
  onDeleteSavedResponse,
  onDeleteCustomRequest,
  onDeleteCollection,
}: {
  collection: PersistedCollection
  requests: PersistedCustomRequest[]
  savedResponsesByOperation: Map<string, SavedResponseSummary[]>
  selectedRequestId?: string | null
  selectedSavedResponseId?: string | null
  loadingSavedResponseId?: string | null
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
  onDeleteCustomRequest: (request: PersistedCustomRequest) => void
  onDeleteCollection: (collection: PersistedCollection) => void
}) {
  const groups = new Map<string, PersistedCustomRequest[]>()
  for (const request of requests) {
    const folder = request.folder?.trim() || "Other"
    groups.set(folder, [...(groups.get(folder) ?? []), request])
  }
  const hasActiveRequest = requests.some(
    (request) => selectedRequestId === getCustomRequestKey(request.id)
  )

  return (
    <FolderSection
      label={collection.name}
      count={requests.length}
      defaultOpen={hasActiveRequest}
      onDelete={() => onDeleteCollection(collection)}
    >
      <div className="ml-5 border-l border-sidebar-border/80 pl-2">
        {Array.from(groups.entries()).map(([folder, folderRequests]) => (
          <FolderSection
            key={folder}
            label={folder}
            count={folderRequests.length}
            defaultOpen={folderRequests.some(
              (request) => selectedRequestId === getCustomRequestKey(request.id)
            )}
          >
            <div className="ml-5 flex flex-col border-l border-sidebar-border/80 py-1 pl-2">
              {folderRequests.map((request) => (
                <CustomRequestItem
                  key={request.id}
                  request={request}
                  isActive={
                    selectedRequestId === getCustomRequestKey(request.id)
                  }
                  savedResponses={savedResponsesByOperation.get(
                    getCustomRequestKey(request.id)
                  )}
                  selectedSavedResponseId={selectedSavedResponseId}
                  loadingSavedResponseId={loadingSavedResponseId}
                  onSelectCustomRequest={onSelectCustomRequest}
                  onSelectSavedResponse={onSelectSavedResponse}
                  onDeleteSavedResponse={onDeleteSavedResponse}
                  onDeleteCustomRequest={onDeleteCustomRequest}
                />
              ))}
            </div>
          </FolderSection>
        ))}
      </div>
    </FolderSection>
  )
}

function FolderSection({
  label,
  count,
  defaultOpen = false,
  onDelete,
  children,
}: {
  label: string
  count: number
  defaultOpen?: boolean
  onDelete?: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  React.useEffect(() => {
    if (defaultOpen) {
      setOpen(true)
    }
  }, [defaultOpen])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group/folder-row relative flex items-center">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full min-w-0 justify-start gap-2 rounded-none px-2 font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronRightIcon
              className={cn("transition-transform", open && "rotate-90")}
            />
            <FolderClosedIcon className="text-sidebar-foreground/60" />
            <span className="truncate text-[13px]">{label}</span>
            <span
              data-slot="folder-count"
              className={cn(
                "ml-auto text-[11px] text-sidebar-foreground/60 tabular-nums transition-opacity",
                onDelete &&
                  "group-focus-within/folder-row:opacity-0 group-hover/folder-row:opacity-0"
              )}
            >
              {count}
            </span>
          </Button>
        </CollapsibleTrigger>
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete ${label} collection`}
            title={`Delete ${label} collection`}
            onClick={onDelete}
            className="pointer-events-none absolute right-1 text-sidebar-foreground/45 opacity-0 group-hover/folder-row:pointer-events-auto group-hover/folder-row:opacity-100 hover:bg-sidebar-accent hover:text-destructive focus-visible:pointer-events-auto focus-visible:opacity-100"
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

function OpenApiRequestTree({
  groups,
  selectedOperationId,
  savedResponsesByOperation,
  selectedSavedResponseId,
  loadingSavedResponseId,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
}: {
  groups: ApiOperationGroup[]
  selectedOperationId: string | null
  savedResponsesByOperation: Map<string, SavedResponseSummary[]>
  selectedSavedResponseId?: string | null
  loadingSavedResponseId?: string | null
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
                  className="h-9 w-full justify-start gap-2 rounded-none px-2 font-medium text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                      loadingSavedResponseId={loadingSavedResponseId}
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
  savedResponses,
  selectedSavedResponseId,
  loadingSavedResponseId,
  onSelectCustomRequest,
  onSelectSavedResponse,
  onDeleteSavedResponse,
  onDeleteCustomRequest,
}: {
  request: PersistedCustomRequest
  isActive: boolean
  savedResponses?: SavedResponseSummary[]
  selectedSavedResponseId?: string | null
  loadingSavedResponseId?: string | null
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onDeleteSavedResponse: (response: SavedResponseSummary) => void
  onDeleteCustomRequest: (request: PersistedCustomRequest) => void
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

  const requestRow = (
    <div
      className={cn(
        "group/custom-request flex min-h-8 w-full items-center gap-1.5 rounded-none py-1 pr-1 pl-2 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive &&
          !savedResponseIsActive &&
          "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      {savedResponseItems.length > 0 ? (
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${savedResponseOpen ? "Collapse" : "Expand"} saved responses for ${request.name}`}
            className="size-5 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <ChevronRightIcon className="transition-transform group-data-[state=open]/custom-request-item:rotate-90" />
          </Button>
        </CollapsibleTrigger>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        data-custom-request-id={request.id}
        onClick={() => onSelectCustomRequest(request)}
        className="h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-none px-0 py-0 text-left font-normal hover:bg-transparent"
      >
        <span
          className={cn(
            "w-10 shrink-0 text-left font-mono text-[10px] font-medium tabular-nums",
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
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-left text-[12px] text-sidebar-foreground">
              {request.url}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={8}
            showArrow={false}
            className="max-w-sm break-all"
          >
            {request.url}
          </TooltipContent>
        </Tooltip>
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

  if (savedResponseItems.length === 0) {
    return requestRow
  }

  return (
    <Collapsible
      open={savedResponseOpen}
      onOpenChange={setSavedResponseOpen}
      className="group/custom-request-item"
    >
      {requestRow}
      <CollapsibleContent>
        <div className="ml-2 flex flex-col gap-0.5 border-l border-sidebar-border/80 py-1 pl-3">
          {savedResponseItems.map((savedResponse) => {
            const responseIsActive =
              savedResponse.id === selectedSavedResponseId

            return (
              <div
                key={savedResponse.id}
                className={cn(
                  "group/response flex min-h-8 items-center gap-1 rounded-none py-1 pr-1 pl-2 transition-colors",
                  responseIsActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Open saved response ${savedResponse.name}`}
                  onClick={() => onSelectSavedResponse(savedResponse)}
                  disabled={loadingSavedResponseId === savedResponse.id}
                  className="h-auto min-w-0 flex-1 justify-start gap-2 rounded-none px-0 py-0 font-normal hover:bg-transparent"
                >
                  {loadingSavedResponseId === savedResponse.id ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <span className="inline-flex h-4 shrink-0 items-center rounded-xs border border-sidebar-foreground/50 px-0.5 text-[10px] leading-none font-semibold text-sidebar-foreground/70">
                      {savedResponse.status}
                    </span>
                  )}
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
                  <Trash2Icon />
                </Button>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function OperationItem({
  operation,
  isActive,
  savedResponses,
  selectedSavedResponseId,
  loadingSavedResponseId,
  onSelectOperation,
  onSelectSavedResponse,
  onDeleteSavedResponse,
}: {
  operation: ApiOperation
  isActive: boolean
  savedResponses?: SavedResponseSummary[]
  selectedSavedResponseId?: string | null
  loadingSavedResponseId?: string | null
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
          "min-h-8 w-full justify-start gap-0.5 rounded-none py-1 pr-2 pl-2 font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <span
          className={cn(
            "w-10 shrink-0 text-left font-mono text-[10px] font-medium tabular-nums",
            operation.requestMode === "sse"
              ? "text-violet-600 dark:text-violet-400"
              : getMethodClassName(operation.method)
          )}
        >
          {operation.requestMode === "sse" ? "SSE" : operation.method}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[12px] text-sidebar-foreground">
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
          "flex min-h-8 w-full items-center rounded-none py-1 pr-2 pl-0 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
              "w-10 shrink-0 text-left font-mono text-[10px] font-medium tabular-nums",
              operation.requestMode === "sse"
                ? "text-violet-600 dark:text-violet-400"
                : getMethodClassName(operation.method)
            )}
          >
            {operation.requestMode === "sse" ? "SSE" : operation.method}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-[12px] text-sidebar-foreground">
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
                  "group/response flex min-h-8 items-center gap-1 rounded-none py-1 pr-1 pl-2 transition-colors",
                  responseIsActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Open saved response ${savedResponse.name}`}
                  onClick={() => onSelectSavedResponse(savedResponse)}
                  disabled={loadingSavedResponseId === savedResponse.id}
                  className="h-auto min-w-0 flex-1 justify-start gap-2 rounded-none px-0 py-0 font-normal hover:bg-transparent"
                >
                  {loadingSavedResponseId === savedResponse.id ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <span className="inline-flex h-4 shrink-0 items-center rounded-xs border border-sidebar-foreground/50 px-0.5 text-[10px] leading-none font-semibold text-sidebar-foreground/70">
                      {savedResponse.status}
                    </span>
                  )}
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
