import { timingSafeEqual } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { parse as parseYaml } from "yaml"
import { z } from "zod/v4"

const HTTP_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
  "WS",
])
const DEFAULT_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"]
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576
const MAX_SEARCH_RESULTS = 50
const FORBIDDEN_CLIENT_HEADER_NAMES = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])
const FORBIDDEN_UPSTREAM_HEADER_NAMES = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

export async function createDocksMcp(options) {
  validateOptions(options)

  const loaded = await loadOpenApi(options.openapi, options.openapiHeaders)
  const baseModel = createApiModel(
    loaded.document,
    loaded.rawDocument,
    loaded.location
  )
  const getModel = async () =>
    addCustomOperations(baseModel, await loadCustomRequests(options.knowledge))
  const model = await getModel()
  const execution = normalizeExecutionOptions(options.execution)
  const forwarding = normalizeForwarding(options.clientHeaders?.forward)
  const activeServers = new Set()
  let stdioServer

  const createServer = (incomingHeaders = new Headers()) => {
    const forwardedHeaders = selectForwardedHeaders(incomingHeaders, forwarding)
    const server = buildMcpServer({
      model,
      getModel,
      options,
      execution,
      forwardedHeaders,
    })
    activeServers.add(server)
    return server
  }

  async function fetchHandler(request) {
    if (!(request instanceof Request)) {
      throw new TypeError("Docks MCP fetch() requires a Request.")
    }

    const authorizationFailure = await authorizeMcpRequest(request, options)
    if (authorizationFailure) return authorizationFailure

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      ...(options.allowedHosts?.length
        ? {
            allowedHosts: options.allowedHosts,
            enableDnsRebindingProtection: true,
          }
        : {}),
    })
    const server = createServer(request.headers)

    try {
      await server.connect(transport)
      return await transport.handleRequest(request)
    } finally {
      activeServers.delete(server)
      await server.close()
    }
  }

  async function nodeHandler(request, response) {
    try {
      const webRequest = await toWebRequest(request)
      const webResponse = await fetchHandler(webRequest)
      await writeNodeResponse(response, webResponse)
    } catch (error) {
      response.statusCode = 500
      response.setHeader?.("content-type", "application/json; charset=utf-8")
      response.end?.(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
  }

  return {
    model,
    fetch: fetchHandler,
    nodeHandler,
    async connectStdio() {
      if (stdioServer) {
        throw new Error("Docks MCP stdio transport is already connected.")
      }
      stdioServer = createServer()
      await stdioServer.connect(new StdioServerTransport())
    },
    async close() {
      const servers = [...activeServers]
      activeServers.clear()
      stdioServer = undefined
      await Promise.allSettled(servers.map((server) => server.close()))
    },
  }
}

function buildMcpServer({
  model,
  getModel,
  options,
  execution,
  forwardedHeaders,
}) {
  const server = new McpServer(
    {
      name: options.name?.trim() || "docks-api",
      version: "0.1.1",
    },
    {
      instructions:
        "Use get_api_overview or search_api before get_api_operation. " +
        "Use call_api only with the canonical operation key or operationId returned by Docks. " +
        "Credentials and destinations are controlled by the MCP host.",
    }
  )

  server.registerTool(
    "get_api_overview",
    {
      title: "Get API overview",
      description:
        "Return the represented API's metadata, servers, authentication schemes, tags, and operation counts.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const currentModel = await getModel()
      return toolSuccess(
        currentModel.overview,
        buildOverviewMarkdown(currentModel)
      )
    }
  )

  server.registerTool(
    "search_api",
    {
      title: "Search API operations",
      description:
        "Search documented API operations by text, HTTP method, or tag. Returns canonical operation keys for follow-up calls.",
      inputSchema: {
        query: z.string().optional(),
        method: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query = "", method, tag, limit = 20 }) => {
      const currentModel = await getModel()
      const results = searchOperations(currentModel, {
        query,
        method,
        tag,
        limit,
      })
      return toolSuccess(
        { results, total: results.length },
        results.length
          ? results
              .map(
                (operation) =>
                  `- ${operation.key} — ${operation.summary}${operation.operationId ? ` (operationId: ${operation.operationId})` : ""}`
              )
              .join("\n")
          : "No matching API operations."
      )
    }
  )

  server.registerTool(
    "get_api_operation",
    {
      title: "Get API operation",
      description:
        "Return complete documentation for one operation, including parameters, request bodies, responses, authentication, and examples.",
      inputSchema: { operation: z.string().min(1) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ operation }) => {
      const currentModel = await getModel()
      const resolved = resolveOperation(currentModel, operation)
      if (!resolved) {
        return toolError(
          "OPERATION_NOT_FOUND",
          `No API operation matches ${JSON.stringify(operation)}.`
        )
      }
      return toolSuccess(
        toOperationDetail(resolved),
        buildOperationMarkdown(resolved)
      )
    }
  )

  server.registerTool(
    "call_api",
    {
      title: "Call API operation",
      description:
        "Execute a finite documented HTTP operation. The host controls destinations, credentials, and allowed methods.",
      inputSchema: {
        operation: z.string().min(1),
        parameters: z
          .object({
            path: z.record(z.string(), z.unknown()).optional(),
            query: z.record(z.string(), z.unknown()).optional(),
            header: z.record(z.string(), z.unknown()).optional(),
            cookie: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
        contentType: z.string().optional(),
        body: z.unknown().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const currentModel = await getModel()
        const result = await executeOperation({
          model: currentModel,
          operationName: input.operation,
          parameters: input.parameters ?? {},
          contentType: input.contentType,
          body: input.body,
          baseUrl: options.baseUrl,
          apiHeaders: options.apiHeaders,
          forwardedHeaders,
          execution,
        })
        return toolSuccess(result, formatCallResult(result))
      } catch (error) {
        if (error instanceof DocksMcpError) {
          return toolError(error.code, error.message)
        }
        return toolError(
          "UPSTREAM_ERROR",
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  )

  server.registerResource(
    "api-overview",
    "docks://api/overview",
    {
      title: `${model.info.title} overview`,
      description: "Markdown overview of the represented API.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/markdown",
          text: buildOverviewMarkdown(await getModel()),
        },
      ],
    })
  )

  server.registerResource(
    "openapi-document",
    "docks://api/openapi",
    {
      title: `${model.info.title} OpenAPI`,
      description: "The original OpenAPI document as JSON.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(model.rawDocument, null, 2),
        },
      ],
    })
  )

  server.registerResource(
    "api-operation",
    new ResourceTemplate("docks://api/operations/{operation}", {
      list: async () => ({
        resources: (await getModel()).operations.map((operation) => ({
          uri: `docks://api/operations/${encodeURIComponent(operation.key)}`,
          name: operation.key,
          title: operation.summary,
          description: `${operation.method} ${operation.path}`,
          mimeType: "text/markdown",
        })),
      }),
      complete: {
        operation: async (value) =>
          (await getModel()).operations
            .map((operation) => operation.key)
            .filter((key) => key.toLowerCase().includes(value.toLowerCase()))
            .slice(0, 20)
            .map(encodeURIComponent),
      },
    }),
    {
      title: "API operation",
      description: "Markdown documentation for one represented API operation.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const requested = decodeURIComponent(String(variables.operation ?? ""))
      const operation = resolveOperation(await getModel(), requested)
      if (!operation) {
        throw new Error(
          `No API operation matches ${JSON.stringify(requested)}.`
        )
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: buildOperationMarkdown(operation),
          },
        ],
      }
    }
  )

  return server
}

