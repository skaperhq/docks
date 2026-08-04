import type { IncomingMessage, ServerResponse } from "node:http"

export type PostgresQueryResult<TRow = Record<string, unknown>> = {
  rows: TRow[]
  rowCount?: number | null
}

export type PostgresQueryable = {
  query: (
    text: string,
    values?: unknown[]
  ) => Promise<PostgresQueryResult> | PostgresQueryResult
  connect?: () => Promise<PostgresQueryable & { release?: () => void }>
}

export type DocksPostgresOptions = {
  pool: PostgresQueryable
  workspaceId: string
  path?: string
  password: string
  sessionTtlMs?: number
  /** Public origin used for CSRF validation when running behind a proxy. */
  origin?: string
}

export type DocksPostgres = {
  readonly path: string
  readonly workspaceId: string
  readonly storageAdapter: DocksStorageAdapter
  readonly handler: {
    (request: Request): Promise<Response>
    (context: { req: { raw: Request } }): Promise<Response>
    (request: IncomingMessage, response: ServerResponse): Promise<void>
  }
  getCustomRequests: () => Promise<DocksCustomRequest[]>
}

export type DocksStorageAdapter = {
  getEnvironments: () => Promise<unknown[]>
  saveEnvironment: (input: { data: unknown }) => Promise<unknown>
  deleteEnvironment: (input: { data: string }) => Promise<unknown>
  saveVariable: (input: { data: unknown }) => Promise<unknown>
  deleteVariable: (input: { data: unknown }) => Promise<unknown>
  bulkSyncEnvironments: (input: { data: unknown[] }) => Promise<unknown>
  getApiWorkspace: () => Promise<Record<string, unknown>>
  upsertRequestTab: (input: { data: unknown }) => Promise<unknown>
  deleteRequestTab: (input: { data: string }) => Promise<unknown>
  saveWorkspaceSetting: (input: { data: unknown }) => Promise<unknown>
  saveResponse: (input: { data: unknown }) => Promise<unknown>
  deleteSavedResponse: (input: { data: { id: string } }) => Promise<unknown>
  getSavedResponse: (input: { data: string }) => Promise<unknown>
  createCollection: (input: { data: unknown }) => Promise<unknown>
  createCollectionWithRequests: (input: { data: unknown }) => Promise<unknown>
  updateCollection: (input: { data: unknown }) => Promise<unknown>
  deleteCollection: (input: { data: string }) => Promise<unknown>
  upsertCustomRequest: (input: { data: unknown }) => Promise<unknown>
  deleteCustomRequest: (input: { data: string }) => Promise<unknown>
}

export type DocksCustomRequest = {
  id: string
  collectionId: string
  name: string
  method: string
  transport: "http" | "websocket"
  mode: "standard" | "sse"
  url: string
  folder?: string
  draft: Record<string, unknown>
  position: number
  createdAt: string
  updatedAt: string
}

export declare function createDocksPostgres(
  options: DocksPostgresOptions
): Promise<DocksPostgres>

export declare function createPostgresStorageAdapter(options: {
  pool: PostgresQueryable
  workspaceId: string
}): Promise<DocksStorageAdapter>

export declare function migrateDocksPostgres(options: {
  client: PostgresQueryable
  dryRun?: boolean
}): Promise<{ applied: string[]; pending: string[]; sql?: string }>
