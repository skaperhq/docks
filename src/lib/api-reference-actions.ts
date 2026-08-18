import { getDocksStorageAdapter } from "./storage-adapter"
import { normalizeRequestConfiguration } from "./request-model"
import type {
  ResponseResult,
  SavedRequestSnapshot,
  SavedResponseSummary,
} from "@/components/api-reference/types"

export type RequestTransport = "http" | "websocket"

export type RequestMode = "standard" | "sse"

export type RequestMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "WS"

export type PersistedCollection = {
  id: string
  name: string
  position: number
  createdAt: string
  updatedAt: string
}

export type PersistedCustomRequest = {
  id: string
  collectionId: string
  name: string
  method: RequestMethod
  transport: RequestTransport
  mode: RequestMode
  url: string
  folder?: string
  draft: SerializableRequestDraft
  position: number
  createdAt: string
  updatedAt: string
}

export type PersistedSavedResponse = SavedResponseSummary & {
  requestSnapshot: SavedRequestSnapshot
  result: ResponseResult
}

type SerializableKeyValueRow = {
  key: string
  value: string
  description: string
  enabled?: boolean
  required?: boolean
  type?: string
  location?: string
  defaultValue?: string
  enum?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  example?: any
  fileName?: string
  fileNames?: string[]
}

export type SerializableRequestDraft = {
  params: SerializableKeyValueRow[]
  headers: SerializableKeyValueRow[]
  body: {
    mode: string
    contentType: string
    value: string
    formDataRows?: SerializableKeyValueRow[]
    urlEncodedRows?: SerializableKeyValueRow[]
    binaryFileName?: string
    graphqlQuery?: string
    graphqlVariables?: string
  }
}

export type ApiWorkspaceState = {
  savedResponses: SavedResponseSummary[]
  collections: PersistedCollection[]
  customRequests: PersistedCustomRequest[]
  responsePanelHeight: number
}

export type ApiSidebarWorkspaceState = Pick<
  ApiWorkspaceState,
  "savedResponses" | "collections" | "customRequests"
>

const apiSidebarWorkspaceCache = new WeakMap<object, ApiSidebarWorkspaceState>()

export type PersistedCollectionImport = {
  collection: PersistedCollection
  requests: PersistedCustomRequest[]
}

export type SavedResponseDetail = SavedResponseSummary & {
  requestSnapshot: SavedRequestSnapshot | null
  result: ResponseResult
}

export type SaveResponseInput = {
  operationId: string
  method: string
  path: string
  name: string
  requestSnapshot: SavedRequestSnapshot
  result: ResponseResult
}

export async function getApiWorkspace(): Promise<ApiWorkspaceState> {
  const storage = getDocksStorageAdapter()
  const workspace = await storage.getApiWorkspace()
  setCachedApiSidebarWorkspace(workspace)
  return workspace
}

export function getCachedApiSidebarWorkspace() {
  return apiSidebarWorkspaceCache.get(getDocksStorageAdapter())
}

export function setCachedApiSidebarWorkspace(
  workspace: ApiSidebarWorkspaceState
) {
  apiSidebarWorkspaceCache.set(getDocksStorageAdapter(), {
    savedResponses: workspace.savedResponses,
    collections: workspace.collections,
    customRequests: workspace.customRequests,
  })
}

export async function saveWorkspaceSetting({
  data,
}: {
  data: { key: string; value: string }
}) {
  return getDocksStorageAdapter().saveWorkspaceSetting({ data })
}

export async function saveResponse({ data }: { data: SaveResponseInput }) {
  const savedResponse = await getDocksStorageAdapter().saveResponse({ data })
  return toSavedResponseSummary(savedResponse)
}

export async function deleteSavedResponse({ data }: { data: { id: string } }) {
  return getDocksStorageAdapter().deleteSavedResponse({ data })
}

export async function getSavedResponse({
  data: id,
}: {
  data: string
}): Promise<SavedResponseDetail | null> {
  return getDocksStorageAdapter().getSavedResponse({ data: id })
}

