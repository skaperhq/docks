import openApiSpecJson from "@/data/football-openapi.json"
import type { RequestMode } from "./api-reference-actions"

type HttpMethod =
  | "delete"
  | "get"
  | "head"
  | "options"
  | "patch"
  | "post"
  | "put"
  | "trace"
  | "ws"

type ReferenceObject = {
  $ref: string
}

export type SchemaObject = {
  $ref?: string
  allOf?: Array<SchemaObject | ReferenceObject>
  anyOf?: Array<SchemaObject | ReferenceObject>
  oneOf?: Array<SchemaObject | ReferenceObject>
  type?: string
  format?: string
  description?: string
  enum?: string[]
  nullable?: boolean
  properties?: Record<string, SchemaObject | ReferenceObject>
  required?: string[]
  items?: SchemaObject | ReferenceObject
  additionalProperties?: boolean | SchemaObject | ReferenceObject
  example?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  default?: unknown
}

type MediaTypeObject = {
  schema?: SchemaObject | ReferenceObject
  example?: unknown
}

type RequestBodyObject = {
  required?: boolean
  content?: Record<string, MediaTypeObject>
}

type ResponseObject = {
  description?: string
  content?: Record<string, MediaTypeObject>
}

type ParameterObject = {
  name: string
  in: "query" | "header" | "path" | "cookie"
  description?: string
  required?: boolean
  schema?: SchemaObject | ReferenceObject
}

type SecurityRequirementObject = Record<string, string[]>

type ExternalDocumentationObject = {
  description?: string
  url: string
}

type SecuritySchemeObject = {
  type: string
  description?: string
  name?: string
  in?: string
  scheme?: string
  bearerFormat?: string
  openIdConnectUrl?: string
}

type OperationObject = {
  tags?: string[]
  summary?: string
  operationId?: string
  description?: string
  parameters?: Array<ParameterObject | ReferenceObject>
  requestBody?: RequestBodyObject | ReferenceObject
  responses?: Record<string, ResponseObject>
  security?: SecurityRequirementObject[]
}

type OpenApiSpec = {
  openapi?: string
  swagger?: string
  info: {
    title: string
    version: string
    description?: string
    contact?: {
      name?: string
      url?: string
      email?: string
    }
    license?: {
      name: string
      url?: string
    }
  }
  externalDocs?: ExternalDocumentationObject
  servers?: Array<{
    url: string
    description?: string
    variables?: Record<
      string,
      { default: string; description?: string; enum?: string[] }
    >
  }>
  security?: SecurityRequirementObject[]
  tags?: Array<{
    name: string
    description?: string
    externalDocs?: ExternalDocumentationObject
  }>
  paths: Record<string, Partial<Record<HttpMethod, OperationObject>>>
  components?: {
    schemas?: Record<string, SchemaObject>
    securitySchemes?: Record<string, SecuritySchemeObject | ReferenceObject>
  }
}

export type ApiSecurityScheme = {
  id: string
  label: string
  type: string
  description?: string
  location?: string
  parameterName?: string
  scheme?: string
  bearerFormat?: string
  openIdConnectUrl?: string
}

export type ApiResource = {
  label: string
  url: string
  description?: string
}

export type ApiOperation = {
  id: string
  method: Uppercase<HttpMethod>
  path: string
  displayPath: string
  tag: string
  summary: string
  description?: string
  operationId?: string
  parameters: ApiParameter[]
  queryParameters: ApiParameter[]
  pathParameters: ApiParameter[]
  headerParameters: ApiParameter[]
  hasAuth: boolean
  securitySchemeNames: string[]
  requestBodyRequired: boolean
  requestContentTypes: string[]
  requestSchemaName?: string
  requestSchema?: SchemaObject
  requestExample: unknown
  responseCodes: string[]
  responses: ApiResponse[]
  requestMode: RequestMode
  hasEventStreamResponse: boolean
  requestUrl: string
  searchText: string
}

export type ApiResponse = {
  code: string
  description: string
  contentTypes: string[]
  schemaName?: string
  schema?: SchemaObject
  example: unknown
}

export type ApiParameter = {
  name: string
  location: ParameterObject["in"]
  required: boolean
  type: string
  description?: string
  defaultValue?: string
  enum?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  example?: unknown
}

export type ApiOperationGroup = {
  name: string
  operations: ApiOperation[]
}

