import { createHash, randomBytes } from "node:crypto"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { parse as parseYaml } from "yaml"

const GRAPH_SCHEMA_VERSION = 1
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
])
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "host",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
])
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

export const DEFAULT_DOCKS_CONFIG = {
  url: null,
  databaseUrlEnv: "DATABASE_URL",
  workspaceId: null,
  knowledgeOutput: "docks-out",
  actions: {
    allowedOrigins: [],
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    allowedOperations: [],
    headerEnvironment: {},
    timeoutMs: 30_000,
    maxResponseBytes: 1_048_576,
  },
}

export async function readDocksConfig(root = process.cwd()) {
  const path = join(root, ".docks", "config.json")
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"))
    return normalizeConfig(parsed)
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(DEFAULT_DOCKS_CONFIG)
    throw new Error(
      `Unable to read ${relative(root, path)}: ${messageOf(error)}`
    )
  }
}

export async function writeDocksConfig(config, root = process.cwd()) {
  const normalized = normalizeConfig(config)
  const directory = join(root, ".docks")
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  )
  return normalized
}

export async function openKnowledgeDatabase(config, environment = process.env) {
  if (config.url) return null
  const environmentName = config.databaseUrlEnv
  const connectionString = environment[environmentName]
  if (!connectionString) return null
  const { Pool } = await import("pg")
  return new Pool({ connectionString })
}

export async function listKnowledgeWorkspaces(pool) {
  const result = await pool.query(
    `SELECT workspace.id, workspace.revision, workspace.updated_at,
            source.source_url, source.document_hash
       FROM skaper.workspaces AS workspace
       LEFT JOIN skaper.api_sources AS source
         ON source.workspace_id = workspace.id
      ORDER BY workspace.id`
  )
  return result.rows.map((row) => ({
    id: row.id,
    revision: Number(row.revision ?? 0),
    updatedAt: toIso(row.updated_at),
    sourceUrl: row.source_url ?? null,
    documentHash: row.document_hash ?? null,
  }))
}

export async function resolveWorkspace(pool, requestedWorkspaceId) {
  const workspaces = await listKnowledgeWorkspaces(pool)
  if (requestedWorkspaceId) {
    const workspace = workspaces.find(
      (item) => item.id === requestedWorkspaceId
    )
    if (!workspace) {
      throw new Error(
        `Unknown Docks workspace ${JSON.stringify(requestedWorkspaceId)}. Available: ${workspaces.map((item) => item.id).join(", ") || "none"}.`
      )
    }
    return workspace
  }
  if (workspaces.length === 1) return workspaces[0]
  if (workspaces.length === 0) {
    throw new Error("The database contains no Docks workspaces.")
  }
  throw new Error(
    `The database contains multiple Docks workspaces. Pass --workspace with one of: ${workspaces.map((item) => item.id).join(", ")}.`
  )
}

export async function knowledgeStatus({
  pool,
  config,
  workspaceId,
  includeResponseBodies = false,
  root = process.cwd(),
}) {
  const output = resolveOutputRoot(root, config.knowledgeOutput)
  let manifest = null
  let graph = null
  try {
    manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"))
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error
  }
  try {
    graph = JSON.parse(await readFile(join(output, "graph.json"), "utf8"))
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error
  }
  const directSource = pool
    ? null
    : await loadDirectOpenApiSource({
        config,
        root,
        fallbackSource: manifest?.source,
      })
  const workspace = pool
    ? await resolveWorkspace(pool, workspaceId ?? config.workspaceId)
    : directWorkspace(
        directSource,
        workspaceId ?? config.workspaceId ?? manifest?.workspaceId
      )
  const artifactsPresent = await Promise.all(
    [
      "DOCKS_REPORT.md",
      "references/operations",
      "references/schemas",
      "references/collections",
      "references/environments",
      "references/responses",
    ].map((path) => exists(join(output, path)))
  ).then((values) => values.every(Boolean))
  const stale =
    !manifest ||
    !graph ||
    !artifactsPresent ||
    manifest.schemaVersion !== GRAPH_SCHEMA_VERSION ||
    manifest.workspaceId !== workspace.id ||
    (pool
      ? Number(manifest.revision) !== workspace.revision
      : manifest.documentHash !== workspace.documentHash ||
        manifest.source !== directSource.source) ||
    manifest.includeResponseBodies !== includeResponseBodies ||
    manifest.configHash !== knowledgeConfigHash(config) ||
    graph.schemaVersion !== GRAPH_SCHEMA_VERSION ||
    graph.workspaceId !== workspace.id
  return { stale, workspace, manifest, output }
}

