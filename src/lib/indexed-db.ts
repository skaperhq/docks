import {
  migrateCustomRequestsV3,
  migrateSavedResponseV3,
} from "./storage-migrations"
import type {
  PersistedCustomRequest,
  PersistedSavedResponse,
} from "./api-reference-actions"

const DB_NAME = "skaper-docks"
const DB_VERSION = 3

const STORE_NAMES = {
  environments: "environments",
  requestTabs: "api_request_tabs",
  savedResponses: "saved_responses",
  settings: "api_workspace_settings",
  collections: "collections",
  customRequests: "custom_requests",
} as const

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES]

const dbPromises = new Map<string, Promise<IDBDatabase>>()

function assertBrowserStorage() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in the browser.")
  }
}

/** Opens (and, when necessary, upgrades) a Skaper workspace database. */
export function openSkaperDb(databaseName = DB_NAME) {
  assertBrowserStorage()

  let dbPromise = dbPromises.get(databaseName)

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, DB_VERSION)

      request.onupgradeneeded = (event) => {
        // Object-store creation is additive so existing browser workspaces are
        // retained when a newer package version introduces another feature.
        const db = request.result

        if (!db.objectStoreNames.contains(STORE_NAMES.environments)) {
          db.createObjectStore(STORE_NAMES.environments, { keyPath: "id" })
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.requestTabs)) {
          db.createObjectStore(STORE_NAMES.requestTabs, {
            keyPath: "operationId",
          })
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.savedResponses)) {
          const savedResponses = db.createObjectStore(
            STORE_NAMES.savedResponses,
            { keyPath: "id" }
          )
          savedResponses.createIndex("createdAt", "createdAt")
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.settings)) {
          db.createObjectStore(STORE_NAMES.settings, { keyPath: "key" })
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.collections)) {
          db.createObjectStore(STORE_NAMES.collections, { keyPath: "id" })
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.customRequests)) {
          const customRequests = db.createObjectStore(
            STORE_NAMES.customRequests,
            { keyPath: "id" }
          )
          customRequests.createIndex("collectionId", "collectionId")
        }

        if (event.oldVersion < 3 && request.transaction) {
          migrateWorkspaceToV3(request.transaction)
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        dbPromises.delete(databaseName)
        reject(request.error)
      }
    })
    dbPromises.set(databaseName, dbPromise)
  }

  return dbPromise
}

function migrateWorkspaceToV3(transaction: IDBTransaction) {
  const customRequestStore = transaction.objectStore(STORE_NAMES.customRequests)
  const customRequestRead = customRequestStore.getAll()
  customRequestRead.onsuccess = () => {
    const migratedRequests = migrateCustomRequestsV3(
      customRequestRead.result as PersistedCustomRequest[]
    )
    migratedRequests.forEach((request) => customRequestStore.put(request))
  }

  const savedResponseStore = transaction.objectStore(STORE_NAMES.savedResponses)
  const savedResponseRead = savedResponseStore.getAll()
  savedResponseRead.onsuccess = () => {
    const savedResponses = savedResponseRead.result as PersistedSavedResponse[]
    savedResponses.forEach((response) =>
      savedResponseStore.put(migrateSavedResponseV3(response))
    )
  }
}

export async function getAllFromStore<T>(
  storeName: StoreName,
  databaseName = DB_NAME
): Promise<T[]> {
  const store = await getStore(storeName, "readonly", databaseName)

  return new Promise((resolve, reject) => {
    const request = store.getAll()

    request.onsuccess = () => {
      resolve(request.result as T[])
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

export async function getFromStore<T>(
  storeName: StoreName,
  key: IDBValidKey,
  databaseName = DB_NAME
): Promise<T | undefined> {
  const store = await getStore(storeName, "readonly", databaseName)

  return new Promise((resolve, reject) => {
    const request = store.get(key)

    request.onsuccess = () => {
      resolve(request.result as T | undefined)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

export async function putInStore<T>(
  storeName: StoreName,
  value: T,
  databaseName = DB_NAME
): Promise<void> {
  const store = await getStore(storeName, "readwrite", databaseName)

  return new Promise((resolve, reject) => {
    const request = store.put(value)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

export async function deleteFromStore(
  storeName: StoreName,
  key: IDBValidKey,
  databaseName = DB_NAME
): Promise<void> {
  const store = await getStore(storeName, "readwrite", databaseName)

  return new Promise((resolve, reject) => {
    const request = store.delete(key)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

export async function clearStore(
  storeName: StoreName,
  databaseName = DB_NAME
): Promise<void> {
  const store = await getStore(storeName, "readwrite", databaseName)

  return new Promise((resolve, reject) => {
    const request = store.clear()

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function getStore(
  storeName: StoreName,
  mode: IDBTransactionMode,
  databaseName: string
) {
  const db = await openSkaperDb(databaseName)
  return db.transaction(storeName, mode).objectStore(storeName)
}

export { DB_NAME, STORE_NAMES }
