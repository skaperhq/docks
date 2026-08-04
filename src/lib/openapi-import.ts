import { parse as parseYaml } from "yaml"

import type {
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "./api-reference-actions"
import {
  createOpenApiParameter,
  createOpenApiSchemaExample,
  getEffectiveSecuritySchemeNames,
  getOpenApiRequestMode,
} from "./openapi"
import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  OpenApiSpec,
  ParameterObject,
  SchemaObject,
} from "./openapi"
import type {
  KeyValueRow,
  RequestDraft,
} from "@/components/api-reference/types"
import { parameterToRow } from "@/components/api-reference/utils"
import { createOperationRequestBodyDraft } from "./request-body"

type JsonObject = Record<string, any>

export type ImportedOpenApiRequest = {
  name: string
  method: RequestMethod
  transport: RequestTransport
  mode: RequestMode
  url: string
  folder: string
  draft: RequestDraft
}

export type OpenApiImportPreview = {
  title: string
  version: string
  requests: ImportedOpenApiRequest[]
  tagCount: number
  skippedOperations: number
  warnings: string[]
}

const supportedMethods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "ws",
])
const knownMethods = new Set([...supportedMethods, "trace"])

/** Parses an OpenAPI document and converts its operations into editable drafts. */
export function parseOpenApiImport(
  source: string,
  fileName?: string
): OpenApiImportPreview {
  if (!source.trim()) throw new Error("Paste or choose an OpenAPI document.")

  let document: unknown
  try {
    document = JSON.parse(source)
  } catch {
    try {
      document = parseYaml(source)
    } catch (error) {
      throw new Error(
        `Could not parse OpenAPI JSON or YAML: ${messageOf(error)}`
      )
    }
  }

  if (!isObject(document))
    throw new Error("The OpenAPI document must be an object.")
  const version = stringValue(document.openapi)
  if (!/^3\.(0|1)(?:\.|$)/.test(version)) {
    throw new Error("Only OpenAPI 3.0 and 3.1 documents can be imported.")
  }
  if (!isObject(document.paths)) {
    throw new Error("The OpenAPI document must contain a paths object.")
  }

  const warnings: string[] = []
  const title =
    stringValue(isObject(document.info) ? document.info.title : undefined) ||
    fileStem(fileName) ||
    "Imported API"
  if (!stringValue(isObject(document.info) ? document.info.title : undefined)) {
    warnings.push(`The document has no info.title; using “${title}”.`)
  }

  const requests: ImportedOpenApiRequest[] = []
  let skippedOperations = 0
  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    const pathItem = resolveObject(document, rawPathItem, warnings)
    if (!pathItem) continue
    const pathParameters = resolveParameters(
      document,
      arrayValue(pathItem.parameters),
      warnings
    )

    for (const [method, rawOperation] of Object.entries(pathItem)) {
      const lowerMethod = method.toLowerCase()
      if (!knownMethods.has(lowerMethod)) continue
      if (!supportedMethods.has(lowerMethod)) {
        skippedOperations += 1
        warnings.push(`Skipped unsupported ${method.toUpperCase()} ${path}.`)
        continue
      }
      const operation = resolveObject(document, rawOperation, warnings)
      if (!operation) {
        skippedOperations += 1
        warnings.push(
          `Skipped ${method.toUpperCase()} ${path} because it could not be resolved.`
        )
        continue
      }

      const converted = convertOperation({
        document,
        path,
        pathItem,
        pathParameters,
        method: lowerMethod,
        operation,
        warnings,
      })
      requests.push(converted)
    }
  }

  if (requests.length === 0) {
    throw new Error("The OpenAPI document contains no supported operations.")
  }

  return {
    title,
    version,
    requests,
    tagCount: new Set(requests.map((request) => request.folder)).size,
    skippedOperations,
    warnings: unique(warnings),
  }
}