const configuredOpenApiSpec = (
  globalThis as typeof globalThis & {
    __SKAPER_OPENAPI_SPEC__?: unknown
  }
).__SKAPER_OPENAPI_SPEC__
const openApiSpec = (configuredOpenApiSpec ?? openApiSpecJson) as OpenApiSpec
const httpMethods = new Set<HttpMethod>([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
  "ws",
])

function isHttpMethod(value: string): value is HttpMethod {
  return httpMethods.has(value as HttpMethod)
}

function getRefName(ref: string) {
  return ref.split("/").at(-1)
}

function isReferenceObject(value: unknown): value is ReferenceObject {
  return (
    typeof value === "object" &&
    value !== null &&
    "$ref" in value &&
    typeof (value as ReferenceObject).$ref === "string"
  )
}

function resolveSchema(schema: SchemaObject | ReferenceObject | undefined): {
  schema?: SchemaObject
  name?: string
} {
  if (!schema) {
    return {}
  }

  if (isReferenceObject(schema)) {
    const name = getRefName(schema.$ref)
    return {
      name,
      schema: name ? openApiSpec.components?.schemas?.[name] : undefined,
    }
  }

  return { schema }
}

function resolveRequestBody(
  requestBody: OperationObject["requestBody"]
): RequestBodyObject | undefined {
  if (!requestBody || isReferenceObject(requestBody)) {
    return undefined
  }

  return requestBody
}

function resolveParameter(
  parameter: ParameterObject | ReferenceObject
): ParameterObject | undefined {
  if (isReferenceObject(parameter)) {
    return undefined
  }

  return parameter
}

function getFirstRequestSchema(requestBody: RequestBodyObject | undefined) {
  const entries = Object.entries(requestBody?.content ?? {})
  if (entries.length === 0) {
    return {}
  }

  const [contentType, mediaType] =
    entries.find(([type]) => type === "application/json") ?? entries[0]
  const { schema, name } = resolveSchema(mediaType.schema)

  return {
    contentType,
    schema,
    name,
    example:
      mediaType.example !== undefined
        ? mediaType.example
        : createSchemaExample(schema),
  }
}

function describeSchema(schema: SchemaObject | ReferenceObject | undefined) {
  const resolved = resolveSchema(schema).schema

  if (!resolved) {
    return "unknown"
  }

  const type = resolved.type ?? (resolved.properties ? "object" : "value")
  return resolved.format ? `${type}<${resolved.format}>` : type
}

function formatDefaultValue(value: unknown) {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === "string") {
    return value
  }

  return JSON.stringify(value)
}

function getDisplayPath(path: string) {
  return path.replace(/^\/+/, "")
}

function getRequestUrl(path: string) {
  return `${path}`
}

function getOperationParameters(operation: OperationObject): ApiParameter[] {
  return (operation.parameters ?? []).flatMap((parameter) => {
    const resolvedParameter = resolveParameter(parameter)
    if (!resolvedParameter) {
      return []
    }

    const schema = resolveSchema(resolvedParameter.schema).schema

    return [
      {
        name: resolvedParameter.name,
        location: resolvedParameter.in,
        required: Boolean(resolvedParameter.required),
        type: describeSchema(resolvedParameter.schema),
        description: resolvedParameter.description,
        defaultValue: formatDefaultValue(schema?.default),
        enum: schema?.enum,
        pattern: schema?.pattern,
        minimum: schema?.minimum,
        maximum: schema?.maximum,
        minLength: schema?.minLength,
        maxLength: schema?.maxLength,
        example: schema?.example,
      },
    ]
  })
}

function getFirstResponseSchema(response: ResponseObject) {
  const entries = Object.entries(response.content ?? {})
  if (entries.length === 0) {
    return {}
  }

  const [contentType, mediaType] =
    entries.find(([type]) => type === "application/json") ?? entries[0]
  const { schema, name } = resolveSchema(mediaType.schema)

  return {
    contentType,
    schema,
    name,
    example:
      mediaType.example !== undefined
        ? mediaType.example
        : createSchemaExample(schema),
  }
}

function getOperationResponses(operation: OperationObject): ApiResponse[] {
  return Object.entries(operation.responses ?? {}).map(([code, response]) => {
    const responseSchema = getFirstResponseSchema(response)

    return {
      code,
      description: response.description ?? "No description",
      contentTypes: Object.keys(response.content ?? {}),
      schemaName: responseSchema.name,
      schema: responseSchema.schema,
      example: responseSchema.example ?? null,
    }
  })
}