export async function createCollection({
  data,
}: {
  data: { name: string; position: number }
}) {
  const now = new Date().toISOString()
  const collection: PersistedCollection = {
    id: createId(),
    name: data.name,
    position: data.position,
    createdAt: now,
    updatedAt: now,
  }

  return getDocksStorageAdapter().createCollection({ data: collection })
}

export async function createCollectionWithRequests({
  data,
}: {
  data: {
    name: string
    position: number
    requests: Array<{
      name: string
      method: RequestMethod
      transport: RequestTransport
      mode: RequestMode
      url: string
      folder?: string
      draft: SerializableRequestDraft
      position: number
    }>
  }
}): Promise<PersistedCollectionImport> {
  const now = new Date().toISOString()
  const collection: PersistedCollection = {
    id: createId(),
    name: data.name,
    position: data.position,
    createdAt: now,
    updatedAt: now,
  }
  const requests = data.requests.map((input) => ({
    ...normalizeRequestConfiguration(input),
    id: createId(),
    collectionId: collection.id,
    name: input.name,
    url: input.url,
    folder: input.folder,
    draft: input.draft,
    position: input.position,
    createdAt: now,
    updatedAt: now,
  }))

  return getDocksStorageAdapter().createCollectionWithRequests({
    data: { collection, requests },
  })
}

export async function updateCollection({
  data,
}: {
  data: PersistedCollection
}) {
  return getDocksStorageAdapter().updateCollection({
    data: { ...data, updatedAt: new Date().toISOString() },
  })
}

export async function deleteCollection({ data }: { data: string }) {
  const storage = getDocksStorageAdapter()
  const workspace = await storage.getApiWorkspace()
  const requests = workspace.customRequests.filter(
    (request) => request.collectionId === data
  )
  const operationIds = new Set(
    requests.map((request) => `custom:${request.id}`)
  )

  await Promise.all([
    ...workspace.savedResponses
      .filter((response) => operationIds.has(response.operationId))
      .map((response) =>
        storage.deleteSavedResponse({ data: { id: response.id } })
      ),
  ])
  await Promise.all(
    requests.map((request) => storage.deleteCustomRequest({ data: request.id }))
  )
  return storage.deleteCollection({ data })
}

export async function upsertCustomRequest({
  data,
}: {
  data: PersistedCustomRequest
}) {
  const normalizedRequest = normalizeCustomRequest(data)
  return getDocksStorageAdapter().upsertCustomRequest({
    data: { ...normalizedRequest, updatedAt: new Date().toISOString() },
  })
}

export async function createCustomRequest({
  data,
}: {
  data: {
    collectionId: string
    name: string
    method: RequestMethod
    transport: RequestTransport
    mode: RequestMode
    url: string
    folder?: string
    draft: SerializableRequestDraft
    position: number
  }
}) {
  const now = new Date().toISOString()
  const request: PersistedCustomRequest = {
    ...normalizeRequestConfiguration(data),
    id: createId(),
    collectionId: data.collectionId,
    name: data.name,
    url: data.url,
    folder: data.folder,
    draft: data.draft,
    position: data.position,
    createdAt: now,
    updatedAt: now,
  }

  return getDocksStorageAdapter().upsertCustomRequest({ data: request })
}

function normalizeCustomRequest(
  request: PersistedCustomRequest
): PersistedCustomRequest {
  return {
    ...request,
    ...normalizeRequestConfiguration(request),
  }
}

export async function deleteCustomRequest({ data }: { data: string }) {
  return getDocksStorageAdapter().deleteCustomRequest({ data })
}

function toSavedResponseSummary(
  response: PersistedSavedResponse
): SavedResponseSummary {
  return {
    id: response.id,
    operationId: response.operationId,
    method: response.method,
    path: response.path,
    name: response.name,
    status: response.status,
    ok: response.ok,
    durationMs: response.durationMs,
    sizeBytes: response.sizeBytes,
    contentType: response.contentType,
    createdAt: response.createdAt,
  }
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