async function loadOpenApi(source, configuredHeaders) {
  const cache = new Map()
  let rawDocument
  let location

  if (source instanceof URL) {
    location = source
    rawDocument = await loadDocumentAt(
      source,
      configuredHeaders,
      cache,
      getHttpOrigin(source)
    )
  } else if (typeof source === "string") {
    location = isHttpUrl(source)
      ? new URL(source)
      : pathToFileURL(resolvePath(source))
    rawDocument = await loadDocumentAt(
      location,
      configuredHeaders,
      cache,
      getHttpOrigin(location)
    )
  } else if (isPlainObject(source)) {
    rawDocument = structuredClone(source)
  } else {
    throw new TypeError(
      "Docks MCP openapi must be an HTTP URL, local file path, URL, or plain object."
    )
  }

  validateOpenApiDocument(rawDocument)
  const document = await dereferenceDocument(
    rawDocument,
    rawDocument,
    location,
    configuredHeaders,
    cache,
    new Set(),
    getHttpOrigin(location)
  )
  return { document, rawDocument, location }
}

async function loadDocumentAt(
  location,
  configuredHeaders,
  cache,
  credentialOrigin
) {
  const key = location.toString().split("#")[0]
  if (cache.has(key)) return cache.get(key)

  let text
  if (location.protocol === "file:") {
    text = await readFile(fileURLToPath(location), "utf8")
  } else if (location.protocol === "http:" || location.protocol === "https:") {
    const response = await fetch(location, {
      headers:
        location.origin === credentialOrigin
          ? normalizeHostHeaders(configuredHeaders)
          : undefined,
      redirect: "error",
    })
    if (!response.ok) {
      throw new Error(
        `Unable to load OpenAPI document (${response.status} ${response.statusText}).`
      )
    }
    text = await response.text()
  } else {
    throw new Error(`Unsupported OpenAPI source protocol: ${location.protocol}`)
  }

  const document = parseDocument(text, key)
  cache.set(key, document)
  return document
}

