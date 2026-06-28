import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
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

export const Route = createFileRoute("/")({ component: App })

const defaultOperation =
  apiOperations.find((operation) => operation.id === "POST /auth/login") ??
  apiOperations[0]

function App() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [requestOnly, setRequestOnly] = React.useState(false)
  const [selectedOperationId, setSelectedOperationId] = React.useState(
    defaultOperation.id
  )
  const selectedOperation =
    apiOperations.find((operation) => operation.id === selectedOperationId) ??
    defaultOperation
  const requestUrl = selectedOperation.requestUrl
  const headers = React.useMemo(
    () => getHeaderRows(selectedOperation),
    [selectedOperation]
  )

  return (
    <SidebarProvider>
      <AppSidebar
        selectedOperationId={selectedOperation.id}
        searchQuery={searchQuery}
        requestOnly={requestOnly}
        onSearchQueryChange={setSearchQuery}
        onRequestOnlyChange={setRequestOnly}
        onSelectOperation={(operation) => setSelectedOperationId(operation.id)}
      />
      <SidebarInset className="min-h-svh overflow-hidden bg-background text-foreground">
        <RequestTabStrip operation={selectedOperation} />
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-8 py-6">
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
                  {requestUrl}
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
              className="mt-4 flex min-h-0 w-full flex-col"
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
                <TabsContent key={tab} value={tab} className="mt-4 min-h-0">
                  <ScrollArea className="h-[calc(100svh-15.5rem)] pr-4">
                    <RequestTabContent
                      activeTab={tab}
                      operation={selectedOperation}
                      headers={headers}
                    />
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </main>
        <ResponseBar operation={selectedOperation} />
      </SidebarInset>
    </SidebarProvider>
  )
}
