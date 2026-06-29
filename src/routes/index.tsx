import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEnvironment } from "@/components/environment-provider"
import { LockIcon } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { apiInfo, apiOperations } from "@/lib/openapi"
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
  KeyValueRow,
  RequestTab,
  RequestBodyDraft,
  RequestDraft,
  ResponseState,
  SavedResponseSummary,
} from "@/components/api-reference/types"
import {
  deleteRequestTab,
  deleteSavedResponse,
  getApiWorkspace,
  getSavedResponse,
  saveResponse,
  saveWorkspaceSetting,
  upsertRequestTab,
} from "@/lib/api-reference-actions"
import {
  getHeaderRows,
  getMethodClassName,
  getBgMethodClassName,
  formatBodyExample,
  parameterToRow,
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

type RequestDraftMap = Partial<Record<string, RequestDraft>>
type RequestTabMap = Partial<Record<string, RequestTab>>

function App() {
  const { operationId } = Route.useSearch()
  const navigate = useNavigate()
  const { activeEnvironment, resolveVariables } = useEnvironment()

  const [searchQuery, setSearchQuery] = React.useState("")
  const [requestOnly, setRequestOnly] = React.useState(false)
  const [openOperationIds, setOpenOperationIds] = React.useState<string[]>(
    () => [defaultOperation.id]
  )
  const [requestDrafts, setRequestDrafts] = React.useState<RequestDraftMap>({})
  const [requestTabByOperation, setRequestTabByOperation] =
    React.useState<RequestTabMap>({})
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
  const restoringSavedResponseOperationId = React.useRef<string | null>(null)
  const selectedOperationId = operationId || defaultOperation.id
  const selectedOperation =
    apiOperations.find((operation) => operation.id === selectedOperationId) ??
    defaultOperation
  const openOperations = React.useMemo(
    () =>
      openOperationIds.flatMap((openOperationId) => {
        const operation = apiOperations.find(
          (apiOperation) => apiOperation.id === openOperationId
        )

        return operation ? [operation] : []
      }),
    [openOperationIds]
  )

  const requestUrl = selectedOperation.requestUrl
  const resolvedBaseUrl = activeEnvironment ? activeEnvironment.baseUrl : ""
  const fullRequestUrl = resolvedBaseUrl
    ? `${resolvedBaseUrl.replace(/\/$/, "")}/${requestUrl.replace(/^\//, "")}`
    : requestUrl

  const rawHeaders = React.useMemo(
    () => getHeaderRows(selectedOperation),
    [selectedOperation]
  )

  const defaultParams = React.useMemo(
    () => [
      ...selectedOperation.pathParameters.map(parameterToRow),
      ...selectedOperation.queryParameters.map(parameterToRow),
    ],
    [selectedOperation]
  )

  const defaultHeaders = React.useMemo(() => {
    return rawHeaders.map((header) => ({
      ...header,
      value: resolveVariables(header.value),
    }))
  }, [rawHeaders, resolveVariables])

  const defaultBody = React.useMemo<RequestBodyDraft>(
    () => ({
      mode: "raw",
      contentType:
        selectedOperation.requestContentTypes[0] ?? "application/json",
      value: formatBodyExample(selectedOperation.requestExample),
    }),
    [selectedOperation]
  )
  const defaultRequestDraft = React.useMemo<RequestDraft>(
    () => ({
      params: defaultParams,
      headers: defaultHeaders,
      body: defaultBody,
    }),
    [defaultParams, defaultHeaders, defaultBody]
  )
  const requestDraft =
    requestDrafts[selectedOperation.id] ?? defaultRequestDraft
  const activeRequestTab = requestTabByOperation[selectedOperation.id] ?? "Docs"
  const selectedOperationSavedResponse = savedResponses.find(
    (response) => response.operationId === selectedOperation.id
  )
  const [responseState, setResponseState] = React.useState<ResponseState>({
    status: "idle",
  })

  React.useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      try {
        const workspace = await getApiWorkspace()
        if (cancelled) {
          return
        }

        const validRequestTabs = workspace.requestTabs.filter((tab) =>
          apiOperations.some((operation) => operation.id === tab.operationId)
        )
        const persistedOperationIds = validRequestTabs.map(
          (tab) => tab.operationId
        )
        const nextOpenOperationIds = persistedOperationIds.length
          ? persistedOperationIds
          : [defaultOperation.id]

        setOpenOperationIds(
          nextOpenOperationIds.includes(selectedOperation.id)
            ? nextOpenOperationIds
            : [...nextOpenOperationIds, selectedOperation.id]
        )
        setRequestDrafts(
          Object.fromEntries(
            validRequestTabs.map((tab) => [tab.operationId, tab.draft])
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
        console.error("Failed to load API workspace from SQLite:", error)
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
    setRequestDrafts((drafts) =>
      drafts[selectedOperation.id]
        ? drafts
        : { ...drafts, [selectedOperation.id]: defaultRequestDraft }
    )
    setOpenOperationIds((operationIds) =>
      operationIds.includes(selectedOperation.id)
        ? operationIds
        : [...operationIds, selectedOperation.id]
    )

    if (restoringSavedResponseOperationId.current === selectedOperation.id) {
      restoringSavedResponseOperationId.current = null
      return
    }

    setResponseState({ status: "idle" })
    setSelectedSavedResponseId(null)
  }, [selectedOperation.id, defaultRequestDraft])

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
          console.error("Failed to persist request tab to SQLite:", error)
        )
      })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [workspaceLoaded, openOperationIds, requestDrafts, requestTabByOperation])

  const hasResponsePanel = responseState.status !== "idle"

  function selectOperation(nextOperationId: string) {
    navigate({ to: "/", search: { operationId: nextOperationId } })
  }

  function updateCurrentDraft(updater: (draft: RequestDraft) => RequestDraft) {
    setRequestDrafts((drafts) => ({
      ...drafts,
      [selectedOperation.id]: updater(
        drafts[selectedOperation.id] ?? defaultRequestDraft
      ),
    }))
  }

  function handleRequestTabChange(nextTab: RequestTab) {
    setRequestTabByOperation((tabs) => ({
      ...tabs,
      [selectedOperation.id]: nextTab,
    }))
  }

  function handleCloseOperation(closedOperationId: string) {
    if (openOperationIds.length <= 1) {
      return
    }

    const closedIndex = openOperationIds.indexOf(closedOperationId)
    const nextOperationIds = openOperationIds.filter(
      (id) => id !== closedOperationId
    )
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
    deleteRequestTab({ data: closedOperationId }).catch((error) =>
      console.error("Failed to delete request tab from SQLite:", error)
    )

    if (closedOperationId === selectedOperation.id) {
      const nextSelectedId =
        nextOperationIds[Math.min(closedIndex, nextOperationIds.length - 1)] ??
        defaultOperation.id
      selectOperation(nextSelectedId)
    }
  }

  async function handleSaveResponse() {
    if (responseState.status !== "success") {
      return
    }

    const existingSavedResponse = savedResponses.find(
      (response) => response.operationId === selectedOperation.id
    )
    if (existingSavedResponse) {
      setSelectedSavedResponseId(existingSavedResponse.id)
      return
    }

    setIsSavingResponse(true)
    try {
      const savedResponse = await saveResponse({
        data: {
          operationId: selectedOperation.id,
          method: selectedOperation.method,
          path: selectedOperation.displayPath,
          name: `${selectedOperation.method} ${selectedOperation.displayPath}`,
          result: responseState.result,
        },
      })
      setSavedResponses((responses) =>
        mergeSavedResponse(responses, savedResponse)
      )
      setSelectedSavedResponseId(savedResponse.id)
    } catch (error) {
      console.error("Failed to save response to SQLite:", error)
    } finally {
      setIsSavingResponse(false)
    }
  }

  async function handleDeleteSavedResponse(response: SavedResponseSummary) {
    setSavedResponses((responses) =>
      responses.filter((item) => item.operationId !== response.operationId)
    )
    if (selectedSavedResponseId === response.id) {
      setSelectedSavedResponseId(null)
      setResponseState({ status: "idle" })
    }

    try {
      await deleteSavedResponse({
        data: {
          id: response.id,
          operationId: response.operationId,
        },
      })
    } catch (error) {
      console.error("Failed to delete saved response from SQLite:", error)
      setSavedResponses((responses) => mergeSavedResponse(responses, response))
    }
  }

  async function handleSelectSavedResponse(response: SavedResponseSummary) {
    const operation = apiOperations.find(
      (apiOperation) => apiOperation.id === response.operationId
    )
    if (!operation) {
      return
    }

    try {
      const savedResponse = await getSavedResponse({ data: response.id })
      if (!savedResponse) {
        return
      }

      restoringSavedResponseOperationId.current = response.operationId
      setOpenOperationIds((operationIds) =>
        operationIds.includes(response.operationId)
          ? operationIds
          : [...operationIds, response.operationId]
      )
      setSelectedSavedResponseId(response.id)
      setResponseState({ status: "success", result: savedResponse.result })
      selectOperation(response.operationId)
    } catch (error) {
      console.error("Failed to load saved response from SQLite:", error)
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
      console.error("Failed to save response panel height to SQLite:", error)
    )
  }

  async function handleSend() {
    const startedAt = performance.now()
    setResponseState({ status: "loading", startedAt })
    setSelectedSavedResponseId(null)

    try {
      const request = buildFetchRequest({
        baseUrl: fullRequestUrl,
        method: selectedOperation.method,
        draft: requestDraft,
        resolveVariables,
      })
      const response = await fetch(request.url, {
        method: selectedOperation.method,
        headers: request.headers,
        body: request.body,
      })
      const buffer = await response.arrayBuffer()
      const bodyText = new TextDecoder().decode(buffer)
      const headers = Array.from(response.headers.entries()).map(
        ([key, value]) => ({ key, value })
      )
      const durationMs = Math.round(performance.now() - startedAt)

      setResponseState({
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
      })
    } catch (error) {
      setResponseState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - startedAt),
      })
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        selectedOperationId={selectedOperation.id}
        searchQuery={searchQuery}
        requestOnly={requestOnly}
        savedResponses={savedResponses}
        selectedSavedResponseId={selectedSavedResponseId}
        onSearchQueryChange={setSearchQuery}
        onRequestOnlyChange={setRequestOnly}
        onSelectOperation={(operation) => {
          selectOperation(operation.id)
        }}
        onSelectSavedResponse={handleSelectSavedResponse}
        onDeleteSavedResponse={handleDeleteSavedResponse}
      />
      <SidebarInset className="h-svh overflow-hidden bg-background text-foreground">
        <RequestTabStrip
          activeOperationId={selectedOperation.id}
          operations={openOperations}
          onSelectOperation={(operation) => selectOperation(operation.id)}
          onCloseOperation={handleCloseOperation}
        />
        <ScrollArea className="min-h-0 w-full flex-1">
          <main
            className="flex flex-col px-8 pt-6 pb-8"
            style={
              hasResponsePanel
                ? { paddingBottom: responsePanelHeight + 64 }
                : undefined
            }
          >
            <div className="mb-4 flex items-center gap-1 text-[13px] text-muted-foreground">
              <span className="truncate">{apiInfo.title}</span>
              <span>/</span>
              <span className="truncate">{selectedOperation.tag}</span>
              <span>/</span>
              <span className="truncate font-normal text-foreground">
                {selectedOperation.displayPath}
              </span>
              {selectedOperation.hasAuth ? (
                <LockIcon className="size-4 text-muted-foreground" />
              ) : null}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_12.5rem] gap-1">
              <div className="flex h-10 min-w-0 overflow-hidden rounded-md border">
                <div className="flex p-1">
                  <div
                    className={cn(
                      "flex shrink-0 items-center justify-between rounded-sm px-4 text-left text-[13px] font-semibold",
                      getMethodClassName(selectedOperation.method),
                      getBgMethodClassName(selectedOperation.method)
                    )}
                  >
                    {selectedOperation.method}
                  </div>
                </div>

                <div className="flex h-full min-w-0 items-center truncate rounded-none border-0 bg-transparent px-4 text-[15px] text-foreground shadow-none">
                  {fullRequestUrl}
                </div>
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-3">
                <Button
                  type="button"
                  className="h-10 rounded-sm bg-primary text-sm font-normal"
                  onClick={handleSend}
                  disabled={responseState.status === "loading"}
                >
                  {responseState.status === "loading" ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>

            <Tabs
              value={activeRequestTab}
              onValueChange={(value) =>
                handleRequestTabChange(value as RequestTab)
              }
              className="mt-4 flex w-full flex-col"
            >
              <TabsList>
                {requestTabs.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    <RequestTabLabel
                      tab={tab}
                      operation={selectedOperation}
                      headers={requestDraft.headers}
                    />
                  </TabsTrigger>
                ))}
              </TabsList>
              {requestTabs.map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-1">
                  <RequestTabContent
                    activeTab={tab}
                    operation={selectedOperation}
                    params={requestDraft.params}
                    onParamsChange={(params) =>
                      updateCurrentDraft((draft) => ({ ...draft, params }))
                    }
                    headers={requestDraft.headers}
                    onHeadersChange={(headers) =>
                      updateCurrentDraft((draft) => ({ ...draft, headers }))
                    }
                    body={requestDraft.body}
                    onBodyChange={(body) =>
                      updateCurrentDraft((draft) => ({ ...draft, body }))
                    }
                  />
                </TabsContent>
              ))}
            </Tabs>
          </main>
        </ScrollArea>
        {hasResponsePanel ? (
          <ResponseBar
            response={responseState}
            height={responsePanelHeight}
            onHeightChange={(height) =>
              setResponsePanelHeight(clampResponsePanelHeight(height))
            }
            onHeightCommit={handleResponsePanelHeightCommit}
            onSaveResponse={handleSaveResponse}
            saveDisabled={isSavingResponse}
            isResponseSaved={Boolean(selectedOperationSavedResponse)}
          />
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  )
}

