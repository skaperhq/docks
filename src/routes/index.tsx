import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEnvironment } from "@/components/environment-provider"
import { LockIcon } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
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
import {
  getHeaderRows,
  getMethodClassName,
  getBgMethodClassName,
} from "@/components/api-reference/utils"

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      operationId: typeof search.operationId === "string" ? search.operationId : undefined,
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

  const headers = React.useMemo(() => {
    return rawHeaders.map((header) => ({
      ...header,
      value: resolveVariables(header.value),
    }))
  }, [rawHeaders, resolveVariables])

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
        <ScrollArea className="flex-1 min-h-0 w-full">
          <main className="flex flex-col px-8 pt-6 pb-[calc(52svh+4rem)]">
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
                <Button className="h-10 rounded-sm bg-primary text-sm font-normal">
                  Send
                </Button>
              </div>
            </div>

            <Tabs
              defaultValue="Docs"
              className="mt-4 flex w-full flex-col"
            >
              <TabsList>
                {requestTabs.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    <RequestTabLabel
                      tab={tab}
                      operation={selectedOperation}
                      headers={headers}
                    />
                  </TabsTrigger>
                ))}
              </TabsList>
              {requestTabs.map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-4">
                  <RequestTabContent
                    activeTab={tab}
                    operation={selectedOperation}
                    headers={headers}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </main>
        </ScrollArea>
        <ResponseBar operation={selectedOperation} />
      </SidebarInset>
    </SidebarProvider>
  )
}
