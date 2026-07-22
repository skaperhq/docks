import type {
  KeyValueRow,
  RequestBodyDraft,
  RequestDraft,
  ResponseState,
} from "@/components/api-reference/types"
import {
  apiInfo,
  apiOperations,
  apiResources,
  apiSecuritySchemes,
  apiServers,
  apiSpecVersion,
  getOperationGroups,
} from "./openapi"
import type { ApiOperation, ApiParameter } from "./openapi"
import type { RequestMode, RequestTransport } from "./api-reference-actions"

export type RequestPageMarkdownInput = {
  title: string
  method: string
  displayPath: string
  transport: RequestTransport
  mode: RequestMode
  requestUrl: string
  draft: RequestDraft
  curlCommand?: string
  operation?: ApiOperation
  responseState: ResponseState
}

export function buildApiOverviewMarkdown() {
  const lines = [
    `# ${apiInfo.title}`,
    "",
    `**API version:** ${apiInfo.version}  `,
    `**OpenAPI:** ${apiSpecVersion}  `,
    `**Operations:** ${apiOperations.length}`,
  ]

  if (apiInfo.description) {
    lines.push("", apiInfo.description)
  }

  if (apiResources.length > 0) {
    lines.push("", "## Resources", "")
    for (const resource of apiResources) {
      lines.push(
        `- [${escapeInline(resource.label)}](${resource.url})${resource.description ? ` — ${escapeInline(resource.description)}` : ""}`
      )
    }
  }

  lines.push("", "## Servers", "")
  if (apiServers.length === 0) {
    lines.push("No servers are declared by the OpenAPI document.")
  } else {
    for (const server of apiServers) {
      lines.push(
        `- \`${escapeInline(server.url)}\`${server.description ? ` — ${escapeInline(server.description)}` : ""}`
      )
    }
  }

  lines.push("", "## Authentication", "")
  if (apiSecuritySchemes.length === 0) {
    lines.push("No authentication schemes are declared.")
  } else {
    for (const scheme of apiSecuritySchemes) {
      const details = [
        scheme.type,
        scheme.scheme,
        scheme.location && scheme.parameterName
          ? `${scheme.location}: ${scheme.parameterName}`
          : undefined,
      ].filter(Boolean)
      lines.push(
        `- **${escapeInline(scheme.label)}**${details.length ? ` — ${details.map(escapeInline).join(", ")}` : ""}${scheme.description ? `. ${escapeInline(scheme.description)}` : ""}`
      )
    }
  }

  lines.push("", "## Operations")
  for (const group of getOperationGroups({ query: "", requestOnly: false })) {
    lines.push("", `### ${escapeInline(group.name)}`, "")
    for (const operation of group.operations) {
      lines.push(
        `- **${operation.method}** \`${escapeInline(operation.path)}\` — ${escapeInline(operation.summary)}`
      )
    }
  }

  return normalizeMarkdown(lines)
}

export function buildRequestPageMarkdown(input: RequestPageMarkdownInput) {
  const { operation } = input
  const lines = [
    `# ${escapeInline(input.title)}`,
    "",
    `**${input.method}** \`${escapeInline(input.displayPath)}\``,
  ]

  if (operation?.description || operation?.summary) {
    lines.push("", operation.description ?? operation.summary)
  }

  appendAuthentication(lines, operation)
  appendDocumentedParameters(lines, operation?.parameters ?? [])
  appendCurrentRequest(lines, input)
  appendRequestBody(lines, input.draft.body, operation)

  if (input.curlCommand) {
    lines.push("", "## cURL", "", fencedCode(input.curlCommand, "bash"))
  }

  appendDocumentedResponses(lines, operation)
  appendLatestResponse(lines, input.responseState)

  return normalizeMarkdown(lines)
}

function appendAuthentication(lines: string[], operation?: ApiOperation) {
  lines.push("", "## Authentication", "")

  if (!operation) {
    lines.push(
      "This custom request does not declare an OpenAPI authentication requirement."
    )
    return
  }

  if (operation.securitySchemeNames.length === 0) {
    lines.push("No authentication required.")
    return
  }

  for (const name of operation.securitySchemeNames) {
    const scheme = apiSecuritySchemes.find((item) => item.id === name)
    lines.push(`- ${escapeInline(scheme?.label ?? name)}`)
  }
}