function parseDocument(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    try {
      return parseYaml(text)
    } catch (error) {
      throw new Error(
        `Unable to parse OpenAPI document ${label}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

async function dereferenceDocument(
  value,
  currentDocument,
  currentLocation,
  configuredHeaders,
  cache,
  refStack,
  credentialOrigin
) {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) =>
        dereferenceDocument(
          item,
          currentDocument,
          currentLocation,
          configuredHeaders,
          cache,
          refStack,
          credentialOrigin
        )
      )
    )
  }
  if (!isPlainObject(value)) return value

  if (typeof value.$ref === "string") {
    const ref = value.$ref
    const refKey = `${currentLocation?.toString() ?? "memory:"}|${ref}`
    if (refStack.has(refKey)) return { ...value }

    const hashIndex = ref.indexOf("#")
    const locationPart = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref
    const pointer = hashIndex >= 0 ? ref.slice(hashIndex + 1) : ""
    let targetDocument = currentDocument
    let targetLocation = currentLocation

    if (locationPart) {
      if (!currentLocation) {
        throw new Error(
          `Cannot resolve external OpenAPI reference ${JSON.stringify(ref)} from an in-memory document.`
        )
      }
      targetLocation = new URL(locationPart, currentLocation)
      targetDocument = await loadDocumentAt(
        targetLocation,
        configuredHeaders,
        cache,
        credentialOrigin
      )
    }

    const target = resolveJsonPointer(targetDocument, pointer)
    if (target === undefined) {
      throw new Error(`OpenAPI reference could not be resolved: ${ref}`)
    }
    const resolved = await dereferenceDocument(
      target,
      targetDocument,
      targetLocation,
      configuredHeaders,
      cache,
      new Set([...refStack, refKey]),
      credentialOrigin
    )
    const siblings = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "$ref")
    )
    return isPlainObject(resolved) ? { ...resolved, ...siblings } : resolved
  }

  return Object.fromEntries(
    await Promise.all(
      Object.entries(value).map(async ([key, child]) => [
        key,
        await dereferenceDocument(
          child,
          currentDocument,
          currentLocation,
          configuredHeaders,
          cache,
          refStack,
          credentialOrigin
        ),
      ])
    )
  )
}

function resolveJsonPointer(document, pointer) {
  if (!pointer) return document
  if (!pointer.startsWith("/")) return undefined
  return pointer
    .slice(1)
    .split("/")
    .map((part) =>
      decodeURIComponent(part.replaceAll("~1", "/").replaceAll("~0", "~"))
    )
    .reduce((value, part) => value?.[part], document)
}

function validateOpenApiDocument(document) {
  if (!isPlainObject(document)) {
    throw new Error("OpenAPI document must be an object.")
  }
  if (typeof document.swagger === "string") {
    throw new Error("Swagger 2 documents are not supported by Docks MCP.")
  }
  if (
    typeof document.openapi !== "string" ||
    (!document.openapi.startsWith("3.0.") &&
      !document.openapi.startsWith("3.1."))
  ) {
    throw new Error("Docks MCP requires an OpenAPI 3.0 or 3.1 document.")
  }
  if (
    !isPlainObject(document.info) ||
    typeof document.info.title !== "string"
  ) {
    throw new Error("OpenAPI document requires info.title.")
  }
  if (!isPlainObject(document.paths)) {
    throw new Error("OpenAPI document requires a paths object.")
  }
}

function createApiModel(document, rawDocument, location) {
  const operations = []
  const operationIds = new Map()
  const securitySchemes = Object.entries(
    document.components?.securitySchemes ?? {}
  ).map(([name, scheme]) => ({ name, ...scheme }))
  const securityHeaderNames = new Set([
    "authorization",
    ...securitySchemes
      .filter(
        (scheme) =>
          scheme.type === "apiKey" &&
          scheme.in === "header" &&
          typeof scheme.name === "string"
      )
      .map((scheme) => scheme.name.toLowerCase()),
  ])

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!isPlainObject(pathItem)) continue
    const pathParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : []

    for (const [methodName, operationValue] of Object.entries(pathItem)) {
      const method = methodName.toUpperCase()
      if (!HTTP_METHODS.has(method) || !isPlainObject(operationValue)) continue

      const parameters = [
        ...pathParameters,
        ...(operationValue.parameters ?? []),
      ]
        .filter(isPlainObject)
        .map(normalizeParameter)
      const key = `${method} ${path}`
      const operationId =
        typeof operationValue.operationId === "string"
          ? operationValue.operationId
          : undefined
      const responses = normalizeResponses(operationValue.responses)
      const requestBody = normalizeRequestBody(operationValue.requestBody)
      const tags = Array.isArray(operationValue.tags)
        ? operationValue.tags.filter((tag) => typeof tag === "string")
        : []
      const security = Array.isArray(operationValue.security)
        ? operationValue.security
        : (document.security ?? [])
      const server =
        firstServerUrl(operationValue.servers) ??
        firstServerUrl(pathItem.servers) ??
        firstServerUrl(document.servers)
      const operation = {
        source: "openapi",
        key,
        operationId,
        method,
        path,
        summary:
          operationValue.summary ??
          operationValue.description ??
          operationId ??
          key,
        description: operationValue.description,
        tags,
        parameters,
        requestBody,
        responses,
        security,
        server,
        securityHeaderNames,
        executable:
          method !== "WS" &&
          !responses.some((response) =>
            response.contentTypes.includes("text/event-stream")
          ),
      }
      operation.searchText = [
        key,
        operationId,
        operation.summary,
        operation.description,
        ...tags,
        ...parameters.flatMap((parameter) => [
          parameter.name,
          parameter.description,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      operations.push(operation)
      if (operationId) {
        const entries = operationIds.get(operationId) ?? []
        entries.push(operation)
        operationIds.set(operationId, entries)
      }
    }
  }

  const tags = Array.from(
    new Set([
      ...(document.tags ?? []).map((tag) => tag?.name).filter(Boolean),
      ...operations.flatMap((operation) => operation.tags),
    ])
  )
  const info = {
    title: document.info.title,
    version: document.info.version ?? "unknown",
    description: document.info.description,
  }

  return {
    document,
    rawDocument,
    location,
    info,
    operations,
    operationIds,
    securitySchemes,
    tags,
    overview: {
      info,
      openapi: document.openapi,
      servers: (document.servers ?? []).map((server) => ({
        url: expandServerUrl(server),
        description: server.description,
      })),
      authentication: securitySchemes,
      tags,
      operationCount: operations.length,
      openApiOperationCount: operations.length,
      customOperationCount: 0,
      executableOperationCount: operations.filter(
        (operation) => operation.executable
      ).length,
    },
  }
}

async function loadCustomRequests(knowledge) {
  if (!knowledge) return []
  const requests = await knowledge.getCustomRequests()
  if (!Array.isArray(requests)) {
    throw new TypeError("knowledge.getCustomRequests() must return an array.")
  }
  return requests
}

function addCustomOperations(baseModel, requests) {
  if (!requests.length) return baseModel
  const customOperations = requests
    .filter((request) => request && typeof request.id === "string")
    .map(toCustomOperation)
  const operations = [...baseModel.operations, ...customOperations]
  const tags = Array.from(
    new Set([
      ...baseModel.tags,
      ...customOperations.flatMap((item) => item.tags),
    ])
  )
  return {
    ...baseModel,
    operations,
    tags,
    overview: {
      ...baseModel.overview,
      tags,
      operationCount: operations.length,
      openApiOperationCount: baseModel.operations.length,
      customOperationCount: customOperations.length,
      executableOperationCount: operations.filter((item) => item.executable)
        .length,
    },
  }
}

function toCustomOperation(request) {
  const method = String(request.method ?? "GET").toUpperCase()
  const draft = isPlainObject(request.draft) ? request.draft : {}
  const queryRows = Array.isArray(draft.params) ? draft.params : []
  const headerRows = Array.isArray(draft.headers) ? draft.headers : []
  const parameters = [
    ...queryRows.map((row) => normalizeCustomRow(row, "query")),
    ...headerRows.map((row) => normalizeCustomRow(row, "header")),
  ].filter((row) => row.name && row.enabled)
  const requestBody = normalizeCustomRequestBody(draft.body)
  const collection = String(request.collectionId ?? "custom")
  const tags = ["Custom", collection]
  const key = `custom:${request.id}`
  const executable =
    request.transport !== "websocket" &&
    request.mode !== "sse" &&
    method !== "WS"
  const operation = {
    source: "custom",
    key,
    method,
    path: String(request.url ?? ""),
    summary: String(request.name ?? key),
    description: `Workspace custom request in ${collection}.`,
    tags,
    parameters,
    requestBody,
    responses: [],
    security: [],
    securityHeaderNames: new Set([
      "authorization",
      "cookie",
      "proxy-authorization",
      "x-api-key",
      "api-key",
    ]),
    executable,
    custom: {
      url: String(request.url ?? ""),
      defaultQuery: Object.fromEntries(
        queryRows
          .filter((row) => row?.enabled !== false && row?.key)
          .map((row) => [
            String(row.key),
            coerceCustomValue(row.value ?? "", row.type),
          ])
      ),
      defaultBody: getCustomDefaultBody(draft.body),
    },
  }
  operation.searchText = [
    key,
    operation.summary,
    operation.description,
    method,
    operation.path,
    collection,
    ...parameters.flatMap((parameter) => [
      parameter.name,
      parameter.description,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return operation
}

function normalizeCustomRow(row, location) {
  const value = isPlainObject(row) ? row : {}
  return {
    name: String(value.key ?? ""),
    in: location,
    description: String(value.description ?? ""),
    required: location === "query" && value.required === true,
    schema: {
      type: normalizeCustomType(value.type),
      ...(Array.isArray(value.enum) ? { enum: value.enum } : {}),
      ...(typeof value.pattern === "string" ? { pattern: value.pattern } : {}),
    },
    enabled: value.enabled !== false,
  }
}

function normalizeCustomType(value) {
  return ["string", "number", "integer", "boolean", "array", "object"].includes(
    value
  )
    ? value
    : "string"
}

function coerceCustomValue(value, type) {
  if (type === "number" || type === "integer") {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
  }
  if (type === "boolean") {
    if (value === "true") return true
    if (value === "false") return false
  }
  if (type === "array" || type === "object") {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function normalizeCustomRequestBody(value) {
  if (!isPlainObject(value) || value.mode === "none" || !value.contentType) {
    return undefined
  }
  return {
    required: false,
    description: "Body saved with the workspace custom request.",
    content: { [String(value.contentType)]: {} },
  }
}

function getCustomDefaultBody(value) {
  if (!isPlainObject(value) || value.mode === "none") return undefined
  if (value.mode === "raw") {
    if (String(value.contentType ?? "").includes("json")) {
      try {
        return value.value ? JSON.parse(value.value) : undefined
      } catch {
        return value.value
      }
    }
    return value.value
  }
  if (value.mode === "x-www-form-urlencoded") {
    return Object.fromEntries(
      (value.urlEncodedRows ?? [])
        .filter((row) => row?.enabled !== false && row?.key)
        .map((row) => [String(row.key), row.value ?? ""])
    )
  }
  if (value.mode === "form-data") {
    return Object.fromEntries(
      (value.formDataRows ?? [])
        .filter((row) => row?.enabled !== false && row?.key && !row?.fileName)
        .map((row) => [String(row.key), row.value ?? ""])
    )
  }
  if (value.mode === "graphql") {
    return {
      query: value.graphqlQuery ?? "",
      variables: parseOptionalJson(value.graphqlVariables),
    }
  }
  return undefined
}

function parseOptionalJson(value) {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeParameter(parameter) {
  const schema = isPlainObject(parameter.schema) ? parameter.schema : {}
  return {
    name: String(parameter.name ?? ""),
    in: parameter.in,
    description: parameter.description,
    required: parameter.in === "path" || parameter.required === true,
    style: parameter.style,
    explode: parameter.explode,
    schema,
    example: parameter.example ?? schema.example,
  }
}

function normalizeRequestBody(requestBody) {
  if (!isPlainObject(requestBody)) return undefined
  return {
    required: requestBody.required === true,
    description: requestBody.description,
    content: Object.fromEntries(
      Object.entries(requestBody.content ?? {}).map(([contentType, media]) => [
        contentType,
        {
          schema: media?.schema,
          example: media?.example ?? media?.schema?.example,
          examples: media?.examples,
        },
      ])
    ),
  }
}

function normalizeResponses(responses) {
  return Object.entries(responses ?? {}).map(([status, response]) => ({
    status,
    description: response?.description ?? "",
    contentTypes: Object.keys(response?.content ?? {}),
    content: response?.content ?? {},
  }))
}

function firstServerUrl(servers) {
  const server = Array.isArray(servers) ? servers[0] : undefined
  return server ? expandServerUrl(server) : undefined
}

function expandServerUrl(server) {
  if (!server || typeof server.url !== "string") return undefined
  return server.url.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = server.variables?.[name]?.default
    return value === undefined ? `{${name}}` : String(value)
  })
}

function searchOperations(model, { query, method, tag, limit }) {
  const queryTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const normalizedMethod = method?.trim().toUpperCase()
  const normalizedTag = tag?.trim().toLowerCase()
  return model.operations
    .filter(
      (operation) =>
        queryTerms.every((term) => operation.searchText.includes(term)) &&
        (!normalizedMethod || operation.method === normalizedMethod) &&
        (!normalizedTag ||
          operation.tags.some((value) => value.toLowerCase() === normalizedTag))
    )
    .slice(0, Math.min(limit, MAX_SEARCH_RESULTS))
    .map(toOperationSummary)
}

function resolveOperation(model, identifier) {
  const normalized = identifier.trim()
  const byKey = model.operations.find(
    (operation) => operation.key.toLowerCase() === normalized.toLowerCase()
  )
  if (byKey) return byKey
  const byId = model.operationIds.get(normalized)
  return byId?.length === 1 ? byId[0] : undefined
}

function toOperationSummary(operation) {
  return {
    source: operation.source,
    key: operation.key,
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    summary: operation.summary,
    tags: operation.tags,
    executable: operation.executable,
  }
}

function toOperationDetail(operation) {
  return {
    ...toOperationSummary(operation),
    description: operation.description,
    parameters: operation.parameters,
    requestBody: operation.requestBody,
    responses: operation.responses,
    security: operation.security,
    server: operation.server,
  }
}

async function executeOperation({
  model,
  operationName,
  parameters,
  contentType,
  body,
  baseUrl,
  apiHeaders,
  forwardedHeaders,
  execution,
}) {
  const operation = resolveOperation(model, operationName)
  if (!operation) {
    throw new DocksMcpError(
      "OPERATION_NOT_FOUND",
      `No API operation matches ${JSON.stringify(operationName)}.`
    )
  }
  if (!operation.executable) {
    throw new DocksMcpError(
      "UNSUPPORTED_OPERATION",
      "SSE and WebSocket operations are discoverable but cannot be executed by Docks MCP."
    )
  }
  if (
    !execution.allowedMethods.has(operation.method) &&
    !execution.allowedOperations.has(operation.key) &&
    !(
      operation.operationId &&
      execution.allowedOperations.has(operation.operationId)
    )
  ) {
    throw new DocksMcpError(
      "OPERATION_NOT_ALLOWED",
      `${operation.key} is not allowed by the MCP host.`
    )
  }

  let requestUrl
  if (operation.source === "custom") {
    requestUrl = buildCustomOperationUrl(operation, parameters)
    if (!execution.allowedOrigins.has(requestUrl.origin)) {
      throw new DocksMcpError(
        "ORIGIN_NOT_ALLOWED",
        `${requestUrl.origin} is not allowed by the MCP host.`
      )
    }
  } else {
    const serverUrl = baseUrl ?? operation.server
    if (!serverUrl) {
      throw new DocksMcpError(
        "SERVER_NOT_CONFIGURED",
        "The OpenAPI document does not declare a server. Configure baseUrl to execute operations."
      )
    }
    const resolvedBase = resolveServerBase(serverUrl, model.location)
    requestUrl = buildOperationUrl(resolvedBase, operation, parameters)
  }
  const documentedHeaders = buildDocumentedHeaders(operation, parameters)
  const effectiveBody =
    body === undefined && operation.source === "custom"
      ? operation.custom.defaultBody
      : body
  assertNoUnresolvedVariables(effectiveBody)
  const requestBody = buildRequestBody(operation, contentType, effectiveBody)
  const selectedForwardedHeaders = Object.fromEntries(forwardedHeaders)
  const configuredHeaders = await resolveApiHeaders(apiHeaders, {
    operation: toOperationSummary(operation),
    forwardedHeaders: selectedForwardedHeaders,
  })
  const headers = new Headers()
  applyHeaders(headers, selectedForwardedHeaders)
  applyHeaders(headers, documentedHeaders)
  if (requestBody.contentType && !headers.has("content-type")) {
    headers.set("content-type", requestBody.contentType)
  }
  applyHeaders(headers, configuredHeaders)

  let currentUrl = requestUrl
  let currentMethod = operation.method
  let currentBody = requestBody.body
  let response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), execution.timeoutMs)

  try {
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      try {
        response = await fetch(currentUrl, {
          method: currentMethod,
          headers,
          body:
            currentMethod === "GET" || currentMethod === "HEAD"
              ? undefined
              : currentBody,
          redirect: "manual",
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          throw new DocksMcpError(
            "TIMEOUT",
            `Upstream request exceeded ${execution.timeoutMs} ms.`
          )
        }
        throw new DocksMcpError(
          "UPSTREAM_ERROR",
          `Upstream request failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      const location = response.headers.get("location")
      if (!location || !isRedirect(response.status)) break
      if (redirectCount === 5) {
        throw new DocksMcpError(
          "UPSTREAM_ERROR",
          "Upstream exceeded the five-redirect limit."
        )
      }
      const nextUrl = new URL(location, currentUrl)
      if (nextUrl.origin !== requestUrl.origin) {
        throw new DocksMcpError(
          "CROSS_ORIGIN_REDIRECT",
          "Upstream redirected to a different origin; credentials were not forwarded."
        )
      }
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) &&
          currentMethod === "POST")
      ) {
        currentMethod = "GET"
        currentBody = undefined
        headers.delete("content-type")
      }
      currentUrl = nextUrl
    }
  } finally {
    clearTimeout(timeout)
  }

  const contentTypeHeader = response.headers.get("content-type") ?? ""
  const bytes = await readLimitedResponse(response, execution.maxResponseBytes)
  const decoded = decodeResponseBody(bytes.value, contentTypeHeader)
  return {
    operation: operation.key,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    contentType: contentTypeHeader || undefined,
    encoding: decoded.encoding,
    body: decoded.body,
    truncated: bytes.truncated,
    sizeBytes: bytes.sizeBytes,
  }
}

