import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEnvironment } from "@/components/environment-provider"
import {
  ArrowLeftRightIcon,
  LockIcon,
  ServerIcon,
  TagsIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  apiInfo,
  apiOperations,
  apiServers,
  apiSpecVersion,
} from "@/lib/openapi"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Extracted components and utilities
import { RequestTabStrip } from "@/components/api-reference/request-tab-strip"
import {
  RequestTabContent,
  RequestTabLabel,
  requestTabs,
} from "@/components/api-reference/request-tab-content"
import { ResponseBar } from "@/components/api-reference/response-bar"
import type {
  RequestTab,
  RequestBodyDraft,
  RequestDraft,
  ResponseState,
  SavedRequestSnapshot,
  SavedResponseSummary,
} from "@/components/api-reference/types"
import { buildFetchRequest } from "@/lib/api-request"
import { buildCurlCommand } from "@/lib/request-curl"
import { requestDraftFromSnapshot } from "@/lib/request-snapshot"
import {
  closeActiveStream,
  openSseConnection,
} from "@/lib/sse/sse-request"
import { getRequestTabCloseResult } from "@/lib/request-tabs"
import { normalizeRequestConfiguration } from "@/lib/request-model"
import {
  createCustomRequest,
  deleteCustomRequest,
  deleteRequestTab,
  deleteSavedResponse,
  getApiWorkspace,
  getSavedResponse,
  saveResponse,
  saveWorkspaceSetting,
  upsertCustomRequest,
  upsertRequestTab,
} from "@/lib/api-reference-actions"
import type {
  PersistedCustomRequest,
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "@/lib/api-reference-actions"
import {
  getHeaderRows,
  getMethodClassName,
  getBgMethodClassName,
  formatBodyExample,
  parameterToRow,
  restoreGeneratedHeaderTemplates,
} from "@/components/api-reference/utils"

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      operationId:
        typeof search.operationId === "string" ? search.operationId : undefined,
    }
  },
  component: App,
})

const defaultOperation =
  apiOperations.find((operation) => operation.id === "POST /auth/login") ??
  apiOperations[0]
const DEFAULT_RESPONSE_PANEL_HEIGHT = 360
const idleResponseState: ResponseState = { status: "idle" }

type RequestDraftMap = Partial<Record<string, RequestDraft>>
type RequestTabMap = Partial<Record<string, RequestTab>>
type ResponseStateMap = Partial<Record<string, ResponseState>>
type WorkspaceRequest = {
  id: string
  method: string
  displayPath: string
  tag: string
  summary: string
  requestUrl: string
  transport: RequestTransport
  mode: RequestMode
  isOpenApi: boolean
  hasEventStreamResponse: boolean
  operation?: (typeof apiOperations)[number]
  customRequest?: PersistedCustomRequest
}

function App() {
  const { operationId } = Route.useSearch()
  const navigate = useNavigate()

  return (
    <WorkspacePage
      operationId={operationId}
      onOperationChange={(nextOperationId) =>
        navigate({
          to: "/",
          search: { operationId: nextOperationId },
        })
      }
      onSelectEnvironment={() => navigate({ to: "/environment" })}
    />
  )
}

