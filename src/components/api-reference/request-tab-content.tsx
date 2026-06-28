import * as React from "react"
import type { ApiOperation } from "@/lib/openapi"
import type { RequestTab, KeyValueRow } from "./types"
import { DocsPanel } from "./docs-panel"
import { KeyValueTable } from "./key-value-table"
import { AuthorizationPanel } from "./authorization-panel"
import { BodyPanel } from "./body-panel"
import { parameterToRow } from "./utils"

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
  headers,
}: {
  activeTab: RequestTab
  operation: ApiOperation
  headers: KeyValueRow[]
}) {
  const parameterRows = React.useMemo(
    () => [
      ...operation.pathParameters.map(parameterToRow),
      ...operation.queryParameters.map(parameterToRow),
    ],
    [operation]
  )

  switch (activeTab) {
    case "Docs":
      return <DocsPanel operation={operation} />
    case "Params":
      return (
        <KeyValueTable
          title="Query Params"
          resetKey={operation.id}
          rows={parameterRows}
          emptyMessage="This request does not define path or query params."
        />
      )
    case "Authorization":
      return <AuthorizationPanel operation={operation} />
    case "Headers":
      return (
        <KeyValueTable
          title="Headers"
          resetKey={operation.id}
          rows={headers}
          badge={
            headers.length > 1 ? `${headers.length - 1} hidden` : undefined
          }
          emptyMessage="This request does not define generated headers."
        />
      )
    case "Body":
      return <BodyPanel operation={operation} />
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