function appendDocumentedParameters(
  lines: string[],
  parameters: ApiParameter[]
) {
  lines.push("", "## Documented Request Parameters", "")

  if (parameters.length === 0) {
    lines.push("No request parameters are documented.")
    return
  }

  lines.push(
    "| Name | In | Type | Required | Description | Constraints | Default | Example |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |"
  )

  for (const parameter of parameters) {
    lines.push(
      tableRow([
        parameter.name,
        parameter.location,
        parameter.type,
        parameter.required ? "Yes" : "No",
        parameter.description ?? "",
        formatParameterConstraints(parameter),
        parameter.defaultValue ?? "",
        formatInlineValue(parameter.example),
      ])
    )
  }
}

function appendCurrentRequest(
  lines: string[],
  input: RequestPageMarkdownInput
) {
  lines.push(
    "",
    "## Current Request Input",
    "",
    `- **URL:** \`${escapeInline(input.requestUrl)}\``,
    `- **Transport:** ${input.transport}`,
    `- **Mode:** ${input.mode}`,
    "",
    "### Parameters",
    ""
  )
  appendInputRows(lines, input.draft.params, "No enabled request parameters.")

  lines.push("", "### Headers", "")
  appendInputRows(lines, input.draft.headers, "No enabled request headers.")
}

function appendInputRows(
  lines: string[],
  rows: KeyValueRow[],
  emptyMessage: string
) {
  const enabledRows = rows.filter(
    (row) => row.enabled !== false && row.key.trim().length > 0
  )

  if (enabledRows.length === 0) {
    lines.push(emptyMessage)
    return
  }

  lines.push(
    "| Name | Location | Value | Description |",
    "| --- | --- | --- | --- |"
  )
  for (const row of enabledRows) {
    lines.push(
      tableRow([row.key, row.location ?? "", row.value, row.description])
    )
  }
}

function appendRequestBody(
  lines: string[],
  body: RequestBodyDraft,
  operation?: ApiOperation
) {
  lines.push(
    "",
    "## Request Body",
    "",
    `- **Mode:** ${escapeInline(body.mode || "none")}`,
    `- **Content type:** ${escapeInline(body.contentType || "Not set")}`
  )

  if (body.mode === "graphql") {
    lines.push(
      "",
      "### GraphQL query",
      "",
      fencedCode(body.graphqlQuery ?? "", "graphql")
    )
    if (body.graphqlVariables) {
      lines.push(
        "",
        "### GraphQL variables",
        "",
        fencedCode(body.graphqlVariables, "json")
      )
    }
  } else if (body.mode === "form-data") {
    lines.push("", "### Form data", "")
    appendBodyRows(lines, body.formDataRows ?? [])
  } else if (body.mode === "x-www-form-urlencoded") {
    lines.push("", "### URL-encoded fields", "")
    appendBodyRows(lines, body.urlEncodedRows ?? [])
  } else if (body.mode === "binary") {
    lines.push(
      "",
      body.binaryFileName
        ? `Binary file: \`${escapeInline(body.binaryFileName)}\``
        : "No binary file selected."
    )
  } else if (body.value) {
    lines.push(
      "",
      fencedCode(body.value, languageForContentType(body.contentType))
    )
  } else {
    lines.push("", "No current request body.")
  }

  if (operation?.requestSchema) {
    lines.push(
      "",
      "### Documented request schema",
      "",
      fencedCode(JSON.stringify(operation.requestSchema, null, 2), "json")
    )
  }

  if (hasMeaningfulExample(operation?.requestExample)) {
    lines.push(
      "",
      "### Documented request example",
      "",
      fencedCode(
        formatCodeValue(operation.requestExample),
        languageForContentType(operation.requestContentTypes[0])
      )
    )
  }
}

function appendBodyRows(lines: string[], rows: KeyValueRow[]) {
  const enabledRows = rows.filter(
    (row) => row.enabled !== false && row.key.trim().length > 0
  )
  if (enabledRows.length === 0) {
    lines.push("No enabled fields.")
    return
  }

  lines.push("| Name | Type | Value |", "| --- | --- | --- |")
  for (const row of enabledRows) {
    const fileNames = row.fileNames?.length
      ? row.fileNames
      : [row.fileName].filter((value): value is string => Boolean(value))
    lines.push(
      tableRow([
        row.key,
        row.type ?? "text",
        fileNames.length ? fileNames.join(", ") : row.value,
      ])
    )
  }
}

