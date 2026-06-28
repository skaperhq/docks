import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  EyeIcon,
  HistoryIcon,
  LockIcon,
  MoreHorizontalIcon,
  X,
} from "lucide-react"
import type { ApiOperation, ApiParameter, ApiResponse } from "@/lib/openapi"

import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { apiInfo, apiOperations, formatSchema } from "@/lib/openapi"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"

export const Route = createFileRoute("/")({ component: App })

type RequestTab = "Docs" | "Params" | "Authorization" | "Headers" | "Body"

type KeyValueRow = {
  key: string
  value: string
  description: string
  enabled?: boolean
  required?: boolean
  type?: string
  location?: string
  defaultValue?: string
  enum?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  example?: unknown
}

const requestTabs: RequestTab[] = [
  "Docs",
  "Params",
  "Authorization",
  "Headers",
  "Body",
]

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

function RequestTabStrip({ operation }: { operation: ApiOperation }) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-card text-muted-foreground">
      <div className="flex h-full w-11 items-center justify-center border-r border-border text-muted-foreground">
        <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
      </div>
      <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden bg-muted/30">
        {apiOperations.slice(0, 6).map((apiOperation) => (
          <button
            type="button"
            key={apiOperation.id}
            className={cn(
              "flex h-full max-w-40 min-w-32 items-center justify-between border-r-[0.5px] border-border bg-card px-1.5 text-left text-sm text-muted-foreground hover:bg-accent/50",
              apiOperation.id === operation.id &&
                "bg-background font-medium text-foreground"
            )}
          >
            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  getMethodClassName(apiOperation.method)
                )}
              >
                {apiOperation.method}
              </span>
              <span className="truncate text-[12px]">
                {apiOperation.displayPath}
              </span>
            </div>

            <span>
              <X className="w-3 text-muted-foreground hover:text-foreground" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function RequestTabContent({
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

function RequestTabLabel({
  tab,
  operation,
  headers,
}: {
  tab: RequestTab
  operation: ApiOperation
  headers: KeyValueRow[]
}) {
  console.log("RequestTabLabel", { headers })
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

function DocsPanel({ operation }: { operation: ApiOperation }) {
  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <div>
        <p className="mt-2 text-sm leading-6 text-[#a5a5a5]">
          {operation.description ?? operation.summary}
        </p>
      </div>
      <div className="overflow-hidden rounded-sm">
        <div className="py-3">
          <h3 className="text-base font-normal tracking-normal text-[#d6d6d6]">
            Responses
          </h3>
        </div>
        <Accordion
          type="multiple"
          className="max-w-full rounded-lg border"
          defaultValue={["200"]}
        >
          {operation.responses.map((item) => (
            <AccordionItem
              key={item.code}
              value={item.code}
              className="border-b px-4 last:border-b-0"
            >
              <AccordionTrigger>
                <span
                  className={cn(
                    Number(item.code) < 400
                      ? "mr-2 rounded bg-green-700 px-2 py-0.5 text-xs font-medium text-green-100"
                      : "mr-2 rounded bg-red-700 px-2 py-0.5 text-xs font-medium text-red-100"
                  )}
                >
                  {item.code}
                </span>
                {item.description}
              </AccordionTrigger>
              <AccordionContent>
                <div className="py-5">
                  <ResponseDetails response={item} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

function ResponseDetails({ response }: { response: ApiResponse }) {
  const defaultContentType = response.contentTypes[0] ?? "none"
  const hasContent = response.contentTypes.length > 0

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      {hasContent ? (
        <>
          <div className="flex max-w-sm flex-col gap-1.5">
            <span className="text-xs font-normal text-muted-foreground">
              Media type
            </span>
            <Select defaultValue={defaultContentType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select media type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Media Types</SelectLabel>
                  {response.contentTypes.map((contentType) => (
                    <SelectItem key={contentType} value={contentType}>
                      {contentType}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Controls the Accept header.
            </span>
          </div>

          <Tabs defaultValue="example" className="gap-3">
            <TabsList>
              <TabsTrigger value="example">Example Value</TabsTrigger>
              <TabsTrigger value="schema">Schema</TabsTrigger>
            </TabsList>
            <TabsContent value="example">
              <ScrollArea className="max-h-80 rounded-md border bg-muted">
                <pre className="p-4 text-sm leading-6 text-foreground">
                  {JSON.stringify(response.example, null, 2)}
                </pre>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="schema">
              <ResponseSchema response={response} />
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This response does not define a response body.
        </p>
      )}
    </div>
  )
}

function CollapsibleSchemaRow({
  name,
  required,
  type,
  description,
  defaultValue,
  enum: allowedValues,
  pattern,
  minimum,
  maximum,
  minLength,
  maxLength,
  example,
}: {
  name: string
  required: boolean
  type: string
  description?: string
  defaultValue?: unknown
  enum?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  example?: unknown
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const hasDetails = Boolean(
    description ||
    allowedValues ||
    pattern ||
    minimum !== undefined ||
    maximum !== undefined ||
    minLength !== undefined ||
    maxLength !== undefined ||
    defaultValue !== undefined ||
    example !== undefined
  )

  return (
    <>
      <TableRow
        onClick={() => hasDetails && setIsOpen(!isOpen)}
        className={cn(
          "border-b border-border/50 transition-colors",
          hasDetails ? "cursor-pointer hover:bg-accent/40" : "",
          isOpen && "bg-accent/20"
        )}
      >
        <TableCell className="py-3 pl-4 font-mono text-foreground">
          <div className="flex items-center gap-2">
            {hasDetails && (
              <ChevronDownIcon
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  !isOpen && "-rotate-90"
                )}
              />
            )}
            {!hasDetails && <div className="size-3.5 shrink-0" />}
            {name}
          </div>
        </TableCell>
        <TableCell className="py-3 font-mono text-muted-foreground">
          {type}
        </TableCell>
        <TableCell className="py-3">
          {required ? (
            <span className="rounded border border-red-900/50 bg-red-900/30 px-1.5 py-0.5 text-xs font-medium text-red-400">
              Yes
            </span>
          ) : (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              No
            </span>
          )}
        </TableCell>
        <TableCell className="py-3 pr-4 text-muted-foreground">
          <div className="line-clamp-1 max-w-[400px] text-sm text-muted-foreground">
            {description || "-"}
          </div>
        </TableCell>
      </TableRow>
      {hasDetails && (
        <TableRow
          className={cn(
            "border-b border-border/30 bg-muted/20",
            !isOpen && "hidden"
          )}
        >
          <TableCell colSpan={4} className="p-0">
            <div
              className={cn(
                "overflow-hidden px-8 py-5 text-sm text-muted-foreground transition-all duration-300 ease-in-out",
                isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
              )}
            >
              <div className="flex flex-col gap-4">
                {description && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                      Description
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {defaultValue !== undefined && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Default
                      </div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {JSON.stringify(defaultValue)}
                      </div>
                    </div>
                  )}

                  {allowedValues && allowedValues.length > 0 && (
                    <div className="col-span-2 space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Allowed Values
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allowedValues.map((val) => (
                          <span
                            key={val}
                            className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-amber-600 dark:text-amber-400"
                          >
                            {val}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {pattern && (
                    <div className="col-span-2 space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Pattern
                      </div>
                      <div className="inline-block rounded border border-cyan-900/40 bg-cyan-950/20 px-2 py-0.5 font-mono text-xs text-cyan-500 dark:text-cyan-400">
                        {pattern}
                      </div>
                    </div>
                  )}

                  {(minimum !== undefined || maximum !== undefined) && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Range
                      </div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {minimum !== undefined ? `[${minimum}` : "[-∞"}
                        {", "}
                        {maximum !== undefined ? `${maximum}]` : "∞]"}
                      </div>
                    </div>
                  )}

                  {(minLength !== undefined || maxLength !== undefined) && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Length
                      </div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {minLength !== undefined ? `Min: ${minLength}` : ""}
                        {minLength !== undefined && maxLength !== undefined
                          ? ", "
                          : ""}
                        {maxLength !== undefined ? `Max: ${maxLength}` : ""}
                      </div>
                    </div>
                  )}

                  {example !== undefined && (
                    <div className="col-span-full mt-2 space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Example
                      </div>
                      <pre className="max-h-40 overflow-x-auto rounded border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
                        {typeof example === "object"
                          ? JSON.stringify(example, null, 2)
                          : String(example)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function ResponseSchema({ response }: { response: ApiResponse }) {
  const schemaFields = formatSchema(response.schema)

  if (typeof schemaFields === "string") {
    return (
      <ScrollArea className="max-h-80 rounded-md border bg-muted">
        <div className="p-4 font-mono text-sm text-muted-foreground">
          {schemaFields}
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="max-h-80 rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48 pl-8 text-muted-foreground">
              Field
            </TableHead>
            <TableHead className="w-48 text-muted-foreground">Type</TableHead>
            <TableHead className="w-32 text-muted-foreground">
              Required
            </TableHead>
            <TableHead className="min-w-64 pr-8 text-muted-foreground">
              Description
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schemaFields.map((field) => (
            <CollapsibleSchemaRow key={field.name} {...field} />
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function AuthorizationPanel({ operation }: { operation: ApiOperation }) {
  return (
    <section className="max-w-4xl">
      <h2 className="mb-4 text-[17px] font-semibold text-foreground">
        Authorization
      </h2>
      <div className="grid max-w-2xl grid-cols-[11rem_minmax(0,1fr)] overflow-hidden rounded-md border border-border">
        <div className="border-r border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Type
        </div>
        <div className="px-4 py-3 text-sm text-foreground">
          {operation.hasAuth ? "Bearer Token" : "No Auth"}
        </div>
        <div className="border-t border-r border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Token
        </div>
        <div className="border-t border-border px-4 py-3 font-mono text-sm text-muted-foreground">
          {operation.hasAuth ? "{{access_token}}" : "-"}
        </div>
      </div>
    </section>
  )
}

function BodyPanel({ operation }: { operation: ApiOperation }) {
  const [bodyMode, setBodyMode] = React.useState("raw")
  const [contentType, setContentType] = React.useState(
    operation.requestContentTypes[0] ?? "application/json"
  )
  const [bodyValue, setBodyValue] = React.useState(() =>
    formatBodyExample(operation.requestExample)
  )

  React.useEffect(() => {
    setBodyMode("raw")
    setContentType(operation.requestContentTypes[0] ?? "application/json")
    setBodyValue(formatBodyExample(operation.requestExample))
  }, [operation.id, operation.requestContentTypes, operation.requestExample])

  return (
    <section className="flex min-h-[calc(100svh-17rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
          {["none", "form-data", "x-www-form-urlencoded", "raw", "binary"].map(
            (mode) => (
              <label
                key={mode}
                className="inline-flex cursor-pointer items-center gap-2 text-[15px]"
              >
                <input
                  type="radio"
                  name={`body-mode-${operation.id}`}
                  checked={bodyMode === mode}
                  onChange={() => setBodyMode(mode)}
                  className="size-4 accent-blue-500"
                />
                <span className={bodyMode === mode ? "text-foreground" : ""}>
                  {mode}
                </span>
              </label>
            )
          )}
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger className="h-8 w-40 border-0 bg-transparent px-0 text-blue-500 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Body Type</SelectLabel>
                {(operation.requestContentTypes.length > 0
                  ? operation.requestContentTypes
                  : ["application/json"]
                ).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "application/json" ? "JSON" : type}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-3 text-blue-500 hover:text-blue-400"
          onClick={() => setBodyValue(prettyPrintJson(bodyValue))}
        >
          Beautify
        </Button>
      </div>
      <div className="relative min-h-96 flex-1 overflow-hidden rounded-sm border border-border bg-card">
        <div className="absolute top-0 left-0 flex h-full w-14 justify-center border-r border-border bg-muted/40 pt-3 font-mono text-sm text-muted-foreground">
          1
        </div>
        <textarea
          value={bodyValue}
          onChange={(event) => setBodyValue(event.target.value)}
          disabled={bodyMode !== "raw"}
          spellCheck={false}
          placeholder={
            bodyMode === "raw"
              ? "Enter request body"
              : `${bodyMode} body editing is not configured yet`
          }
          className="h-full min-h-96 w-full resize-none bg-transparent py-3 pr-4 pl-20 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 disabled:text-muted-foreground/50"
        />
      </div>
    </section>
  )
}

function KeyValueTable({
  title,
  rows,
  resetKey,
  emptyMessage,
}: {
  title: string
  rows: KeyValueRow[]
  resetKey: string
  badge?: string
  emptyMessage: string
}) {
  const [tableRows, setTableRows] = React.useState<KeyValueRow[]>(() =>
    rows.map(normalizeKeyValueRow)
  )

  React.useEffect(() => {
    setTableRows(rows.map(normalizeKeyValueRow))
  }, [resetKey, rows])

  function updateRow(index: number, patch: Partial<KeyValueRow>) {
    setTableRows((currentRows) =>
      index >= currentRows.length
        ? shouldCreateRow(patch)
          ? [
              ...currentRows,
              normalizeKeyValueRow({ ...emptyKeyValueRow, ...patch }),
            ]
          : currentRows
        : currentRows.map((row, rowIndex) =>
            rowIndex === index ? { ...row, ...patch } : row
          )
    )
  }

  const visibleRows = React.useMemo(
    () => [...tableRows, emptyKeyValueRow],
    [tableRows]
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-muted-background/90 text-[14px] font-normal">
          {title}
        </h2>
      </div>
      <div
        aria-label={rows.length === 0 ? emptyMessage : undefined}
        className="overflow-hidden border border-border bg-background"
      >
        <Table className="table-fixed border-collapse">
          <TableHeader>
            <TableRow className="border-border bg-background hover:bg-background">
              <TableHead className="h-8.5 w-14 border-r border-border px-0" />
              <TableHead className="h-8.5 w-[31%] border-r border-border px-4 text-[13px] font-normal text-muted-foreground">
                Key
              </TableHead>
              <TableHead className="h-8.5 w-[31%] border-r border-border px-4 text-[13px] font-normal text-muted-foreground">
                Value
              </TableHead>
              <TableHead className="h-8.5 border-border px-4 text-[13px] font-normal text-muted-foreground">
                Description
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row, index) => (
              <EditableKeyValueRow
                key={`${title}-${resetKey}-${index}`}
                row={row}
                isPlaceholder={index === tableRows.length}
                onChange={(patch) => updateRow(index, patch)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function EditableKeyValueRow({
  row,
  isPlaceholder,
  onChange,
}: {
  row: KeyValueRow
  isPlaceholder?: boolean
  onChange: (patch: Partial<KeyValueRow>) => void
}) {
  return (
    <TableRow className="border-border hover:bg-transparent">
      <TableCell className="h-8.5 border-r border-border px-0 py-0 text-center">
        {isPlaceholder ? null : (
          <input
            type="checkbox"
            checked={row.enabled !== false}
            onChange={(event) => onChange({ enabled: event.target.checked })}
            className="size-4 rounded-sm accent-primary"
            aria-label={`Enable ${row.key || "row"}`}
          />
        )}
      </TableCell>
      <TableCell className="h-8.5 border-r border-border px-0 py-0">
        <Input
          value={row.key}
          onChange={(event) => onChange({ key: event.target.value })}
          placeholder="Key"
          className={cn(
            leanCellInputClassName,
            isPlaceholder && "text-[12px] font-normal text-muted-foreground/60"
          )}
        />
      </TableCell>
      <TableCell className="h-8.5 border-r border-border px-0 py-0">
        <Input
          value={row.value}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder="Value"
          className={cn(
            leanCellInputClassName,
            isPlaceholder && "text-[12px] font-normal text-muted-foreground/60"
          )}
        />
      </TableCell>
      <TableCell className="h-8.5 border-border px-0 py-0">
        <Input
          value={row.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Description"
          className={cn(
            leanCellInputClassName,
            "font-sans",
            isPlaceholder && "text-[12px] font-normal text-muted-foreground/60"
          )}
        />
      </TableCell>
    </TableRow>
  )
}

const emptyKeyValueRow: KeyValueRow = {
  key: "",
  value: "",
  description: "",
  enabled: true,
}

const leanCellInputClassName =
  "h-8.5 rounded-none border-0 bg-transparent px-4 font-sans text-[12px] text-foreground shadow-none focus-visible:ring-0 focus-visible:border-0 placeholder:text-muted-foreground/55"

function shouldCreateRow(patch: Partial<KeyValueRow>) {
  return Boolean(
    patch.key?.trim() || patch.value?.trim() || patch.description?.trim()
  )
}

function normalizeKeyValueRow(row: KeyValueRow): KeyValueRow {
  return {
    ...row,
    enabled: row.enabled ?? true,
    value: row.value,
    description: row.description,
  }
}

function formatBodyExample(example: unknown) {
  if (example === null || example === undefined) {
    return ""
  }

  if (typeof example === "string") {
    return example
  }

  return JSON.stringify(example, null, 2)
}

function prettyPrintJson(value: string) {
  if (!value.trim()) {
    return value
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function ResponseBar({ operation }: { operation: ApiOperation }) {
  const previewResponse = operation.responses[0]

  return (
    <Sheet>
      <div className="flex h-12 shrink-0 items-center justify-between border-t border-border bg-card">
        <div className="flex h-full items-center">
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex h-full cursor-pointer items-center border-r border-border px-8 text-[15px] font-semibold text-foreground hover:bg-accent/40"
            >
              Response
            </button>
          </SheetTrigger>
          <button
            type="button"
            className="flex h-full cursor-pointer items-center gap-2 px-8 text-[15px] text-muted-foreground hover:bg-accent/40 hover:text-foreground"
          >
            <HistoryIcon />
            History
            <ChevronDownIcon />
          </button>
        </div>
        <SheetTrigger asChild>
          <button
            type="button"
            className="mr-4 flex size-8 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDownIcon className="rotate-180" />
            <span className="sr-only">Open response panel</span>
          </button>
        </SheetTrigger>
      </div>
      <SheetContent
        side="bottom"
        className="h-[52svh] gap-0 border-border bg-background p-0 text-foreground sm:max-w-none"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-foreground">Response</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {operation.method} {operation.requestUrl}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(52svh-5rem)]">
          <div className="space-y-6 p-6">
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="w-28 text-muted-foreground">
                      Code
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      Description
                    </TableHead>
                    <TableHead className="w-52 text-muted-foreground">
                      Media type
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operation.responses.map((response) => (
                    <TableRow key={response.code}>
                      <TableCell className="font-mono text-foreground">
                        {response.code}
                      </TableCell>
                      <TableCell className="text-foreground/90">
                        {response.description}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {response.contentTypes[0] ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border bg-muted px-4 py-3 text-sm font-medium text-foreground">
                {previewResponse.code} example
              </div>
              <ScrollArea className="max-h-64 bg-muted">
                <pre className="p-4 font-mono text-sm leading-6 text-foreground">
                  {JSON.stringify(previewResponse.example ?? {}, null, 2)}
                </pre>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function parameterToRow(parameter: ApiParameter): KeyValueRow {
  return {
    key: parameter.name,
    value:
      parameter.defaultValue ??
      (parameter.location === "path" ? `{{${parameter.name}}}` : ""),
    description: parameter.description ?? "",
    required: parameter.required,
    type: parameter.type,
    location: parameter.location,
    defaultValue: parameter.defaultValue,
    enum: parameter.enum,
    pattern: parameter.pattern,
    minimum: parameter.minimum,
    maximum: parameter.maximum,
    minLength: parameter.minLength,
    maxLength: parameter.maxLength,
    example: parameter.example,
  }
}

function getHeaderRows(operation: ApiOperation): KeyValueRow[] {
  const rows: KeyValueRow[] = []

  if (operation.hasAuth) {
    rows.push({
      key: "Authorization",
      value: "Bearer {{access_token}}",
      description: "Generated from bearerAuth security",
    })
  }

  if (operation.requestContentTypes[0]) {
    rows.push({
      key: "Content-Type",
      value: operation.requestContentTypes[0],
      description: "Generated from request body content type",
    })
  }

  for (const parameter of operation.headerParameters) {
    rows.push(parameterToRow(parameter))
  }

  return rows
}

function getMethodClassName(method: ApiOperation["method"]) {
  switch (method) {
    case "GET":
      return "text-emerald-600 dark:text-[#6bdd9a]"
    case "POST":
      return "text-amber-600 dark:text-[#f5d36b]"
    case "PUT":
    case "PATCH":
      return "text-blue-600 dark:text-[#74aef6]"
    case "DELETE":
      return "text-rose-600 dark:text-[#ff8d7a]"
    default:
      return "text-muted-foreground"
  }
}

function getBgMethodClassName(method: ApiOperation["method"]) {
  switch (method) {
    case "GET":
      return "bg-emerald-50 dark:bg-[#003415]"
    case "POST":
      return "bg-amber-50 dark:bg-[#3a2b00]"
    case "PUT":
    case "PATCH":
      return "bg-blue-50 dark:bg-[#00274d]"
    case "DELETE":
      return "bg-rose-50 dark:bg-[#4d1a00]"
    default:
      return "bg-muted"
  }
}
