import type { ApiOperation, SchemaObject } from "./openapi"
import type {
  KeyValueRow,
  RequestBodyDraft,
  RequestDraft,
} from "@/components/api-reference/types"

type RequestBodyMode =
  "none" | "form-data" | "x-www-form-urlencoded" | "raw" | "binary" | "graphql"

/** Creates the initial editor state that matches an operation's media type. */
export function createOperationRequestBodyDraft(
  operation?: ApiOperation
): RequestBodyDraft {
  const contentType = operation?.requestContentTypes[0] ?? ""
  const mode = getRequestBodyMode(contentType)
  const generatedRows = operation ? createSchemaRows(operation) : []

  return {
    mode,
    contentType: contentType || (mode === "raw" ? "application/json" : ""),
    value: mode === "raw" ? formatBodyExample(operation?.requestExample) : "",
    formDataRows: mode === "form-data" ? generatedRows : [],
    urlEncodedRows: mode === "x-www-form-urlencoded" ? generatedRows : [],
  }
}

/**
 * Repairs drafts saved before media-type-aware body selection was introduced.
 * Only the old raw/media-type mismatch is changed, preserving explicit modes.
 */
export function normalizeOperationRequestDraft(
  operation: ApiOperation,
  draft: RequestDraft
): RequestDraft {
  if (draft.body.mode !== "raw") {
    return draft
  }

  const expectedMode = getRequestBodyMode(draft.body.contentType)
  if (expectedMode === "raw" || expectedMode === "none") {
    return draft
  }

  const generatedRows = createSchemaRows(operation)

  return {
    ...draft,
    body: {
      ...draft.body,
      mode: expectedMode,
      value: "",
      formDataRows:
        expectedMode === "form-data" &&
        (draft.body.formDataRows?.length ?? 0) === 0
          ? generatedRows
          : draft.body.formDataRows,
      urlEncodedRows:
        expectedMode === "x-www-form-urlencoded" &&
        (draft.body.urlEncodedRows?.length ?? 0) === 0
          ? generatedRows
          : draft.body.urlEncodedRows,
    },
  }
}

export function getRequestBodyMode(contentType: string): RequestBodyMode {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase()

  if (!mediaType) {
    return "none"
  }

  if (mediaType === "multipart/form-data") {
    return "form-data"
  }

  if (mediaType === "application/x-www-form-urlencoded") {
    return "x-www-form-urlencoded"
  }

  if (mediaType === "application/graphql") {
    return "graphql"
  }

  if (
    mediaType === "application/octet-stream" ||
    mediaType === "application/pdf" ||
    mediaType.startsWith("audio/") ||
    mediaType.startsWith("image/") ||
    mediaType.startsWith("video/")
  ) {
    return "binary"
  }

  return "raw"
}

function createSchemaRows(operation: ApiOperation): KeyValueRow[] {
  const schema = operation.requestSchema
  const properties = schema?.properties
  if (!properties) {
    return []
  }

  const requiredProperties = new Set(schema.required ?? [])
  const example = isRecord(operation.requestExample)
    ? operation.requestExample
    : {}

  return Object.entries(properties).map(([name, property]) => {
    const propertySchema = isSchemaObject(property) ? property : undefined
    const isFile = propertySchema?.format?.toLowerCase() === "binary"
    const value =
      propertySchema?.default ?? propertySchema?.example ?? example[name]

    return {
      key: name,
      value: isFile ? "" : formatRowValue(value),
      description: propertySchema?.description ?? "",
      enabled: true,
      required: requiredProperties.has(name),
      type: isFile ? "file" : (propertySchema?.type ?? "text"),
      defaultValue:
        propertySchema?.default === undefined
          ? undefined
          : formatRowValue(propertySchema.default),
      enum: propertySchema?.enum,
      pattern: propertySchema?.pattern,
      minimum: propertySchema?.minimum,
      maximum: propertySchema?.maximum,
      minLength: propertySchema?.minLength,
      maxLength: propertySchema?.maxLength,
      example: propertySchema?.example,
    }
  })
}

function isSchemaObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null && !("$ref" in value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatRowValue(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return typeof value === "string" ? value : JSON.stringify(value)
}

function formatBodyExample(example: unknown) {
  if (example === null || example === undefined) {
    return ""
  }

  return typeof example === "string"
    ? example
    : JSON.stringify(example, null, 2)
}