export async function buildKnowledge({
  pool,
  config,
  workspaceId,
  includeResponseBodies = false,
  root = process.cwd(),
}) {
  const directSource = pool
    ? null
    : await loadDirectOpenApiSource({ config, root })
  const workspace = pool
    ? await resolveWorkspace(pool, workspaceId ?? config.workspaceId)
    : directWorkspace(directSource, workspaceId ?? config.workspaceId)
  const snapshot = pool
    ? await loadWorkspaceSnapshot(pool, workspace.id)
    : createDirectSnapshot(workspace, directSource)
  const configuredSecretValues = Object.values(
    config.actions.headerEnvironment
  ).flatMap((environmentName) => {
    const value = process.env[environmentName]
    return value ? [value] : []
  })
  const graph = createKnowledgeGraph(snapshot, {
    includeResponseBodies,
    configuredSecretValues,
  })
  const output = resolveOutputRoot(root, config.knowledgeOutput)
  await mkdir(dirname(output), { recursive: true })
  const temporary = await mkdtemp(join(dirname(output), ".docks-out-"))
  const references = join(temporary, "references")
  for (const directory of [
    "operations",
    "schemas",
    "collections",
    "environments",
    "responses",
  ]) {
    await mkdir(join(references, directory), { recursive: true })
  }

  await writeFile(
    join(temporary, "graph.json"),
    `${JSON.stringify(graph, null, 2)}\n`
  )
  await writeFile(
    join(temporary, "DOCKS_REPORT.md"),
    createKnowledgeReport(graph)
  )
  const manifest = {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    workspaceId: workspace.id,
    revision: pool ? workspace.revision : null,
    documentHash: snapshot.source?.documentHash ?? null,
    source: pool ? (snapshot.source?.url ?? null) : directSource.source,
    sourceMode: pool ? "postgres" : "openapi",
    configHash: knowledgeConfigHash(config),
    includeResponseBodies,
    builtAt: new Date().toISOString(),
  }
  await writeFile(
    join(temporary, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
  await writeNodeReferences(graph.nodes, references)

  const backup = `${output}.previous`
  await rm(backup, { recursive: true, force: true })
  if (await exists(output)) await rename(output, backup)
  try {
    await rename(temporary, output)
    await rm(backup, { recursive: true, force: true })
  } catch (error) {
    if (await exists(backup)) await rename(backup, output).catch(() => {})
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
  await ensureGitIgnore(root, config.knowledgeOutput)
  return { graph, manifest, output }
}

async function loadDirectOpenApiSource({ config, root, fallbackSource }) {
  const source =
    config.url ?? fallbackSource ?? (await discoverOpenApiSource(root))
  if (!source) {
    throw new Error(
      "No PostgreSQL database or OpenAPI source is configured. Pass --url <file-or-http-url>, set url in .docks/config.json, or add one conventional openapi/swagger file at the project root."
    )
  }
  const text = await readOpenApiSource(source, root)
  let document
  try {
    document = parseYaml(text)
  } catch (error) {
    throw new Error(
      `Unable to parse OpenAPI source ${JSON.stringify(source)}: ${messageOf(error)}`
    )
  }
  if (!isObject(document) || (!document.openapi && !document.swagger)) {
    throw new Error(
      `OpenAPI source ${JSON.stringify(source)} is not an OpenAPI or Swagger document.`
    )
  }
  return {
    source,
    document,
    documentHash: createHash("sha256").update(text).digest("hex"),
  }
}

async function discoverOpenApiSource(root) {
  const candidates = [
    "openapi.json",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
  ]
  const matches = []
  for (const candidate of candidates) {
    if (await exists(join(root, candidate))) matches.push(candidate)
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple OpenAPI files were found (${matches.join(", ")}). Pass --url to select one.`
    )
  }
  return matches[0] ?? null
}

async function readOpenApiSource(source, root) {
  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source)
    if (url.username || url.password) {
      throw new Error("OpenAPI source URLs must not contain credentials.")
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/json, application/yaml, text/yaml",
          "cache-control": "no-cache, no-store, max-age=0",
          pragma: "no-cache",
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      const declaredLength = Number(response.headers.get("content-length"))
      if (Number.isFinite(declaredLength) && declaredLength > 10_485_760) {
        throw new Error("OpenAPI source exceeds the 10 MiB limit.")
      }
      const text = await response.text()
      if (Buffer.byteLength(text) > 10_485_760) {
        throw new Error("OpenAPI source exceeds the 10 MiB limit.")
      }
      return text
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("OpenAPI source request timed out.")
      }
      throw new Error(
        `Unable to read OpenAPI source ${JSON.stringify(source)}: ${messageOf(error)}`
      )
    } finally {
      clearTimeout(timeout)
    }
  }
  try {
    const projectRoot = await realpath(resolve(root))
    const path = await realpath(resolve(projectRoot, source))
    if (path !== projectRoot && !path.startsWith(`${projectRoot}/`)) {
      throw new Error("Local OpenAPI sources must be inside the project root.")
    }
    return await readFile(path, "utf8")
  } catch (error) {
    throw new Error(
      `Unable to read OpenAPI source ${JSON.stringify(source)}: ${messageOf(error)}`
    )
  }
}

function directWorkspace(source, requestedWorkspaceId) {
  const id =
    requestedWorkspaceId ??
    `openapi-${createHash("sha256").update(source.source).digest("hex").slice(0, 16)}`
  return {
    id,
    revision: null,
    updatedAt: null,
    sourceUrl: source.source,
    documentHash: source.documentHash,
    mode: "openapi",
  }
}

function createDirectSnapshot(workspace, source) {
  return {
    workspaceId: workspace.id,
    source: {
      url: source.source,
      documentHash: source.documentHash,
      document: source.document,
      syncedAt: null,
    },
    environments: [],
    variables: [],
    collections: [],
    customRequests: [],
    responses: [],
  }
}

export async function loadLocalGraph(config, root = process.cwd()) {
  const output = resolveOutputRoot(root, config.knowledgeOutput)
  try {
    return JSON.parse(await readFile(join(output, "graph.json"), "utf8"))
  } catch (error) {
    throw new Error(`Docks knowledge has not been built: ${messageOf(error)}`)
  }
}

export function queryKnowledge(graph, question, limit = 12) {
  const terms = tokenize(question)
  return graph.nodes
    .map((node) => ({ node, score: scoreNode(node, terms) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.node.id.localeCompare(right.node.id)
    )
    .slice(0, limit)
    .map(({ node, score }) => ({
      ...node,
      score,
      connections: graph.edges
        .filter((edge) => edge.source === node.id || edge.target === node.id)
        .slice(0, 12),
    }))
}

export function explainKnowledgeNode(graph, selector) {
  const node = resolveGraphNode(graph, selector)
  if (!node)
    throw new Error(`No knowledge node matches ${JSON.stringify(selector)}.`)
  return {
    node,
    connections: graph.edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id
    ),
  }
}

export function findKnowledgePath(graph, fromSelector, toSelector) {
  const from = resolveGraphNode(graph, fromSelector)
  const to = resolveGraphNode(graph, toSelector)
  if (!from || !to)
    throw new Error("Both path endpoints must match knowledge nodes.")
  const queue = [from.id]
  const previous = new Map([[from.id, null]])
  while (queue.length) {
    const current = queue.shift()
    if (current === to.id) break
    for (const edge of graph.edges) {
      const next =
        edge.source === current
          ? edge.target
          : edge.target === current
            ? edge.source
            : undefined
      if (next && !previous.has(next)) {
        previous.set(next, { node: current, edge })
        queue.push(next)
      }
    }
  }
  if (!previous.has(to.id)) return { from, to, path: [] }
  const path = []
  let current = to.id
  while (current !== from.id) {
    const step = previous.get(current)
    path.unshift({
      node: graph.nodes.find((node) => node.id === current),
      edge: step.edge,
    })
    current = step.node
  }
  path.unshift({ node: from, edge: null })
  return { from, to, path }
}

export function createKnowledgeQueryOutput(graph, question, results) {
  return {
    query: question,
    resultCount: results.length,
    results: results.map((result) => ({
      ...summarizeKnowledgeNode(result),
      score: result.score,
      relationships: summarizeRelationships(
        graph,
        result.id,
        result.connections
      ),
    })),
    next: "Use `docks knowledge explain <id>` for complete details or `docks knowledge path <from> <to>` for traversal.",
  }
}

export function createKnowledgeExplainOutput(graph, explanation) {
  return {
    node: summarizeKnowledgeNode(explanation.node, true),
    relationships: summarizeRelationships(
      graph,
      explanation.node.id,
      explanation.connections
    ),
  }
}

export function createKnowledgePathOutput(result) {
  return {
    from: summarizeKnowledgeNode(result.from),
    to: summarizeKnowledgeNode(result.to),
    found: result.path.length > 0,
    path: result.path.map((step) => ({
      node: summarizeKnowledgeNode(step.node),
      via: step.edge
        ? {
            relation: step.edge.relation,
            confidence: step.edge.confidence,
          }
        : null,
    })),
  }
}

function summarizeKnowledgeNode(item, detailed = false) {
  const attributes = item.attributes ?? {}
  const summary = {
    id: item.id,
    type: item.type,
    label: item.label,
  }
  if (item.type === "operation") {
    return {
      ...summary,
      operationKey: attributes.operationKey,
      operationId: attributes.operationId,
      method: attributes.method,
      path: attributes.path,
      url: attributes.url,
      summary: attributes.summary,
      description: truncateText(attributes.description, detailed ? 2_000 : 500),
      parameters: (attributes.parameters ?? []).map((parameter) => ({
        name: parameter.name,
        in: parameter.in,
        required: Boolean(parameter.required),
        type: parameter.schema?.type ?? null,
      })),
      requestBody: summarizeRequestBody(attributes.requestBody),
      responses: summarizeResponses(attributes.responses),
    }
  }
  if (item.type === "schema") {
    const schema = attributes.schema ?? {}
    return {
      ...summary,
      name: attributes.name,
      schemaType: schema.type ?? null,
      description: truncateText(schema.description, detailed ? 2_000 : 500),
      required: schema.required ?? [],
      properties: Object.keys(schema.properties ?? {}),
      ...(detailed ? { schema } : {}),
    }
  }
  if (item.type === "custom_request") {
    return {
      ...summary,
      operationKey: attributes.operationKey,
      method: attributes.method,
      url: attributes.url,
      transport: attributes.transport,
      mode: attributes.mode,
      ...(detailed ? { draft: attributes.draft } : {}),
    }
  }
  const allowed = [
    "name",
    "sourceUrl",
    "documentHash",
    "version",
    "openapi",
    "baseUrl",
    "key",
    "enabled",
    "description",
    "operationId",
    "method",
    "path",
    "status",
    "ok",
    "contentType",
    "createdAt",
  ]
  return {
    ...summary,
    attributes: Object.fromEntries(
      allowed.flatMap((key) =>
        attributes[key] === undefined ? [] : [[key, attributes[key]]]
      )
    ),
  }
}

function summarizeRelationships(graph, nodeId, connections = []) {
  return connections.slice(0, 16).map((edge) => {
    const outgoing = edge.source === nodeId
    const relatedId = outgoing ? edge.target : edge.source
    const related = graph.nodes.find((node) => node.id === relatedId)
    return {
      relation: edge.relation,
      confidence: edge.confidence,
      direction: outgoing ? "outgoing" : "incoming",
      node: related
        ? { id: related.id, type: related.type, label: related.label }
        : { id: relatedId },
    }
  })
}

function summarizeRequestBody(requestBody) {
  if (!requestBody) return null
  return {
    required: Boolean(requestBody.required),
    content: Object.entries(requestBody.content ?? {}).map(
      ([contentType, media]) => ({
        contentType,
        schemas: [...collectRefs(media)].map((ref) => ref.split("/").at(-1)),
      })
    ),
  }
}

function summarizeResponses(responses = {}) {
  return Object.entries(responses).map(([status, response]) => ({
    status,
    description: truncateText(response?.description, 240),
    content: Object.entries(response?.content ?? {}).map(
      ([contentType, media]) => ({
        contentType,
        schemas: [...collectRefs(media)].map((ref) => ref.split("/").at(-1)),
      })
    ),
  }))
}

function truncateText(value, limit) {
  if (typeof value !== "string") return ""
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

export async function runUpstreamAction({
  graph,
  config,
  selector,
  parameters = {},
  body,
  contentType,
  confirmedWrite = false,
  saveResponse = false,
  pool,
  workspaceId,
}) {
  const node = resolveExecutableNode(graph, selector)
  if (!node || !["operation", "custom_request"].includes(node.type)) {
    throw new Error(
      `No executable operation matches ${JSON.stringify(selector)}.`
    )
  }
  const operation = node.attributes
  if (operation.transport === "websocket" || operation.mode === "sse") {
    throw new Error("SSE and WebSocket actions are not supported.")
  }
  const method = String(operation.method).toUpperCase()
  const operationKey = operation.operationKey ?? node.id
  const configuredMethods = new Set(
    config.actions.allowedMethods.map((value) => value.toUpperCase())
  )
  const allowedOperation = config.actions.allowedOperations.some(
    (value) => value === operationKey || value === operation.operationId
  )
  if (!configuredMethods.has(method) && !allowedOperation) {
    throw new Error(`${operationKey} is not allowlisted for upstream actions.`)
  }
  if (!SAFE_METHODS.has(method) && !confirmedWrite) {
    throw new Error(
      "Mutating upstream actions require --confirmed-write after explicit user approval."
    )
  }

  validateActionParameters(operation, parameters, body, contentType)
  const requestUrl = buildActionUrl(operation.url, parameters)
  if (!config.actions.allowedOrigins.includes(requestUrl.origin)) {
    throw new Error(
      `${requestUrl.origin} is not present in actions.allowedOrigins.`
    )
  }
  const headers = new Headers()
  for (const [name, value] of Object.entries(parameters.header ?? {})) {
    assertAgentHeader(name)
    headers.set(name, String(value))
  }
  for (const [name, environmentName] of Object.entries(
    config.actions.headerEnvironment
  )) {
    const value = process.env[environmentName]
    if (!value)
      throw new Error(
        `Missing credential environment variable ${environmentName}.`
      )
    headers.set(name, value)
  }
  if (contentType) {
    if (/multipart\/form-data|application\/octet-stream/i.test(contentType)) {
      throw new Error(
        "Multipart and binary upstream actions are not supported."
      )
    }
    headers.set("content-type", contentType)
  }

  const startedAt = performance.now()
  const response = await fetchWithLimits(requestUrl, {
    method,
    headers,
    body: SAFE_METHODS.has(method) ? undefined : body,
    timeoutMs: config.actions.timeoutMs,
    maxResponseBytes: config.actions.maxResponseBytes,
  })
  const result = {
    operation: operationKey,
    method,
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    durationMs: Math.round(performance.now() - startedAt),
    sizeBytes: response.bytes.byteLength,
    contentType: response.headers.get("content-type") ?? "",
    headers: redactHeaders(response.headers),
    bodyText: new TextDecoder().decode(response.bytes),
  }
  if (saveResponse) {
    if (!pool || !workspaceId)
      throw new Error("Saving requires a selected database workspace.")
    await saveAgentResponse(pool, workspaceId, node, parameters, body, result)
  }
  return result
}

async function loadWorkspaceSnapshot(pool, workspaceId) {
  const [
    source,
    environments,
    variables,
    collections,
    customRequests,
    responses,
  ] = await Promise.all([
    pool.query(
      `SELECT source_url, document_hash, document, synced_at
           FROM skaper.api_sources WHERE workspace_id = $1`,
      [workspaceId]
    ),
    pool.query(
      `SELECT id, name, base_url, updated_at
           FROM skaper.environments WHERE workspace_id = $1 ORDER BY name, id`,
      [workspaceId]
    ),
    pool.query(
      `SELECT environment_id, id, key, value, enabled, is_secret, description
           FROM skaper.environment_variables
          WHERE workspace_id = $1 ORDER BY environment_id, position, id`,
      [workspaceId]
    ),
    pool.query(
      `SELECT id, name, position, created_at, updated_at
           FROM skaper.collections WHERE workspace_id = $1 ORDER BY position, id`,
      [workspaceId]
    ),
    pool.query(
      `SELECT id, collection_id, name, method, transport, mode, url, folder,
                draft, position, created_at, updated_at
           FROM skaper.custom_requests
          WHERE workspace_id = $1 ORDER BY collection_id, position, id`,
      [workspaceId]
    ),
    pool.query(
      `SELECT id, operation_id, method, path, name, status, ok, duration_ms,
                size_bytes, content_type, request_snapshot, result, created_at
           FROM skaper.saved_responses
          WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    ),
  ])
  const sourceRow = source.rows[0]
  return {
    workspaceId,
    source: sourceRow
      ? {
          url: sourceRow.source_url,
          documentHash: sourceRow.document_hash,
          document: parseJson(sourceRow.document),
          syncedAt: toIso(sourceRow.synced_at),
        }
      : null,
    environments: environments.rows,
    variables: variables.rows,
    collections: collections.rows,
    customRequests: customRequests.rows,
    responses: responses.rows,
  }
}

function createKnowledgeGraph(
  snapshot,
  { includeResponseBodies, configuredSecretValues }
) {
  const nodes = []
  const edges = []
  const addNode = (node) => {
    if (!nodes.some((item) => item.id === node.id)) nodes.push(node)
    return node.id
  }
  const addEdge = (source, target, relation, confidence = "EXTRACTED") => {
    const key = `${source}|${target}|${relation}`
    if (!edges.some((edge) => edge.key === key)) {
      edges.push({ key, source, target, relation, confidence })
    }
  }
  const workspaceNode = addNode(
    node("workspace", snapshot.workspaceId, snapshot.workspaceId, {
      workspaceId: snapshot.workspaceId,
    })
  )
  const document = snapshot.source?.document
  if (document) {
    const apiId = addNode(
      node("api_source", "source", document.info?.title ?? "OpenAPI", {
        sourceUrl: snapshot.source.url,
        documentHash: snapshot.source.documentHash,
        version: document.info?.version ?? "",
        openapi: document.openapi ?? "",
      })
    )
    addEdge(workspaceNode, apiId, "contains")
    const schemas = document.components?.schemas ?? {}
    for (const [name, schema] of Object.entries(schemas)) {
      const schemaId = addNode(node("schema", name, name, { name, schema }))
      addEdge(apiId, schemaId, "defines")
    }
    for (const [name, scheme] of Object.entries(
      document.components?.securitySchemes ?? {}
    )) {
      const authId = addNode(
        node("auth_scheme", name, name, { name, ...scheme })
      )
      addEdge(apiId, authId, "defines")
    }
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem ?? {})) {
        if (!HTTP_METHODS.has(method.toLowerCase()) || !isObject(operation))
          continue
        const upperMethod = method.toUpperCase()
        const operationKey = `${upperMethod} ${path}`
        const baseUrl = firstServerUrl(
          operation,
          pathItem,
          document,
          snapshot.source.url
        )
        const operationId = addNode(
          node(
            "operation",
            operationKey,
            operation.summary ?? operation.operationId ?? operationKey,
            {
              operationKey,
              operationId: operation.operationId ?? null,
              method: upperMethod,
              path,
              url: joinUrl(baseUrl, path),
              summary: operation.summary ?? operationKey,
              description: operation.description ?? "",
              parameters: [
                ...(pathItem.parameters ?? []),
                ...(operation.parameters ?? []),
              ],
              requestBody: operation.requestBody ?? null,
              responses: operation.responses ?? {},
              transport: "http",
              mode: hasSseResponse(operation) ? "sse" : "standard",
            }
          )
        )
        addEdge(apiId, operationId, "defines")
        addEdge(operationId, apiId, "served_by")
        for (const tag of operation.tags ?? ["Other"]) {
          const tagId = addNode(node("tag", tag, tag, { name: tag }))
          addEdge(operationId, tagId, "tagged_with")
        }
        for (const ref of collectRefs(operation)) {
          const schemaName = ref.split("/").at(-1)
          if (schemaName && schemas[schemaName]) {
            addEdge(operationId, `schema:${schemaName}`, "uses_schema")
          }
        }
        const security = operation.security ?? document.security ?? []
        for (const requirement of security) {
          for (const name of Object.keys(requirement)) {
            if (document.components?.securitySchemes?.[name]) {
              addEdge(operationId, `auth_scheme:${name}`, "requires_auth")
            }
          }
        }
      }
    }
  }

  for (const collection of snapshot.collections) {
    const collectionId = addNode(
      node("collection", collection.id, collection.name, {
        id: collection.id,
        name: collection.name,
        updatedAt: toIso(collection.updated_at),
      })
    )
    addEdge(workspaceNode, collectionId, "contains")
  }
  for (const request of snapshot.customRequests) {
    const requestId = addNode(
      node("custom_request", request.id, request.name, {
        operationKey: `custom:${request.id}`,
        id: request.id,
        method: request.method,
        url: request.url,
        transport: request.transport,
        mode: request.mode,
        folder: request.folder ?? null,
        draft: redactDraft(parseJson(request.draft)),
      })
    )
    addEdge(workspaceNode, requestId, "contains")
    if (
      nodes.some((item) => item.id === `collection:${request.collection_id}`)
    ) {
      addEdge(requestId, `collection:${request.collection_id}`, "belongs_to")
    }
  }
  for (const environment of snapshot.environments) {
    const environmentId = addNode(
      node("environment", environment.id, environment.name, {
        id: environment.id,
        name: environment.name,
        baseUrl: environment.base_url,
      })
    )
    addEdge(workspaceNode, environmentId, "contains")
    for (const variable of snapshot.variables.filter(
      (item) => item.environment_id === environment.id && !item.is_secret
    )) {
      const variableId = addNode(
        node(
          "environment_variable",
          `${environment.id}:${variable.id}`,
          variable.key,
          {
            key: variable.key,
            value: variable.value,
            enabled: variable.enabled,
            description: variable.description,
          }
        )
      )
      addEdge(environmentId, variableId, "contains")
    }
    for (const request of nodes.filter((item) =>
      ["operation", "custom_request"].includes(item.type)
    )) {
      if (sameConfiguredOrigin(request.attributes.url, environment.base_url)) {
        addEdge(request.id, environmentId, "uses_environment", "INFERRED")
      }
    }
  }
  for (const response of snapshot.responses) {
    const result = parseJson(response.result) ?? {}
    const responseId = addNode(
      node("saved_response", response.id, response.name, {
        id: response.id,
        operationId: response.operation_id,
        method: response.method,
        path: response.path,
        status: response.status,
        ok: response.ok,
        durationMs: Number(response.duration_ms),
        sizeBytes: response.size_bytes,
        contentType: response.content_type,
        createdAt: toIso(response.created_at),
        requestSnapshot: redactSnapshot(parseJson(response.request_snapshot)),
        ...(includeResponseBodies
          ? {
              result: redactResponseResult(
                result,
                snapshot.variables,
                configuredSecretValues
              ),
            }
          : {}),
      })
    )
    addEdge(workspaceNode, responseId, "contains")
    const target = resolveOperationNodeId(nodes, response.operation_id)
    if (target) addEdge(responseId, target, "response_for")
  }
  nodes.sort((left, right) => left.id.localeCompare(right.id))
  edges.sort((left, right) => left.key.localeCompare(right.key))
  return redactKnownValues(
    {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      workspaceId: snapshot.workspaceId,
      nodes,
      edges,
    },
    [
      ...snapshot.variables
        .filter((variable) => variable.is_secret && variable.value)
        .map((variable) => String(variable.value)),
      ...configuredSecretValues,
    ]
  )
}

