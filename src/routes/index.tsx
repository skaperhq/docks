import { AppSidebar } from "@/components/app-sidebar"
import { useEnvironment } from "@/components/environment-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  apiInfo,
  apiOperations,
  apiServers,
  apiSpecVersion,
} from "@/lib/openapi"
import { cn } from "@/lib/utils"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  LoaderCircleIcon,
  LockIcon,
  ServerIcon,
  Settings2Icon,
  TagsIcon,
} from "lucide-react"
import * as React from "react"

// Extracted components and utilities
import { CopyPageAction } from "@/components/api-reference/copy-page-action"
import {
  RequestTabContent,
  RequestTabLabel,
  requestTabs,
  websocketRequestTabs,
} from "@/components/api-reference/request-tab-content"
import { RequestTabStrip } from "@/components/api-reference/request-tab-strip"
import { ResponseBar } from "@/components/api-reference/response-bar"
import type {
  RequestBodyDraft,
  RequestDraft,
  RequestTab,
  ResponseState,
  SavedRequestSnapshot,
  SavedResponseSummary,
  ServerSentEvent,
  WebSocketConnectionStatus,
  WebSocketFrame,
} from "@/components/api-reference/types"
import {
  getBgMethodClassName,
  getHeaderRows,
  getMethodClassName,
  parameterToRow,
  restoreGeneratedHeaderTemplates,
} from "@/components/api-reference/utils"
import type {
  PersistedCollection,
  PersistedCustomRequest,
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "@/lib/api-reference-actions"
import {
  createCollectionWithRequests,
  createCustomRequest,
  deleteCollection,
  deleteCustomRequest,
  deleteRequestTab,
  deleteSavedResponse,
  getCachedApiSidebarWorkspace,
  getApiWorkspace,
  getSavedResponse,
  saveResponse,
  saveWorkspaceSetting,
  setCachedApiSidebarWorkspace,
  upsertCustomRequest,
  upsertRequestTab,
} from "@/lib/api-reference-actions"
import type {
  CreateRequestInput,
  ImportOpenApiInput,
} from "@/components/request-import-dialog"
import { buildFetchRequest } from "@/lib/api-request"
import {
  buildApiOverviewMarkdown,
  buildRequestPageMarkdown,
} from "@/lib/page-markdown"
import {
  createRelayWebSocket,
  getRelayedResponseCookies,
  getRelayedResponseUrl,
  docksFetch,
} from "@/lib/relay"
import {
  createOperationRequestBodyDraft,
  normalizeOperationRequestDraft,
} from "@/lib/request-body"
import { buildCurlCommand } from "@/lib/request-curl"
import { normalizeRequestConfiguration } from "@/lib/request-model"
import { requestDraftFromSnapshot } from "@/lib/request-snapshot"
import { getRequestTabCloseResult } from "@/lib/request-tabs"
import { closeActiveStream, openSseConnection } from "@/lib/sse/sse-request"

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      operationId:
        typeof search.operationId === "string" ? search.operationId : undefined,
    }
  },
  component: App,
})

const defaultOperation = apiOperations[0]
const DEFAULT_RESPONSE_PANEL_HEIGHT = 360
const preserveTemplateVariables = (value: string) => value
const idleResponseState: ResponseState = { status: "idle" }
const disconnectedWebSocketState: WebSocketConnectionStatus = "disconnected"

type RequestDraftMap = Partial<Record<string, RequestDraft>>
type RequestTabMap = Partial<Record<string, RequestTab>>
type ResponseStateMap = Partial<Record<string, ResponseState>>
type WebSocketConnectionStateMap = Partial<
  Record<string, WebSocketConnectionStatus>
