import type { FormEvent } from "react"
import {
  CirclePlus,
  Container,
  Copy,
  Eye,
  EyeOff,
  Info,
  Plus,
  Trash2,
} from "lucide-react"

import type {
  Environment,
  EnvironmentVariable,
} from "@/components/environment-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function EnvironmentList({
  environments,
  activeEnvironmentId,
  showAddPrompt,
  newEnvironmentName,
  onShowAddPromptChange,
  onNewEnvironmentNameChange,
  onCreateEnvironment,
  onSelectEnvironment,
  onDuplicateEnvironment,
  onDeleteEnvironment,
}: {
  environments: Environment[]
  activeEnvironmentId: string | null
  showAddPrompt: boolean
  newEnvironmentName: string
  onShowAddPromptChange: (open: boolean) => void
  onNewEnvironmentNameChange: (name: string) => void
  onCreateEnvironment: (event: FormEvent) => void
  onSelectEnvironment: (id: string) => void
  onDuplicateEnvironment: (environment: Environment) => void
  onDeleteEnvironment: (id: string) => void
}) {
  return (
    <div className="flex max-h-64 w-full shrink-0 flex-col border-b border-border bg-card/40 md:max-h-none md:w-[18rem] md:border-b-0">
      <div className="flex items-center justify-between border-b border-border p-4">
        <span className="font-mono text-sm font-normal text-muted-foreground uppercase">
          Add Environment
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onShowAddPromptChange(true)}
          className="size-7"
          aria-label="Create environment"
          title="Create Environment"
        >
          <CirclePlus />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5 p-3">
          {showAddPrompt ? (
            <form
              onSubmit={onCreateEnvironment}
              className="mb-3 flex flex-col gap-2 rounded-none border border-border bg-background/50 p-2"
            >
              <Input
                autoFocus
                placeholder="Environment name"
                value={newEnvironmentName}
                onChange={(event) =>
                  onNewEnvironmentNameChange(event.target.value)
                }
                className="h-8 rounded-none text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onShowAddPromptChange(false)
                    onNewEnvironmentNameChange("")
                  }}
                  className="h-7 rounded-none px-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 rounded-none px-2 text-xs"
                  disabled={!newEnvironmentName.trim()}
                >
                  Create
                </Button>
              </div>
            </form>
          ) : null}

          {environments.map((environment) => {
            const isActive = environment.id === activeEnvironmentId
            return (
              <div
                key={environment.id}
                className={cn(
                  "group relative rounded-none border transition-colors hover:shadow-sm",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background/40 text-muted-foreground"
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={isActive}
                  onClick={() => onSelectEnvironment(environment.id)}
                  className={cn(
                    "h-auto w-full flex-col items-stretch gap-1 rounded-none px-2 py-2 text-left font-normal hover:bg-accent/50",
                    isActive &&
                      "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  )}
                >
                  <span className="flex items-center justify-between gap-1.5">
                    <span className="truncate font-mono text-[13px] uppercase">
                      {environment.name}
                    </span>
                    {isActive ? (
                      <span className="shrink-0 bg-primary-foreground px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary uppercase">
                        Active
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "truncate text-[11px] text-muted-foreground",
                      isActive && "text-primary-foreground/75"
                    )}
                  >
                    {environment.baseUrl || "No base URL"}
                  </span>
                </Button>

                <div className="absolute right-2 bottom-2 hidden items-center gap-1 border border-border bg-background p-0.5 shadow-sm group-hover:flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDuplicateEnvironment(environment)
                    }}
                    className="text-muted-foreground"
                    aria-label={`Duplicate ${environment.name}`}
                    title="Duplicate Environment"
                  >
                    <Copy />
                  </Button>
                  {environments.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteEnvironment(environment.id)
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${environment.name}`}
                      title="Delete Environment"
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

export function EnvironmentEditor({
  environment,
  visibleSecrets,
  onUpdateName,
  onUpdateBaseUrl,
  onAddVariable,
  onUpdateVariable,
  onToggleSecretVisibility,
  onDeleteVariable,
}: {
  environment: Environment | null
  visibleSecrets: Record<string, boolean>
  onUpdateName: (value: string) => void
  onUpdateBaseUrl: (value: string) => void
  onAddVariable: () => void
  onUpdateVariable: (
    variableId: string,
    updates: Partial<EnvironmentVariable>
  ) => void
  onToggleSecretVisibility: (variableId: string) => void
  onDeleteVariable: (variableId: string) => void
}) {
  return (
    <div className="flex min-h-128 min-w-0 flex-1 flex-col bg-background md:min-h-0">
      {environment ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex max-w-4xl flex-col gap-8 p-4 sm:p-8">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-normal text-muted-foreground">
                  Environment Name
                </label>
                <Input
                  value={environment.name}
                  onChange={(event) => onUpdateName(event.target.value)}
                  className="h-10 max-w-md rounded-none bg-card text-[15px] font-normal focus-visible:ring-primary"
                  placeholder="Production, Staging, etc."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-normal text-muted-foreground">
                  Base URL
                </label>
                <Input
                  value={environment.baseUrl}
                  onChange={(event) => onUpdateBaseUrl(event.target.value)}
                  className="h-10 max-w-xl rounded-none bg-card text-[14px] focus-visible:ring-primary"
                  placeholder="https://api.example.com"
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
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
                  onClick={onAddVariable}
                  className="h-8 gap-1.5 rounded-none font-mono uppercase"
                >
                  <Plus />
                  Add Variable
                </Button>
              </div>

              <EnvironmentVariableTable
                environment={environment}
                visibleSecrets={visibleSecrets}
                onUpdateVariable={onUpdateVariable}
                onToggleSecretVisibility={onToggleSecretVisibility}
                onDeleteVariable={onDeleteVariable}
              />
            </div>

            <Alert className="rounded-none p-4">
              <Info />
              <AlertDescription className="min-w-0 flex-1 text-xs leading-relaxed wrap-break-word">
                To reference these variables in your request details, type the
                variable key wrapped in double curly braces, like{" "}
                <code className="rounded bg-muted/50 px-1 font-mono">
                  {"{{access_token}}"}
                </code>
                . The values will be substituted in headers, auth configs, and
                URL paths when displaying and making requests.
              </AlertDescription>
            </Alert>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <Container className="mb-4 size-12 text-muted-foreground/45" />
          <h3 className="mb-1 text-base font-semibold text-foreground">
            No Active Environment
          </h3>
          <p className="max-w-sm text-xs text-muted-foreground">
            Create or select an environment from the list on the left to start
            editing.
          </p>
        </div>
      )}
    </div>
  )
}

function EnvironmentVariableTable({
  environment,
  visibleSecrets,
  onUpdateVariable,
  onToggleSecretVisibility,
  onDeleteVariable,
}: {
  environment: Environment
  visibleSecrets: Record<string, boolean>
  onUpdateVariable: (
    variableId: string,
    updates: Partial<EnvironmentVariable>
  ) => void
  onToggleSecretVisibility: (variableId: string) => void
  onDeleteVariable: (variableId: string) => void
}) {
  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-none border border-border bg-card/20 contain-[inline-size]">
      <div className="grid min-w-208 grid-cols-[3rem_12rem_16rem_1fr_3.5rem] border-b border-border bg-background px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
        <div>Use</div>
        <div>Variable Key</div>
        <div>Value</div>
        <div>Description</div>
        <div className="text-center">Action</div>
      </div>

      {environment.variables.length > 0 ? (
        <div className="min-w-208 divide-y divide-border">
          {environment.variables.map((variable) => {
            const showSecret = visibleSecrets[variable.id] ?? false
            return (
              <div
                key={variable.id}
                className="grid grid-cols-[3rem_12rem_16rem_1fr_3.5rem] items-center px-4 py-2 transition-colors hover:bg-card/40"
              >
                <div className="flex items-center">
                  <Checkbox
                    checked={variable.enabled}
                    onCheckedChange={(checked) =>
                      onUpdateVariable(variable.id, {
                        enabled: checked === true,
                      })
                    }
                    aria-label={`Use ${variable.key || "variable"}`}
                  />
                </div>

                <div className="pr-3">
                  <Input
                    value={variable.key}
                    onChange={(event) =>
                      onUpdateVariable(variable.id, {
                        key: event.target.value,
                      })
                    }
                    className="h-8 rounded-none border-border/80 bg-background text-[12px] focus-visible:ring-primary"
                    placeholder="variable_key"
                  />
                </div>

                <div className="pr-3">
                  <InputGroup className="rounded-none border-border/80 bg-background">
                    <InputGroupInput
                      type={showSecret ? "text" : "password"}
                      value={variable.value}
                      onChange={(event) =>
                        onUpdateVariable(variable.id, {
                          value: event.target.value,
                        })
                      }
                      className="text-[12px]"
                      placeholder="value"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        onClick={() => onToggleSecretVisibility(variable.id)}
                        aria-label={showSecret ? "Hide value" : "Show value"}
                        title={showSecret ? "Hide value" : "Show value"}
                      >
                        {showSecret ? <EyeOff /> : <Eye />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </div>

                <div className="pr-2">
                  <Input
                    value={variable.description || ""}
                    onChange={(event) =>
                      onUpdateVariable(variable.id, {
                        description: event.target.value,
                      })
                    }
                    className="h-8 rounded-none border-border/80 bg-background text-[12px] focus-visible:ring-primary"
                    placeholder="e.g. Authentication token"
                  />
                </div>

                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDeleteVariable(variable.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${variable.key || "variable"}`}
                    title="Delete Variable"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No variables defined. Click "Add Variable" to define environment
          values.
        </div>
      )}
    </div>
  )
}