function node(type, key, label, attributes) {
  const safeLabel = sanitizeLabel(label)
  return {
    id: `${type}:${key}`,
    type,
    label: safeLabel,
    attributes,
    searchText:
      `${safeLabel} ${type} ${JSON.stringify(attributes)}`.toLowerCase(),
  }
}

async function writeNodeReferences(nodes, references) {
  const directoryByType = {
    operation: "operations",
    custom_request: "operations",
    schema: "schemas",
    collection: "collections",
    environment: "environments",
    environment_variable: "environments",
    saved_response: "responses",
  }
  for (const item of nodes) {
    const directory = directoryByType[item.type]
    if (!directory) continue
    const jsonBlock = JSON.stringify(item.attributes, null, 2)
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n")
    const markdown = `# ${escapeMarkdown(item.label)}\n\n- Type: ${escapeMarkdown(item.type)}\n- ID: ${escapeMarkdown(item.id)}\n\n${jsonBlock}\n`
    await writeFile(
      join(references, directory, `${safeFileName(item.id)}.md`),
      markdown
    )
  }
}

function createKnowledgeReport(graph) {
  const counts = Object.entries(
    graph.nodes.reduce((result, item) => {
      result[item.type] = (result[item.type] ?? 0) + 1
      return result
    }, {})
  ).sort(([left], [right]) => left.localeCompare(right))
  const connected = graph.nodes
    .map((item) => ({
      item,
      degree: graph.edges.filter(
        (edge) => edge.source === item.id || edge.target === item.id
      ).length,
    }))
    .sort((left, right) => right.degree - left.degree)
    .slice(0, 10)
  const includesBodies = graph.nodes.some(
    (item) => item.type === "saved_response" && item.attributes.result
  )
  const warning = includesBodies
    ? "\n\n## Response body warning\n\nKnown secrets were redacted deterministically, but unknown personal data may remain in opted-in response bodies."
    : ""
  return `# Docks Knowledge Report\n\nWorkspace: ${escapeMarkdown(graph.workspaceId)}\n\n## Inventory\n\n${counts.map(([type, count]) => `- ${escapeMarkdown(type)}: ${count}`).join("\n")}\n\n## Most connected\n\n${connected.map(({ item, degree }) => `- ${escapeMarkdown(item.label)} (${escapeMarkdown(item.type)}, ${degree} connections)`).join("\n")}${warning}\n`
}