function convertOperation({
  document,
  path,
  pathItem,
  pathParameters,
  method,
  operation,
  warnings,
}: {
  document: JsonObject
  path: string
  pathItem: JsonObject
  pathParameters: JsonObject[]
  method: string
  operation: JsonObject
  warnings: string[]
}): ImportedOpenApiRequest {
  const operationParameters = resolveParameters(
    document,
    arrayValue(operation.parameters),
    warnings
  )
  const parameters = mergeParameters(pathParameters, operationParameters).map(
    (parameter) => toApiParameter(document, parameter, warnings)
  )
  const requestBody = resolveObject(document, operation.requestBody, warnings)
  const requestMedia = selectMediaType(requestBody?.content)
  const requestSchema = resolveSchema(
    document,
    requestMedia?.media.schema,
    warnings
  )
  const requestExample =
    requestMedia?.media.example ??
    createSchemaExample(document, requestSchema, warnings)
  const responses = isObject(operation.responses) ? operation.responses : {}
  const responseModels: ApiResponse[] = Object.entries(responses).map(
    ([code, rawResponse]) => {
      const response = resolveObject(document, rawResponse, warnings)
      return {
        code,
        description: stringValue(response?.description) || "No description",
        contentTypes: isObject(response?.content)
          ? Object.keys(response.content)
          : [],
        example: null,
      }
    }
  )
  const transport: RequestTransport = method === "ws" ? "websocket" : "http"
  const detectedMode = getOpenApiRequestMode(method, responseModels)
  const hasEventStreamResponse = detectedMode.hasEventStreamResponse
  const mode: RequestMode =
    transport === "websocket" ? "standard" : detectedMode.requestMode
  const importedMethod: RequestMethod =
    transport === "websocket" ? "GET" : (method.toUpperCase() as RequestMethod)
  const folder = stringArray(operation.tags)[0] ?? "Other"
  const apiOperation = createApiOperation({
    path,
    method,
    operation,
    parameters,
    requestMedia,
    requestSchema,
    requestExample,
    mode,
    hasEventStreamResponse,
  })
  const security = effectiveSecurity(document, operation)
  const { authHeaders, authParams } = createSecurityRows(
    document,
    security,
    warnings
  )
  const headers: KeyValueRow[] = [
    ...authHeaders,
    ...(requestMedia
      ? [
          row(
            "Content-Type",
            requestMedia.contentType,
            "Generated from OpenAPI request body"
          ),
        ]
      : []),
    ...parameters
      .filter((parameter) => parameter.location === "header")
      .map(parameterToRow),
  ]
  const params = [
    ...parameters
      .filter(
        (parameter) =>
          parameter.location === "path" || parameter.location === "query"
      )
      .map(parameterToRow),
    ...authParams,
  ]
  const server = selectServer(operation, pathItem, document)
  const baseUrl = expandServerUrl(server, warnings)
  if (!baseUrl)
    warnings.push(
      `${importedMethod} ${path} has no server URL and was imported as a relative URL.`
    )

  return {
    name:
      stringValue(operation.summary) ||
      stringValue(operation.operationId) ||
      `${method.toUpperCase()} ${path}`,
    method: importedMethod,
    transport,
    mode,
    url: joinServerAndPath(baseUrl, path),
    folder,
    draft: {
      params,
      headers,
      body:
        transport === "websocket"
          ? emptyBody()
          : createOperationRequestBodyDraft(apiOperation),
    },
  }
}

function createApiOperation({
  path,
  method,
  operation,
  parameters,
  requestMedia,
  requestSchema,
  requestExample,
  mode,
  hasEventStreamResponse,
}: {
  path: string
  method: string
  operation: JsonObject
  parameters: ApiParameter[]
  requestMedia?: { contentType: string; media: JsonObject }
  requestSchema?: SchemaObject
  requestExample: unknown
  mode: RequestMode
  hasEventStreamResponse: boolean
}): ApiOperation {
  const tag = stringArray(operation.tags)[0] ?? "Other"
  const summary =
    stringValue(operation.summary) || stringValue(operation.operationId) || path
  return {
    id: `${method.toUpperCase()} ${path}`,
    method: method.toUpperCase() as ApiOperation["method"],
    path,
    displayPath: path.replace(/^\/+/, ""),
    tag,
    summary,
    description: stringValue(operation.description) || undefined,
    operationId: stringValue(operation.operationId) || undefined,
    parameters,
    queryParameters: parameters.filter(
      (parameter) => parameter.location === "query"
    ),
    pathParameters: parameters.filter(
      (parameter) => parameter.location === "path"
    ),
    headerParameters: parameters.filter(
      (parameter) => parameter.location === "header"
    ),
    hasAuth: false,
    securitySchemeNames: [],
    requestBodyRequired: Boolean(operation.requestBody?.required),
    requestContentTypes: requestMedia ? [requestMedia.contentType] : [],
    requestSchema,
    requestExample,
    responseCodes: [],
    responses: [],
    requestMode: mode,
    hasEventStreamResponse,
    requestUrl: path,
    searchText: `${method} ${path} ${tag} ${summary}`.toLowerCase(),
  }
}

