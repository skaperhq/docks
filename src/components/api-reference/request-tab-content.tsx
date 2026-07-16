import type { ApiOperation } from "@/lib/openapi"
import type {
  RequestTab,
  KeyValueRow,
  RequestBodyDraft,
  WebSocketConnectionStatus,
} from "./types"
import { CurlExample, DocsPanel } from "./docs-panel"
import { KeyValueTable } from "./key-value-table"
import { BodyPanel } from "./body-panel"
import { WebSocketMessagePanel } from "./websocket-message-panel"

export const requestTabs: RequestTab[] = ["Docs", "Params", "Headers", "Body"]
export const websocketRequestTabs: RequestTab[] = [
  "Docs",
  "Message",
  "Params",
  "Headers",
]

export function RequestTabContent({
  activeTab,
  operation,
  requestId,
  params,
  onParamsChange,
  headers,
  onHeadersChange,
  body,
  onBodyChange,
  websocketConnectionStatus = "disconnected",
  onSendWebSocketMessage,
  curlCommand,
}: {
  activeTab: RequestTab
  operation?: ApiOperation
  requestId?: string
  params: KeyValueRow[]
  onParamsChange: (rows: KeyValueRow[]) => void
  headers: KeyValueRow[]
  onHeadersChange: (rows: KeyValueRow[]) => void
  body: RequestBodyDraft
  onBodyChange: (body: RequestBodyDraft) => void
  websocketConnectionStatus?: WebSocketConnectionStatus
  onSendWebSocketMessage?: () => void
  curlCommand?: string
}) {
  switch (activeTab) {
    case "Docs":
      return operation ? (
        <DocsPanel operation={operation} curlCommand={curlCommand} />
      ) : (
        <CustomDocsPanel curlCommand={curlCommand} />
      )
    case "Params":
      return (
        <KeyValueTable
          title="Query Params"
          rows={params}
          onRowsChange={onParamsChange}
          emptyMessage="This request does not define path or query params."
        />
      )
    case "Headers":
      return (
        <KeyValueTable
          title="Headers"
          rows={headers}
          onRowsChange={onHeadersChange}
          badge={
            headers.length > 1 ? `${headers.length - 1} hidden` : undefined
          }
          emptyMessage="This request does not define generated headers."
        />
      )
    case "Message":
      return (
        <WebSocketMessagePanel
          body={body}
          connectionStatus={websocketConnectionStatus}
          onBodyChange={onBodyChange}
          onSend={onSendWebSocketMessage ?? (() => {})}
        />
      )
    case "Body":
      return (
        <BodyPanel
          operation={operation}
          requestId={requestId}
          body={body}
          onBodyChange={onBodyChange}
        />
      )
  }
}

export function RequestTabLabel({
  tab,
  operation,
  headers,
  websocketConnectionStatus,
}: {
  tab: RequestTab
  operation?: ApiOperation
  headers: KeyValueRow[]
  websocketConnectionStatus?: WebSocketConnectionStatus
}) {
  if (tab === "Message" && websocketConnectionStatus === "connected") {
    return (
      <span className="inline-flex items-center gap-2">
        Message <span className="size-2 rounded-full bg-primary" />
      </span>
    )
  }
  if (tab === "Headers" && headers.length > 0) {
    return (
      <span className="inline-flex items-center gap-2">
        Headers <span className="size-2 rounded-full bg-primary" />
      </span>
    )
  }

  if (tab === "Body" && operation && operation.requestContentTypes.length > 0) {
    return (
      <span className="inline-flex items-center gap-2">
        Body
        <span className="size-2 rounded-full bg-primary" />
      </span>
    )
  }

  return tab
}

function CustomDocsPanel({ curlCommand }: { curlCommand?: string }) {
  return (
    <section className="flex min-h-52 flex-col gap-5 rounded-sm border border-border bg-background p-4 text-sm text-muted-foreground">
      <div>
        <h2 className="mb-2 text-base font-medium text-foreground">
          Custom Request
        </h2>
        <p>
          This request was created in the workspace and is not generated from
          the OpenAPI document. Configure its request details before testing it.
        </p>
      </div>
      {curlCommand ? <CurlExample command={curlCommand} /> : null}
    </section>
  )
}