function resolveGraphNode(graph, selector) {
  const normalized = selector.trim().toLowerCase()
  return (
    graph.nodes.find((item) => item.id.toLowerCase() === normalized) ??
    graph.nodes.find(
      (item) => item.attributes?.operationKey?.toLowerCase() === normalized
    ) ??
    graph.nodes.find(
      (item) => item.attributes?.operationId?.toLowerCase() === normalized
    ) ??
    graph.nodes.find((item) => item.label.toLowerCase() === normalized) ??
    queryKnowledge(graph, selector, 1)[0]
  )
}

function resolveExecutableNode(graph, selector) {
  const normalized = selector.trim().toLowerCase()
  return graph.nodes.find(
    (item) =>
      ["operation", "custom_request"].includes(item.type) &&
      (item.id.toLowerCase() === normalized ||
        item.attributes?.operationKey?.toLowerCase() === normalized ||
        item.attributes?.operationId?.toLowerCase() === normalized ||
        item.label.toLowerCase() === normalized)
  )
}

function buildActionUrl(template, parameters) {
  let url = String(template ?? "")
  for (const [name, value] of Object.entries(parameters.path ?? {})) {
    url = url.replaceAll(`{${name}}`, encodeURIComponent(String(value)))
  }
  if (/\{[^}]+\}/.test(url))
    throw new Error("Missing required path parameters.")
  let resolved
  try {
    resolved = new URL(url)
  } catch {
    throw new Error(
      "The operation does not resolve to an absolute upstream URL."
    )
  }
  for (const [name, value] of Object.entries(parameters.query ?? {})) {
    if (Array.isArray(value)) {
      for (const entry of value)
        resolved.searchParams.append(name, String(entry))
    } else if (value !== undefined && value !== null) {
      resolved.searchParams.set(name, String(value))
    }
  }
  return resolved
}