function resolveParameters(
  document: JsonObject,
  parameters: unknown[],
  warnings: string[]
) {
  return parameters.flatMap((parameter) => {
    const resolved = resolveObject(document, parameter, warnings)
    return resolved ? [resolved] : []
  })
}

function mergeParameters(
  pathParameters: JsonObject[],
  operationParameters: JsonObject[]
) {
  const merged = new Map<string, JsonObject>()
  for (const parameter of [...pathParameters, ...operationParameters]) {
    merged.set(
      `${stringValue(parameter.in)}:${stringValue(parameter.name)}`,
      parameter
    )
  }
  return Array.from(merged.values())
}

function toApiParameter(
  document: JsonObject,
  parameter: JsonObject,
  warnings: string[]
): ApiParameter {
  const schema = resolveSchema(document, parameter.schema, warnings)
  const converted = createOpenApiParameter(
    { ...parameter, schema } as ParameterObject,
    document as OpenApiSpec
  )
  return {
    ...converted,
    example: converted.example ?? parameter.example,
  }
}

function createSecurityRows(
  document: JsonObject,
  requirements: JsonObject[],
  warnings: string[]
) {
  const authHeaders: KeyValueRow[] = []
  const authParams: KeyValueRow[] = []
  const schemes = isObject(document.components?.securitySchemes)
    ? document.components.securitySchemes
    : {}
  const names = getEffectiveSecuritySchemeNames(requirements)
  for (const name of names) {
    const scheme = resolveObject(document, schemes[name], warnings)
    if (!scheme) continue
    const variable = name.replaceAll(/[^a-zA-Z0-9_]/g, "_")
    if (
      scheme.type === "http" &&
      stringValue(scheme.scheme).toLowerCase() === "bearer"
    ) {
      authHeaders.push(
        row(
          "Authorization",
          `Bearer {{${variable}}}`,
          `Generated from ${name} security`
        )
      )
    } else if (
      scheme.type === "http" &&
      stringValue(scheme.scheme).toLowerCase() === "basic"
    ) {
      authHeaders.push(
        row(
          "Authorization",
          `Basic {{${variable}}}`,
          `Generated from ${name} security`
        )
      )
    } else if (
      scheme.type === "apiKey" &&
      scheme.in === "header" &&
      scheme.name
    ) {
      authHeaders.push(
        row(
          String(scheme.name),
          `{{${variable}}}`,
          `Generated from ${name} security`
        )
      )
    } else if (
      scheme.type === "apiKey" &&
      scheme.in === "query" &&
      scheme.name
    ) {
      authParams.push({
        ...row(
          String(scheme.name),
          `{{${variable}}}`,
          `Generated from ${name} security`
        ),
        location: "query",
      })
    } else if (
      scheme.type === "apiKey" &&
      scheme.in === "cookie" &&
      scheme.name
    ) {
      authHeaders.push(
        row(
          "Cookie",
          `${scheme.name}={{${variable}}}`,
          `Generated from ${name} security`
        )
      )
    } else {
      warnings.push(
        `Security scheme ${name} (${stringValue(scheme.type) || "unknown"}) requires manual configuration.`
      )
    }
  }
  return { authHeaders, authParams }
}

function effectiveSecurity(document: JsonObject, operation: JsonObject) {
  const value =
    operation.security === undefined ? document.security : operation.security
  return arrayValue(value).filter(isObject)
}

function selectMediaType(content: unknown) {
  if (!isObject(content)) return undefined
  const entries = Object.entries(content).filter(
    (entry): entry is [string, JsonObject] => isObject(entry[1])
  )
  if (!entries.length) return undefined
  const [contentType, media] =
    entries.find(
      ([name]) => normalizedMediaType(name) === "application/json"
    ) ?? entries[0]
  return { contentType, media }
}