function createSchemaExample(
  schema: SchemaObject | ReferenceObject | undefined,
  seenRefs = new Set<string>()
): unknown {
  if (!schema) {
    return null
  }

  if (isReferenceObject(schema)) {
    if (seenRefs.has(schema.$ref)) {
      return null
    }

    const name = getRefName(schema.$ref)
    const resolved = name ? openApiSpec.components?.schemas?.[name] : undefined
    return createSchemaExample(resolved, new Set([...seenRefs, schema.$ref]))
  }

  if (schema.example !== undefined) {
    return schema.example
  }

  if (schema.enum?.[0] !== undefined) {
    return schema.enum[0]
  }

  if (schema.allOf?.length) {
    return schema.allOf.reduce<Record<string, unknown>>((example, item) => {
      const itemExample = createSchemaExample(item, seenRefs)
      if (
        typeof itemExample === "object" &&
        itemExample !== null &&
        !Array.isArray(itemExample)
      ) {
        return { ...example, ...itemExample }
      }

      return example
    }, {})
  }

  if (schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [
        name,
        createSchemaExample(property, seenRefs),
      ])
    )
  }

  if (schema.type === "array") {
    return [createSchemaExample(schema.items, seenRefs)]
  }

  if (schema.type === "boolean") {
    return true
  }

  if (schema.type === "integer" || schema.type === "number") {
    return 0
  }

  if (schema.type === "object") {
    return {}
  }

  if (schema.format === "date-time") {
    return "2026-06-28T00:00:00.000Z"
  }

  if (schema.format === "date") {
    return "2026-06-28"
  }

  if (schema.format === "uuid") {
    return "00000000-0000-0000-0000-000000000000"
  }

  if (schema.format === "email") {
    return "user@example.com"
  }

  return "string"
}

export const apiInfo = openApiSpec.info
export const apiSpecVersion =
  openApiSpec.openapi ?? openApiSpec.swagger ?? "Unknown"
export const apiServers = openApiSpec.servers ?? []
export const apiTags = openApiSpec.tags ?? []

export const apiSecuritySchemes: ApiSecurityScheme[] = Object.entries(
  openApiSpec.components?.securitySchemes ?? {}
).flatMap(([id, scheme]) => {
  if (isReferenceObject(scheme)) {
    return []
  }

  const normalizedScheme = scheme.scheme?.toLowerCase()
  const label =
    normalizedScheme === "bearer"
      ? `Bearer${scheme.bearerFormat ? ` (${scheme.bearerFormat})` : ""}`
      : normalizedScheme === "basic"
        ? "HTTP Basic"
        : scheme.type === "apiKey"
          ? `API key${scheme.name ? ` (${scheme.name})` : ""}`
          : scheme.type === "openIdConnect"
            ? "OpenID Connect"
            : scheme.type === "oauth2"
              ? "OAuth 2.0"
              : id

  return [
    {
      id,
      label,
      type: scheme.type,
      description: scheme.description,
      location: scheme.in,
      parameterName: scheme.name,
      scheme: scheme.scheme,
      bearerFormat: scheme.bearerFormat,
      openIdConnectUrl: scheme.openIdConnectUrl,
    },
  ]
})

export const apiResources: ApiResource[] = [
  ...(openApiSpec.externalDocs
    ? [
        {
          label: openApiSpec.externalDocs.description ?? "Documentation",
          url: openApiSpec.externalDocs.url,
          description: "External documentation",
        },
      ]
    : []),
  ...(openApiSpec.info.contact?.url
    ? [
        {
          label: openApiSpec.info.contact.name ?? "Support",
          url: openApiSpec.info.contact.url,
          description: "API contact",
        },
      ]
    : []),
  ...(openApiSpec.info.contact?.email
    ? [
        {
          label: openApiSpec.info.contact.name ?? "Email support",
          url: `mailto:${openApiSpec.info.contact.email}`,
          description: openApiSpec.info.contact.email,
        },
      ]
    : []),
  ...(openApiSpec.info.license?.url
    ? [
        {
          label: openApiSpec.info.license.name,
          url: openApiSpec.info.license.url,
          description: "License",
        },
      ]
    : []),
]

export function getEffectiveSecuritySchemeNames(
  operationSecurity: SecurityRequirementObject[] | undefined,
  documentSecurity: SecurityRequirementObject[] = []
) {
  const effectiveSecurity =
    operationSecurity === undefined ? documentSecurity : operationSecurity

  return Array.from(
    new Set(
      effectiveSecurity.flatMap((requirement) => Object.keys(requirement))
    )
  )
}