function validateActionParameters(operation, supplied, body, contentType) {
  const documented = Array.isArray(operation.parameters)
    ? operation.parameters
    : []
  for (const location of ["path", "query", "header"]) {
    const values = supplied[location] ?? {}
    if (!isObject(values)) {
      throw new Error(`${location} parameters must be an object.`)
    }
    const parameters = documented.filter(
      (parameter) =>
        parameter?.in === location && typeof parameter.name === "string"
    )
    const nameOf = (name) =>
      location === "header" ? String(name).toLowerCase() : String(name)
    const byName = new Map(
      parameters.map((parameter) => [nameOf(parameter.name), parameter])
    )
    if (documented.length) {
      for (const [name, value] of Object.entries(values)) {
        const parameter = byName.get(nameOf(name))
        if (!parameter) {
          throw new Error(
            `Undocumented ${location} parameter ${JSON.stringify(name)}.`
          )
        }
        validateParameterValue(parameter, value)
      }
    }
    for (const parameter of parameters.filter((item) => item.required)) {
      const suppliedName = Object.keys(values).find(
        (name) => nameOf(name) === nameOf(parameter.name)
      )
      if (
        suppliedName === undefined ||
        values[suppliedName] === undefined ||
        values[suppliedName] === null
      ) {
        throw new Error(
          `Missing required ${location} parameter ${parameter.name}.`
        )
      }
    }
  }
  if (operation.requestBody?.required && body === undefined) {
    throw new Error("This operation requires a request body.")
  }
  if (
    SAFE_METHODS.has(String(operation.method).toUpperCase()) &&
    body !== undefined
  ) {
    throw new Error(`${operation.method} actions do not accept a request body.`)
  }
  if (body !== undefined && operation.requestBody?.content && !contentType) {
    throw new Error("--content-type is required for a documented request body.")
  }
  if (body !== undefined && operation.requestBody?.content && contentType) {
    const supported = Object.keys(operation.requestBody.content)
    if (!supported.includes(contentType)) {
      throw new Error(
        `Request content type ${contentType} is not documented for this operation.`
      )
    }
  }
}