function appendDocumentedResponses(lines: string[], operation?: ApiOperation) {
  lines.push("", "## Documented Responses", "")

  if (!operation || operation.responses.length === 0) {
    lines.push("No documented responses.")
    return
  }

  for (const response of operation.responses) {
    lines.push(
      `### ${escapeInline(response.code)} — ${escapeInline(response.description)}`,
      ""
    )
    if (response.contentTypes.length > 0) {
      lines.push(
        `**Content types:** ${response.contentTypes.map((type) => `\`${escapeInline(type)}\``).join(", ")}`
      )
    }
    if (response.schema) {
      lines.push(
        "",
        "#### Schema",
        "",
        fencedCode(JSON.stringify(response.schema, null, 2), "json")
      )
    }
    if (hasMeaningfulExample(response.example)) {
      lines.push(
        "",
        "#### Example",
        "",
        fencedCode(
          formatCodeValue(response.example),
          languageForContentType(response.contentTypes[0])
        )
      )
    }
    lines.push("")
  }
}

function appendLatestResponse(lines: string[], responseState: ResponseState) {
  if (responseState.status === "idle" || responseState.status === "loading") {
    return
  }

  lines.push("", "## Latest Received Response", "")

  if (responseState.status === "error") {
    lines.push(
      `- **Result:** Request failed`,
      `- **Duration:** ${responseState.durationMs} ms`,
      "",
      fencedCode(responseState.error, "text")
    )
    return
  }

  const { result } = responseState
  lines.push(
    `- **Status:** ${result.status} ${escapeInline(result.statusText)}`,
    `- **URL:** \`${escapeInline(result.url)}\``,
    `- **Duration:** ${result.durationMs} ms`,
    `- **Size:** ${result.sizeBytes} bytes`,
    `- **Content type:** ${escapeInline(result.contentType || "Not provided")}`,
    "",
    "### Response headers",
    ""
  )
  appendResponseRows(lines, result.headers, "No response headers.")

  lines.push("", "### Cookies", "")
  appendResponseRows(lines, result.cookies, "No response cookies.")

  if (result.websocketFrames?.length) {
    lines.push(
      "",
      "### WebSocket frames",
      "",
      "| Direction | Timestamp | Size | Data |",
      "| --- | --- | --- | --- |"
    )
    for (const frame of result.websocketFrames) {
      lines.push(
        tableRow([
          frame.direction,
          new Date(frame.timestamp).toISOString(),
          `${frame.sizeBytes} bytes`,
          frame.data,
        ])
      )
    }
  }

  lines.push(
    "",
    "### Response body",
    "",
    fencedCode(result.bodyText, languageForContentType(result.contentType))
  )
}

function appendResponseRows(
  lines: string[],
  rows: Array<{ key: string; value: string }>,
  emptyMessage: string
) {
  if (rows.length === 0) {
    lines.push(emptyMessage)
    return
  }

  lines.push("| Name | Value |", "| --- | --- |")
  for (const row of rows) {
    lines.push(tableRow([row.key, row.value]))
  }
}

function formatParameterConstraints(parameter: ApiParameter) {
  return [
    parameter.enum?.length ? `enum: ${parameter.enum.join(", ")}` : undefined,
    parameter.pattern ? `pattern: ${parameter.pattern}` : undefined,
    parameter.minimum !== undefined ? `min: ${parameter.minimum}` : undefined,
    parameter.maximum !== undefined ? `max: ${parameter.maximum}` : undefined,
    parameter.minLength !== undefined
      ? `min length: ${parameter.minLength}`
      : undefined,
    parameter.maxLength !== undefined
      ? `max length: ${parameter.maxLength}`
      : undefined,
  ]
    .filter(Boolean)
    .join("; ")
}

function tableRow(values: Array<unknown>) {
  return `| ${values.map(escapeTableCell).join(" | ")} |`
}

function escapeTableCell(value: unknown) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r", "")
    .replaceAll("\n", "<br>")
}

function escapeInline(value: unknown) {
  return String(value ?? "")
    .replaceAll("\r", "")
    .replaceAll("\n", " ")
}

function formatInlineValue(value: unknown) {
  if (value === undefined || value === null) return ""
  return typeof value === "string" ? value : JSON.stringify(value)
}

function formatCodeValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

function fencedCode(value: string, language = "text") {
  const longestRun = Math.max(
    0,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length)
  )
  const fence = "`".repeat(Math.max(3, longestRun + 1))
  return `${fence}${language}\n${value}\n${fence}`
}

function languageForContentType(contentType?: string) {
  const normalized = contentType?.toLowerCase() ?? ""
  if (normalized.includes("json")) return "json"
  if (normalized.includes("xml")) return "xml"
  if (normalized.includes("html")) return "html"
  if (normalized.includes("graphql")) return "graphql"
  if (normalized.includes("javascript")) return "javascript"
  return "text"
}

function hasMeaningfulExample(value: unknown) {
  return value !== undefined && value !== null
}

function normalizeMarkdown(lines: string[]) {
  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`
}
