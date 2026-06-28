import * as React from "react"
import type { ApiOperation } from "@/lib/openapi"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatBodyExample, prettyPrintJson } from "./utils"

export function BodyPanel({ operation }: { operation: ApiOperation }) {
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