function validateParameterValue(parameter, value) {
  const schema = parameter.schema ?? {}
  const values = Array.isArray(value) ? value : [value]
  if (schema.type !== "array" && Array.isArray(value)) {
    throw new Error(
      `Parameter ${parameter.name} does not accept multiple values.`
    )
  }
  const itemSchema = schema.type === "array" ? (schema.items ?? {}) : schema
  for (const item of values) {
    const serialized = String(item)
    if (itemSchema.type === "integer" && !/^-?\d+$/.test(serialized)) {
      throw new Error(`Parameter ${parameter.name} must be an integer.`)
    }
    if (
      itemSchema.type === "number" &&
      (serialized.trim() === "" || !Number.isFinite(Number(serialized)))
    ) {
      throw new Error(`Parameter ${parameter.name} must be a number.`)
    }
    if (
      itemSchema.type === "boolean" &&
      !["true", "false"].includes(serialized.toLowerCase())
    ) {
      throw new Error(`Parameter ${parameter.name} must be a boolean.`)
    }
    if (Array.isArray(itemSchema.enum) && !itemSchema.enum.includes(item)) {
      throw new Error(
        `Parameter ${parameter.name} is outside its documented enum.`
      )
    }
    if (
      itemSchema.pattern &&
      !new RegExp(itemSchema.pattern).test(serialized)
    ) {
      throw new Error(
        `Parameter ${parameter.name} does not match its documented pattern.`
      )
    }
  }
}