function resolveServerBase(serverUrl, sourceLocation) {
  let resolved
  try {
    resolved = new URL(serverUrl)
  } catch {
    if (
      sourceLocation?.protocol === "http:" ||
      sourceLocation?.protocol === "https:"
    ) {
      resolved = new URL(serverUrl, sourceLocation)
    } else {
      throw new DocksMcpError(
        "SERVER_NOT_CONFIGURED",
        "A relative OpenAPI server URL requires an HTTP specification URL or an absolute baseUrl."
      )
    }
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new DocksMcpError(
      "SERVER_NOT_CONFIGURED",
      "The API server must use HTTP or HTTPS."
    )
  }
  if (resolved.username || resolved.password) {
    throw new DocksMcpError(
      "SERVER_NOT_CONFIGURED",
      "Credentials in API server URLs are not supported; configure apiHeaders instead."
    )
  }
  return resolved
}

function buildOperationUrl(base, operation, parameters) {
  const pathValues = parameters.path ?? {}
  let path = operation.path
  for (const parameter of operation.parameters.filter(
    (item) => item.in === "path"
  )) {
    const value = pathValues[parameter.name]
    validateParameterValue(parameter, value)
    path = path.replaceAll(
      `{${parameter.name}}`,
      serializePathParameter(parameter, value)
    )
  }
  if (/\{[^}]+\}/.test(path)) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      "Not all documented path parameters were provided."
    )
  }

  const baseWithSlash = new URL(base.toString())
  if (!baseWithSlash.pathname.endsWith("/")) baseWithSlash.pathname += "/"
  const url = new URL(path.replace(/^\//, ""), baseWithSlash)
  const queryValues = parameters.query ?? {}
  for (const parameter of operation.parameters.filter(
    (item) => item.in === "query"
  )) {
    const value = queryValues[parameter.name]
    validateParameterValue(parameter, value)
    if (value === undefined) continue
    appendQueryParameter(url.searchParams, parameter, value)
  }
  return url
}

function buildCustomOperationUrl(operation, parameters) {
  const rawUrl = operation.custom.url
  assertNoUnresolvedVariables(rawUrl)
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new DocksMcpError(
      "INVALID_INPUT",
      "Custom API requests require an absolute HTTP(S) URL."
    )
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      "Custom API URLs must use HTTP(S) and cannot contain credentials."
    )
  }
  const query = {
    ...operation.custom.defaultQuery,
    ...(parameters.query ?? {}),
  }
  for (const parameter of operation.parameters.filter(
    (item) => item.in === "query"
  )) {
    const value = query[parameter.name]
    validateParameterValue(parameter, value)
    if (value === undefined || value === "") continue
    assertNoUnresolvedVariables(value)
    url.searchParams.delete(parameter.name)
    appendQueryParameter(url.searchParams, parameter, value)
  }
  return url
}