export const apiOperations = Object.entries(openApiSpec.paths).flatMap(
  ([path, methods]) =>
    Object.entries(methods).flatMap(([method, operation]) => {
      if (!isHttpMethod(method)) {
        return []
      }

      const requestBody = resolveRequestBody(operation.requestBody)
      const requestContentTypes = Object.keys(requestBody?.content ?? {})
      const requestSchema = getFirstRequestSchema(requestBody)
      const parameters = getOperationParameters(operation)
      const tag = operation.tags?.[0] ?? "Other"
      const summary = operation.summary ?? operation.operationId ?? path
      const responseCodes = Object.keys(operation.responses ?? {})
      const responses = getOperationResponses(operation)
      const { requestMode, hasEventStreamResponse } = getOpenApiRequestMode(
        method,
        responses
      )
      const securitySchemeNames = getEffectiveSecuritySchemeNames(
        operation.security,
        openApiSpec.security
      )

      return [
        {
          id: `${method.toUpperCase()} ${path}`,
          method: method.toUpperCase() as Uppercase<HttpMethod>,
          path,
          displayPath: getDisplayPath(path),
          tag,
          summary,
          description: operation.description,
          operationId: operation.operationId,
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
          hasAuth: securitySchemeNames.length > 0,
          securitySchemeNames,
          requestBodyRequired: Boolean(requestBody?.required),
          requestContentTypes,
          requestSchemaName: requestSchema.name,
          requestSchema: requestSchema.schema,
          requestExample: requestSchema.example ?? null,
          responseCodes,
          responses,
          requestMode,
          hasEventStreamResponse,
          requestUrl: getRequestUrl(path),
          searchText: [
            method,
            path,
            getDisplayPath(path),
            tag,
            summary,
            operation.description,
            operation.operationId,
            requestSchema.name,
            requestSchema.contentType,
            ...parameters.map((parameter) => parameter.name),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        },
      ]
    })
)

/** Detects native SSE operations from their advertised response content type. */
export function getOpenApiRequestMode(
  method: string,
  responses: ApiResponse[]
): { requestMode: RequestMode; hasEventStreamResponse: boolean } {
  const hasEventStreamResponse = responses.some((response) =>
    response.contentTypes.some(
      (contentType) =>
        contentType.split(";", 1)[0]?.trim().toLowerCase() ===
        "text/event-stream"
    )
  )

  return {
    requestMode:
      hasEventStreamResponse && method.toUpperCase() === "GET"
        ? "sse"
        : "standard",
    hasEventStreamResponse,
  }
}

/**
 * Groups the parsed operations by OpenAPI tag after applying sidebar filters.
 * Tag order follows the source document; previously undeclared tags are added
 * in the order their operations are encountered.
 */
export function getOperationGroups({
  query,
  requestOnly,
}: {
  query: string
  requestOnly: boolean
}): ApiOperationGroup[] {
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOperations = apiOperations.filter((operation) => {
    if (requestOnly && !operation.requestSchema) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    return operation.searchText.includes(normalizedQuery)
  })

  const groups = new Map<string, ApiOperation[]>()

  for (const tag of openApiSpec.tags ?? []) {
    groups.set(tag.name, [])
  }

  for (const operation of filteredOperations) {
    groups.set(operation.tag, [...(groups.get(operation.tag) ?? []), operation])
  }

  return Array.from(groups.entries())
    .map(([name, operations]) => ({ name, operations }))
    .filter((group) => group.operations.length > 0)
}

/** Converts an object schema into rows suitable for the documentation table. */
export function formatSchema(schema: SchemaObject | undefined) {
  if (!schema?.properties) {
    return schema?.type ?? "No request schema available."
  }

  const requiredFields = new Set(schema.required ?? [])

  return Object.entries(schema.properties).map(([name, property]) => {
    const resolved = resolveSchema(property).schema
    return {
      name,
      required: requiredFields.has(name),
      type: describeSchema(property),
      description: resolved?.description,
      defaultValue: resolved?.default,
      enum: resolved?.enum,
      pattern: resolved?.pattern,
      minimum: resolved?.minimum,
      maximum: resolved?.maximum,
      minLength: resolved?.minLength,
      maxLength: resolved?.maxLength,
      example: resolved?.example,
    }
  })
}