export function WorkspacePage({
  operationId,
  onOperationChange,
  onSelectEnvironment,
}: {
  operationId?: string
  onOperationChange: (operationId?: string) => void
  onSelectEnvironment: () => void
}) {
  const { activeEnvironment, resolveVariables } = useEnvironment()

  const [searchQuery, setSearchQuery] = React.useState("")
  const [openOperationIds, setOpenOperationIds] = React.useState<string[]>(
    () => [defaultOperation.id]
  )
  const [requestDrafts, setRequestDrafts] = React.useState<RequestDraftMap>({})
  const [requestTabByOperation, setRequestTabByOperation] =
    React.useState<RequestTabMap>({})
  const [customRequests, setCustomRequests] = React.useState<
    PersistedCustomRequest[]
  >([])
  const [savedResponses, setSavedResponses] = React.useState<
    SavedResponseSummary[]
  >([])
  const [selectedSavedResponseId, setSelectedSavedResponseId] = React.useState<
    string | null
  >(null)
  const [responsePanelHeight, setResponsePanelHeight] = React.useState(
    DEFAULT_RESPONSE_PANEL_HEIGHT
  )
  const [workspaceLoaded, setWorkspaceLoaded] = React.useState(false)
  const [isSavingResponse, setIsSavingResponse] = React.useState(false)
  const [responseStateByOperationId, setResponseStateByOperationId] =
    React.useState<ResponseStateMap>({})
  const [requestSnapshotByOperationId, setRequestSnapshotByOperationId] =
    React.useState<Partial<Record<string, SavedRequestSnapshot>>>({})
  const activeStreamRef = React.useRef<{
    id: string
    close: () => void
  } | null>(null)
  const selectedOperation = operationId
    ? apiOperations.find((operation) => operation.id === operationId)
    : undefined
  const selectedCustomRequest = operationId?.startsWith("custom:")
    ? customRequests.find(
        (request) => getCustomRequestKey(request.id) === operationId
      )
    : undefined
  const selectedRequest = React.useMemo(
    () =>
      selectedOperation
        ? toOperationWorkspaceRequest(selectedOperation)
        : selectedCustomRequest
          ? toCustomWorkspaceRequest(selectedCustomRequest)
          : undefined,
    [selectedCustomRequest, selectedOperation]
  )
  const selectedRequestId = selectedRequest?.id
  const selectedRequestInitialDraft = selectedRequest?.customRequest?.draft
  const openOperations = React.useMemo(
    () =>
      openOperationIds.flatMap((openOperationId) => {
        const operation = apiOperations.find(
          (apiOperation) => apiOperation.id === openOperationId
        )
        if (operation) {
          return [toOperationWorkspaceRequest(operation)]
        }

        if (openOperationId.startsWith("custom:")) {
          const customRequest = customRequests.find(
            (request) => getCustomRequestKey(request.id) === openOperationId
          )

          return customRequest ? [toCustomWorkspaceRequest(customRequest)] : []
        }

        return []
      }),
    [customRequests, openOperationIds]
  )

  const requestUrl = selectedRequest?.requestUrl ?? defaultOperation.requestUrl
  const resolvedBaseUrl = activeEnvironment ? activeEnvironment.baseUrl : ""
  const fullRequestUrl =
    selectedRequest?.isOpenApi && resolvedBaseUrl
      ? `${resolvedBaseUrl.replace(/\/$/, "")}/${requestUrl.replace(/^\//, "")}`
      : requestUrl

  const defaultHeaders = React.useMemo(
    () =>
      selectedRequest?.operation
        ? getHeaderRows(selectedRequest.operation)
        : [],
    [selectedRequest?.operation]
  )

  const defaultParams = React.useMemo(
    () => [
      ...(selectedRequest?.operation?.pathParameters ?? []).map(parameterToRow),
      ...(selectedRequest?.operation?.queryParameters ?? []).map(
        parameterToRow
      ),
    ],
    [selectedRequest?.operation]
  )

  const defaultBody = React.useMemo<RequestBodyDraft>(
    () => ({
      mode: "raw",
      contentType:
        selectedRequest?.operation?.requestContentTypes[0] ??
        "application/json",
      value: formatBodyExample(selectedRequest?.operation?.requestExample),
      formDataRows: [],
      urlEncodedRows: [],
    }),
    [selectedRequest?.operation]
  )
  const defaultRequestDraft = React.useMemo<RequestDraft>(
    () => ({
      params: defaultParams,
      headers: defaultHeaders,
      body: defaultBody,
    }),
    [defaultParams, defaultHeaders, defaultBody]
  )
  const requestDraft: RequestDraft = selectedRequest
    ? (requestDrafts[selectedRequest.id] ??
      selectedRequest.customRequest?.draft ??
      defaultRequestDraft)
    : defaultRequestDraft
  const activeRequestTab = selectedRequest
    ? (requestTabByOperation[selectedRequest.id] ?? "Docs")
    : "Docs"
  const responseState = selectedRequest
    ? (responseStateByOperationId[selectedRequest.id] ?? idleResponseState)
    : idleResponseState
  const requestPreviewSnapshot = React.useMemo(() => {
    if (!selectedRequest || selectedRequest.transport === "websocket") {
      return undefined
    }

    const environment = activeEnvironment
      ? {
          id: activeEnvironment.id,
          name: activeEnvironment.name,
          baseUrl: activeEnvironment.baseUrl,
        }
      : null

    if (selectedRequest.mode === "sse") {
      const sseRequest = buildFetchRequest({
        baseUrl: fullRequestUrl,
        method: selectedRequest.method,
        draft: requestDraft,
        resolveVariables,
        environment,
      })
      sseRequest.requestSnapshot.mode = "sse"
      return sseRequest.requestSnapshot
    }

    return buildFetchRequest({
      baseUrl: fullRequestUrl,
      method: selectedRequest.method,
      draft: requestDraft,
      resolveVariables,
      environment,
    }).requestSnapshot
  }, [
    activeEnvironment,
    fullRequestUrl,
    requestDraft,
    resolveVariables,
    selectedRequest,
  ])
  const requestCurlCommand = requestPreviewSnapshot
    ? buildCurlCommand(requestPreviewSnapshot)
    : ""

  React.useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      try {
        const workspace = await getApiWorkspace()
        if (cancelled) {
          return
        }

        setCustomRequests(workspace.customRequests)
        const validRequestTabs = workspace.requestTabs.filter((tab) =>
          isKnownRequestId(tab.operationId, workspace.customRequests)
        )
        const persistedOperationIds = validRequestTabs.map(
          (tab) => tab.operationId
        )
        const nextOpenOperationIds = persistedOperationIds.length
          ? persistedOperationIds
          : [defaultOperation.id]
        const initialSelectedId =
          operationId && isKnownRequestId(operationId, workspace.customRequests)
            ? operationId
            : undefined

        setOpenOperationIds(
          initialSelectedId && !nextOpenOperationIds.includes(initialSelectedId)
            ? [...nextOpenOperationIds, initialSelectedId]
            : nextOpenOperationIds
        )
        setRequestDrafts(
          Object.fromEntries(
            validRequestTabs.map((tab) => [
              tab.operationId,
              {
                ...tab.draft,
                headers: restoreGeneratedHeaderTemplates(tab.draft.headers),
              },
            ])
          )
        )
        setRequestTabByOperation(
          Object.fromEntries(
            validRequestTabs.map((tab) => [tab.operationId, tab.requestTab])
          )
        )
        setSavedResponses(workspace.savedResponses)
        setResponsePanelHeight(
          clampResponsePanelHeight(workspace.responsePanelHeight)
        )
      } catch (error) {
        console.error("Failed to load API workspace from IndexedDB:", error)
      } finally {
        if (!cancelled) {
          setWorkspaceLoaded(true)
        }
      }
    }

    loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!selectedRequestId) {
      return
    }

    setRequestDrafts((drafts) =>
      drafts[selectedRequestId]
        ? drafts
        : {
            ...drafts,
            [selectedRequestId]:
              selectedRequestInitialDraft ?? defaultRequestDraft,
          }
    )
    setOpenOperationIds((operationIds) =>
      operationIds.includes(selectedRequestId)
        ? operationIds
        : [...operationIds, selectedRequestId]
    )
  }, [defaultRequestDraft, selectedRequestId, selectedRequestInitialDraft])

  React.useEffect(() => {
    if (!workspaceLoaded) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      openOperationIds.forEach((openOperationId, index) => {
        const draft = requestDrafts[openOperationId]
        if (!draft) {
          return
        }

        upsertRequestTab({
          data: {
            operationId: openOperationId,
            requestTab: requestTabByOperation[openOperationId] ?? "Docs",
            draft,
            position: index,
          },
        }).catch((error) =>
          console.error("Failed to persist request tab to IndexedDB:", error)
        )
      })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [workspaceLoaded, openOperationIds, requestDrafts, requestTabByOperation])

  React.useEffect(() => {
    return () => {
      activeStreamRef.current?.close()
    }
  }, [])

  const hasResponsePanel = responseState.status !== "idle"

  function selectOperation(
    nextOperationId: string,
    options: { savedResponse?: boolean } = {}
  ) {
    if (!options.savedResponse) {
      setSelectedSavedResponseId(null)
    }
    onOperationChange(nextOperationId)
  }

  function selectOverview() {
    onOperationChange(undefined)
  }

  async function handleCreateCustomRequest(input: {
    name: string
    method: RequestMethod
    transport: RequestTransport
    mode: RequestMode
    url: string
  }) {
    const draft = createEmptyRequestDraft()

    try {
      const request = await createCustomRequest({
        data: {
          ...input,
          collectionId: getProtocolCustomBucketId(input.transport),
          url: input.url || defaultUrlForRequest(input.transport, input.mode),
          draft,
          position: customRequests.filter(
            (item) => item.transport === input.transport
          ).length,
        },
      })
      setCustomRequests((requests) => [...requests, request])
      setRequestDrafts((drafts) => ({
        ...drafts,
        [getCustomRequestKey(request.id)]: draft,
      }))
      return request
    } catch (error) {
      console.error("Failed to create custom request:", error)
      return null
    }
  }

  function handleSelectCustomRequest(request: PersistedCustomRequest) {
    selectOperation(getCustomRequestKey(request.id))
  }

  async function handleDeleteCustomRequest(request: PersistedCustomRequest) {
    const requestKey = getCustomRequestKey(request.id)
    setCustomRequests((requests) =>
      requests.filter((item) => item.id !== request.id)
    )
    setRequestDrafts((drafts) => {
      const nextDrafts = { ...drafts }
      delete nextDrafts[requestKey]
      return nextDrafts
    })
    setOpenOperationIds((operationIds) =>
      operationIds.filter((id) => id !== requestKey)
    )
    if (selectedRequest?.id === requestKey) {
      selectOverview()
    }

    try {
      await Promise.all([
        deleteCustomRequest({ data: request.id }),
        deleteRequestTab({ data: requestKey }),
      ])
    } catch (error) {
      console.error("Failed to delete custom request:", error)
      setCustomRequests((requests) => [...requests, request])
    }
  }

  function handleUpdateCustomRequest(
    request: PersistedCustomRequest,
    updates: Partial<
      Pick<
        PersistedCustomRequest,
        "method" | "transport" | "mode" | "url" | "name"
      >
    >
  ) {
    const nextTransport = updates.transport ?? request.transport
    const normalizedRequest = normalizeRequestConfiguration({
      transport: nextTransport,
      mode: updates.mode ?? request.mode,
      method: updates.method ?? request.method,
    })
    const nextRequest: PersistedCustomRequest = {
      ...request,
      ...updates,
      ...normalizedRequest,
    }

    if (
      (request.transport !== nextRequest.transport ||
        request.mode !== nextRequest.mode) &&
      activeStreamRef.current?.id === getCustomRequestKey(request.id)
    ) {
      activeStreamRef.current.close()
      activeStreamRef.current = null
    }

    setCustomRequests((requests) =>
      requests.map((item) => (item.id === request.id ? nextRequest : item))
    )
    upsertCustomRequest({ data: nextRequest }).catch((error) =>
      console.error("Failed to update custom request:", error)
    )
  }

  function updateCurrentDraft(updater: (draft: RequestDraft) => RequestDraft) {
    if (!selectedRequest) {
      return
    }

    setRequestDrafts((drafts) => ({
      ...drafts,
      [selectedRequest.id]: updater(
        drafts[selectedRequest.id] ??
          selectedRequest.customRequest?.draft ??
          defaultRequestDraft
      ),
    }))
  }

  function handleRequestTabChange(nextTab: RequestTab) {
    if (!selectedRequest) {
      return
    }

    setRequestTabByOperation((tabs) => ({
      ...tabs,
      [selectedRequest.id]: nextTab,
    }))
  }

  function handleCloseOperation(closedOperationId: string) {
    const {
      openOperationIds: nextOperationIds,
      nextOperationId,
      shouldShowOverview,
    } = getRequestTabCloseResult({
      openOperationIds,
      activeOperationId: selectedRequest?.id,
      closedOperationId,
    })
    setOpenOperationIds(nextOperationIds)
    setRequestDrafts((drafts) => {
      const nextDrafts = { ...drafts }
      delete nextDrafts[closedOperationId]
      return nextDrafts
    })
    setRequestTabByOperation((tabs) => {
      const nextTabs = { ...tabs }
      delete nextTabs[closedOperationId]
      return nextTabs
    })
    setResponseStateByOperationId((states) => {
      const nextStates = { ...states }
      delete nextStates[closedOperationId]
      return nextStates
    })
    setRequestSnapshotByOperationId((snapshots) => {
      const nextSnapshots = { ...snapshots }
      delete nextSnapshots[closedOperationId]
      return nextSnapshots
    })
    deleteRequestTab({ data: closedOperationId }).catch((error) =>
      console.error("Failed to delete request tab from IndexedDB:", error)
    )

    closeActiveStream(activeStreamRef, closedOperationId)

    if (shouldShowOverview) {
      selectOverview()
    } else if (nextOperationId) {
      selectOperation(nextOperationId)
    }
  }

  async function handleSaveResponse(name: string) {
    if (!selectedRequest || responseState.status !== "success") {
      return
    }

    const requestSnapshot = requestSnapshotByOperationId[selectedRequest.id]
    if (!requestSnapshot) {
      return
    }

    setIsSavingResponse(true)
    try {
      const savedResponse = await saveResponse({
        data: {
          operationId: selectedRequest.id,
          method: selectedRequest.method,
          path: selectedRequest.displayPath,
          name,
          requestSnapshot,
          result: responseState.result,
        },
      })
      setSavedResponses((responses) => [savedResponse, ...responses])
      setSelectedSavedResponseId(savedResponse.id)
    } catch (error) {
      console.error("Failed to save response to IndexedDB:", error)
    } finally {
      setIsSavingResponse(false)
    }
  }

  async function handleDeleteSavedResponse(response: SavedResponseSummary) {
    setSavedResponses((responses) =>
      responses.filter((item) => item.id !== response.id)
    )
    if (selectedSavedResponseId === response.id) {
      setSelectedSavedResponseId(null)
      setResponseStateByOperationId((states) => {
        const nextStates = { ...states }
        delete nextStates[response.operationId]
        return nextStates
      })
    }

    try {
      await deleteSavedResponse({
        data: {
          id: response.id,
        },
      })
    } catch (error) {
      console.error("Failed to delete saved response from IndexedDB:", error)
      setSavedResponses((responses) => [response, ...responses])
    }
  }

  async function handleSelectSavedResponse(response: SavedResponseSummary) {
    const operation = apiOperations.find(
      (apiOperation) => apiOperation.id === response.operationId
    )
    const customRequest = response.operationId.startsWith("custom:")
      ? customRequests.find(
          (request) => getCustomRequestKey(request.id) === response.operationId
        )
      : undefined
    if (!operation && !customRequest) {
      return
    }

    try {
      const savedResponse = await getSavedResponse({ data: response.id })
      if (!savedResponse) {
        return
      }

      setOpenOperationIds((operationIds) =>
        operationIds.includes(response.operationId)
          ? operationIds
          : [...operationIds, response.operationId]
      )
      setSelectedSavedResponseId(response.id)
      setResponseStateByOperationId((states) => ({
        ...states,
        [response.operationId]: {
          status: "success",
          result: savedResponse.result,
        },
      }))
      const requestSnapshot = savedResponse.requestSnapshot
      if (requestSnapshot) {
        setRequestSnapshotByOperationId((snapshots) => ({
          ...snapshots,
          [response.operationId]: requestSnapshot,
        }))
        setRequestDrafts((drafts) => ({
          ...drafts,
          [response.operationId]: {
            ...requestDraftFromSnapshot(requestSnapshot),
            headers: restoreGeneratedHeaderTemplates(requestSnapshot.headers),
          },
        }))
      }
      selectOperation(response.operationId, { savedResponse: true })
    } catch (error) {
      console.error("Failed to load saved response from IndexedDB:", error)
    }
  }

  function handleResponsePanelHeightCommit(nextHeight: number) {
    const height = clampResponsePanelHeight(nextHeight)
    setResponsePanelHeight(height)
    saveWorkspaceSetting({
      data: {
        key: "response_panel_height",
        value: String(height),
      },
    }).catch((error) =>
      console.error("Failed to save response panel height to IndexedDB:", error)
    )
  }

  async function handleSend() {
    if (!selectedRequest) {
      return
    }

    const startedAt = performance.now()
    if (
      selectedRequest.transport === "http" &&
      selectedRequest.mode === "standard" &&
      requestDraft.body.mode === "binary" &&
      !requestDraft.body.binaryFile
    ) {
      setResponseStateByOperationId((states) => ({
        ...states,
        [selectedRequest.id]: {
          status: "error",
          error: "Choose a binary file before sending this request.",
          durationMs: 0,
        },
      }))
      return
    }

    activeStreamRef.current?.close()
    activeStreamRef.current = null
    setResponseStateByOperationId((states) => ({
      ...states,
      [selectedRequest.id]: { status: "loading", startedAt },
    }))
    setSelectedSavedResponseId(null)

    try {
      if (selectedRequest.transport === "websocket") {
        connectWebSocketRequest({
          request: selectedRequest,
          url: resolveVariables(fullRequestUrl),
          draft: requestDraft,
          startedAt,
          setRequestSnapshotByOperationId,
          setResponseStateByOperationId,
          activeStreamRef,
          environment: activeEnvironment
            ? {
                id: activeEnvironment.id,
                name: activeEnvironment.name,
                baseUrl: activeEnvironment.baseUrl,
              }
            : null,
        })
        return
      }

      if (selectedRequest.mode === "sse") {
        const sseRequest = buildFetchRequest({
          baseUrl: fullRequestUrl,
          method: selectedRequest.method,
          draft: requestDraft,
          resolveVariables,
          environment: activeEnvironment
            ? {
                id: activeEnvironment.id,
                name: activeEnvironment.name,
                baseUrl: activeEnvironment.baseUrl,
              }
            : null,
        })
        sseRequest.requestSnapshot.mode = "sse"

        connectSseRequest({
          request: selectedRequest,
          url: sseRequest.url,
          headers: sseRequest.headers,
          body: sseRequest.body,
          requestSnapshot: sseRequest.requestSnapshot,
          startedAt,
          setRequestSnapshotByOperationId,
          setResponseStateByOperationId,
          activeStreamRef,
        })
        return
      }

      const request = buildFetchRequest({
        baseUrl: fullRequestUrl,
        method: selectedRequest.method,
        draft: requestDraft,
        resolveVariables,
        environment: activeEnvironment
          ? {
              id: activeEnvironment.id,
              name: activeEnvironment.name,
              baseUrl: activeEnvironment.baseUrl,
            }
          : null,
      })
      setRequestSnapshotByOperationId((snapshots) => ({
        ...snapshots,
        [selectedRequest.id]: request.requestSnapshot,
      }))
      const response = await fetch(request.url, {
        method: selectedRequest.method,
        headers: request.headers,
        body: request.body,
      })
      const buffer = await response.arrayBuffer()
      const bodyText = new TextDecoder().decode(buffer)
      const headers = Array.from(response.headers.entries()).map(
        ([key, value]) => ({ key, value })
      )
      const durationMs = Math.round(performance.now() - startedAt)

      setResponseStateByOperationId((states) => ({
        ...states,
        [selectedRequest.id]: {
          status: "success",
          result: {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            durationMs,
            sizeBytes: buffer.byteLength,
            contentType: response.headers.get("content-type") ?? "",
            bodyText,
            headers,
            cookies: headers.filter((header) =>
              header.key.toLowerCase().includes("cookie")
            ),
            url: response.url,
          },
        },
      }))
    } catch (error) {
      setResponseStateByOperationId((states) => ({
        ...states,
        [selectedRequest.id]: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          durationMs: Math.round(performance.now() - startedAt),
        },
      }))
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        activePage="workspace"
        selectedOperationId={selectedOperation?.id ?? null}
        selectedRequestId={selectedRequest?.id ?? null}
        searchQuery={searchQuery}
        savedResponses={savedResponses}
        customRequests={customRequests}
        selectedSavedResponseId={selectedSavedResponseId}
        onSelectOverview={selectOverview}
        onSelectEnvironment={onSelectEnvironment}
        onSearchQueryChange={setSearchQuery}
        onSelectOperation={(operation) => {
          selectOperation(operation.id)
        }}
        onSelectSavedResponse={handleSelectSavedResponse}
        onDeleteSavedResponse={handleDeleteSavedResponse}
        onDeleteCustomRequest={handleDeleteCustomRequest}
        onCreateCustomRequest={handleCreateCustomRequest}
        onSelectCustomRequest={handleSelectCustomRequest}
      />
      <SidebarInset className="h-svh overflow-hidden bg-background text-foreground">
        <RequestTabStrip
          activeOperationId={selectedRequest?.id ?? ""}
          operations={openOperations}
          onSelectOperation={(request) => selectOperation(request.id)}
          onCloseOperation={handleCloseOperation}
        />
        <ScrollArea className="min-h-0 w-full flex-1">
          <main
            className="flex flex-col px-4 pt-5 pb-8 sm:px-8 sm:pt-6"
            style={
              hasResponsePanel
                ? { paddingBottom: responsePanelHeight + 64 }
                : undefined
            }
          >
            {selectedRequest ? (
              <RequestWorkspace
                request={selectedRequest}
                resolvedRequestUrl={
                  requestPreviewSnapshot?.url ?? fullRequestUrl
                }
                requestDraft={requestDraft}
                activeRequestTab={activeRequestTab}
                responseState={responseState}
                onSend={handleSend}
                onRequestTabChange={handleRequestTabChange}
                onUpdateDraft={updateCurrentDraft}
                onUpdateCustomRequest={handleUpdateCustomRequest}
                curlCommand={requestCurlCommand}
              />
            ) : (
              <ApiOverview />
            )}
          </main>
        </ScrollArea>
        {hasResponsePanel && selectedRequest ? (
          <ResponseBar
            response={responseState}
            height={responsePanelHeight}
            onHeightChange={(height) =>
              setResponsePanelHeight(clampResponsePanelHeight(height))
            }
            onHeightCommit={handleResponsePanelHeightCommit}
            onSaveResponse={handleSaveResponse}
            saveDefaultName={getDefaultSavedResponseName(
              selectedRequest,
              responseState
            )}
            saveDisabled={isSavingResponse}
            showSave={!selectedSavedResponseId}
            curlCommand={
              requestSnapshotByOperationId[selectedRequest.id]
                ? buildCurlCommand(
                    requestSnapshotByOperationId[selectedRequest.id]!
                  )
                : requestCurlCommand
            }
          />
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  )
}

function RequestWorkspace({
  request,
  resolvedRequestUrl,
  requestDraft,
  activeRequestTab,
  responseState,
  onSend,
  onRequestTabChange,
  onUpdateDraft,
  onUpdateCustomRequest,
  curlCommand,
}: {
  request: WorkspaceRequest
  resolvedRequestUrl: string
  requestDraft: RequestDraft
  activeRequestTab: RequestTab
  responseState: ResponseState
  onSend: () => void
  onRequestTabChange: (tab: RequestTab) => void
  onUpdateDraft: (updater: (draft: RequestDraft) => RequestDraft) => void
  onUpdateCustomRequest: (
    request: PersistedCustomRequest,
    updates: Partial<
      Pick<
        PersistedCustomRequest,
        "method" | "transport" | "mode" | "url" | "name"
      >
    >
  ) => void
  curlCommand?: string
}) {
  const visibleRequestTab = activeRequestTab

  return (
    <>
      <div className="mb-4 flex items-center gap-1 text-[13px] text-muted-foreground">
        <span className="truncate">{apiInfo.title}</span>
        <span>/</span>
        <span className="truncate">{request.tag}</span>
        <span>/</span>
        <span className="truncate font-normal text-foreground">
          {request.displayPath}
        </span>
        {request.operation?.hasAuth ? (
          <LockIcon className="size-4 text-muted-foreground" />
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12.5rem] sm:gap-1">
        <div className="flex h-10 min-w-0 overflow-hidden rounded-md border">
          {request.customRequest ? (
            <CustomRequestAddressBar
              request={request.customRequest}
              onUpdateCustomRequest={onUpdateCustomRequest}
            />
          ) : (
            <>
              <div className="flex p-1">
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-between rounded-sm px-4 text-left text-[13px] font-semibold",
                    request.mode === "sse"
                      ? "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                      : [
                          getMethodClassName(request.method),
                          getBgMethodClassName(request.method),
                        ]
                  )}
                >
                  {request.mode === "sse" ? "SSE" : request.method}
                </div>
              </div>

              <div className="flex h-full min-w-0 items-center truncate rounded-none border-0 bg-transparent px-4 text-[15px] text-foreground shadow-none">
                {resolvedRequestUrl}
              </div>
            </>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Button
            type="button"
            className="h-10 rounded-sm bg-primary text-sm font-normal"
            onClick={onSend}
            disabled={responseState.status === "loading"}
          >
            {responseState.status === "loading"
              ? request.transport === "websocket" || request.mode === "sse"
                ? "Connecting..."
                : "Sending..."
              : request.transport === "websocket" || request.mode === "sse"
                ? "Connect"
                : "Send"}
          </Button>
        </div>
      </div>

      {request.mode === "sse" ? (
        <div className="mt-3 rounded-md border border-border bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Fetch-based Server-Sent Events (SSE) support custom methods, headers, and request bodies.
        </div>
      ) : null}

      <Tabs
        value={visibleRequestTab}
        onValueChange={(value) => onRequestTabChange(value as RequestTab)}
        className="mt-4 flex w-full flex-col"
      >
        <TabsList className="max-w-full justify-start overflow-x-auto rounded-md border border-border bg-muted/50 p-1">
          {requestTabs.map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="shrink-0 rounded-sm"
            >
              <RequestTabLabel
                tab={tab}
                operation={request.operation}
                headers={requestDraft.headers}
              />
            </TabsTrigger>
          ))}
        </TabsList>
        {requestTabs.map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-1">
            <RequestTabContent
              activeTab={tab}
              operation={request.operation}
              requestId={request.id}
              params={requestDraft.params}
              onParamsChange={(params) =>
                onUpdateDraft((draft) => ({ ...draft, params }))
              }
              headers={requestDraft.headers}
              onHeadersChange={(headers) =>
                onUpdateDraft((draft) => ({ ...draft, headers }))
              }
              body={requestDraft.body}
              onBodyChange={(body) =>
                onUpdateDraft((draft) => ({ ...draft, body }))
              }
              curlCommand={curlCommand}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}

function CustomRequestAddressBar({
  request,
  onUpdateCustomRequest,
}: {
  request: PersistedCustomRequest
  onUpdateCustomRequest: (
    request: PersistedCustomRequest,
    updates: Partial<
      Pick<
        PersistedCustomRequest,
        "method" | "transport" | "mode" | "url" | "name"
      >
    >
  ) => void
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center">
      <Select
        value={request.transport}
        onValueChange={(value) =>
          onUpdateCustomRequest(request, {
            transport: value as RequestTransport,
          })
        }
      >
        <SelectTrigger
          aria-label="Request transport"
          className="h-full w-32 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 text-xs font-normal text-muted-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="http">HTTP</SelectItem>
          <SelectItem value="websocket">WebSocket</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={request.mode}
        onValueChange={(value: RequestMode) =>
          onUpdateCustomRequest(request, {
            mode: value,
          })
        }
        disabled={request.transport !== "http"}
      >
        <SelectTrigger
          aria-label="HTTP mode"
          className="h-full w-32 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 text-xs font-normal text-muted-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="standard">Standard</SelectItem>
          <SelectItem value="sse">SSE</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={request.method}
        onValueChange={(value) =>
          onUpdateCustomRequest(request, {
            method: value as RequestMethod,
          })
        }
        disabled={request.transport !== "http" || request.mode === "sse"}
      >
        <SelectTrigger
          aria-label="HTTP method"
          className={cn(
            "h-full w-28 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 text-xs font-normal shadow-none focus-visible:ring-0 dark:bg-transparent",
            getMethodClassName(request.method)
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
            (method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            )
          )}
        </SelectContent>
      </Select>
      <Input
        value={request.url}
        onChange={(event) =>
          onUpdateCustomRequest(request, { url: event.target.value })
        }
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 text-sm text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder={defaultUrlForRequest(request.transport, request.mode)}
        aria-label="Custom request URL"
      />
    </div>
  )
}

function ApiOverview() {
  const tags = new Set(apiOperations.map((operation) => operation.tag))

  return (
    <section className="flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground">
          OpenAPI {apiSpecVersion} / API {apiInfo.version}
        </div>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">
          {apiInfo.title}
        </h1>
        {apiInfo.description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {apiInfo.description}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <OverviewStat
          label="Endpoints"
          value={apiOperations.length}
          icon={ArrowLeftRightIcon}
        />
        <OverviewStat label="Tags" value={tags.size} icon={TagsIcon} />
        <OverviewStat
          label="Servers"
          value={apiServers.length}
          icon={ServerIcon}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Servers</h2>
        <div className="overflow-hidden rounded-sm border border-border">
          {apiServers.length > 0 ? (
            apiServers.map((server) => (
              <div
                key={server.url}
                className="border-b border-border px-4 py-3 font-mono text-sm last:border-b-0"
              >
                {server.url}
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No servers are defined in this specification.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function OverviewStat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: LucideIcon
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-foreground tabular-nums">
            {value}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{label}</div>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function toOperationWorkspaceRequest(
  operation: (typeof apiOperations)[number]
): WorkspaceRequest {
  return {
    id: operation.id,
    method: operation.method,
    displayPath: operation.displayPath,
    tag: operation.tag,
    summary: operation.summary,
    requestUrl: operation.requestUrl,
    transport: "http",
    mode: operation.requestMode,
    isOpenApi: true,
    hasEventStreamResponse: operation.hasEventStreamResponse,
    operation,
  }
}

function toCustomWorkspaceRequest(
  request: PersistedCustomRequest
): WorkspaceRequest {
  return {
    id: getCustomRequestKey(request.id),
    method: request.method,
    displayPath: request.name,
    tag: request.transport === "websocket" ? "WebSocket" : "HTTP",
    summary: request.name,
    requestUrl: request.url,
    transport: request.transport,
    mode: request.mode,
    isOpenApi: false,
    hasEventStreamResponse: request.mode === "sse",
    customRequest: request,
  }
}

function getCustomRequestKey(id: string) {
  return `custom:${id}`
}

function getProtocolCustomBucketId(transport: RequestTransport) {
  return `${transport}-custom`
}

function isKnownRequestId(
  id: string,
  customRequests: PersistedCustomRequest[]
) {
  return (
    apiOperations.some((operation) => operation.id === id) ||
    customRequests.some((request) => getCustomRequestKey(request.id) === id)
  )
}

function createEmptyRequestDraft(): RequestDraft {
  return {
    params: [],
    headers: [],
    body: {
      mode: "raw",
      contentType: "application/json",
      value: "",
      formDataRows: [],
      urlEncodedRows: [],
    },
  }
}

function defaultUrlForRequest(transport: RequestTransport, mode: RequestMode) {
  if (transport === "websocket") {
    return "wss://echo.websocket.events"
  }

  if (mode === "sse") {
    return "https://example.com/events"
  }

  return "https://api.example.com/resource"
}

function createStreamSnapshot({
  request,
  url,
  draft,
  environment,
}: {
  request: WorkspaceRequest
  url: string
  draft: RequestDraft
  environment: SavedRequestSnapshot["environment"]
}): SavedRequestSnapshot {
  return {
    method: "GET",
    transport: request.transport,
    mode: request.mode,
    url,
    params: draft.params,
    headers: draft.headers,
    body: draft.body,
    environment,
    sentAt: new Date().toISOString(),
  }
}

function createStreamResult({
  status,
  statusText,
  url,
  startedAt,
  bodyText,
}: {
  status: number
  statusText: string
  url: string
  startedAt: number
  bodyText: string
}) {
  return {
    status,
    statusText,
    ok: status >= 200 && status < 400,
    durationMs: Math.round(performance.now() - startedAt),
    sizeBytes: new Blob([bodyText]).size,
    contentType: "text/plain; charset=utf-8",
    bodyText,
    headers: [],
    cookies: [],
    url,
  }
}

function connectWebSocketRequest({
  request,
  url,
  draft,
  startedAt,
  setRequestSnapshotByOperationId,
  setResponseStateByOperationId,
  activeStreamRef,
  environment,
}: {
  request: WorkspaceRequest
  url: string
  draft: RequestDraft
  startedAt: number
  setRequestSnapshotByOperationId: React.Dispatch<
    React.SetStateAction<Partial<Record<string, SavedRequestSnapshot>>>
  >
  setResponseStateByOperationId: React.Dispatch<
    React.SetStateAction<ResponseStateMap>
  >
  activeStreamRef: { current: { id: string; close: () => void } | null }
  environment: SavedRequestSnapshot["environment"]
}) {
  const socket = new WebSocket(url)
  let bodyText = "[connecting] WebSocket connection started\n"

  activeStreamRef.current = {
    id: request.id,
    close: () => socket.close(),
  }
  setRequestSnapshotByOperationId((snapshots) => ({
    ...snapshots,
    [request.id]: createStreamSnapshot({ request, url, draft, environment }),
  }))

  socket.onopen = () => {
    bodyText += "[open] Connected\n"
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: createStreamResult({
          status: 101,
          statusText: "Switching Protocols",
          url,
          startedAt,
          bodyText,
        }),
      },
    }))
  }

  socket.onmessage = (event) => {
    bodyText += `[message] ${String(event.data)}\n`
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: createStreamResult({
          status: 101,
          statusText: "Streaming",
          url,
          startedAt,
          bodyText,
        }),
      },
    }))
  }

  socket.onerror = () => {
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "error",
        error: "WebSocket connection failed.",
        durationMs: Math.round(performance.now() - startedAt),
      },
    }))
  }

  socket.onclose = (event) => {
    bodyText += `[close] code=${event.code} reason=${event.reason || "none"}\n`
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: createStreamResult({
          status: event.wasClean ? 200 : 499,
          statusText: event.wasClean ? "Closed" : "Closed Unexpectedly",
          url,
          startedAt,
          bodyText,
        }),
      },
    }))
  }
}