function assertNoUnresolvedVariables(value) {
  if (value === undefined || value === null) return
  const serialized = typeof value === "string" ? value : JSON.stringify(value)
  if (/\{\{[^{}]+\}\}/.test(serialized)) {
    throw new DocksMcpError(
      "UNRESOLVED_VARIABLE",
      "The custom request contains unresolved workspace variables."
    )
  }
}

function buildDocumentedHeaders(operation, parameters) {
  const result = {}
  const headerValues = parameters.header ?? {}
  for (const parameter of operation.parameters.filter(
    (item) => item.in === "header"
  )) {
    const value = getCaseInsensitiveValue(headerValues, parameter.name)
    validateParameterValue(parameter, value)
    if (
      value !== undefined &&
      operation.securityHeaderNames.has(parameter.name.toLowerCase())
    ) {
      throw new DocksMcpError(
        "INVALID_INPUT",
        `${parameter.name} is an authentication header and must be configured by the MCP host.`
      )
    }
    if (value !== undefined)
      result[parameter.name] = serializeSimple(value, ",")
  }
  const cookieValues = parameters.cookie ?? {}
  for (const parameter of operation.parameters.filter(
    (item) => item.in === "cookie"
  )) {
    const value = cookieValues[parameter.name]
    validateParameterValue(parameter, value)
    if (value !== undefined) {
      throw new DocksMcpError(
        "INVALID_INPUT",
        "Cookie parameters cannot be supplied by an MCP tool call; configure them as server-side apiHeaders if required."
      )
    }
  }
  return result
}

