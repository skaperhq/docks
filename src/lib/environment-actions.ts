import { createServerFn } from "@tanstack/react-start"
import { db } from "./db"

export interface EnvironmentVariableDb {
  id: string
  environment_id: string
  key: string
  value: string
  enabled: number
  is_secret: number
  description: string | null
}

export interface EnvironmentDb {
  id: string
  name: string
  base_url: string
}

export interface EnvironmentVariableInput {
  id: string
  key: string
  value: string
  enabled: boolean
  isSecret?: boolean
  description?: string
}

export interface EnvironmentInput {
  id: string
  name: string
  baseUrl: string
  variables: EnvironmentVariableInput[]
}

export const getEnvironments = createServerFn({ method: "GET" }).handler(
  async () => {
    const envs = db
      .prepare("SELECT * FROM environments")
      .all() as EnvironmentDb[]
    const vars = db
      .prepare("SELECT * FROM environment_variables")
      .all() as EnvironmentVariableDb[]

    // Group variables by environment_id
    const varsByEnv = vars.reduce(
      (acc, v) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!acc[v.environment_id]) {
          acc[v.environment_id] = []
        }
        acc[v.environment_id].push({
          id: v.id,
          key: v.key,
          value: v.value,
          enabled: v.enabled === 1,
          isSecret: v.is_secret === 1,
          description: v.description || undefined,
        })
        return acc
      },
      {} as Record<string, any[]>
    )

    return envs.map((env) => ({
      id: env.id,
      name: env.name,
      baseUrl: env.base_url,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      variables: varsByEnv[env.id] || [],
    }))
  }
)

export const saveEnvironment = createServerFn({ method: "POST" })
  .validator((data: { id: string; name: string; baseUrl: string }) => data)
  .handler(async ({ data }) => {
    const stmt = db.prepare(`
    INSERT INTO environments (id, name, base_url)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      base_url = excluded.base_url
  `)
    stmt.run(data.id, data.name, data.baseUrl)
    return { success: true }
  })

export const deleteEnvironment = createServerFn({ method: "POST" })
  .validator((data: string) => data)
  .handler(async ({ data: id }) => {
    const stmt = db.prepare("DELETE FROM environments WHERE id = ?")
    stmt.run(id)
    return { success: true }
  })

export const saveVariable = createServerFn({ method: "POST" })
  .validator(
    (data: { envId: string; variable: EnvironmentVariableInput }) => data
  )
  .handler(async ({ data }) => {
    const stmt = db.prepare(`
    INSERT INTO environment_variables (id, environment_id, key, value, enabled, is_secret, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      key = excluded.key,
      value = excluded.value,
      enabled = excluded.enabled,
      is_secret = excluded.is_secret,
      description = excluded.description
  `)
    stmt.run(
      data.variable.id,
      data.envId,
      data.variable.key,
      data.variable.value,
      data.variable.enabled ? 1 : 0,
      data.variable.isSecret ? 1 : 0,
      data.variable.description || null
    )
    return { success: true }
  })

export const deleteVariable = createServerFn({ method: "POST" })
  .validator((data: { envId: string; varId: string }) => data)
  .handler(async ({ data }) => {
    const stmt = db.prepare(
      "DELETE FROM environment_variables WHERE id = ? AND environment_id = ?"
    )
    stmt.run(data.varId, data.envId)
    return { success: true }
  })

export const bulkSyncEnvironments = createServerFn({ method: "POST" })
  .validator((data: EnvironmentInput[]) => data)
  .handler(async ({ data: envs }) => {
    const insertEnv = db.prepare(`
    INSERT INTO environments (id, name, base_url)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      base_url = excluded.base_url
  `)

    const insertVar = db.prepare(`
    INSERT INTO environment_variables (id, environment_id, key, value, enabled, is_secret, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      key = excluded.key,
      value = excluded.value,
      enabled = excluded.enabled,
      is_secret = excluded.is_secret,
      description = excluded.description
  `)

    const transaction = db.transaction((envsList) => {
      for (const env of envsList) {
        insertEnv.run(env.id, env.name, env.baseUrl || "")
        for (const v of env.variables || []) {
          insertVar.run(
            v.id,
            env.id,
            v.key,
            v.value || "",
            v.enabled ? 1 : 0,
            v.isSecret ? 1 : 0,
            v.description || null
          )
        }
      }
    })

    transaction(envs)
    return { success: true }
  })
