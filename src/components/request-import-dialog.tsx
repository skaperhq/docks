"use client"

import * as React from "react"
import {
  AlertTriangleIcon,
  FileJsonIcon,
  LoaderCircleIcon,
  TerminalSquareIcon,
} from "lucide-react"

import type {
  PersistedCustomRequest,
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "@/lib/api-reference-actions"
import type { RequestDraft } from "@/components/api-reference/types"
import { parseCurlCommand } from "@/lib/curl-import"
import type { ParsedCurlRequest } from "@/lib/curl-import"
import { parseOpenApiImport } from "@/lib/openapi-import"
import type {
  ImportedOpenApiRequest,
  OpenApiImportPreview,
} from "@/lib/openapi-import"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
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
import { Textarea } from "@/components/ui/textarea"

export type CreateRequestInput = {
  name: string
  method: RequestMethod
  transport: RequestTransport
  mode: RequestMode
  url: string
  draft?: RequestDraft
}

export type ImportOpenApiInput = {
  name: string
  requests: ImportedOpenApiRequest[]
}

export function RequestImportDialog({
  open,
  onOpenChange,
  collectionNames,
  onCreateRequest,
  onImportOpenApi,
  onSelectCustomRequest,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionNames: string[]
  onCreateRequest: (
    input: CreateRequestInput
  ) => Promise<PersistedCustomRequest | null>
  onImportOpenApi: (
    input: ImportOpenApiInput
  ) => Promise<PersistedCustomRequest[] | null>
  onSelectCustomRequest: (request: PersistedCustomRequest) => void
}) {
  const [activeTab, setActiveTab] = React.useState("blank")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState("")
  const [name, setName] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [method, setMethod] = React.useState<RequestMethod>("GET")
  const [transport, setTransport] = React.useState<RequestTransport>("http")
  const [mode, setMode] = React.useState<RequestMode>("standard")
  const [curlSource, setCurlSource] = React.useState("")
  const [curlPreview, setCurlPreview] =
    React.useState<ParsedCurlRequest | null>(null)
  const [curlName, setCurlName] = React.useState("")
  const [openApiSource, setOpenApiSource] = React.useState("")
  const [openApiFileName, setOpenApiFileName] = React.useState("")
  const [openApiPreview, setOpenApiPreview] =
    React.useState<OpenApiImportPreview | null>(null)
  const [collectionName, setCollectionName] = React.useState("")

  function reset() {
    setActiveTab("blank")
    setError("")
    setName("")
    setUrl("")
    setMethod("GET")
    setTransport("http")
    setMode("standard")
    setCurlSource("")
    setCurlPreview(null)
    setCurlName("")
    setOpenApiSource("")
    setOpenApiFileName("")
    setOpenApiPreview(null)
    setCollectionName("")
  }

  function closeAfterSuccess() {
    onOpenChange(false)
    reset()
  }

  async function submitBlank(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || pending) return
    setPending(true)
    setError("")
    try {
      const request = await onCreateRequest({
        name: name.trim(),
        method,
        transport,
        mode,
        url: url.trim(),
      })
      if (!request) throw new Error("The request could not be created.")
      onSelectCustomRequest(request)
      closeAfterSuccess()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  function parseCurl() {
    setError("")
    try {
      const preview = parseCurlCommand(curlSource)
      setCurlPreview(preview)
      setCurlName(preview.name)
    } catch (caught) {
      setCurlPreview(null)
      setError(messageOf(caught))
    }
  }

  async function importCurl() {
    if (!curlPreview || !curlName.trim() || pending) return
    setPending(true)
    setError("")
    try {
      const request = await onCreateRequest({
        ...curlPreview,
        name: curlName.trim(),
      })
      if (!request) throw new Error("The cURL request could not be imported.")
      onSelectCustomRequest(request)
      closeAfterSuccess()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  function parseOpenApi() {
    setError("")
    try {
      const preview = parseOpenApiImport(openApiSource, openApiFileName)
      setOpenApiPreview(preview)
      setCollectionName(uniqueCollectionName(preview.title, collectionNames))
    } catch (caught) {
      setOpenApiPreview(null)
      setError(messageOf(caught))
    }
  }

  async function importOpenApi() {
    if (!openApiPreview || pending) return
    setPending(true)
    setError("")
    try {
      const requests = await onImportOpenApi({
        name: collectionName,
        requests: openApiPreview.requests,
      })
      if (!requests?.length) {
        throw new Error("The OpenAPI collection could not be imported.")
      }
      onSelectCustomRequest(requests[0])
      closeAfterSuccess()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  async function loadOpenApiFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError("")
    setOpenApiPreview(null)
    setOpenApiFileName(file.name)
    try {
      setOpenApiSource(await file.text())
    } catch (caught) {
      setError(`Could not read ${file.name}: ${messageOf(caught)}`)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending && !nextOpen) return
        onOpenChange(nextOpen)
        if (!nextOpen) reset()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg font-medium uppercase">
            Add request
          </DialogTitle>
          <DialogDescription>
            Create a blank request or import one from cURL or OpenAPI.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value)
            setError("")
          }}
        >
          <TabsList className="grid w-full grid-cols-3 rounded-none">
            <TabsTrigger value="blank" className="rounded-none">
              Blank
            </TabsTrigger>
            <TabsTrigger value="curl" className="rounded-none">
              cURL
            </TabsTrigger>
            <TabsTrigger value="openapi" className="rounded-none">
              OpenAPI
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blank">
            <form className="flex flex-col gap-5 pt-2" onSubmit={submitBlank}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="request-name">Name</FieldLabel>
                  <Input
                    id="request-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="New request"
                    autoFocus
                    className="rounded-none"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel htmlFor="request-type">Request type</FieldLabel>
                    <Select
                      value={
                        transport === "websocket"
                          ? "websocket"
                          : mode === "sse"
                            ? "sse"
                            : "http"
                      }
                      onValueChange={(value) => {
                        if (value === "websocket") {
                          setTransport("websocket")
                          setMode("standard")
                        } else {
                          setTransport("http")
                          setMode(value === "sse" ? "sse" : "standard")
                        }
                        setMethod("GET")
                      }}
                    >
                      <SelectTrigger
                        id="request-type"
                        className="w-full rounded-none"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Request type</SelectLabel>
                          <SelectItem value="http">HTTP</SelectItem>
                          <SelectItem value="sse">
                            Server-Sent Events
                          </SelectItem>
                          <SelectItem value="websocket">WebSocket</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field data-disabled={transport === "websocket"}>
                    <FieldLabel htmlFor="request-method">Method</FieldLabel>
                    <Select
                      value={method}
                      onValueChange={(value) =>
                        setMethod(value as RequestMethod)
                      }
                      disabled={transport === "websocket"}
                    >
                      <SelectTrigger
                        id="request-method"
                        className="w-full rounded-none"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>HTTP method</SelectLabel>
                          {HTTP_METHODS.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="request-url">URL</FieldLabel>
                  <Input
                    id="request-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder={
                      transport === "websocket"
                        ? "wss://example.com/socket"
                        : mode === "sse"
                          ? "https://example.com/events"
                          : "https://api.example.com/resource"
                    }
                    className="rounded-none"
                  />
                </Field>
              </FieldGroup>
              <ImportError message={error} />
              <DialogFooter>
                <Button type="submit" disabled={!name.trim() || pending}>
                  {pending ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : null}
                  {pending ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="curl">
            <div className="flex flex-col gap-5 pt-2">
              <FieldGroup>
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="curl-source">cURL command</FieldLabel>
                  <Textarea
                    id="curl-source"
                    value={curlSource}
                    onChange={(event) => {
                      setCurlSource(event.target.value)
                      setCurlPreview(null)
                      setError("")
                    }}
                    placeholder="curl --request POST 'https://api.example.com/items'"
                    className="min-h-40 rounded-none font-mono text-xs"
                    aria-invalid={Boolean(error)}
                  />
                  <FieldDescription>
                    The command is parsed locally and is never executed.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              {curlPreview ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="curl-name">Request name</FieldLabel>
                    <Input
                      id="curl-name"
                      value={curlName}
                      onChange={(event) => setCurlName(event.target.value)}
                      className="rounded-none"
                    />
                  </Field>
                  <ImportPreview
                    icon={<TerminalSquareIcon />}
                    title={`${curlPreview.method} ${curlPreview.url}`}
                    details={[
                      `${curlPreview.draft.params.length} parameters`,
                      `${curlPreview.draft.headers.length} headers`,
                      `${curlPreview.draft.body.mode} body`,
                    ]}
                    warnings={curlPreview.warnings}
                  />
                </>
              ) : null}
              <ImportError message={error} />
              <DialogFooter>
                {curlPreview ? (
                  <Button
                    type="button"
                    onClick={importCurl}
                    disabled={!curlName.trim() || pending}
                    className="rounded-none font-mono uppercase"
                  >
                    {pending ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : null}
                    {pending ? "Importing…" : "Import request"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={parseCurl}
                    disabled={!curlSource.trim()}
                    className="rounded-none font-mono uppercase"
                  >
                    Preview import
                  </Button>
                )}
              </DialogFooter>
            </div>
          </TabsContent>

          <TabsContent value="openapi">
            <div className="flex flex-col gap-5 pt-2">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="openapi-file">OpenAPI file</FieldLabel>
                  <Input
                    id="openapi-file"
                    type="file"
                    accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
                    onChange={loadOpenApiFile}
                    className="rounded-none"
                  />
                </Field>
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="openapi-source">JSON or YAML</FieldLabel>
                  <Textarea
                    id="openapi-source"
                    value={openApiSource}
                    onChange={(event) => {
                      setOpenApiSource(event.target.value)
                      setOpenApiFileName("")
                      setOpenApiPreview(null)
                      setError("")
                    }}
                    placeholder={
                      "openapi: 3.1.0\ninfo:\n  title: Example API\npaths: {}"
                    }
                    className="min-h-52 rounded-none font-mono text-xs"
                    aria-invalid={Boolean(error)}
                  />
                  <FieldDescription>
                    OpenAPI 3.0 and 3.1 are supported. External references are
                    reported as warnings.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              {openApiPreview ? (
                <ImportPreview
                  icon={<FileJsonIcon />}
                  title={collectionName}
                  details={[
                    `OpenAPI ${openApiPreview.version}`,
                    `${openApiPreview.requests.length} operations`,
                    `${openApiPreview.tagCount} tag folders`,
                    `${openApiPreview.skippedOperations} skipped`,
                  ]}
                  warnings={openApiPreview.warnings}
                />
              ) : null}
              <ImportError message={error} />
              <DialogFooter>
                {openApiPreview ? (
                  <Button
                    type="button"
                    onClick={importOpenApi}
                    disabled={pending}
                    className="rounded-none font-mono uppercase"
                  >
                    {pending ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : null}
                    {pending
                      ? "Importing…"
                      : `Import ${openApiPreview.requests.length} requests`}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={parseOpenApi}
                    disabled={!openApiSource.trim()}
                    className="rounded-none font-mono uppercase"
                  >
                    Preview import
                  </Button>
                )}
              </DialogFooter>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function ImportPreview({
  icon,
  title,
  details,
  warnings,
}: {
  icon: React.ReactNode
  title: string
  details: string[]
  warnings: string[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-none border p-3">
        <div className="mt-0.5 text-muted-foreground [&>svg]:size-4">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {details.map((detail) => (
              <span key={detail}>{detail}</span>
            ))}
          </div>
        </div>
      </div>
      {warnings.length ? (
        <Alert className="rounded-none!">
          <AlertTriangleIcon className="text-muted-foreground" />
          <AlertTitle>Review import warnings</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 list-disc">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function ImportError({ message }: { message: string }) {
  if (!message) return null
  return (
    <Field data-invalid>
      <FieldError>{message}</FieldError>
    </Field>
  )
}

function uniqueCollectionName(title: string, existingNames: string[]) {
  const names = new Set(existingNames.map((name) => name.toLowerCase()))
  if (!names.has(title.toLowerCase())) return title
  let suffix = 2
  while (names.has(`${title} (${suffix})`.toLowerCase())) suffix += 1
  return `${title} (${suffix})`
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

const HTTP_METHODS: RequestMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]
