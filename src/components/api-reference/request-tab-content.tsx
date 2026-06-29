import type { ApiOperation } from "@/lib/openapi"
import type { RequestTab, KeyValueRow, RequestBodyDraft } from "./types"
import { DocsPanel } from "./docs-panel"
import { KeyValueTable } from "./key-value-table"
import { AuthorizationPanel } from "./authorization-panel"
import { BodyPanel } from "./body-panel"

export const requestTabs: RequestTab[] = [
  "Docs",
  "Params",
  "Authorization",
  "Headers",
  "Body",
]

export function RequestTabContent({
  activeTab,
  operation,
  params,
  onParamsChange,
  headers,
  onHeadersChange,
  body,
  onBodyChange,
}: {
  activeTab: RequestTab
  operation: ApiOperation
  params: KeyValueRow[]
  onParamsChange: (rows: KeyValueRow[]) => void
  headers: KeyValueRow[]
  onHeadersChange: (rows: KeyValueRow[]) => void
  body: RequestBodyDraft
  onBodyChange: (body: RequestBodyDraft) => void
}) {

  switch (activeTab) {
    case "Docs":
      return <DocsPanel operation={operation} />
    case "Params":
      return (
        <KeyValueTable
          title="Query Params"
          rows={params}
          onRowsChange={onParamsChange}
          emptyMessage="This request does not define path or query params."
        />
      )
    case "Authorization":
      return <AuthorizationPanel operation={operation} />
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
    case "Body":
      return (
        <BodyPanel
          operation={operation}
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
}: {
  tab: RequestTab
  operation: ApiOperation
  headers: KeyValueRow[]
}) {
  if (tab === "Headers" && headers.length > 0) {
    return (
      <span className="inline-flex items-center gap-2">
        Headers <span className="size-2 rounded-full bg-primary" />
      </span>
    )
  }

  if (tab === "Body" && operation.requestContentTypes.length > 0) {
    return (
      <span className="inline-flex items-center gap-2">
        Body
        <span className="size-2 rounded-full bg-primary" />
      </span>
    )
  }

  return tab
}