function validateParameterValue(parameter, value) {
  if (value === undefined || value === null || value === "") {
    if (parameter.required) {
      throw new DocksMcpError(
        "INVALID_INPUT",
        `Required ${parameter.in} parameter ${parameter.name} is missing.`
      )
    }
    return
  }
  const schema = parameter.schema ?? {}
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      `${parameter.name} must be one of: ${schema.enum.join(", ")}.`
    )
  }
  if (schema.type === "array" && !Array.isArray(value)) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      `${parameter.name} must be an array.`
    )
  }
  if (schema.type === "object" && !isPlainObject(value)) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      `${parameter.name} must be an object.`
    )
  }
  if (
    (schema.type === "integer" || schema.type === "number") &&
    typeof value !== "number"
  ) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      `${parameter.name} must be a number.`
    )
  }
  if (schema.type === "boolean" && typeof value !== "boolean") {
    throw new DocksMcpError(
      "INVALID_INPUT",
      `${parameter.name} must be a boolean.`
    )
  }
}

function serializePathParameter(parameter, value) {
  const style = parameter.style ?? "simple"
  if (style === "label") return `.${serializeSimple(value, ".")}`
  if (style === "matrix") {
    if (isPlainObject(value)) {
      return `;${Object.entries(value)
        .map(
          ([key, child]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(String(child))}`
        )
        .join(";")}`
    }
    return `;${encodeURIComponent(parameter.name)}=${serializeSimple(value, ",")}`
  }
  return serializeSimple(value, ",")
}

function appendQueryParameter(searchParams, parameter, value) {
  const style = parameter.style ?? "form"
  const explode = parameter.explode ?? style === "form"
  if (style === "deepObject" && isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      searchParams.append(`${parameter.name}[${key}]`, String(child))
    }
    return
  }
  if (Array.isArray(value)) {
    if (style === "spaceDelimited") {
      searchParams.append(parameter.name, value.join(" "))
    } else if (style === "pipeDelimited") {
      searchParams.append(parameter.name, value.join("|"))
    } else if (explode) {
      for (const child of value)
        searchParams.append(parameter.name, String(child))
    } else {
      searchParams.append(parameter.name, value.join(","))
    }
    return
  }
  if (isPlainObject(value)) {
    if (explode) {
      for (const [key, child] of Object.entries(value)) {
        searchParams.append(key, String(child))
      }
    } else {
      searchParams.append(
        parameter.name,
        Object.entries(value)
          .flatMap(([key, child]) => [key, String(child)])
          .join(",")
      )
    }
    return
  }
  searchParams.append(parameter.name, String(value))
}

function serializeSimple(value, delimiter) {
  if (Array.isArray(value)) {
    return value
      .map((child) => encodeURIComponent(String(child)))
      .join(delimiter)
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .flatMap(([key, child]) => [
        encodeURIComponent(key),
        encodeURIComponent(String(child)),
      ])
      .join(delimiter)
  }
  return encodeURIComponent(String(value))
}

function buildRequestBody(operation, requestedContentType, body) {
  const requestBody = operation.requestBody
  if (body === undefined || body === null) {
    if (requestBody?.required) {
      throw new DocksMcpError("INVALID_INPUT", "A request body is required.")
    }
    return {}
  }
  const contentTypes = Object.keys(requestBody?.content ?? {})
  const contentType =
    requestedContentType ??
    contentTypes.find((value) => value === "application/json") ??
    contentTypes[0]
  if (!contentType) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      "This operation does not document a request body."
    )
  }
  if (!contentTypes.includes(contentType)) {
    throw new DocksMcpError(
      "INVALID_INPUT",
      `Unsupported request content type. Use one of: ${contentTypes.join(", ")}.`
    )
  }

  if (contentType.includes("json")) {
    return {
      contentType,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  }
  if (contentType === "application/x-www-form-urlencoded") {
    if (!isPlainObject(body)) {
      throw new DocksMcpError(
        "INVALID_INPUT",
        "URL-encoded bodies must be objects."
      )
    }
    const encoded = new URLSearchParams()
    for (const [key, value] of Object.entries(body)) {
      if (Array.isArray(value)) {
        for (const child of value) encoded.append(key, String(child))
      } else {
        encoded.append(key, String(value))
      }
    }
    return { contentType, body: encoded.toString() }
  }
  if (contentType === "multipart/form-data") {
    if (!isPlainObject(body)) {
      throw new DocksMcpError(
        "INVALID_INPUT",
        "Multipart bodies must be objects."
      )
    }
    const form = new FormData()
    for (const [key, value] of Object.entries(body)) {
      if (isPlainObject(value) && ("file" in value || "base64" in value)) {
        throw new DocksMcpError(
          "UNSUPPORTED_OPERATION",
          "Multipart file uploads are not supported by Docks MCP v1."
        )
      }
      if (Array.isArray(value)) {
        for (const child of value) form.append(key, String(child))
      } else {
        form.append(
          key,
          typeof value === "string" ? value : JSON.stringify(value)
        )
      }
    }
    return { body: form }
  }
  if (contentType.startsWith("text/")) {
    if (typeof body !== "string") {
      throw new DocksMcpError(
        "INVALID_INPUT",
        "Text request bodies must be strings."
      )
    }
    return { contentType, body }
  }
  throw new DocksMcpError(
    "UNSUPPORTED_OPERATION",
    `Binary request content type ${contentType} is not supported by Docks MCP v1.`
  )
}

async function resolveApiHeaders(apiHeaders, context) {
  const resolved =
    typeof apiHeaders === "function" ? await apiHeaders(context) : apiHeaders
  return normalizeHostHeaders(resolved)
}

function normalizeHostHeaders(value) {
  const headers = toHeaders(value)
  for (const name of headers.keys()) {
    if (FORBIDDEN_UPSTREAM_HEADER_NAMES.has(name.toLowerCase())) {
      headers.delete(name)
    }
  }
  return headers
}

function applyHeaders(target, source) {
  const headers = toHeaders(source)
  for (const [name, value] of headers) {
    if (!FORBIDDEN_UPSTREAM_HEADER_NAMES.has(name.toLowerCase())) {
      target.set(name, value)
    }
  }
}

function toHeaders(value) {
  if (value instanceof Headers) return new Headers(value)
  if (Array.isArray(value)) return new Headers(value)
  const headers = new Headers()
  for (const [name, headerValue] of Object.entries(value ?? {})) {
    if (headerValue === undefined) continue
    if (Array.isArray(headerValue)) {
      for (const child of headerValue) headers.append(name, String(child))
    } else {
      headers.set(name, String(headerValue))
    }
  }
  return headers
}

async function readLimitedResponse(response, maxBytes) {
  if (!response.body)
    return { value: new Uint8Array(), truncated: false, sizeBytes: 0 }
  const reader = response.body.getReader()
  const chunks = []
  let collected = 0
  let seen = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    seen += value.byteLength
    const remaining = maxBytes - collected
    if (remaining > 0) {
      const chunk =
        value.byteLength > remaining ? value.slice(0, remaining) : value
      chunks.push(chunk)
      collected += chunk.byteLength
    }
    if (seen > maxBytes) {
      truncated = true
      await reader.cancel()
      break
    }
  }

  const combined = new Uint8Array(collected)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { value: combined, truncated, sizeBytes: seen }
}

function decodeResponseBody(bytes, contentType) {
  if (contentType.includes("json")) {
    const text = new TextDecoder().decode(bytes)
    try {
      return { encoding: "json", body: text ? JSON.parse(text) : null }
    } catch {
      return { encoding: "text", body: text }
    }
  }
  if (
    !contentType ||
    contentType.startsWith("text/") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("x-www-form-urlencoded")
  ) {
    return { encoding: "text", body: new TextDecoder().decode(bytes) }
  }
  return { encoding: "base64", body: Buffer.from(bytes).toString("base64") }
}

function normalizeForwarding(forward) {
  const result = new Map()
  for (const [sourceName, targetName] of Object.entries(forward ?? {})) {
    const source = sourceName.trim().toLowerCase()
    const target = String(targetName).trim().toLowerCase()
    if (!source || !target) {
      throw new TypeError("Forwarded header names must be non-empty.")
    }
    if (isForbiddenClientHeader(source)) {
      throw new TypeError(`Client header ${sourceName} cannot be forwarded.`)
    }
    if (
      FORBIDDEN_UPSTREAM_HEADER_NAMES.has(target) ||
      target.startsWith("mcp-")
    ) {
      throw new TypeError(`Upstream header ${targetName} cannot be forwarded.`)
    }
    result.set(source, target)
  }
  return result
}

function isForbiddenClientHeader(name) {
  return (
    FORBIDDEN_CLIENT_HEADER_NAMES.has(name) ||
    name.startsWith("mcp-") ||
    name.startsWith("proxy-") ||
    name.startsWith("x-forwarded-")
  )
}

function selectForwardedHeaders(incoming, forwarding) {
  const selected = new Headers()
  for (const [source, target] of forwarding) {
    const value = incoming.get(source)
    if (value !== null) selected.set(target, value)
  }
  return selected
}

async function authorizeMcpRequest(request, options) {
  if (options.authorizeMcpRequest) {
    const result = await options.authorizeMcpRequest(request)
    if (result instanceof Response) return result
    if (result !== true) return unauthorizedResponse()
    return undefined
  }
  if (!options.mcpBearerToken) return undefined
  const authorization = request.headers.get("authorization") ?? ""
  const prefix = "Bearer "
  if (!authorization.startsWith(prefix)) return unauthorizedResponse()
  const provided = authorization.slice(prefix.length)
  return safeTokenEqual(provided, options.mcpBearerToken)
    ? undefined
    : unauthorizedResponse()
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "www-authenticate": 'Bearer realm="docks-mcp"',
    },
  })
}

function safeTokenEqual(left, right) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  )
}

function normalizeExecutionOptions(value = {}) {
  const allowedMethods = new Set(
    (value.allowedMethods ?? DEFAULT_ALLOWED_METHODS).map((method) =>
      String(method).toUpperCase()
    )
  )
  const allowedOperations = new Set(value.allowedOperations ?? [])
  const timeoutMs = value.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxResponseBytes = value.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  const allowedOrigins = new Set(
    (value.allowedOrigins ?? []).map((origin) => normalizeAllowedOrigin(origin))
  )
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("execution.timeoutMs must be a positive integer.")
  }
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new TypeError(
      "execution.maxResponseBytes must be a positive integer."
    )
  }
  return {
    allowedMethods,
    allowedOperations,
    allowedOrigins,
    timeoutMs,
    maxResponseBytes,
  }
}

function normalizeAllowedOrigin(value) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    throw new TypeError(
      "execution.allowedOrigins entries must be HTTP(S) origins."
    )
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "execution.allowedOrigins entries must be exact HTTP(S) origins."
    )
  }
  return url.origin
}

function validateOptions(options) {
  if (!options || options.openapi === undefined) {
    throw new TypeError("createDocksMcp requires an openapi source.")
  }
  if (options.mcpBearerToken && options.authorizeMcpRequest) {
    throw new TypeError(
      "Configure either mcpBearerToken or authorizeMcpRequest, not both."
    )
  }
  if (
    options.mcpBearerToken !== undefined &&
    (typeof options.mcpBearerToken !== "string" || !options.mcpBearerToken)
  ) {
    throw new TypeError("mcpBearerToken must be a non-empty string.")
  }
  if (
    options.knowledge !== undefined &&
    (!options.knowledge ||
      typeof options.knowledge.getCustomRequests !== "function")
  ) {
    throw new TypeError(
      "knowledge must provide an asynchronous getCustomRequests() function."
    )
  }
}

function buildOverviewMarkdown(model) {
  const lines = [
    `# ${model.info.title}`,
    "",
    model.info.description ?? "",
    "",
    `- API version: ${model.info.version}`,
    `- OpenAPI: ${model.overview.openapi}`,
    `- Operations: ${model.operations.length}`,
    `- OpenAPI operations: ${model.overview.openApiOperationCount}`,
    `- Custom operations: ${model.overview.customOperationCount}`,
    "",
    "## Servers",
    "",
    ...(model.overview.servers.length
      ? model.overview.servers.map(
          (server) =>
            `- \`${server.url}\`${server.description ? ` — ${server.description}` : ""}`
        )
      : ["No servers are declared."]),
    "",
    "## Authentication",
    "",
    ...(model.securitySchemes.length
      ? model.securitySchemes.map(
          (scheme) => `- **${scheme.name}** — ${scheme.type ?? "unknown"}`
        )
      : ["No authentication schemes are declared."]),
    "",
    "## Tags",
    "",
    ...(model.tags.length
      ? model.tags.map((tag) => `- ${tag}`)
      : ["No tags are declared."]),
  ]
  return lines
    .filter((line, index) => line || lines[index - 1] !== "")
    .join("\n")
}