function buildFetchRequest({
  baseUrl,
  method,
  draft,
  resolveVariables,
}: {
  baseUrl: string
  method: string
  draft: RequestDraft
  resolveVariables: (text: string) => string
}) {
  const headers = new Headers()
  for (const header of draft.headers) {
    if (header.enabled === false || !header.key.trim()) continue
    headers.set(header.key.trim(), resolveVariables(header.value))
  }

  const url = buildRequestUrl(baseUrl, draft.params, resolveVariables)
  const canHaveBody = method !== "GET" && method !== "HEAD"
  const body =
    canHaveBody && draft.body.mode === "raw" && draft.body.value.trim()
      ? resolveVariables(draft.body.value)
      : undefined

  if (body && draft.body.contentType && !headers.has("content-type")) {
    headers.set("Content-Type", draft.body.contentType)
  }

  return { url, headers, body }
}

function buildRequestUrl(
  baseUrl: string,
  params: KeyValueRow[],
  resolveVariables: (text: string) => string
) {
  let url = resolveVariables(baseUrl)
  const queryParams = new URLSearchParams()

  for (const param of params) {
    const key = param.key.trim()
    if (!key || param.enabled === false) continue

    const value = resolveVariables(param.value)
    if (param.location === "path") {
      url = url
        .replaceAll(`{${key}}`, encodeURIComponent(value))
        .replaceAll(`:${key}`, encodeURIComponent(value))
    } else {
      queryParams.append(key, value)
    }
  }

  const urlObject = new URL(url, window.location.origin)
  queryParams.forEach((value, key) => urlObject.searchParams.append(key, value))

  return urlObject.toString()
}

function clampResponsePanelHeight(height: number) {
  const maxHeight =
    typeof window === "undefined" ? 720 : Math.round(window.innerHeight * 0.75)
  return Math.min(Math.max(height, 220), Math.max(maxHeight, 220))
}

function mergeSavedResponse(
  responses: SavedResponseSummary[],
  savedResponse: SavedResponseSummary
) {
  return [
    savedResponse,
    ...responses.filter(
      (response) => response.operationId !== savedResponse.operationId
    ),
  ]
}
