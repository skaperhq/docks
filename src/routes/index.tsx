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
  RequestBodyDraft,
  RequestDraft,
  ResponseState,
} from "@/components/api-reference/types"
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

function App() {
  const { operationId } = Route.useSearch()
  const navigate = useNavigate()
  const { activeEnvironment, resolveVariables } = useEnvironment()

  const [searchQuery, setSearchQuery] = React.useState("")
  const [requestOnly, setRequestOnly] = React.useState(false)
  const selectedOperationId = operationId || defaultOperation.id
  const selectedOperation =
    apiOperations.find((operation) => operation.id === selectedOperationId) ??
    defaultOperation

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
      contentType: selectedOperation.requestContentTypes[0] ?? "application/json",
      value: formatBodyExample(selectedOperation.requestExample),
    }),
    [selectedOperation]
  )

  const [requestDraft, setRequestDraft] = React.useState<RequestDraft>(() => ({
    params: defaultParams,
    headers: defaultHeaders,
    body: defaultBody,
  }))
  const [responseState, setResponseState] = React.useState<ResponseState>({
    status: "idle",
  })

  React.useEffect(() => {
    setRequestDraft({
      params: defaultParams,
      headers: defaultHeaders,
      body: defaultBody,
    })
    setResponseState({ status: "idle" })
  }, [
    selectedOperation.id,
    activeEnvironment?.id,
    defaultParams,
    defaultHeaders,
    defaultBody,
  ])

  async function handleSend() {
    const startedAt = performance.now()
    setResponseState({ status: "loading", startedAt })

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
        onSearchQueryChange={setSearchQuery}
        onRequestOnlyChange={setRequestOnly}
        onSelectOperation={(operation) => {
          navigate({ to: "/", search: { operationId: operation.id } })
        }}
      />
      <SidebarInset className="h-svh overflow-hidden bg-background text-foreground">
        <RequestTabStrip operation={selectedOperation} />
        <ScrollArea className="min-h-0 w-full flex-1">
          <main className="flex flex-col px-8 pt-6 pb-[calc(42svh+4rem)]">
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

            <Tabs defaultValue="Docs" className="mt-4 flex w-full flex-col">
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
                      setRequestDraft((draft) => ({ ...draft, params }))
                    }
                    headers={requestDraft.headers}
                    onHeadersChange={(headers) =>
                      setRequestDraft((draft) => ({ ...draft, headers }))
                    }
                    body={requestDraft.body}
                    onBodyChange={(body) =>
                      setRequestDraft((draft) => ({ ...draft, body }))
                    }
                  />
                </TabsContent>
              ))}
            </Tabs>
          </main>
        </ScrollArea>
        <ResponseBar response={responseState} />
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