function selectServer(
  operation: JsonObject,
  pathItem: JsonObject,
  document: JsonObject
) {
  return [operation.servers, pathItem.servers, document.servers]
    .flatMap((servers) => arrayValue(servers))
    .find(isObject)
}

function expandServerUrl(server: JsonObject | undefined, warnings: string[]) {
  if (!server) return ""
  let url = stringValue(server.url)
  if (!url) return ""
  const variables = isObject(server.variables) ? server.variables : {}
  url = url.replaceAll(/\{([^}]+)\}/g, (_match, name: string) => {
    const variable = isObject(variables[name]) ? variables[name] : undefined
    const fallback = stringValue(variable?.default)
    if (fallback) return fallback
    warnings.push(
      `Server variable ${name} has no default and was preserved as a Docks variable.`
    )
    return `{{${name}}}`
  })
  return url
}

function joinServerAndPath(server: string, path: string) {
  if (!server) return path
  return `${server.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
}

function resolveSchema(
  document: JsonObject,
  value: unknown,
  warnings: string[]
): SchemaObject | undefined {
  const resolved = resolveObject(document, value, warnings)
  return resolved
}

function resolveObject(
  document: JsonObject,
  value: unknown,
  warnings: string[],
  seen = new Set<string>()
): JsonObject | undefined {
  if (!isObject(value)) return undefined
  const ref = stringValue(value.$ref)
  if (!ref) return value
  if (!ref.startsWith("#/")) {
    warnings.push(`External reference ${ref} was not resolved.`)
    return undefined
  }
  if (seen.has(ref)) {
    warnings.push(`Cyclic reference ${ref} was stopped.`)
    return undefined
  }
  const target = ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>(
      (current, part) => (isObject(current) ? current[part] : undefined),
      document
    )
  if (!isObject(target)) {
    warnings.push(`Reference ${ref} could not be resolved.`)
    return undefined
  }
  const resolved = resolveObject(
    document,
    target,
    warnings,
    new Set([...seen, ref])
  )
  if (!resolved) return undefined
  const { $ref: _ref, ...siblings } = value
  return Object.keys(siblings).length ? { ...resolved, ...siblings } : resolved
}

function createSchemaExample(
  document: JsonObject,
  schema: SchemaObject | undefined,
  warnings: string[]
): unknown {
  inspectSchemaReferences(document, schema, warnings)
  return createOpenApiSchemaExample(schema, new Set(), document as OpenApiSpec)
}

function inspectSchemaReferences(
  document: JsonObject,
  schema: unknown,
  warnings: string[],
  seenRefs = new Set<string>(),
  seenObjects = new Set<JsonObject>()
) {
  if (!isObject(schema) || seenObjects.has(schema)) return
  seenObjects.add(schema)

  const ref = stringValue(schema.$ref)
  if (ref) {
    if (seenRefs.has(ref)) {
      warnings.push(`Cyclic reference ${ref} was stopped.`)
      return
    }
    const resolved = resolveObject(document, schema, warnings)
    if (resolved) {
      inspectSchemaReferences(
        document,
        resolved,
        warnings,
        new Set([...seenRefs, ref]),
        seenObjects
      )
    }
    return
  }

  for (const child of [
    ...arrayValue(schema.allOf),
    ...arrayValue(schema.oneOf),
    ...arrayValue(schema.anyOf),
    ...Object.values(isObject(schema.properties) ? schema.properties : {}),
    schema.items,
  ]) {
    inspectSchemaReferences(document, child, warnings, seenRefs, seenObjects)
  }
}

function row(key: string, value: string, description: string): KeyValueRow {
  return { key, value, description, enabled: true }
}

function emptyBody() {
  return {
    mode: "none",
    contentType: "",
    value: "",
    formDataRows: [],
    urlEncodedRows: [],
  }
}

function normalizedMediaType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase()
}

function fileStem(fileName?: string) {
  return fileName?.replace(/^.*[\\/]/, "").replace(/\.(json|ya?ml)$/i, "")
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
