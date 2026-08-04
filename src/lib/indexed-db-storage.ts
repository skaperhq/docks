import {
  deleteFromStore,
  getAllFromStore,
  getFromStore,
  putInStore,
  putCollectionWithRequests,
  STORE_NAMES,
} from "./indexed-db"
import type {
  ApiWorkspaceState,
  PersistedCollection,
  PersistedCustomRequest,
  PersistedRequestTab,
  PersistedSavedResponse,
  SavedResponseDetail,
} from "./api-reference-actions"
import type { EnvironmentInput } from "./environment-actions"
import type { RequestTab } from "@/components/api-reference/types"
import type { StorageAdapter } from "./storage-adapter"
import {
  migrateCustomRequestsV3,
  migrateSavedResponseV3,
} from "./storage-migrations"

type WorkspaceSetting = {
  key: string
  value: string
}

const DEFAULT_RESPONSE_PANEL_HEIGHT = 360
const MAX_SAVED_RESPONSES = 100
const DB_NAME_PREFIX = "skaper-docks"

/**
 * Creates the default browser-only storage adapter backed by IndexedDB.
 * Each method performs its own transaction, so callers do not need to manage
 * database handles or transaction lifetimes.
 */
export function createIndexedDbStorageAdapter(
  workspaceId = "development"
): StorageAdapter {
  const normalizedWorkspaceId = workspaceId.trim()
  if (!normalizedWorkspaceId) {
    throw new TypeError("Docks workspaceId must be a non-empty string.")
  }

  const databaseName = `${DB_NAME_PREFIX}:${encodeURIComponent(normalizedWorkspaceId)}`

  return {
    async getEnvironments() {
      const environments = await getAllFromStore<EnvironmentInput>(
        STORE_NAMES.environments,
        databaseName
      )

      return environments.sort((a, b) => a.name.localeCompare(b.name))
    },

    async saveEnvironment({ data }) {
      const environments = await this.getEnvironments()
      const existing = environments.find(
        (environment) => environment.id === data.id
      )

      await putInStore<EnvironmentInput>(
        STORE_NAMES.environments,
        {
          id: data.id,
          name: data.name,
          baseUrl: data.baseUrl,
          variables: existing?.variables ?? [],
        },
        databaseName
      )

      return { success: true }
    },

    async deleteEnvironment({ data: id }) {
      await deleteFromStore(STORE_NAMES.environments, id, databaseName)

      return { success: true }
    },

    async saveVariable({ data }) {
      const environments = await this.getEnvironments()
      const environment = environments.find((item) => item.id === data.envId)

      if (!environment) {
        return { success: false }
      }

      const hasVariable = environment.variables.some(
        (variable) => variable.id === data.variable.id
      )
      const variables = hasVariable
        ? environment.variables.map((variable) =>
            variable.id === data.variable.id ? data.variable : variable
          )
        : [...environment.variables, data.variable]

      await putInStore<EnvironmentInput>(
        STORE_NAMES.environments,
        {
          ...environment,
          variables,
        },
        databaseName
      )

      return { success: true }
    },

    async deleteVariable({ data }) {
      const environments = await this.getEnvironments()
      const environment = environments.find((item) => item.id === data.envId)

      if (!environment) {
        return { success: false }
      }

      await putInStore<EnvironmentInput>(
        STORE_NAMES.environments,
        {
          ...environment,
          variables: environment.variables.filter(
            (variable) => variable.id !== data.varId
          ),
        },
        databaseName
      )

      return { success: true }
    },

    async bulkSyncEnvironments({ data: environments }) {
      await Promise.all(
        environments.map((environment) =>
          putInStore<EnvironmentInput>(
            STORE_NAMES.environments,
            environment,
            databaseName
          )
        )
      )

      return { success: true }
    },

    async getApiWorkspace(): Promise<ApiWorkspaceState> {
      const [
        requestTabs,
        savedResponses,
        settings,
        collections,
        customRequests,
      ] = await Promise.all([
        getAllFromStore<PersistedRequestTab>(
          STORE_NAMES.requestTabs,
          databaseName
        ),
        getAllFromStore<PersistedSavedResponse>(
          STORE_NAMES.savedResponses,
          databaseName
        ),
        getAllFromStore<WorkspaceSetting>(STORE_NAMES.settings, databaseName),
        getAllFromStore<PersistedCollection>(
          STORE_NAMES.collections,
          databaseName
        ),
        getAllFromStore<PersistedCustomRequest>(
          STORE_NAMES.customRequests,
          databaseName
        ),
      ])
      const settingMap = new Map(settings.map((item) => [item.key, item.value]))
      const persistedHeight = Number(settingMap.get("response_panel_height"))

      return {
        requestTabs: requestTabs
          .map((tab) => ({
            ...tab,
            requestTab: normalizeRequestTab(tab.requestTab),
          }))
          .sort((a, b) => a.position - b.position),
        savedResponses: savedResponses
          .map(migrateSavedResponseV3)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, MAX_SAVED_RESPONSES),
        collections: collections.sort((a, b) => a.position - b.position),
        customRequests: migrateCustomRequestsV3(customRequests).sort(
          (a, b) => a.position - b.position
        ),
        responsePanelHeight: Number.isFinite(persistedHeight)
          ? persistedHeight
          : DEFAULT_RESPONSE_PANEL_HEIGHT,
      }
    },

    async upsertRequestTab({ data }) {
      await putInStore<PersistedRequestTab>(
        STORE_NAMES.requestTabs,
        {
          ...data,
          requestTab: normalizeRequestTab(data.requestTab),
          updatedAt: new Date().toISOString(),
        },
        databaseName
      )

      return { success: true }
    },

    async deleteRequestTab({ data: operationId }) {
      await deleteFromStore(STORE_NAMES.requestTabs, operationId, databaseName)

      return { success: true }
    },

    async saveWorkspaceSetting({ data }) {
      await putInStore<WorkspaceSetting>(
        STORE_NAMES.settings,
        data,
        databaseName
      )

      return { success: true }
    },

    async saveResponse({ data }) {
      const createdAt = new Date().toISOString()
      const savedResponse: PersistedSavedResponse = {
        id: `${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        operationId: data.operationId,
        method: data.method,
        path: data.path,
        name: data.name,
        status: data.result.status,
        ok: data.result.ok,
        durationMs: data.result.durationMs,
        sizeBytes: data.result.sizeBytes,
        contentType: data.result.contentType,
        createdAt,
        requestSnapshot: data.requestSnapshot,
        result: data.result,
      }

      await putInStore<PersistedSavedResponse>(
        STORE_NAMES.savedResponses,
        savedResponse,
        databaseName
      )

      return migrateSavedResponseV3(savedResponse)
    },

    async deleteSavedResponse({ data }) {
      await deleteFromStore(STORE_NAMES.savedResponses, data.id, databaseName)

      return { success: true }
    },

    async getSavedResponse({ data: id }): Promise<SavedResponseDetail | null> {
      const savedResponse = await getFromStore<PersistedSavedResponse>(
        STORE_NAMES.savedResponses,
        id,
        databaseName
      )

      if (!savedResponse) {
        return null
      }

      return migrateSavedResponseV3(savedResponse)
    },

    async createCollection({ data }) {
      await putInStore<PersistedCollection>(
        STORE_NAMES.collections,
        data,
        databaseName
      )

      return data
    },

    async createCollectionWithRequests({ data }) {
      await putCollectionWithRequests(
        data.collection,
        data.requests,
        databaseName
      )
      return data
    },

    async updateCollection({ data }) {
      await putInStore<PersistedCollection>(
        STORE_NAMES.collections,
        data,
        databaseName
      )

      return data
    },

    async deleteCollection({ data: id }) {
      await deleteFromStore(STORE_NAMES.collections, id, databaseName)

      return { success: true }
    },

    async upsertCustomRequest({ data }) {
      await putInStore<PersistedCustomRequest>(
        STORE_NAMES.customRequests,
        data,
        databaseName
      )

      return data
    },

    async deleteCustomRequest({ data: id }) {
      await deleteFromStore(STORE_NAMES.customRequests, id, databaseName)

      return { success: true }
    },
  }
}

function normalizeRequestTab(value: string): RequestTab {
  // Authorization now lives in the regular headers table. Keep persisted
  // workspaces usable by moving the retired tab to Headers during hydration.
  if (value === "Authorization") {
    return "Headers"
  }

  if (
    value === "Docs" ||
    value === "Message" ||
    value === "Params" ||
    value === "Headers" ||
    value === "Body"
  ) {
    return value
  }

  return "Docs"
}