function buildOperationMarkdown(operation) {
  const lines = [
    `# ${operation.summary}`,
    "",
    `**${operation.method}** \`${operation.path}\``,
    "",
    `Canonical key: \`${operation.key}\``,
    `Source: ${operation.source === "custom" ? "Workspace custom request" : "OpenAPI"}`,
  ]
  if (operation.operationId)
    lines.push(`Operation ID: \`${operation.operationId}\``)
  if (operation.description) lines.push("", operation.description)
  lines.push("", "## Parameters", "")
  if (!operation.parameters.length) {
    lines.push("No documented parameters.")
  } else {
    lines.push(
      "| Name | In | Required | Type | Description |",
      "| --- | --- | --- | --- | --- |"
    )
    for (const parameter of operation.parameters) {
      lines.push(
        `| ${escapeTable(parameter.name)} | ${escapeTable(parameter.in)} | ${parameter.required ? "Yes" : "No"} | ${escapeTable(parameter.schema?.type ?? "unknown")} | ${escapeTable(parameter.description ?? "")} |`
      )
    }
  }
  lines.push("", "## Request body", "")
  if (!operation.requestBody) {
    lines.push("No documented request body.")
  } else {
    lines.push(
      `Required: ${operation.requestBody.required ? "Yes" : "No"}`,
      "",
      ...Object.keys(operation.requestBody.content).map(
        (type) => `- \`${type}\``
      )
    )
  }
  lines.push("", "## Responses", "")
  for (const response of operation.responses) {
    lines.push(
      `- **${response.status}** — ${response.description || "No description"}${response.contentTypes.length ? ` (${response.contentTypes.join(", ")})` : ""}`
    )
  }
  if (!operation.responses.length) lines.push("No documented responses.")
  return lines.join("\n")
}

