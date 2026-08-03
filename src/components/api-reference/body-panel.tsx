import * as React from "react"
import type { ApiOperation } from "@/lib/openapi"
import type { RequestBodyDraft } from "./types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BodyEditor } from "./body-editor"
import { KeyValueTable } from "./key-value-table"
import { prettyPrintJson } from "./utils"

export function BodyPanel({
  operation,
  requestId,
  body,
  onBodyChange,
}: {
  operation?: ApiOperation
  requestId?: string
  body: RequestBodyDraft
  onBodyChange: (body: RequestBodyDraft) => void
}) {
  const updateBody = React.useCallback(
    (patch: Partial<RequestBodyDraft>) => {
      onBodyChange({ ...body, ...patch })
    },
    [body, onBodyChange]
  )

  const isRaw = body.mode === "raw"

  return (
    <section className="flex min-h-[calc(100svh-17rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
          <RadioGroup
            aria-label="Request body mode"
            name={`body-mode-${operation?.id ?? requestId ?? "custom"}`}
            value={body.mode}
            onValueChange={(mode) =>
              updateBody({
                mode,
                contentType:
                  mode === "form-data"
                    ? "multipart/form-data"
                    : mode === "x-www-form-urlencoded"
                      ? "application/x-www-form-urlencoded"
                      : mode === "binary"
                        ? "application/octet-stream"
                        : mode === "graphql"
                          ? "application/json"
                          : mode === "raw" && !isRawBodyType(body.contentType)
                            ? "application/json"
                            : body.contentType,
              })
            }
            className="flex flex-wrap items-center gap-5"
          >
            {BODY_MODES.map((mode) => (
              <label
                key={mode.value}
                className="inline-flex cursor-pointer items-center gap-2 text-sm"
              >
                <RadioGroupItem value={mode.value} />
                <span
                  className={body.mode === mode.value ? "text-foreground" : ""}
                >
                  {mode.label}
                </span>
              </label>
            ))}
          </RadioGroup>
          {isRaw ? (
            <Select
              value={body.contentType}
              onValueChange={(contentType) => updateBody({ contentType })}
            >
              <SelectTrigger
                aria-label="Raw body type"
                className="h-8 w-32 rounded-none border-0 bg-muted px-2 py-1 text-foreground shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Body Type</SelectLabel>
                  {RAW_BODY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
        </div>
        {isRaw ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-3 text-blue-500 hover:text-blue-400"
            onClick={() => updateBody({ value: prettyPrintJson(body.value) })}
            disabled={!body.contentType.toLowerCase().includes("json")}
          >
            Beautify
          </Button>
        ) : null}
      </div>
      <RequestBodyModeContent body={body} updateBody={updateBody} />
    </section>
  )
}

export const BODY_MODES = [
  { value: "none", label: "none" },
  { value: "form-data", label: "form-data" },
  { value: "x-www-form-urlencoded", label: "x-www-form-urlencoded" },
  { value: "raw", label: "raw" },
  { value: "binary", label: "binary" },
  { value: "graphql", label: "GraphQL" },
] as const

export const RAW_BODY_TYPES = [
  { value: "text/plain", label: "Text" },
  { value: "application/javascript", label: "JavaScript" },
  { value: "application/json", label: "JSON" },
  { value: "text/html", label: "HTML" },
  { value: "application/xml", label: "XML" },
] as const

function isRawBodyType(contentType: string) {
  return RAW_BODY_TYPES.some((item) => item.value === contentType)
}

function RequestBodyModeContent({
  body,
  updateBody,
}: {
  body: RequestBodyDraft
  updateBody: (patch: Partial<RequestBodyDraft>) => void
}) {
  if (body.mode === "none") {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-none border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        This request will be sent without a body.
      </div>
    )
  }

  if (body.mode === "form-data") {
    return (
      <KeyValueTable
        title="Form Data"
        rows={body.formDataRows ?? []}
        onRowsChange={(formDataRows) => updateBody({ formDataRows })}
        emptyMessage="Add form-data rows for this request."
        allowFileValues
      />
    )
  }

  if (body.mode === "x-www-form-urlencoded") {
    return (
      <KeyValueTable
        title="URL Encoded"
        rows={body.urlEncodedRows ?? []}
        onRowsChange={(urlEncodedRows) => updateBody({ urlEncodedRows })}
        emptyMessage="Add x-www-form-urlencoded rows for this request."
      />
    )
  }

  if (body.mode === "binary") {
    return (
      <div className="flex max-w-xl flex-col gap-3 rounded-none border border-border bg-card p-4">
        <div className="text-sm font-medium text-foreground">Binary Body</div>
        <p className="text-sm text-muted-foreground">
          Select a file to send as the raw request payload. File contents stay
          in this browser session; the draft only persists the file name.
        </p>
        <Input
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            updateBody({
              binaryFile: file,
              binaryFileName: file?.name ?? "",
              contentType:
                file?.type || body.contentType || "application/octet-stream",
            })
          }}
          className="max-w-md rounded-none"
        />
        <div className="text-xs text-muted-foreground">
          {body.binaryFile
            ? `${body.binaryFileName || "Selected file"} · ${formatFileSize(body.binaryFile.size)}`
            : body.binaryFileName
              ? `${body.binaryFileName} must be selected again before sending.`
              : "No file selected."}
        </div>
      </div>
    )
  }

  if (body.mode === "graphql") {
    return (
      <div className="grid min-h-96 flex-1 gap-4 lg:grid-cols-2">
        <GraphqlEditor
          label="Query"
          value={body.graphqlQuery ?? ""}
          contentType="text/plain"
          onChange={(graphqlQuery) => updateBody({ graphqlQuery })}
        />
        <GraphqlEditor
          label="GraphQL Variables"
          value={body.graphqlVariables ?? ""}
          contentType="application/json"
          onChange={(graphqlVariables) => updateBody({ graphqlVariables })}
        />
      </div>
    )
  }

  return (
    <div className="min-h-96 flex-1 overflow-hidden rounded-none border border-border bg-card">
      <BodyEditor
        value={body.value}
        onChange={(value) => updateBody({ value })}
        contentType={body.contentType}
        className="min-h-96"
      />
    </div>
  )
}

function GraphqlEditor({
  label,
  value,
  contentType,
  onChange,
}: {
  label: string
  value: string
  contentType: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex min-h-96 min-w-0 flex-col gap-2">
      <div className="text-xs font-medium tracking-wide text-foreground uppercase">
        {label}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-none border border-border bg-card">
        <BodyEditor
          value={value}
          onChange={onChange}
          contentType={contentType}
          className="h-full min-h-96"
        />
      </div>
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
