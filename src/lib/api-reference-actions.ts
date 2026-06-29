import { createServerFn } from "@tanstack/react-start"
import { db } from "./db"
import type {
  RequestTab,
  ResponseResult,
  SavedResponseSummary,
} from "@/components/api-reference/types"

type RequestTabDb = {
  operation_id: string
  request_tab: string
  draft_json: string
  position: number
}

type SavedResponseDb = {
  id: string
  operation_id: string
  method: string
  path: string
  name: string
  status: number
  ok: number
  duration_ms: number
  size_bytes: number
  content_type: string
  result_json: string
  created_at: string
}

type WorkspaceSettingDb = {
  key: string
  value: string
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
}

type SerializableRequestDraft = {
  params: SerializableKeyValueRow[]
  headers: SerializableKeyValueRow[]
  body: {
    mode: string
    contentType: string
    value: string
  }
}

export type PersistedRequestTab = {
  operationId: string
  requestTab: RequestTab
  draft: SerializableRequestDraft
  position: number
}

export type ApiWorkspaceState = {
  requestTabs: PersistedRequestTab[]
  savedResponses: SavedResponseSummary[]
  responsePanelHeight: number
}

export type UpsertRequestTabInput = {
  operationId: string
  requestTab: RequestTab
  draft: SerializableRequestDraft
  position: number
}

export type SaveResponseInput = {
  operationId: string
  method: string
  path: string
  name: string
  result: ResponseResult
}

const DEFAULT_RESPONSE_PANEL_HEIGHT = 360

export const getApiWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiWorkspaceState> => {
    const requestRows = db
      .prepare(
        "SELECT operation_id, request_tab, draft_json, position FROM api_request_tabs ORDER BY position ASC, updated_at ASC"
      )
      .all() as RequestTabDb[]
    const savedRows = db
      .prepare(
        "SELECT * FROM saved_responses ORDER BY datetime(created_at) DESC LIMIT 100"
      )
      .all() as SavedResponseDb[]
    const settings = db
      .prepare("SELECT key, value FROM api_workspace_settings")
      .all() as WorkspaceSettingDb[]
    const settingMap = new Map(settings.map((item) => [item.key, item.value]))
    const persistedHeight = Number(settingMap.get("response_panel_height"))

    return {
      requestTabs: requestRows.flatMap((row) => {
        const draft = parseJson<SerializableRequestDraft>(row.draft_json)
        if (!draft) {
          return []
        }

        return [
          {
            operationId: row.operation_id,
            requestTab: normalizeRequestTab(row.request_tab),
            draft,
            position: row.position,
          },
        ]
      }),
      savedResponses: uniqueSavedResponses(
        savedRows.map(toSavedResponseSummary)
      ),
      responsePanelHeight: Number.isFinite(persistedHeight)
        ? persistedHeight
        : DEFAULT_RESPONSE_PANEL_HEIGHT,
    }
  }
)

export const upsertRequestTab = createServerFn({ method: "POST" })
  .validator((data: UpsertRequestTabInput) => data)
  .handler(async ({ data }) => {
    db.prepare(
      `
      INSERT INTO api_request_tabs (operation_id, request_tab, draft_json, position, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(operation_id) DO UPDATE SET
        request_tab = excluded.request_tab,
        draft_json = excluded.draft_json,
        position = excluded.position,
        updated_at = CURRENT_TIMESTAMP
    `
    ).run(
      data.operationId,
      data.requestTab,
      JSON.stringify(data.draft),
      data.position
    )

    return { success: true }
  })

export const deleteRequestTab = createServerFn({ method: "POST" })
  .validator((data: string) => data)
  .handler(async ({ data: operationId }) => {
    db.prepare("DELETE FROM api_request_tabs WHERE operation_id = ?").run(
      operationId
    )

    return { success: true }
  })

export const saveWorkspaceSetting = createServerFn({ method: "POST" })
  .validator((data: { key: string; value: string }) => data)
  .handler(async ({ data }) => {
    db.prepare(
      `
      INSERT INTO api_workspace_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `
    ).run(data.key, data.value)

    return { success: true }
  })

export const saveResponse = createServerFn({ method: "POST" })
  .validator((data: SaveResponseInput) => data)
  .handler(async ({ data }) => {
    const existing = db
      .prepare(
        "SELECT * FROM saved_responses WHERE operation_id = ? ORDER BY datetime(created_at) DESC LIMIT 1"
      )
      .get(data.operationId) as SavedResponseDb | undefined

    if (existing) {
      return toSavedResponseSummary(existing)
    }

    const id = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`

    db.prepare(
      `
      INSERT INTO saved_responses (
        id,
        operation_id,
        method,
        path,
        name,
        status,
        ok,
        duration_ms,
        size_bytes,
        content_type,
        result_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      data.operationId,
      data.method,
      data.path,
      data.name,
      data.result.status,
      data.result.ok ? 1 : 0,
      data.result.durationMs,
      data.result.sizeBytes,
      data.result.contentType,
      JSON.stringify(data.result)
    )

    const row = db
      .prepare("SELECT * FROM saved_responses WHERE id = ?")
      .get(id) as SavedResponseDb

    return toSavedResponseSummary(row)
  })

export const deleteSavedResponse = createServerFn({ method: "POST" })
  .validator((data: { id: string; operationId: string }) => data)
  .handler(async ({ data }) => {
    db.prepare(
      "DELETE FROM saved_responses WHERE id = ? OR operation_id = ?"
    ).run(data.id, data.operationId)

    return { success: true }
  })

export const getSavedResponse = createServerFn({ method: "GET" })
  .validator((data: string) => data)
  .handler(async ({ data: id }) => {
    const row = db
      .prepare("SELECT * FROM saved_responses WHERE id = ?")
      .get(id) as SavedResponseDb | undefined

    if (!row) {
      return null
    }

    const result = parseJson<ResponseResult>(row.result_json)
    if (!result) {
      return null
    }

    return {
      ...toSavedResponseSummary(row),
      result,
    }
  })

function toSavedResponseSummary(row: SavedResponseDb): SavedResponseSummary {
  return {
    id: row.id,
    operationId: row.operation_id,
    method: row.method,
    path: row.path,
    name: row.name,
    status: row.status,
    ok: row.ok === 1,
    durationMs: row.duration_ms,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    createdAt: row.created_at,
  }
}

function uniqueSavedResponses(responses: SavedResponseSummary[]) {
  const byOperation = new Map<string, SavedResponseSummary>()

  for (const response of responses) {
    if (!byOperation.has(response.operationId)) {
      byOperation.set(response.operationId, response)
    }
  }

  return Array.from(byOperation.values())
}

function normalizeRequestTab(value: string): RequestTab {
  if (
    value === "Docs" ||
    value === "Params" ||
    value === "Authorization" ||
    value === "Headers" ||
    value === "Body"
  ) {
    return value
  }

  return "Docs"
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
