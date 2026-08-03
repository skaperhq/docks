import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Container,
  Info,
  CirclePlus,
} from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useEnvironment } from "@/components/environment-provider"
import type { EnvironmentVariable } from "@/components/environment-provider"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { SavedResponseSummary } from "@/components/api-reference/types"
import type {
  PersistedCollection,
  PersistedCustomRequest,
} from "@/lib/api-reference-actions"
import {
  createCollectionWithRequests,
  createCustomRequest,
  deleteCollection,
  deleteCustomRequest,
  deleteRequestTab,
  deleteSavedResponse,
  getCachedApiSidebarWorkspace,
  getApiWorkspace,
  setCachedApiSidebarWorkspace,
} from "@/lib/api-reference-actions"
import type {
  CreateRequestInput,
  ImportOpenApiInput,
} from "@/components/request-import-dialog"

export const Route = createFileRoute("/environment")({
  component: EnvironmentRoutePage,
})

function EnvironmentRoutePage() {
  const navigate = useNavigate()

  return (
    <EnvironmentPage
      onSelectWorkspace={() =>
        navigate({ to: "/", search: { operationId: undefined } })
      }
      onSelectOperation={(operationId) =>
        navigate({ to: "/", search: { operationId } })
      }
    />
  )
}

export function EnvironmentPage({
  onSelectWorkspace,
  onSelectOperation,
}: {
  onSelectWorkspace: () => void
  onSelectOperation: (operationId: string) => void
}) {
  const {
    environments,
    activeEnvironmentId,
    activeEnvironment,
    setActiveEnvironmentId,
    addEnvironment,
    deleteEnvironment,
    updateEnvironment,
    addVariable,
    deleteVariable,
    updateVariable,
  } = useEnvironment()
  const [initialSidebarWorkspace] = React.useState(() =>
    getCachedApiSidebarWorkspace()
  )

  // Track password/secret visibility by variable id
  const [visibleSecrets, setVisibleSecrets] = React.useState<
    Record<string, boolean>
  >({})

  // Track name edits and new environment prompt
  const [newEnvName, setNewEnvName] = React.useState("")
  const [showAddPrompt, setShowAddPrompt] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "saving" | "saved"
  >("idle")
  const [collections, setCollections] = React.useState<PersistedCollection[]>(
    () => initialSidebarWorkspace?.collections ?? []
  )
  const [customRequests, setCustomRequests] = React.useState<
    PersistedCustomRequest[]
  >(() => initialSidebarWorkspace?.customRequests ?? [])
  const [savedResponses, setSavedResponses] = React.useState<
    SavedResponseSummary[]
  >(() => initialSidebarWorkspace?.savedResponses ?? [])
  const [sidebarWorkspaceLoaded, setSidebarWorkspaceLoaded] = React.useState(
    Boolean(initialSidebarWorkspace)
  )

  React.useEffect(() => {
    let cancelled = false

    void getApiWorkspace()
      .then((workspace) => {
        if (cancelled) return
        setCollections(workspace.collections)
        setCustomRequests(workspace.customRequests)
        setSavedResponses(workspace.savedResponses)
        setSidebarWorkspaceLoaded(true)
      })
      .catch((error) =>
        console.error("Failed to load API workspace for the sidebar:", error)
      )

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!sidebarWorkspaceLoaded) return
    setCachedApiSidebarWorkspace({
      collections,
      customRequests,
      savedResponses,
    })
  }, [collections, customRequests, savedResponses, sidebarWorkspaceLoaded])

  const handleUpdateBaseUrl = (id: string, value: string) => {
    setSaveStatus("saving")
    updateEnvironment(id, { baseUrl: value })
    setTimeout(() => setSaveStatus("saved"), 350)
  }

  const handleUpdateEnvName = (id: string, value: string) => {
    setSaveStatus("saving")
    updateEnvironment(id, { name: value })
    setTimeout(() => setSaveStatus("saved"), 350)
  }

  const handleUpdateVar = (
    envId: string,
    varId: string,
    updates: Partial<EnvironmentVariable>
  ) => {
    setSaveStatus("saving")
    updateVariable(envId, varId, updates)
    setTimeout(() => setSaveStatus("saved"), 350)
  }

  const toggleSecretVisibility = (varId: string) => {
    setVisibleSecrets((prev) => ({ ...prev, [varId]: !prev[varId] }))
  }

  // Handle save status reset
  React.useEffect(() => {
    if (saveStatus === "saved") {
      const timer = setTimeout(() => setSaveStatus("idle"), 2000)
      return () => clearTimeout(timer)
    }
  }, [saveStatus])

  const handleCreateEnv = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEnvName.trim()) return
    addEnvironment(newEnvName.trim())
    setNewEnvName("")
    setShowAddPrompt(false)
  }

  const handleDuplicateEnv = (env: (typeof environments)[0]) => {
    setSaveStatus("saving")
    const newVariables = env.variables.map((v) => ({
      ...v,
      id: Math.random().toString(36).substring(2, 9),
    }))
    addEnvironment(`${env.name} Copy`, env.baseUrl, newVariables)
    setTimeout(() => {
      setSaveStatus("saved")
    }, 200)
  }

  async function handleCreateCustomRequest(input: CreateRequestInput) {
    try {
      const request = await createCustomRequest({
        data: {
          ...input,
          collectionId: `${input.transport}-custom`,
          url:
            input.url ||
            (input.transport === "websocket"
              ? "wss://echo.websocket.events"
              : input.mode === "sse"
                ? "https://example.com/events"
                : "https://api.example.com/resource"),
          draft: input.draft ?? {
            params: [],
            headers: [],
            body: {
              mode: "raw",
              contentType: "application/json",
              value: "",
              formDataRows: [],
              urlEncodedRows: [],
            },
          },
          position: customRequests.filter(
            (item) => item.transport === input.transport
          ).length,
        },
      })
      setCustomRequests((requests) => [...requests, request])
      return request
    } catch (error) {
      console.error("Failed to create custom request:", error)
      return null
    }
  }

  async function handleImportOpenApi(input: ImportOpenApiInput) {
    try {
      const imported = await createCollectionWithRequests({
        data: {
          name: input.name,
          position: collections.length,
          requests: input.requests.map((request, position) => ({
            ...request,
            position,
          })),
        },
      })
      setCollections((items) => [...items, imported.collection])
      setCustomRequests((requests) => [...requests, ...imported.requests])
      return imported.requests
    } catch (error) {
      console.error("Failed to import OpenAPI collection:", error)
      return null
    }
  }

  async function handleDeleteCustomRequest(request: PersistedCustomRequest) {
    const requestKey = `custom:${request.id}`
    setCustomRequests((requests) =>
      requests.filter((item) => item.id !== request.id)
    )
    setSavedResponses((responses) =>
      responses.filter((response) => response.operationId !== requestKey)
    )

    try {
      await Promise.all([
        deleteCustomRequest({ data: request.id }),
        deleteRequestTab({ data: requestKey }),
      ])
    } catch (error) {
      console.error("Failed to delete custom request:", error)
      setCustomRequests((requests) => [...requests, request])
    }
  }

  async function handleDeleteCollection(collection: PersistedCollection) {
    const requestIds = new Set(
      customRequests
        .filter((request) => request.collectionId === collection.id)
        .map((request) => `custom:${request.id}`)
    )
    setCollections((items) => items.filter((item) => item.id !== collection.id))
    setCustomRequests((requests) =>
      requests.filter((request) => request.collectionId !== collection.id)
    )
    setSavedResponses((responses) =>
      responses.filter((response) => !requestIds.has(response.operationId))
    )

    try {
      await deleteCollection({ data: collection.id })
    } catch (error) {
      console.error("Failed to delete imported collection:", error)
      const workspace = await getApiWorkspace().catch(() => null)
      if (workspace) {
        setCollections(workspace.collections)
        setCustomRequests(workspace.customRequests)
        setSavedResponses(workspace.savedResponses)
      }
    }
  }

  async function handleDeleteSavedResponse(response: SavedResponseSummary) {
    setSavedResponses((responses) =>
      responses.filter((item) => item.id !== response.id)
    )
    try {
      await deleteSavedResponse({ data: { id: response.id } })
    } catch (error) {
      console.error("Failed to delete saved response:", error)
      setSavedResponses((responses) => [response, ...responses])
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        activePage="environment"
        selectedOperationId={null}
        savedResponses={savedResponses}
        collections={collections}
        customRequests={customRequests}
        selectedRequestId={null}
        onSelectOverview={onSelectWorkspace}
        onSelectEnvironment={() => {}}
        onSelectOperation={(operation) => onSelectOperation(operation.id)}
        onSelectSavedResponse={(response) =>
          onSelectOperation(response.operationId)
        }
        onDeleteSavedResponse={handleDeleteSavedResponse}
        onDeleteCustomRequest={handleDeleteCustomRequest}
        onDeleteCollection={handleDeleteCollection}
        onCreateCustomRequest={handleCreateCustomRequest}
        onImportOpenApi={handleImportOpenApi}
        onSelectCustomRequest={(request) =>
          onSelectOperation(`custom:${request.id}`)
        }
      />
      <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden bg-background text-foreground">
        {/* Header */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card px-2 text-muted-foreground">
          <div className="flex items-center gap-1">
            <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
            <span className="text-[14px] font-normal text-foreground">
              Environment Settings
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 font-medium text-emerald-500">
                <Check className="size-3.5" />
                All changes saved
              </span>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:divide-x md:divide-border md:overflow-hidden">
          {/* Left panel: Environment list */}
          <div className="flex max-h-64 w-full shrink-0 flex-col border-b border-border bg-card/40 md:max-h-none md:w-[18rem] md:border-b-0">
            <div className="flex items-center justify-between border-b border-border p-4">
              <span className="font-mono text-sm font-normal text-muted-foreground uppercase">
                Add Environment
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAddPrompt(true)}
                className="size-7"
                title="Create Environment"
              >
                <CirclePlus className="size-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-1.5 p-3">
                {showAddPrompt && (
                  <form
                    onSubmit={handleCreateEnv}
                    className="mb-3 space-y-2 rounded-none border border-border bg-background/50 p-2"
                  >
                    <Input
                      autoFocus
                      placeholder="Env name..."
                      value={newEnvName}
                      onChange={(e) => setNewEnvName(e.target.value)}
                      className="h-8 rounded-none text-xs"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddPrompt(false)
                          setNewEnvName("")
                        }}
                        className="h-7 rounded-none px-2 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        className="h-7 rounded-none px-2 text-xs"
                        disabled={!newEnvName.trim()}
                      >
                        Create
                      </Button>
                    </div>
                  </form>
                )}

                {environments.map((env) => {
                  const isActive = env.id === activeEnvironmentId
                  return (
                    <div
                      key={env.id}
                      className={`group relative rounded-none border transition-colors hover:shadow-sm ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background/40 text-muted-foreground"
                      }`}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        aria-pressed={isActive}
                        onClick={() => setActiveEnvironmentId(env.id)}
                        className={cn(
                          "h-auto w-full flex-col items-stretch gap-1 rounded-none px-2 py-2 text-left font-normal hover:bg-accent/50",
                          isActive &&
                            "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                        )}
                      >
                        <span className="flex items-center justify-between gap-1.5">
                          <span className="truncate font-mono text-[13px] uppercase">
                            {env.name}
                          </span>
                          {isActive && (
                            <span className="shrink-0 bg-primary-foreground px-1.5 py-0.5 font-mono text-[10px] font-medium text-black uppercase">
                              Active
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "truncate text-[11px] text-muted-foreground",
                            isActive && "text-primary-foreground/75"
                          )}
                        >
                          {env.baseUrl || "No base URL"}
                        </span>
                      </Button>

                      {/* Actions */}
                      <div className="absolute right-2 bottom-2 hidden items-center gap-1 border border-border bg-background p-0.5 shadow-sm group-hover:flex">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicateEnv(env)
                          }}
                          className="text-muted-foreground"
                          aria-label={`Duplicate ${env.name}`}
                          title="Duplicate Environment"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        {environments.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteEnvironment(env.id)
                            }}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${env.name}`}
                            title="Delete Environment"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Right panel: Environment editor */}
          <div className="flex min-h-128 min-w-0 flex-1 flex-col bg-background md:min-h-0">
            {activeEnvironment ? (
              <ScrollArea className="min-h-0 flex-1">
                <div className="max-w-4xl space-y-8 p-4 sm:p-8">
                  {/* Name and Base URL Section */}
                  <div className="min-w-0 space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-normal text-muted-foreground">
                        Environment Name
                      </label>
                      <Input
                        value={activeEnvironment.name}
                        onChange={(e) =>
                          handleUpdateEnvName(
                            activeEnvironment.id,
                            e.target.value
                          )
                        }
                        className="h-10 max-w-md rounded-none bg-card text-[15px] font-normal focus-visible:ring-primary"
                        placeholder="Production, Staging, etc."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-normal text-muted-foreground">
                        Base URL
                      </label>
                      <div className="flex flex-col gap-2">
                        <Input
                          value={activeEnvironment.baseUrl}
                          onChange={(e) =>
                            handleUpdateBaseUrl(
                              activeEnvironment.id,
                              e.target.value
                            )
                          }
                          className="h-10 max-w-xl rounded-none bg-card text-[14px] focus-visible:ring-primary"
                          placeholder="https://api.example.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Variables Grid */}
                  <div className="min-w-0 space-y-4">
                    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex flex-col gap-0.5">
                        <h2 className="text-sm font-normal text-foreground">
                          Variables & Auth Keys
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Define variables to substitute templates like{" "}
                          <code className="rounded bg-muted px-1 font-mono text-foreground">
                            {"{{access_token}}"}
                          </code>{" "}
                          in your requests.
                        </p>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => addVariable(activeEnvironment.id)}
                        className="h-8 gap-1.5 rounded-none font-mono uppercase"
                      >
                        <Plus className="size-3.5" />
                        Add Variable
                      </Button>
                    </div>

                    {/* Table Grid */}
                    <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-none border border-border bg-card/20 contain-[inline-size]">
                      <div className="grid min-w-208 grid-cols-[3rem_12rem_16rem_1fr_3.5rem] border-b border-border bg-background px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                        <div>Use</div>
                        <div>Variable Key</div>
                        <div>Value</div>
                        <div>Description</div>
                        <div className="text-center">Action</div>
                      </div>

                      {activeEnvironment.variables.length > 0 ? (
                        <div className="min-w-208 divide-y divide-border">
                          {activeEnvironment.variables.map((variable) => {
                            const showSecret =
                              visibleSecrets[variable.id] ?? false
                            return (
                              <div
                                key={variable.id}
                                className="grid grid-cols-[3rem_12rem_16rem_1fr_3.5rem] items-center px-4 py-2 transition-colors hover:bg-card/40"
                              >
                                {/* Checkbox */}
                                <div className="flex items-center">
                                  <Checkbox
                                    checked={variable.enabled}
                                    onCheckedChange={(checked) =>
                                      handleUpdateVar(
                                        activeEnvironment.id,
                                        variable.id,
                                        {
                                          enabled: checked === true,
                                        }
                                      )
                                    }
                                    aria-label="Toggle variable use"
                                  />
                                </div>

                                {/* Key */}
                                <div className="pr-3">
                                  <Input
                                    value={variable.key}
                                    onChange={(e) =>
                                      handleUpdateVar(
                                        activeEnvironment.id,
                                        variable.id,
                                        {
                                          key: e.target.value,
                                        }
                                      )
                                    }
                                    className="h-8 rounded-none border-border/80 bg-background text-[12px] focus-visible:ring-primary"
                                    placeholder="variable_key"
                                  />
                                </div>

                                {/* Value */}
                                <div className="pr-3">
                                  <InputGroup className="rounded-none border-border/80 bg-background">
                                    <InputGroupInput
                                      type={showSecret ? "text" : "password"}
                                      value={variable.value}
                                      onChange={(e) =>
                                        handleUpdateVar(
                                          activeEnvironment.id,
                                          variable.id,
                                          {
                                            value: e.target.value,
                                          }
                                        )
                                      }
                                      className="text-[12px]"
                                      placeholder="value"
                                    />
                                    <InputGroupAddon align="inline-end">
                                      <InputGroupButton
                                        size="icon-xs"
                                        onClick={() =>
                                          toggleSecretVisibility(variable.id)
                                        }
                                        aria-label={
                                          showSecret
                                            ? "Hide value"
                                            : "Show value"
                                        }
                                        title={
                                          showSecret
                                            ? "Hide value"
                                            : "Show value"
                                        }
                                      >
                                        {showSecret ? <EyeOff /> : <Eye />}
                                      </InputGroupButton>
                                    </InputGroupAddon>
                                  </InputGroup>
                                </div>

                                {/* Description */}
                                <div className="pr-2">
                                  <Input
                                    value={variable.description || ""}
                                    onChange={(e) =>
                                      handleUpdateVar(
                                        activeEnvironment.id,
                                        variable.id,
                                        {
                                          description: e.target.value,
                                        }
                                      )
                                    }
                                    className="h-8 rounded-none border-border/80 bg-background text-[12px] focus-visible:ring-primary"
                                    placeholder="e.g. Authentication token"
                                  />
                                </div>

                                {/* Delete */}
                                <div className="flex justify-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() =>
                                      deleteVariable(
                                        activeEnvironment.id,
                                        variable.id
                                      )
                                    }
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label={`Delete ${variable.key || "variable"}`}
                                    title="Delete Variable"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                          No variables defined. Click "Add Variable" to define
                          environment values.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Info alert block */}
                  <div className="bg-muted-background flex gap-3 rounded-none border p-4 text-xs leading-relaxed text-muted-foreground dark:text-muted-foreground/90">
                    <Info className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1 wrap-break-word">
                      To reference these variables in your request details, type
                      the variable key wrapped in double curly braces, like{" "}
                      <code className="rounded bg-muted/50 px-1 font-mono">
                        {"{{access_token}}"}
                      </code>
                      . The values will be substituted in headers, auth configs,
                      and URL paths when displaying and making requests.
                    </div>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <Container className="mb-4 size-12 text-muted-foreground/45" />
                <h3 className="mb-1 text-base font-semibold text-foreground">
                  No Active Environment
                </h3>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Create or select an environment from the list on the left to
                  start editing.
                </p>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