function formatCallResult(result) {
  const body =
    typeof result.body === "string"
      ? result.body
      : JSON.stringify(result.body, null, 2)
  return [
    `${result.status} ${result.statusText}`.trim(),
    result.contentType ? `Content-Type: ${result.contentType}` : "",
    result.truncated ? "Response body was truncated." : "",
    "",
    body,
  ]
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join("\n")
}

function toolSuccess(structuredContent, text) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  }
}

function toolError(code, message) {
  return {
    content: [{ type: "text", text: `${code}: ${message}` }],
    structuredContent: { code, message },
    isError: true,
  }
}

async function toWebRequest(request) {
  const host = request.headers?.host ?? "localhost"
  const protocol = request.socket?.encrypted ? "https:" : "http:"
  const url = new URL(request.url ?? "/", `${protocol}//${host}`)
  const method = request.method ?? "GET"
  const init = { method, headers: request.headers }
  if (method !== "GET" && method !== "HEAD") {
    init.body = request
    init.duplex = "half"
  }
  return new Request(url, init)
}

async function writeNodeResponse(response, webResponse) {
  response.statusCode = webResponse.status
  for (const [name, value] of webResponse.headers)
    response.setHeader(name, value)
  if (!webResponse.body) {
    response.end()
    return
  }
  const reader = webResponse.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!response.write(Buffer.from(value))) {
      await new Promise((resolve) => response.once("drain", resolve))
    }
  }
  response.end()
}

function getCaseInsensitiveValue(record, name) {
  const entry = Object.entries(record).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  )
  return entry?.[1]
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ")
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value)
}

function getHttpOrigin(location) {
  return location?.protocol === "http:" || location?.protocol === "https:"
    ? location.origin
    : undefined
}

function isRedirect(status) {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  )
}

class DocksMcpError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export const __testing = {
  addCustomOperations,
  createApiModel,
  executeOperation,
  normalizeExecutionOptions,
  normalizeForwarding,
  selectForwardedHeaders,
  loadOpenApi,
}
