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
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/environment")({
  component: EnvironmentPage,
})

function EnvironmentPage() {
  const navigate = useNavigate()
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

  const [searchQuery, setSearchQuery] = React.useState("")
  const [requestOnly, setRequestOnly] = React.useState(false)

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

  return (
    <SidebarProvider>
      <AppSidebar
        selectedOperationId=""
        searchQuery={searchQuery}
        requestOnly={requestOnly}
        onSearchQueryChange={setSearchQuery}
        onRequestOnlyChange={setRequestOnly}
        onSelectOperation={(operation) => {
          navigate({ to: "/", search: { operationId: operation.id } })
        }}
      />
      <SidebarInset className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
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
        <div className="flex min-h-0 flex-1 divide-x divide-border overflow-hidden">
          {/* Left panel: Environment list */}
          <div className="flex w-[18rem] shrink-0 flex-col bg-card/40">
            <div className="flex items-center justify-between border-b border-border p-4">
              <span className="text-sm font-normal text-muted-foreground">
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
                    className="mb-3 space-y-2 rounded-md border border-primary/30 bg-background/50 p-2"
                  >
                    <Input
                      autoFocus
                      placeholder="Env name..."
                      value={newEnvName}
                      onChange={(e) => setNewEnvName(e.target.value)}
                      className="h-8 text-xs"
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
                        className="h-7 px-2 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        className="h-7 px-2 text-xs"
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
                      onClick={() => setActiveEnvironmentId(env.id)}
                      className={`group relative flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-left transition-all duration-200 hover:shadow-sm ${
                        isActive
                          ? "border-primary bg-primary text-white hover:bg-primary/90"
                          : "border-border bg-background/40 text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-[13px] font-normal">
                          {env.name}
                        </span>
                        {isActive && (
                          <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-black">
                            Active
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "truncate text-[11px] text-muted-foreground",
                          isActive && "text-white/80"
                        )}
                      >
                        {env.baseUrl || "No base URL"}
                      </span>

                      {/* Actions */}
                      <div className="absolute right-2 bottom-2 hidden items-center gap-1 rounded-md border border-border bg-background p-0.5 shadow-sm group-hover:flex">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicateEnv(env)
                          }}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Duplicate Environment"
                        >
                          <Copy className="size-3.5" />
                        </button>
                        {environments.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteEnvironment(env.id)
                            }}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete Environment"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Right panel: Environment editor */}
          <div className="flex flex-1 flex-col bg-background">
            {activeEnvironment ? (
              <ScrollArea className="flex-1">
                <div className="max-w-4xl space-y-8 p-8">
                  {/* Name and Base URL Section */}
                  <div className="space-y-4">
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
                        className="h-10 max-w-md bg-card text-[15px] font-normal focus-visible:ring-primary"
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
                          className="h-10 max-w-xl bg-card text-[14px] focus-visible:ring-primary"
                          placeholder="https://api.example.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Variables Grid */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
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
                        className="h-8 gap-1.5"
                      >
                        <Plus className="size-3.5" />
                        Add Variable
                      </Button>
                    </div>

                    {/* Table Grid */}
                    <div className="overflow-hidden rounded-md border border-border bg-card/20">
                      <div className="grid grid-cols-[3rem_12rem_16rem_1fr_3.5rem] border-b border-border bg-background px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                        <div>Use</div>
                        <div>Variable Key</div>
                        <div>Value</div>
                        <div>Description</div>
                        <div className="text-center">Action</div>
                      </div>

                      {activeEnvironment.variables.length > 0 ? (
                        <div className="divide-y divide-border">
                          {activeEnvironment.variables.map((variable) => {
                            const isSecret = variable.isSecret ?? false
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
                                    className="h-8 border-border/80 bg-background text-[12px] focus-visible:ring-primary"
                                    placeholder="variable_key"
                                  />
                                </div>

                                {/* Value */}
                                <div className="relative flex items-center gap-1.5 pr-3">
                                  <Input
                                    type={
                                      isSecret && !showSecret
                                        ? "password"
                                        : "text"
                                    }
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
                                    className="h-8 flex-1 border-border/80 bg-background pr-8 text-[12px] focus-visible:ring-primary"
                                    placeholder="value"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleSecretVisibility(variable.id)
                                    }
                                    className="absolute right-5 p-1 text-muted-foreground transition-colors hover:text-foreground"
                                    title={
                                      showSecret ? "Hide value" : "Show value"
                                    }
                                  >
                                    {showSecret ? (
                                      <EyeOff className="size-3.5" />
                                    ) : (
                                      <Eye className="size-3.5" />
                                    )}
                                  </button>
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
                                    className="h-8 border-border/80 bg-background text-[12px] focus-visible:ring-primary"
                                    placeholder="e.g. Authentication token"
                                  />
                                </div>

                                {/* Delete */}
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteVariable(
                                        activeEnvironment.id,
                                        variable.id
                                      )
                                    }
                                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    title="Delete Variable"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
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
                  <div className="bg-muted-background flex gap-3 rounded-md border p-4 text-xs leading-relaxed text-muted-foreground dark:text-muted-foreground/90">
                    <Info className="size-5 shrink-0 text-primary" />
                    <div>
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
