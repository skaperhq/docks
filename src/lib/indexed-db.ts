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

let dbPromise: Promise<IDBDatabase> | null = null

function assertBrowserStorage() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in the browser.")
  }
}

/** Opens (and, when necessary, upgrades) the shared Skaper database. */
export function openSkaperDb() {
  assertBrowserStorage()

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

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
        reject(request.error)
      }
    })
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

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const store = await getStore(storeName, "readonly")

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
  key: IDBValidKey
): Promise<T | undefined> {
  const store = await getStore(storeName, "readonly")

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
  value: T
): Promise<void> {
  const store = await getStore(storeName, "readwrite")

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
  key: IDBValidKey
): Promise<void> {
  const store = await getStore(storeName, "readwrite")

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

export async function clearStore(storeName: StoreName): Promise<void> {
  const store = await getStore(storeName, "readwrite")

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

async function getStore(storeName: StoreName, mode: IDBTransactionMode) {
  const db = await openSkaperDb()
  return db.transaction(storeName, mode).objectStore(storeName)
}

export { STORE_NAMES }
