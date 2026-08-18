import type { StorageAdapter } from "./storage-adapter"

declare global {
  var __DOCKS_STORAGE_URL__: string | undefined
}

export function getRuntimeStorageUrl() {
  const value = globalThis.__DOCKS_STORAGE_URL__
  return typeof value === "string" && value.startsWith("/") ? value : undefined
}

/** Creates a browser adapter for the authenticated Docks storage endpoint. */
export function createHttpStorageAdapter(url: string): StorageAdapter {
  async function call<T>(action: string, data?: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...(data === undefined ? {} : { data }) }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : `Docks storage request failed (${response.status}).`
      )
    }
    return payload as T
  }

  return {
    getEnvironments: () => call("getEnvironments"),
    saveEnvironment: ({ data }) => call("saveEnvironment", data),
    deleteEnvironment: ({ data }) => call("deleteEnvironment", data),
    saveVariable: ({ data }) => call("saveVariable", data),
    deleteVariable: ({ data }) => call("deleteVariable", data),
    bulkSyncEnvironments: ({ data }) => call("bulkSyncEnvironments", data),
    getApiWorkspace: () => call("getApiWorkspace"),
    saveWorkspaceSetting: ({ data }) => call("saveWorkspaceSetting", data),
    saveResponse: ({ data }) => call("saveResponse", data),
    deleteSavedResponse: ({ data }) => call("deleteSavedResponse", data),
    getSavedResponse: ({ data }) => call("getSavedResponse", data),
    createCollection: ({ data }) => call("createCollection", data),
    createCollectionWithRequests: ({ data }) =>
      call("createCollectionWithRequests", data),
    updateCollection: ({ data }) => call("updateCollection", data),
    deleteCollection: ({ data }) => call("deleteCollection", data),
    upsertCustomRequest: ({ data }) => call("upsertCustomRequest", data),
    deleteCustomRequest: ({ data }) => call("deleteCustomRequest", data),
  }
}