async function fetchWithLimits(url, options) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    let current = url
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetch(current, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        redirect: "manual",
        signal: controller.signal,
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location) throw new Error("Upstream redirect is missing Location.")
        const next = new URL(location, current)
        if (next.origin !== url.origin)
          throw new Error("Cross-origin redirects are blocked.")
        await response.body?.cancel().catch(() => {})
        current = next
        continue
      }
      const declared = Number(response.headers.get("content-length"))
      if (Number.isFinite(declared) && declared > options.maxResponseBytes) {
        throw new Error("Upstream response exceeds maxResponseBytes.")
      }
      const contentType = response.headers.get("content-type") ?? ""
      if (
        contentType &&
        (/^text\/event-stream/i.test(contentType) ||
          !/^(application\/(?:json|problem\+json|[^;]+\+json|xml|x-www-form-urlencoded)|text\/|image\/svg\+xml)/i.test(
            contentType
          ))
      ) {
        throw new Error(
          `Unsupported upstream response content type: ${contentType}.`
        )
      }
      const bytes = await readLimitedBody(response, options.maxResponseBytes)
      return {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: response.headers,
        bytes,
        url: current.toString(),
      }
    }
    throw new Error("Upstream response exceeded the redirect limit.")
  } catch (error) {
    if (error?.name === "AbortError")
      throw new Error("Upstream action timed out.")
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function readLimitedBody(response, maximum) {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maximum) {
      await reader.cancel().catch(() => {})
      throw new Error("Upstream response exceeds maxResponseBytes.")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function saveAgentResponse(
  pool,
  workspaceId,
  node,
  parameters,
  body,
  result
) {
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`
  await pool.query(
    `INSERT INTO skaper.saved_responses
       (workspace_id, id, operation_id, method, path, name, status, ok,
        duration_ms, size_bytes, content_type, request_snapshot, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)`,
    [
      workspaceId,
      id,
      node.attributes.operationKey ?? node.id,
      result.method,
      node.attributes.path ?? result.url,
      `Agent ${result.method} ${node.label}`,
      result.status,
      result.ok,
      result.durationMs,
      result.sizeBytes,
      result.contentType,
      JSON.stringify({
        parameters,
        body: body ?? null,
        sentAt: new Date().toISOString(),
      }),
      JSON.stringify(result),
    ]
  )
  await pool.query(
    "UPDATE skaper.workspaces SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [workspaceId]
  )
}

function normalizeConfig(value) {
  const actions = value?.actions ?? {}
  return {
    url:
      value?.url === null || value?.url === undefined
        ? null
        : nonEmptyString(value.url),
    databaseUrlEnv: nonEmptyString(value?.databaseUrlEnv, "DATABASE_URL"),
    workspaceId:
      value?.workspaceId === null || value?.workspaceId === undefined
        ? null
        : nonEmptyString(value.workspaceId),
    knowledgeOutput: nonEmptyString(value?.knowledgeOutput, "docks-out"),
    actions: {
      allowedOrigins: uniqueStrings(actions.allowedOrigins).map(
        normalizeOrigin
      ),
      allowedMethods: uniqueStrings(
        actions.allowedMethods ?? DEFAULT_DOCKS_CONFIG.actions.allowedMethods
      ).map((method) => method.toUpperCase()),
      allowedOperations: uniqueStrings(actions.allowedOperations),
      headerEnvironment: normalizeHeaderEnvironment(actions.headerEnvironment),
      timeoutMs: positiveInteger(actions.timeoutMs, 30_000),
      maxResponseBytes: positiveInteger(actions.maxResponseBytes, 1_048_576),
    },
  }
}

function normalizeHeaderEnvironment(value) {
  if (!isObject(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([name, environmentName]) => {
      assertConfigHeader(name)
      return [name.toLowerCase(), nonEmptyString(environmentName)]
    })
  )
}

function assertConfigHeader(name) {
  const normalized = name.toLowerCase()
  if (HOP_BY_HOP_HEADERS.has(normalized) || normalized === "host") {
    throw new Error(`Header ${name} cannot be configured for upstream actions.`)
  }
}

function assertAgentHeader(name) {
  const normalized = name.toLowerCase()
  if (
    isSensitiveHeader(normalized) ||
    HOP_BY_HOP_HEADERS.has(normalized) ||
    normalized === "forwarded" ||
    normalized === "via" ||
    normalized.startsWith("x-forwarded-") ||
    normalized.startsWith("proxy-")
  ) {
    throw new Error(`Header ${name} must not be supplied by an agent action.`)
  }
}

function redactHeaders(headers) {
  return Array.from(headers.entries()).flatMap(([name, value]) =>
    isSensitiveHeader(name) ? [] : [{ key: name, value }]
  )
}

function redactDraft(draft) {
  if (!draft) return draft
  return {
    ...draft,
    headers: redactRows(draft.headers),
    params: redactRows(draft.params),
  }
}

function redactSnapshot(snapshot) {
  if (!snapshot) return snapshot
  return {
    ...snapshot,
    headers: redactRows(snapshot.headers),
    params: redactRows(snapshot.params),
  }
}

function redactRows(rows = []) {
  return rows.map((row) =>
    isSensitiveHeader(String(row.key ?? row.name ?? ""))
      ? { ...row, value: "[REDACTED]" }
      : row
  )
}

function isSensitiveHeader(name) {
  const normalized = String(name).toLowerCase()
  return (
    SENSITIVE_HEADERS.has(normalized) ||
    /(?:^|[-_])(auth|authorization|cookie|credential|password|secret|token|api[-_]?key)(?:$|[-_])/i.test(
      normalized
    )
  )
}

function redactResponseResult(result, variables, configuredSecretValues = []) {
  const secrets = [
    ...variables
      .filter((variable) => variable.is_secret && variable.value)
      .map((variable) => String(variable.value)),
    ...configuredSecretValues,
  ]
  const redactValue = (value) => {
    if (typeof value !== "string") return value
    return secrets.reduce(
      (text, secret) => text.replaceAll(secret, "[REDACTED]"),
      value
    )
  }
  return {
    ...result,
    bodyText: redactValue(result.bodyText),
    headers: redactRows(result.headers),
    cookies: [],
  }
}

function redactKnownValues(value, secretValues) {
  if (typeof value === "string") {
    return secretValues.reduce(
      (current, secret) => current.replaceAll(secret, "[REDACTED]"),
      value
    )
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactKnownValues(item, secretValues))
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactKnownValues(item, secretValues),
      ])
    )
  }
  return value
}

function collectRefs(value, refs = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs)
  } else if (isObject(value)) {
    if (typeof value.$ref === "string") refs.add(value.$ref)
    for (const item of Object.values(value)) collectRefs(item, refs)
  }
  return refs
}

function firstServerUrl(operation, pathItem, document, sourceUrl) {
  const value =
    operation.servers?.[0]?.url ??
    pathItem.servers?.[0]?.url ??
    document.servers?.[0]?.url ??
    "/"
  if (typeof value !== "string") return ""
  try {
    return new URL(value, sourceUrl).toString()
  } catch {
    return value
  }
}

function joinUrl(base, path) {
  if (!base) return path
  try {
    const server = new URL(base)
    const pathname = `${server.pathname.replace(/\/$/, "")}/${path.replace(
      /^\//,
      ""
    )}`
    return `${server.origin}${pathname}${server.search}`
  } catch {
    return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
  }
}

function sameConfiguredOrigin(requestUrl, environmentUrl) {
  if (!requestUrl || !environmentUrl) return false
  try {
    return new URL(requestUrl).origin === new URL(environmentUrl).origin
  } catch {
    return false
  }
}

function hasSseResponse(operation) {
  return Object.values(operation.responses ?? {}).some((response) =>
    Object.keys(response?.content ?? {}).some(
      (type) => type.toLowerCase() === "text/event-stream"
    )
  )
}

function resolveOperationNodeId(nodes, operationId) {
  const custom = operationId.startsWith("custom:")
    ? `custom_request:${operationId.slice(7)}`
    : undefined
  if (custom && nodes.some((item) => item.id === custom)) return custom
  return nodes.find(
    (item) =>
      item.type === "operation" &&
      (item.attributes.operationKey === operationId ||
        item.attributes.operationId === operationId)
  )?.id
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9_./{}:-]+/)
    .filter(Boolean)
}

function scoreNode(node, terms) {
  if (!terms.length) return 1
  return terms.reduce((score, term) => {
    const label = node.label.toLowerCase()
    const id = node.id.toLowerCase()
    if (label === term || id === term) return score + 12
    if (label.startsWith(term) || id.includes(term)) return score + 6
    if (node.searchText.includes(term)) return score + 2
    return score
  }, 0)
}

function resolveOutputRoot(root, configured) {
  const resolvedRoot = resolve(root)
  const output = resolve(resolvedRoot, configured)
  if (output === resolvedRoot || !output.startsWith(`${resolvedRoot}/`)) {
    throw new Error(
      "knowledgeOutput must resolve to a directory inside the project."
    )
  }
  return output
}

async function ensureGitIgnore(root, configuredOutput) {
  const path = join(root, ".gitignore")
  const entry = `${configuredOutput.replace(/\/$/, "")}/`
  let current = ""
  try {
    current = await readFile(path, "utf8")
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  if (current.split(/\r?\n/).includes(entry)) return
  await writeFile(
    path,
    `${current}${current && !current.endsWith("\n") ? "\n" : ""}${entry}\n`
  )
}

function safeFileName(value) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
}

function sanitizeLabel(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 256)
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_[\]<>#])/g, "\\$1")
}

function uniqueStrings(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : []).map((item) => nonEmptyString(item))
    ),
  ]
}

function normalizeOrigin(value) {
  const url = new URL(value)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Invalid exact upstream origin ${JSON.stringify(value)}.`)
  }
  return url.origin
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("Action limits must be positive integers.")
  return value
}

function nonEmptyString(value, fallback) {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== "string" || !value.trim())
    throw new Error("Expected a non-empty string.")
  return value.trim()
}

function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function knowledgeConfigHash(config) {
  const { url: _url, ...sourceIndependentConfig } = config
  return createHash("sha256")
    .update(JSON.stringify(sourceIndependentConfig))
    .digest("hex")
}