function connectSseRequest({
  request,
  url,
  headers,
  body,
  requestSnapshot,
  startedAt,
  setRequestSnapshotByOperationId,
  setResponseStateByOperationId,
  activeStreamRef,
}: {
  request: WorkspaceRequest
  url: string
  headers: Headers
  body: BodyInit | undefined
  requestSnapshot: SavedRequestSnapshot
  startedAt: number
  setRequestSnapshotByOperationId: React.Dispatch<
    React.SetStateAction<Partial<Record<string, SavedRequestSnapshot>>>
  >
  setResponseStateByOperationId: React.Dispatch<
    React.SetStateAction<ResponseStateMap>
  >
  activeStreamRef: { current: { id: string; close: () => void } | null }
}) {
  let bodyText = `[connecting] SSE connection started. Method: ${requestSnapshot.method}\n`

  setRequestSnapshotByOperationId((snapshots) => ({
    ...snapshots,
    [request.id]: requestSnapshot,
  }))

  const updateStream = (status = 200, statusText = "Streaming") => {
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: createStreamResult({
          status,
          statusText,
          url,
          startedAt,
          bodyText,
        }),
      },
    }))
  }

  const headersRecord: Record<string, string> = {}
  headers.forEach((value, key) => {
    headersRecord[key] = value
  })

  const connection = openSseConnection({
    url,
    method: requestSnapshot.method,
    headers: headersRecord,
    body,
    onOpen: () => {
      bodyText += "[open] Connected\n"
      updateStream()
    },
    onMessage: (data) => {
      bodyText += `[event] ${data}\n`
      updateStream()
    },
    onError: (err) => {
      const errMsg = err instanceof Error ? err.message : String(err)
      bodyText += `[error] SSE connection failed: ${errMsg}\n`
      setResponseStateByOperationId((states) => ({
        ...states,
        [request.id]: {
          status: "error",
          error: errMsg,
          durationMs: Math.round(performance.now() - startedAt),
        },
      }))
    },
  })
  activeStreamRef.current = { id: request.id, close: connection.close }
}

function getDefaultSavedResponseName(
  request: WorkspaceRequest,
  responseState: ResponseState
) {
  const status =
    responseState.status === "success"
      ? ` - ${responseState.result.status}`
      : ""
  return `${request.method} ${request.displayPath}${status} ${new Date().toLocaleString()}`
}

function clampResponsePanelHeight(height: number) {
  const maxHeight =
    typeof window === "undefined" ? 720 : Math.round(window.innerHeight * 0.75)
  return Math.min(Math.max(height, 220), Math.max(maxHeight, 220))
}
