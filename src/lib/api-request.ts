import type {
  KeyValueRow,
  RequestBodyDraft,
  RequestDraft,
  SavedRequestSnapshot,
} from "@/components/api-reference/types"

export type RequestEnvironmentSnapshot = {
  id?: string
  name?: string
  baseUrl?: string
} | null

/**
 * Resolves a request draft into Fetch API values and a serializable audit
 * snapshot. Disabled or unnamed rows are intentionally omitted.
 *
 * The returned headers may differ from the draft for body modes where the
 * browser must choose the final content type, such as multipart form data.
 */
export function buildFetchRequest({
  baseUrl,
  method,
  draft,
  resolveVariables,
  environment,
  sentAt = new Date().toISOString(),
}: {
  baseUrl: string
  method: string
  draft: RequestDraft
  resolveVariables: (text: string) => string
  environment: RequestEnvironmentSnapshot
  sentAt?: string
}) {
  const headers = new Headers()
  const resolvedHeaders = draft.headers
    .filter((header) => header.enabled !== false && header.key.trim())
    .map((header) => resolveRow(header, resolveVariables))

  for (const header of resolvedHeaders) {
    headers.set(header.key.trim(), header.value)
  }

  const resolvedParams = draft.params
    .filter((param) => param.enabled !== false && param.key.trim())
    .map((param) => resolveRow(param, resolveVariables))
  const url = buildRequestUrl(resolveVariables(baseUrl), resolvedParams)
  const canHaveBody = method !== "GET" && method !== "HEAD"
  const body = canHaveBody
    ? buildRequestBody({ body: draft.body, headers, resolveVariables })
    : undefined
  const snapshotBody = resolveBodyDraft(draft.body, resolveVariables)

  const requestSnapshot: SavedRequestSnapshot = {
    method,
    transport: "http",
    mode: "standard",
    url,
    params: resolvedParams,
    headers: Array.from(headers.entries()).map(([key, value]) => ({
      key,
      value,
      description:
        resolvedHeaders.find(
          (header) => header.key.toLowerCase() === key.toLowerCase()
        )?.description ?? "",
      enabled: true,
    })),
    body: snapshotBody,
    environment,
    sentAt,
  }

  return { url, headers, body, requestSnapshot }
}

/**
 * Applies path parameters and appends query parameters to a request URL.
 * Relative URLs are resolved against the current origin in a browser and
 * `http://localhost` during server rendering and unit tests.
 */
export function buildRequestUrl(baseUrl: string, params: KeyValueRow[]) {
  let url = baseUrl
  const queryParams = new URLSearchParams()

  for (const param of params) {
    const key = param.key.trim()
    if (!key || param.enabled === false) continue

    if (param.location === "path") {
      url = url
        .replaceAll(`{${key}}`, encodeURIComponent(param.value))
        .replaceAll(`:${key}`, encodeURIComponent(param.value))
    } else {
      queryParams.append(key, param.value)
    }
  }

  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  const urlObject = new URL(url, origin)
  queryParams.forEach((value, key) => urlObject.searchParams.append(key, value))

  return urlObject.toString()
}

function buildRequestBody({
  body,
  headers,
  resolveVariables,
}: {
  body: RequestBodyDraft
  headers: Headers
  resolveVariables: (text: string) => string
}): BodyInit | undefined {
  if (body.mode === "none") {
    return undefined
  }

  if (body.mode === "binary") {
    if (!body.binaryFile) {
      return undefined
    }
    headers.set(
      "Content-Type",
      body.binaryFile.type || body.contentType || "application/octet-stream"
    )
    return body.binaryFile
  }

  if (body.mode === "form-data") {
    // Fetch adds the multipart boundary. Keeping a caller-provided content
    // type would omit that boundary and produce an invalid request payload.
    headers.delete("content-type")
    const formData = new FormData()
    for (const row of body.formDataRows ?? []) {
      if (row.enabled === false || !row.key.trim()) continue
      if (row.type === "file") {
        const files = row.files?.length ? row.files : row.file ? [row.file] : []
        const fileNames = row.fileNames?.length
          ? row.fileNames
          : row.fileName
            ? [row.fileName]
            : []

        files.forEach((file, index) => {
          formData.append(
            row.key.trim(),
            file,
            fileNames[index] ||
              ("name" in file && typeof file.name === "string"
                ? file.name
                : "upload.bin")
          )
        })
        continue
      }
      formData.append(row.key.trim(), resolveVariables(row.value))
    }
    return formData
  }

  if (body.mode === "x-www-form-urlencoded") {
    const params = new URLSearchParams()
    for (const row of body.urlEncodedRows ?? []) {
      if (row.enabled === false || !row.key.trim()) continue
      params.append(row.key.trim(), resolveVariables(row.value))
    }
    headers.set("Content-Type", "application/x-www-form-urlencoded")
    return params
  }

  if (body.mode === "graphql") {
    const graphqlBody = serializeGraphqlBody(body, resolveVariables)
    if (!graphqlBody) {
      return undefined
    }
    headers.set("Content-Type", "application/json")
    return graphqlBody
  }

  const rawBody = resolveVariables(body.value)
  if (!rawBody.trim()) {
    return undefined
  }

  if (body.contentType) {
    headers.set("Content-Type", body.contentType)
  }

  return rawBody
}

function resolveBodyDraft(
  body: RequestBodyDraft,
  resolveVariables: (text: string) => string
): RequestBodyDraft {
  const { binaryFile: _binaryFile, ...serializableBody } = body

  return {
    ...serializableBody,
    value: resolveVariables(body.value),
    graphqlQuery: resolveVariables(body.graphqlQuery ?? ""),
    graphqlVariables: resolveVariables(body.graphqlVariables ?? ""),
    formDataRows: (body.formDataRows ?? []).map((row) =>
      resolveRow(row, resolveVariables)
    ),
    urlEncodedRows: (body.urlEncodedRows ?? []).map((row) =>
      resolveRow(row, resolveVariables)
    ),
  }
}

export function serializeGraphqlBody(
  body: RequestBodyDraft,
  resolveVariables: (text: string) => string = (value) => value
) {
  const query = resolveVariables(body.graphqlQuery ?? "").trim()
  const variablesText = resolveVariables(body.graphqlVariables ?? "").trim()

  if (!query && !variablesText) {
    return ""
  }

  const payload: { query: string; variables?: unknown } = { query }
  if (variablesText) {
    try {
      payload.variables = JSON.parse(variablesText)
    } catch {
      // Keep the editor and request preview usable while the user is midway
      // through entering JSON. The server can still report invalid variables
      // if the incomplete value is sent.
      payload.variables = variablesText
    }
  }

  return JSON.stringify(payload)
}

function resolveRow(
  row: KeyValueRow,
  resolveVariables: (text: string) => string
): KeyValueRow {
  const { file: _file, files: _files, ...serializableRow } = row
  const fileNames =
    row.fileNames ??
    row.files?.map((file) => file.name) ??
    (row.fileName ? [row.fileName] : undefined)

  return {
    ...serializableRow,
    key: resolveVariables(row.key),
    value: resolveVariables(row.value),
    description: row.description,
    fileName: fileNames?.[0],
    fileNames,
  }
}