>
type ActiveStream = {
  id: string
  close: () => void
  send?: (message: string) => boolean
  clear?: () => void
}
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
  const [initialSidebarWorkspace] = React.useState(() =>
    getCachedApiSidebarWorkspace()
  )

  const [openOperationIds, setOpenOperationIds] = React.useState<string[]>(
    () => [defaultOperation.id]
  )
  const [requestDrafts, setRequestDrafts] = React.useState<RequestDraftMap>({})
  const [requestTabByOperation, setRequestTabByOperation] =
    React.useState<RequestTabMap>({})
  const [customRequests, setCustomRequests] = React.useState<
    PersistedCustomRequest[]
  >(() => initialSidebarWorkspace?.customRequests ?? [])
  const [collections, setCollections] = React.useState<PersistedCollection[]>(
    () => initialSidebarWorkspace?.collections ?? []
  )
  const [savedResponses, setSavedResponses] = React.useState<
    SavedResponseSummary[]
  >(() => initialSidebarWorkspace?.savedResponses ?? [])
  const [selectedSavedResponseId, setSelectedSavedResponseId] = React.useState<
    string | null
  >(null)
  const [responsePanelHeight, setResponsePanelHeight] = React.useState(
    DEFAULT_RESPONSE_PANEL_HEIGHT
  )
  const [workspaceLoaded, setWorkspaceLoaded] = React.useState(false)
  const [isSavingResponse, setIsSavingResponse] = React.useState(false)
  const [loadingSavedResponseId, setLoadingSavedResponseId] = React.useState<
    string | null
  >(null)
  const [responseStateByOperationId, setResponseStateByOperationId] =
    React.useState<ResponseStateMap>({})
  const [
    webSocketConnectionStateByOperationId,
    setWebSocketConnectionStateByOperationId,
  ] = React.useState<WebSocketConnectionStateMap>({})
  const [requestSnapshotByOperationId, setRequestSnapshotByOperationId] =
    React.useState<Partial<Record<string, SavedRequestSnapshot>>>({})
  const activeStreamRef = React.useRef<ActiveStream | null>(null)
  const persistedRequestTabsRef = React.useRef(new Map<string, string>())
  const pendingRequestTabsRef = React.useRef(
    new Map<
      string,
      {
        fingerprint: string
        data: Parameters<typeof upsertRequestTab>[0]["data"]
      }
    >()
  )
  const savingRequestTabsRef = React.useRef(new Set<string>())
  const persistedCustomRequestsRef = React.useRef(new Map<string, string>())
  const pendingCustomRequestsRef = React.useRef(
    new Map<string, { fingerprint: string; request: PersistedCustomRequest }>()
  )
  const savingCustomRequestsRef = React.useRef(new Set<string>())
  const savedResponseLoadRef = React.useRef(0)
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
    () => createOperationRequestBodyDraft(selectedRequest?.operation),
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
  const websocketConnectionStatus = selectedRequest
    ? (webSocketConnectionStateByOperationId[selectedRequest.id] ??
      disconnectedWebSocketState)
    : disconnectedWebSocketState
  const requestPreviewSnapshot = React.useMemo(() => {
    if (!selectedRequest) {
      return undefined
    }

    const environment = activeEnvironment
      ? {
          id: activeEnvironment.id,
          name: activeEnvironment.name,
          baseUrl: activeEnvironment.baseUrl,
        }
      : null

    if (selectedRequest.transport === "websocket") {
      const wsRequest = buildFetchRequest({
        baseUrl: fullRequestUrl,
        method: selectedRequest.method,
        draft: requestDraft,
        resolveVariables,
        environment,
      })
      wsRequest.requestSnapshot.transport = "websocket"
      wsRequest.requestSnapshot.url = wsRequest.url
        .replace(/^http:/i, "ws:")
        .replace(/^https:/i, "wss:")
      return wsRequest.requestSnapshot
    }

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
  const literalRequestPreviewSnapshot = React.useMemo(() => {
    if (!selectedRequest) return undefined

    const environment = activeEnvironment
      ? {
          id: activeEnvironment.id,
          name: activeEnvironment.name,
          baseUrl: activeEnvironment.baseUrl,
        }
      : null
    const preview = buildFetchRequest({
      baseUrl: fullRequestUrl,
      method: selectedRequest.method,
      draft: requestDraft,
      resolveVariables: preserveTemplateVariables,
      environment,
    }).requestSnapshot

    if (selectedRequest.transport === "websocket") {
      preview.transport = "websocket"
      preview.url = preview.url
        .replace(/^http:/i, "ws:")
        .replace(/^https:/i, "wss:")
    } else if (selectedRequest.mode === "sse") {
      preview.mode = "sse"
    }

    return preview
  }, [activeEnvironment, fullRequestUrl, requestDraft, selectedRequest])
  const literalCurlCommand = literalRequestPreviewSnapshot
    ? buildCurlCommand(literalRequestPreviewSnapshot)
    : ""
  const requestPageMarkdown = React.useMemo(
    () =>
      selectedRequest
        ? buildRequestPageMarkdown({
            title: selectedRequest.summary,
            method: selectedRequest.method,
            displayPath: selectedRequest.displayPath,
            transport: selectedRequest.transport,
            mode: selectedRequest.mode,
            requestUrl: literalRequestPreviewSnapshot?.url ?? fullRequestUrl,
            draft: requestDraft,
            curlCommand: literalCurlCommand,
            operation: selectedRequest.operation,
            responseState,
          })
        : "",
    [
      fullRequestUrl,
      literalCurlCommand,
      literalRequestPreviewSnapshot?.url,
      requestDraft,
      responseState,
      selectedRequest,
    ]
  )

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
        const restoredDraftEntries = validRequestTabs.map((tab) => {
          const operation = apiOperations.find(
            (item) => item.id === tab.operationId
          )
          const draft = operation
            ? normalizeOperationRequestDraft(operation, tab.draft)
            : tab.draft

          return [
            tab.operationId,
            {
              ...draft,
              headers: restoreGeneratedHeaderTemplates(draft.headers),
            },
          ] as const
        })
        const restoredDrafts = Object.fromEntries(restoredDraftEntries)
        setRequestDrafts(restoredDrafts)
        persistedRequestTabsRef.current = new Map(
          validRequestTabs.map((tab, index) => [
            tab.operationId,
            requestTabFingerprint({
              operationId: tab.operationId,
              requestTab: tab.requestTab,
              draft: restoredDrafts[tab.operationId],
              position: index,
            }),
          ])
        )
        setRequestTabByOperation(
          Object.fromEntries(
            validRequestTabs.map((tab) => [tab.operationId, tab.requestTab])
          )
        )
        setSavedResponses(workspace.savedResponses)
        setCollections(workspace.collections)
        persistedCustomRequestsRef.current = new Map(
          workspace.customRequests.map((request) => [
            request.id,
            customRequestFingerprint(request),
          ])
        )
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

        const data = {
          operationId: openOperationId,
          requestTab: requestTabByOperation[openOperationId] ?? "Docs",
          draft,
          position: index,
        }
        const fingerprint = requestTabFingerprint(data)
        if (
          persistedRequestTabsRef.current.get(openOperationId) === fingerprint
        ) {
          return
        }
        pendingRequestTabsRef.current.set(openOperationId, {
          fingerprint,
          data,
        })
        void persistLatestRequestTab(openOperationId)
      })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [workspaceLoaded, openOperationIds, requestDrafts, requestTabByOperation])

  React.useEffect(() => {
    if (!workspaceLoaded) return

    const timeoutId = window.setTimeout(() => {
      for (const request of customRequests) {
        const fingerprint = customRequestFingerprint(request)
        if (
          persistedCustomRequestsRef.current.get(request.id) === fingerprint
        ) {
          continue
        }
        pendingCustomRequestsRef.current.set(request.id, {
          fingerprint,
          request,
        })
        void persistLatestCustomRequest(request.id)
      }
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [customRequests, workspaceLoaded])

  React.useEffect(() => {
    if (!workspaceLoaded) return
    setCachedApiSidebarWorkspace({
      collections,
      customRequests,
      savedResponses,
    })
  }, [collections, customRequests, savedResponses, workspaceLoaded])

  async function persistLatestRequestTab(requestId: string) {
    if (savingRequestTabsRef.current.has(requestId)) return
    savingRequestTabsRef.current.add(requestId)
    try {
      for (;;) {
        const pending = pendingRequestTabsRef.current.get(requestId)
        if (
          !pending ||
          persistedRequestTabsRef.current.get(requestId) === pending.fingerprint
        ) {
          return
        }
        await upsertRequestTab({ data: pending.data })
        persistedRequestTabsRef.current.set(requestId, pending.fingerprint)
      }
    } catch (error) {
      console.error("Failed to persist request tab:", error)
    } finally {
      savingRequestTabsRef.current.delete(requestId)
    }
  }

  async function persistLatestCustomRequest(requestId: string) {
    if (savingCustomRequestsRef.current.has(requestId)) return
    savingCustomRequestsRef.current.add(requestId)
    try {
      for (;;) {
        const pending = pendingCustomRequestsRef.current.get(requestId)
        if (
          !pending ||
          persistedCustomRequestsRef.current.get(requestId) ===
            pending.fingerprint
        ) {
          return
        }
        await upsertCustomRequest({ data: pending.request })
        persistedCustomRequestsRef.current.set(requestId, pending.fingerprint)
      }
    } catch (error) {
      console.error("Failed to update custom request:", error)
    } finally {
      savingCustomRequestsRef.current.delete(requestId)
    }
  }

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

  async function handleCreateCustomRequest(input: CreateRequestInput) {
    const draft = input.draft ?? createEmptyRequestDraft()

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
      persistedCustomRequestsRef.current.set(
        request.id,
        customRequestFingerprint(request)
      )
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

  async function handleImportOpenApi(input: ImportOpenApiInput) {
    try {
      const imported = await createCollectionWithRequests({
        data: {
          name: input.name,
          position: collections.length,
          requests: input.requests.map((request, position) => ({
            ...request,
            position,
          })),
        },
      })
      setCollections((items) => [...items, imported.collection])
      for (const request of imported.requests) {
        persistedCustomRequestsRef.current.set(
          request.id,
          customRequestFingerprint(request)
        )
      }
      setCustomRequests((requests) => [...requests, ...imported.requests])
      setRequestDrafts((drafts) => ({
        ...drafts,
        ...Object.fromEntries(
          imported.requests.map((request) => [
            getCustomRequestKey(request.id),
            request.draft,
          ])
        ),
      }))
      return imported.requests
    } catch (error) {
      console.error("Failed to import OpenAPI collection:", error)
      return null
    }
  }

  function handleSelectCustomRequest(request: PersistedCustomRequest) {
    selectOperation(getCustomRequestKey(request.id))
  }

  async function handleDeleteCustomRequest(request: PersistedCustomRequest) {
    const requestKey = getCustomRequestKey(request.id)
    persistedCustomRequestsRef.current.delete(request.id)
    pendingCustomRequestsRef.current.delete(request.id)
    persistedRequestTabsRef.current.delete(requestKey)
    pendingRequestTabsRef.current.delete(requestKey)
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

  async function handleDeleteCollection(collection: PersistedCollection) {
    const collectionRequests = customRequests.filter(
      (request) => request.collectionId === collection.id
    )
    const requestKeys = new Set(
      collectionRequests.map((request) => getCustomRequestKey(request.id))
    )

    for (const request of collectionRequests) {
      const requestKey = getCustomRequestKey(request.id)
      persistedCustomRequestsRef.current.delete(request.id)
      pendingCustomRequestsRef.current.delete(request.id)
      persistedRequestTabsRef.current.delete(requestKey)
      pendingRequestTabsRef.current.delete(requestKey)
    }

    setCollections((items) => items.filter((item) => item.id !== collection.id))
    setCustomRequests((requests) =>
      requests.filter((request) => request.collectionId !== collection.id)
    )
    setSavedResponses((responses) =>
      responses.filter((response) => !requestKeys.has(response.operationId))
    )
    setOpenOperationIds((operationIds) =>
      operationIds.filter((id) => !requestKeys.has(id))
    )
    setRequestDrafts((drafts) => omitRequestKeys(drafts, requestKeys))
    setRequestTabByOperation((tabs) => omitRequestKeys(tabs, requestKeys))
    setResponseStateByOperationId((states) =>
      omitRequestKeys(states, requestKeys)
    )
    setWebSocketConnectionStateByOperationId((states) =>
      omitRequestKeys(states, requestKeys)
    )
    setRequestSnapshotByOperationId((snapshots) =>
      omitRequestKeys(snapshots, requestKeys)
    )

    if (
      activeStreamRef.current &&
      requestKeys.has(activeStreamRef.current.id)
    ) {
      activeStreamRef.current.close()
      activeStreamRef.current = null
    }
    if (selectedRequest && requestKeys.has(selectedRequest.id)) {
      selectOverview()
    }

    try {
      await deleteCollection({ data: collection.id })
    } catch (error) {
      console.error("Failed to delete imported collection:", error)
      const workspace = await getApiWorkspace().catch(() => null)
      if (workspace) {
        setCollections(workspace.collections)
        setCustomRequests(workspace.customRequests)
        setSavedResponses(workspace.savedResponses)
      }
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
      setWebSocketConnectionStateByOperationId((states) => ({
        ...states,
        [getCustomRequestKey(request.id)]: "disconnected",
      }))
    }

    setCustomRequests((requests) =>
      requests.map((item) => (item.id === request.id ? nextRequest : item))
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
    persistedRequestTabsRef.current.delete(closedOperationId)
    pendingRequestTabsRef.current.delete(closedOperationId)
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
    setWebSocketConnectionStateByOperationId((states) => {
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

    const loadId = savedResponseLoadRef.current + 1
    savedResponseLoadRef.current = loadId
    setLoadingSavedResponseId(response.id)
    setOpenOperationIds((operationIds) =>
      operationIds.includes(response.operationId)
        ? operationIds
        : [...operationIds, response.operationId]
    )
    setSelectedSavedResponseId(response.id)
    selectOperation(response.operationId, { savedResponse: true })

    try {
      const savedResponse = await getSavedResponse({ data: response.id })
      if (!savedResponse || savedResponseLoadRef.current !== loadId) {
        return
      }
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
    } catch (error) {
      console.error("Failed to load saved response:", error)
    } finally {
      if (savedResponseLoadRef.current === loadId) {
        setLoadingSavedResponseId(null)
      }
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

    const previousStreamId = activeStreamRef.current?.id
    activeStreamRef.current?.close()
    activeStreamRef.current = null
    if (previousStreamId) {
      setWebSocketConnectionStateByOperationId((states) => ({
        ...states,
        [previousStreamId]: "disconnected",
      }))
    }
    setResponseStateByOperationId((states) => ({
      ...states,
      [selectedRequest.id]: { status: "loading", startedAt },
    }))
    setSelectedSavedResponseId(null)

    try {
      if (selectedRequest.transport === "websocket") {
        setWebSocketConnectionStateByOperationId((states) => ({
          ...states,
          [selectedRequest.id]: "connecting",
        }))
        const wsRequest = buildFetchRequest({
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

        connectWebSocketRequest({
          request: selectedRequest,
          url: wsRequest.url,
          headers: wsRequest.headers,
          draft: requestDraft,
          startedAt,
          setRequestSnapshotByOperationId,
          setResponseStateByOperationId,
          setWebSocketConnectionStateByOperationId,
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
      const response = await docksFetch(request.url, {
        method: selectedRequest.method,
        headers: request.headers,
        body: request.body,
      })
      const buffer = await response.arrayBuffer()
      const bodyText = new TextDecoder().decode(buffer)
      const headers = Array.from(response.headers.entries())
        .map(([key, value]) => ({ key, value }))
        .filter((header) => !header.key.startsWith("x-docks-relay-"))
      const relayedCookies = getRelayedResponseCookies(response)
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
            cookies:
              relayedCookies.length > 0
                ? relayedCookies
                : headers.filter((header) =>
                    header.key.toLowerCase().includes("cookie")
                  ),
            url: getRelayedResponseUrl(response, request.url),
          },
        },
      }))
    } catch (error) {
      if (selectedRequest.transport === "websocket") {
        setWebSocketConnectionStateByOperationId((states) => ({
          ...states,
          [selectedRequest.id]: "disconnected",
        }))
      }
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

  function handleDisconnectWebSocket() {
    if (
      !selectedRequest ||
      selectedRequest.transport !== "websocket" ||
      activeStreamRef.current?.id !== selectedRequest.id
    ) {
      return
    }

    setWebSocketConnectionStateByOperationId((states) => ({
      ...states,
      [selectedRequest.id]: "disconnected",
    }))
    activeStreamRef.current.close()
  }

  function handleClearSseEvents() {
    if (!selectedRequest || selectedRequest.mode !== "sse") {
      return
    }

    if (activeStreamRef.current?.id === selectedRequest.id) {
      activeStreamRef.current.clear?.()
      return
    }

    setResponseStateByOperationId((states) => {
      const currentState = states[selectedRequest.id]
      if (currentState?.status !== "success") {
        return states
      }

      return {
        ...states,
        [selectedRequest.id]: {
          ...currentState,
          result: {
            ...currentState.result,
            sseEvents: [],
          },
        },
      }
    })
  }

  function handleSendWebSocketMessage() {
    if (
      !selectedRequest ||
      selectedRequest.transport !== "websocket" ||
      activeStreamRef.current?.id !== selectedRequest.id
    ) {
      return
    }

    const message = resolveVariables(requestDraft.body.value)
    if (!message || !activeStreamRef.current.send?.(message)) {
      return
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        activePage="workspace"
        selectedOperationId={selectedOperation?.id ?? null}
        selectedRequestId={selectedRequest?.id ?? null}
        savedResponses={savedResponses}
        collections={collections}
        customRequests={customRequests}
        selectedSavedResponseId={selectedSavedResponseId}
        loadingSavedResponseId={loadingSavedResponseId}
        onSelectOverview={selectOverview}
        onSelectEnvironment={onSelectEnvironment}
        onSelectOperation={(operation) => {
          selectOperation(operation.id)
        }}
        onSelectSavedResponse={handleSelectSavedResponse}
        onDeleteSavedResponse={handleDeleteSavedResponse}
        onDeleteCustomRequest={handleDeleteCustomRequest}
        onDeleteCollection={handleDeleteCollection}
        onCreateCustomRequest={handleCreateCustomRequest}
        onImportOpenApi={handleImportOpenApi}
        onSelectCustomRequest={handleSelectCustomRequest}
      />
      <SidebarInset className="h-svh min-w-0 overflow-hidden bg-background text-foreground">
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
                websocketConnectionStatus={websocketConnectionStatus}
                onSend={handleSend}
                onDisconnectWebSocket={handleDisconnectWebSocket}
                onSendWebSocketMessage={handleSendWebSocketMessage}
                onRequestTabChange={handleRequestTabChange}
                onUpdateDraft={updateCurrentDraft}
                onUpdateCustomRequest={handleUpdateCustomRequest}
                curlCommand={requestCurlCommand}
                pageMarkdown={requestPageMarkdown}
              />
            ) : (
              <ApiOverview
                savedResponses={savedResponses}
                loadingSavedResponseId={loadingSavedResponseId}
                onSelectSavedResponse={handleSelectSavedResponse}
                onSelectEnvironment={onSelectEnvironment}
                onSelectOperation={(selectedOperationId) =>
                  selectOperation(selectedOperationId)
                }
              />
            )}
          </main>
        </ScrollArea>
        {hasResponsePanel && selectedRequest ? (
          <ResponseBar
            response={responseState}
            transport={selectedRequest.transport}
            mode={selectedRequest.mode}
            height={responsePanelHeight}
            onHeightChange={(height) =>
              setResponsePanelHeight(clampResponsePanelHeight(height))
            }
            onHeightCommit={handleResponsePanelHeightCommit}
            onSaveResponse={handleSaveResponse}
            onClearSseEvents={handleClearSseEvents}
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
  websocketConnectionStatus,
  onSend,
  onDisconnectWebSocket,
  onSendWebSocketMessage,
  onRequestTabChange,
  onUpdateDraft,
  onUpdateCustomRequest,
  curlCommand,
  pageMarkdown,
}: {
  request: WorkspaceRequest
  resolvedRequestUrl: string
  requestDraft: RequestDraft
  activeRequestTab: RequestTab
  responseState: ResponseState
  websocketConnectionStatus: WebSocketConnectionStatus
  onSend: () => void
  onDisconnectWebSocket: () => void
  onSendWebSocketMessage: () => void
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
  pageMarkdown: string
}) {
  const isWebSocket = request.transport === "websocket"
  const visibleRequestTabs = isWebSocket ? websocketRequestTabs : requestTabs
  const visibleRequestTab = isWebSocket
    ? activeRequestTab === "Body" ||
      !visibleRequestTabs.includes(activeRequestTab)
      ? "Message"
      : activeRequestTab
    : activeRequestTab === "Message" ||
        !visibleRequestTabs.includes(activeRequestTab)
      ? "Body"
      : activeRequestTab
  const isWebSocketConnecting =
    isWebSocket && websocketConnectionStatus === "connecting"
  const isWebSocketConnected =
    isWebSocket && websocketConnectionStatus === "connected"
  const isRequestLoading = !isWebSocket && responseState.status === "loading"

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
          <span className="truncate border border-border px-1 font-mono uppercase">
            {apiInfo.title}
          </span>
          <span className="truncate border border-border px-1 font-mono uppercase">
            {request.tag}
          </span>
          <span className="truncate border border-border px-1">
            {request.displayPath}
          </span>
          {request.operation?.hasAuth ? (
            <LockIcon className="size-4 text-muted-foreground" />
          ) : null}
        </div>
        <CopyPageAction markdown={pageMarkdown} title={request.summary} />
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem] sm:gap-1">
        <div className="flex h-9 min-w-0 overflow-hidden rounded-none border">
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
                    "flex shrink-0 items-center justify-between rounded-none px-4 text-left font-mono text-[13px] font-semibold",
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
            className="h-9 rounded-none border border-primary bg-primary font-mono text-sm font-normal uppercase"
            onClick={isWebSocketConnected ? onDisconnectWebSocket : onSend}
            disabled={isWebSocketConnecting || isRequestLoading}
            aria-label={
              isWebSocketConnected ? "Disconnect WebSocket" : undefined
            }
          >
            {isWebSocketConnected ? (
              <>
                <span className="group-hover/button:hidden">Connected</span>
                <span className="hidden group-hover/button:inline">
                  Disconnect
                </span>
              </>
            ) : isWebSocketConnecting ? (
              "Connecting..."
            ) : responseState.status === "loading" ? (
              request.mode === "sse" ? (
                "Connecting..."
              ) : (
                "Sending..."
              )
            ) : isWebSocket || request.mode === "sse" ? (
              "Connect"
            ) : (
              "Send"
            )}
          </Button>
        </div>
      </div>

      {request.mode === "sse" ? (
        <div className="mt-3 rounded-md border border-border bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Fetch-based Server-Sent Events (SSE) support custom methods, headers,
          and request bodies.
        </div>
      ) : null}

      <Tabs
        value={visibleRequestTab}
        onValueChange={(value) => onRequestTabChange(value as RequestTab)}
        className="mt-4 flex w-full flex-col"
      >
        <TabsList className="max-w-full justify-start overflow-x-auto rounded-none border border-border bg-muted/50 p-1">
          {visibleRequestTabs.map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="shrink-0 rounded-none"
            >
              <RequestTabLabel
                tab={tab}
                operation={request.operation}
                headers={requestDraft.headers}
                websocketConnectionStatus={websocketConnectionStatus}
              />
            </TabsTrigger>
          ))}
        </TabsList>
        {visibleRequestTabs.map((tab) => (
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
              websocketConnectionStatus={websocketConnectionStatus}
              onSendWebSocketMessage={onSendWebSocketMessage}
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
          className="h-full w-22 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 font-mono text-xs font-medium text-muted-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Transport</SelectLabel>
            <SelectItem value="http">HTTP</SelectItem>
            <SelectItem value="websocket">WS</SelectItem>
          </SelectGroup>
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
          className="h-full w-28 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 font-mono text-xs font-medium text-muted-foreground uppercase shadow-none focus-visible:ring-0 dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>HTTP Mode</SelectLabel>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="sse">SSE</SelectItem>
          </SelectGroup>
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
            "h-full w-22 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 font-mono text-xs font-medium uppercase shadow-none focus-visible:ring-0 dark:bg-transparent",
            getMethodClassName(request.method)
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>HTTP Method</SelectLabel>
            {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
              (method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              )
            )}
          </SelectGroup>
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

function ApiOverview({
  savedResponses,
  loadingSavedResponseId,
  onSelectSavedResponse,
  onSelectEnvironment,
}: {
  savedResponses: SavedResponseSummary[]
  loadingSavedResponseId?: string | null
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onSelectEnvironment: () => void
  onSelectOperation: (operationId: string) => void
}) {
  const tags = new Set(apiOperations.map((operation) => operation.tag))
  const overviewMarkdown = React.useMemo(buildApiOverviewMarkdown, [])

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col">
      <header className="flex flex-col gap-6 py-5 sm:py-7">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-none border-[0.5px] border-foreground bg-black font-mono font-medium text-white"
              >
                V{apiInfo.version}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-none border border-foreground bg-white font-mono font-medium text-black"
              >
                OPENAPI {apiSpecVersion}
              </Badge>
            </div>
            <h1 className="font-mono text-3xl font-medium tracking-tight text-foreground uppercase">
              {apiInfo.title}
            </h1>
            {apiInfo.description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {apiInfo.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onSelectEnvironment}
              className="rounded-none font-mono uppercase"
            >
              <Settings2Icon data-icon="inline-start" />
              Environment
            </Button>
            <CopyPageAction markdown={overviewMarkdown} title={apiInfo.title} />
          </div>
        </div>
      </header>

      <Separator />

      <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-mono text-lg font-medium text-foreground uppercase">
                API surface
              </h2>
              <p className="text-sm text-muted-foreground">
                A live summary generated from this OpenAPI document.
              </p>
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
          </section>
        </div>
      </div>

      <Separator />

      <section className="flex flex-col gap-5 py-8">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-mono text-base font-medium text-foreground uppercase">
              Saved responses
            </h2>
            <p className="text-sm text-muted-foreground">
              Responses saved from previous requests.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-none border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Response</TableHead>
                <TableHead className="w-50">Endpoint</TableHead>
                <TableHead className="w-20">Method</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-24">Duration</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead className="w-32">Saved</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedResponses.length > 0 ? (
                savedResponses.map((response) => (
                  <TableRow key={response.id}>
                    <TableCell className="max-w-44 truncate font-normal text-foreground">
                      {response.name}
                    </TableCell>
                    <TableCell className="max-w-20">
                      <p className="truncate text-muted-foreground">
                        {response.path}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p
                        className={cn(
                          getMethodClassName(response.method),
                          getBgMethodClassName(response.method),
                          "w-fit rounded-none px-2 py-0.5 text-center text-xs font-semibold uppercase"
                        )}
                      >
                        {response.method}
                      </p>
                    </TableCell>

                    <TableCell>
                      <span
                        className={cn(
                          "font-mono text-xs font-normal tabular-nums",
                          response.ok ? "text-foreground" : "text-destructive"
                        )}
                      >
                        {response.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {Math.round(response.durationMs)} ms
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatSavedResponseSize(response.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSavedResponseDate(response.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open saved response ${response.name}`}
                        onClick={() => onSelectSavedResponse(response)}
                        disabled={loadingSavedResponseId === response.id}
                      >
                        {loadingSavedResponseId === response.id ? (
                          <LoaderCircleIcon className="animate-spin" />
                        ) : (
                          <ArrowRightIcon data-icon="inline-end" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No saved responses yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </section>
  )
}

function formatSavedResponseDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatSavedResponseSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kilobytes = bytes / 1024
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`
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
    <Card size="sm" className="rounded-none bg-background">
      <CardHeader>
        <CardDescription className="font-mono uppercase">
          {label}
        </CardDescription>
        <CardTitle className="tabular-nums">{value}</CardTitle>
        <CardAction>
          <Icon
            className="text-foreground"
            aria-hidden="true"
            strokeWidth={1.2}
          />
        </CardAction>
      </CardHeader>
    </Card>
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
    transport: operation.method === "WS" ? "websocket" : "http",
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

function omitRequestKeys<T>(
  record: Partial<Record<string, T>>,
  requestKeys: Set<string>
) {
  const nextRecord = { ...record }
  for (const requestKey of requestKeys) {
    delete nextRecord[requestKey]
  }
  return nextRecord
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
    method: request.method,
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
  websocketFrames,
}: {
  status: number
  statusText: string
  url: string
  startedAt: number
  bodyText: string
  websocketFrames?: WebSocketFrame[]
}) {
  return {
    status,
    statusText,
    ok: status === 101 || (status >= 200 && status < 400),
    durationMs: Math.round(performance.now() - startedAt),
    sizeBytes: new Blob([bodyText]).size,
    contentType: "text/plain; charset=utf-8",
    bodyText,
    headers: [],
    cookies: [],
    url,
    websocketFrames,
  }
}

function connectWebSocketRequest({
  request,
  url,
  headers,
  draft,
  startedAt,
  setRequestSnapshotByOperationId,
  setResponseStateByOperationId,
  setWebSocketConnectionStateByOperationId,
  activeStreamRef,
  environment,
}: {
  request: WorkspaceRequest
  url: string
  headers: Headers
  draft: RequestDraft
  startedAt: number
  setRequestSnapshotByOperationId: React.Dispatch<
    React.SetStateAction<Partial<Record<string, SavedRequestSnapshot>>>
  >
  setResponseStateByOperationId: React.Dispatch<
    React.SetStateAction<ResponseStateMap>
  >
  setWebSocketConnectionStateByOperationId: React.Dispatch<
    React.SetStateAction<WebSocketConnectionStateMap>
  >
  activeStreamRef: { current: ActiveStream | null }
  environment: SavedRequestSnapshot["environment"]
}) {
  const wsUrl = url.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
  const relaySocket = createRelayWebSocket(wsUrl, headers)
  const socket = relaySocket.socket
  socket.binaryType = "arraybuffer"
  let connectionReady = false
  let terminalError = false
  let bodyText = "[connecting] WebSocket connection started\n"
  let frames: WebSocketFrame[] = []
  let frameSequence = 0

  const publishResult = (status: number, statusText: string) => {
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: createStreamResult({
          status,
          statusText,
          url: wsUrl,
          startedAt,
          bodyText,
          websocketFrames: frames,
        }),
      },
    }))
  }

  const appendFrame = (
    direction: WebSocketFrame["direction"],
    data: string
  ) => {
    const timestamp = Date.now()
    frameSequence += 1
    frames = [
      ...frames,
      {
        id: `${timestamp}-${frameSequence}`,
        direction,
        data,
        sizeBytes: new TextEncoder().encode(data).byteLength,
        timestamp,
      },
    ]
  }

  const stream: ActiveStream = {
    id: request.id,
    close: () => socket.close(),
    send: (message) => {
      if (socket.readyState !== WebSocket.OPEN || !connectionReady) {
        return false
      }

      socket.send(message)
      bodyText += `[sent] ${message}\n`
      appendFrame("outgoing", message)
      publishResult(101, "Connected")
      return true
    },
  }
  activeStreamRef.current = stream
  setRequestSnapshotByOperationId((snapshots) => ({
    ...snapshots,
    [request.id]: createStreamSnapshot({
      request,
      url: wsUrl,
      draft,
      environment,
    }),
  }))

  const markConnected = () => {
    if (activeStreamRef.current !== stream) {
      socket.close()
      return
    }

    connectionReady = true
    bodyText += "[open] Connected\n"
    setWebSocketConnectionStateByOperationId((states) => ({
      ...states,
      [request.id]: "connected",
    }))
    publishResult(101, "Connected")
  }

  socket.onopen = () => {
    if (relaySocket.waitsForRelay) {
      relaySocket.beginRelayHandshake()
      return
    }
    markConnected()
  }

  socket.onmessage = async (event) => {
    if (relaySocket.waitsForRelay && !connectionReady) {
      const control = relaySocket.isRelayControlMessage(event.data)
      if (control === "ready") {
        markConnected()
      } else if (control === "error") {
        terminalError = true
        setResponseStateByOperationId((states) => ({
          ...states,
          [request.id]: {
            status: "error",
            error: relaySocket.relayError(),
            durationMs: Math.round(performance.now() - startedAt),
          },
        }))
        socket.close()
      }
      return
    }

    const message = await webSocketMessageToText(event.data)
    if (activeStreamRef.current !== stream) {
      return
    }

    bodyText += `[message] ${message}\n`
    appendFrame("incoming", message)
    publishResult(101, "Connected")
  }

  socket.onerror = () => {
    if (activeStreamRef.current !== stream) {
      return
    }

    terminalError = true
    setWebSocketConnectionStateByOperationId((states) => ({
      ...states,
      [request.id]: "disconnected",
    }))
    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "error",
        error: relaySocket.waitsForRelay
          ? relaySocket.relayError()
          : "WebSocket connection failed.",
        durationMs: Math.round(performance.now() - startedAt),
      },
    }))
  }

  socket.onclose = (event) => {
    if (activeStreamRef.current !== stream) {
      return
    }

    bodyText += `[close] code=${event.code} reason=${event.reason || "none"}\n`
    activeStreamRef.current = null
    setWebSocketConnectionStateByOperationId((states) => ({
      ...states,
      [request.id]: "disconnected",
    }))
    if (terminalError) return
    publishResult(
      event.wasClean ? 200 : 499,
      event.wasClean ? "Disconnected" : "Disconnected Unexpectedly"
    )
  }
}

async function webSocketMessageToText(data: unknown) {
  if (typeof data === "string") {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data)
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.text()
  }

  return String(data)
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
  activeStreamRef: { current: ActiveStream | null }
}) {
  let bodyText = ""
  let sizeBytes = 0
  let sequence = 0
  let sseEvents: ServerSentEvent[] = []
  let responseMetadata:
    | {
        status: number
        statusText: string
        ok: boolean
        contentType: string
        headers: { key: string; value: string }[]
        cookies: { key: string; value: string }[]
        url: string
      }
    | undefined
  setRequestSnapshotByOperationId((snapshots) => ({
    ...snapshots,
    [request.id]: requestSnapshot,
  }))

  const updateStream = (statusText = "Streaming") => {
    const metadata = responseMetadata
    if (!metadata) {
      return
    }

    setResponseStateByOperationId((states) => ({
      ...states,
      [request.id]: {
        status: "success",
        result: {
          ...metadata,
          statusText,
          durationMs: Math.round(performance.now() - startedAt),
          sizeBytes,
          bodyText,
          sseEvents,
        },
      },
    }))
  }

  const headersRecord: Record<string, string> = {}
  headers.forEach((value, key) => {
    headersRecord[key] = value
  })

  const stream: ActiveStream = {
    id: request.id,
    close: () => connection.close(),
    clear: () => {
      sseEvents = []
      updateStream()
    },
  }

  const connection = openSseConnection({
    url,
    method: requestSnapshot.method,
    headers: headersRecord,
    body,
    onOpen: (response) => {
      if (activeStreamRef.current !== stream) {
        connection.close()
        return
      }

      const responseHeaders = Array.from(response.headers.entries())
        .map(([key, value]) => ({ key, value }))
        .filter((header) => !header.key.startsWith("x-docks-relay-"))
      const relayedCookies = getRelayedResponseCookies(response)
      responseMetadata = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get("content-type") ?? "",
        headers: responseHeaders,
        cookies:
          relayedCookies.length > 0
            ? relayedCookies
            : responseHeaders.filter((header) =>
                header.key.toLowerCase().includes("cookie")
              ),
        url: getRelayedResponseUrl(response, url),
      }
      updateStream()
    },
    onChunk: (text, byteLength) => {
      if (activeStreamRef.current !== stream) {
        return
      }

      bodyText += text
      sizeBytes += byteLength
      updateStream()
    },
    onEvent: (event) => {
      if (activeStreamRef.current !== stream) {
        return
      }

      sequence += 1
      sseEvents = [
        ...sseEvents,
        {
          sequence,
          eventId: event.eventId,
          eventName: event.eventName,
          data: event.data,
          receivedAt: Date.now(),
        },
      ]
      updateStream()
    },
    onComplete: () => {
      if (activeStreamRef.current !== stream) {
        return
      }

      activeStreamRef.current = null
      updateStream("Complete")
    },
    onError: (err) => {
      if (activeStreamRef.current !== stream) {
        return
      }

      activeStreamRef.current = null
      const errMsg = err instanceof Error ? err.message : String(err)
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
  activeStreamRef.current = stream
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

function requestTabFingerprint(
  data: Parameters<typeof upsertRequestTab>[0]["data"]
) {
  return JSON.stringify(data)
}

function customRequestFingerprint(request: PersistedCustomRequest) {
  return JSON.stringify(request)
}

function clampResponsePanelHeight(height: number) {
  const maxHeight =
    typeof window === "undefined" ? 720 : Math.round(window.innerHeight * 0.75)
  return Math.min(Math.max(height, 220), Math.max(maxHeight, 220))
}
