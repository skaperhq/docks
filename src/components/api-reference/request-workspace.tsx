import { LockIcon } from "lucide-react"
import { CopyPageAction } from "./copy-page-action"
import {
  RequestTabContent,
  RequestTabLabel,
  requestTabs,
  websocketRequestTabs,
} from "./request-tab-content"
import type {
  RequestDraft,
  RequestTab,
  ResponseState,
  WebSocketConnectionStatus,
} from "./types"
import { getBgMethodClassName, getMethodClassName } from "./utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  PersistedCustomRequest,
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "@/lib/api-reference-actions"
import { apiInfo } from "@/lib/openapi"
import { cn } from "@/lib/utils"
import { defaultUrlForRequest } from "@/lib/workspace-request"
import type { WorkspaceRequest } from "@/lib/workspace-request"

export function RequestWorkspace({
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
            <LockIcon className="text-muted-foreground" />
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
                      ? "bg-secondary text-secondary-foreground"
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
        <Button
          type="button"
          className="h-9 rounded-none font-mono text-sm font-normal uppercase"
          onClick={isWebSocketConnected ? onDisconnectWebSocket : onSend}
          disabled={isWebSocketConnecting || isRequestLoading}
          aria-label={isWebSocketConnected ? "Disconnect WebSocket" : undefined}
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

      {request.mode === "sse" ? (
        <Alert className="mt-3 rounded-none">
          <AlertDescription>
            Fetch-based Server-Sent Events support custom methods, headers, and
            request bodies.
          </AlertDescription>
        </Alert>
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
          className="h-full w-22 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 font-mono text-xs font-medium text-muted-foreground shadow-none focus-visible:ring-0"
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
          onUpdateCustomRequest(request, { mode: value })
        }
        disabled={request.transport !== "http"}
      >
        <SelectTrigger
          aria-label="HTTP mode"
          className="h-full w-28 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 font-mono text-xs font-medium text-muted-foreground uppercase shadow-none focus-visible:ring-0"
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
          onUpdateCustomRequest(request, { method: value as RequestMethod })
        }
        disabled={request.transport !== "http" || request.mode === "sse"}
      >
        <SelectTrigger
          aria-label="HTTP method"
          className={cn(
            "h-full w-22 shrink-0 rounded-none border-0 border-r border-border bg-transparent px-3 font-mono text-xs font-medium uppercase shadow-none focus-visible:ring-0",
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
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 text-sm text-foreground shadow-none focus-visible:ring-0"
        placeholder={defaultUrlForRequest(request.transport, request.mode)}
        aria-label="Custom request URL"
      />
    </div>
  )
}
