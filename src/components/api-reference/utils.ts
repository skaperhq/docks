import { apiSecuritySchemes } from "@/lib/openapi"
import type { ApiOperation, ApiParameter } from "@/lib/openapi"
import type { KeyValueRow } from "./types"

export function parameterToRow(parameter: ApiParameter): KeyValueRow {
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

/** Builds editable request headers derived from an OpenAPI operation. */
export function getHeaderRows(operation: ApiOperation): KeyValueRow[] {
  const rows: KeyValueRow[] = []

  for (const securityName of operation.securitySchemeNames) {
    const scheme = apiSecuritySchemes.find((item) => item.id === securityName)
    const variableName = securityName.replaceAll(/[^a-zA-Z0-9_]/g, "_")

    if (scheme?.type === "http" && scheme.scheme?.toLowerCase() === "bearer") {
      rows.push({
        key: "Authorization",
        value: `Bearer {{${securityName === "bearerAuth" ? "access_token" : variableName}}}`,
        description: `Generated from ${securityName} security`,
      })
    } else if (
      scheme?.type === "http" &&
      scheme.scheme?.toLowerCase() === "basic"
    ) {
      rows.push({
        key: "Authorization",
        value: `Basic {{${variableName}}}`,
        description: `Generated from ${securityName} security`,
      })
    } else if (
      scheme?.type === "apiKey" &&
      scheme.location === "header" &&
      scheme.parameterName
    ) {
      rows.push({
        key: scheme.parameterName,
        value: `{{${variableName}}}`,
        description: `Generated from ${securityName} security`,
      })
    }
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

/**
 * Restores the template for system-generated bearer headers that older
 * versions persisted after resolving the active environment secret.
 */
export function restoreGeneratedHeaderTemplates(
  headers: KeyValueRow[]
): KeyValueRow[] {
  return headers.map((header) => {
    const isGeneratedBearerHeader =
      header.key.trim().toLowerCase() === "authorization" &&
      header.description === "Generated from bearerAuth security"

    if (!isGeneratedBearerHeader || header.value.includes("{{")) {
      return header
    }

    return {
      ...header,
      value: "Bearer {{access_token}}",
    }
  })
}

export function getMethodClassName(method: string) {
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
    case "WS":
      return "text-violet-600 dark:text-violet-400"
    default:
      return "text-muted-foreground"
  }
}

export function getBgMethodClassName(method: string) {
  switch (method) {
    case "GET":
      return "bg-emerald-50 dark:bg-[#003415] border border-emerald-200 dark:border-[#6bdd9a]/30"
    case "POST":
      return "bg-amber-50 dark:bg-[#3a2b00] border border-amber-200 dark:border-[#f5d36b]/30"
    case "PUT":
    case "PATCH":
      return "bg-blue-50 dark:bg-[#00274d] border border-blue-200 dark:border-[#74aef6]/30"
    case "DELETE":
      return "bg-rose-50 dark:bg-[#4d1a00] border border-rose-200 dark:border-[#ff8d7a]/30"
    case "WS":
      return "bg-violet-50 dark:bg-[#2e1065] border border-violet-200 dark:border-[#2e1065]/30"
    default:
      return "bg-muted border dark:bg-muted-foreground/10 border-border"
  }
}

export function formatBodyExample(example: unknown) {
  if (example === null || example === undefined) {
    return ""
  }

  if (typeof example === "string") {
    return example
  }

  return JSON.stringify(example, null, 2)
}

export function prettyPrintJson(value: string) {
  if (!value.trim()) {
    return value
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    // Editors may call this while a user is halfway through valid JSON. Keep
    // their draft intact instead of treating an incomplete value as an error.
    return value
  }
}

export function shouldCreateRow(patch: Partial<KeyValueRow>) {
  return Boolean(
    patch.key?.trim() ||
    patch.value?.trim() ||
    patch.description?.trim() ||
    patch.type === "file"
  )
}

export function normalizeKeyValueRow(row: KeyValueRow): KeyValueRow {
  return {
    ...row,
    enabled: row.enabled ?? true,
    value: row.value,
    description: row.description,
  }
}

export const emptyKeyValueRow: KeyValueRow = {
  key: "",
  value: "",
  description: "",
  enabled: true,
}

export const leanCellInputClassName =
  "h-8.5 rounded-none border-0 bg-transparent px-4 font-sans text-[12px] text-foreground shadow-none focus-visible:ring-0 focus-visible:border-0 placeholder:text-muted-foreground/55"
