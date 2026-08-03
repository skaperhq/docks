import type {
  ApiWorkspaceState,
  PersistedCollectionImport,
  PersistedCollection,
  PersistedCustomRequest,
  PersistedSavedResponse,
  SavedResponseDetail,
  SaveResponseInput,
  UpsertRequestTabInput,
} from "./api-reference-actions"
import type {
  EnvironmentInput,
  EnvironmentVariableInput,
} from "./environment-actions"

/**
 * Persistence boundary used by Skaper.
 *
 * The browser entry installs the IndexedDB implementation. Package consumers
 * can provide the same contract to persist shared workspaces in a remote
 * database without coupling the UI package to a database driver.
 */
export type StorageAdapter = {
  /** Environment and variable persistence. */
  getEnvironments: () => Promise<EnvironmentInput[]>
  saveEnvironment: (input: {
    data: { id: string; name: string; baseUrl: string }
  }) => Promise<{ success: boolean }>
  deleteEnvironment: (input: { data: string }) => Promise<{ success: boolean }>
  saveVariable: (input: {
    data: { envId: string; variable: EnvironmentVariableInput }
  }) => Promise<{ success: boolean }>
  deleteVariable: (input: {
    data: { envId: string; varId: string }
  }) => Promise<{ success: boolean }>
  bulkSyncEnvironments: (input: {
    data: EnvironmentInput[]
  }) => Promise<{ success: boolean }>

  /** Request workspace and response-history persistence. */
  getApiWorkspace: () => Promise<ApiWorkspaceState>
  upsertRequestTab: (input: {
    data: UpsertRequestTabInput
  }) => Promise<{ success: boolean }>
  deleteRequestTab: (input: { data: string }) => Promise<{ success: boolean }>
  saveWorkspaceSetting: (input: {
    data: { key: string; value: string }
  }) => Promise<{ success: boolean }>
  saveResponse: (input: {
    data: SaveResponseInput
  }) => Promise<PersistedSavedResponse>
  deleteSavedResponse: (input: {
    data: { id: string }
  }) => Promise<{ success: boolean }>
  getSavedResponse: (input: {
    data: string
  }) => Promise<SavedResponseDetail | null>

  /** User-created collections and requests. */
  createCollection: (input: {
    data: PersistedCollection
  }) => Promise<PersistedCollection>
  createCollectionWithRequests: (input: {
    data: PersistedCollectionImport
  }) => Promise<PersistedCollectionImport>
  updateCollection: (input: {
    data: PersistedCollection
  }) => Promise<PersistedCollection>
  deleteCollection: (input: { data: string }) => Promise<{ success: boolean }>
  upsertCustomRequest: (input: {
    data: PersistedCustomRequest
  }) => Promise<PersistedCustomRequest>
  deleteCustomRequest: (input: {
    data: string
  }) => Promise<{ success: boolean }>
}

let storageAdapter: StorageAdapter | null = null

/** Installs the process-wide storage adapter used by all persistence actions. */
export function setDocksStorageAdapter(adapter: StorageAdapter) {
  storageAdapter = adapter
}

/**
 * Returns the configured adapter.
 *
 * @throws When no adapter has been installed. Browser applications normally
 * install the IndexedDB adapter in their root entry point.
 */
export function getDocksStorageAdapter() {
  if (!storageAdapter) {
    throw new Error(
      "Docks storage adapter has not been initialized. The browser entry initializes IndexedDB by default; package consumers can call setDocksStorageAdapter."
    )
  }

  return storageAdapter
}

/** Returns whether an adapter has already been installed. */
export function isDocksStorageAdapterConfigured() {
  return Boolean(storageAdapter)
}
