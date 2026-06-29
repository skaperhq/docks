import * as React from "react"
import {
  getEnvironments,
  saveEnvironment as saveEnvironmentServer,
  deleteEnvironment as deleteEnvironmentServer,
  saveVariable as saveVariableServer,
  deleteVariable as deleteVariableServer,
  bulkSyncEnvironments,
} from "../lib/environment-actions"

export interface EnvironmentVariable {
  id: string
  key: string
  value: string
  enabled: boolean
  isSecret?: boolean
  description?: string
}

export interface Environment {
  id: string
  name: string
  baseUrl: string
  variables: EnvironmentVariable[]
}

interface EnvironmentContextType {
  environments: Environment[]
  activeEnvironmentId: string | null
  activeEnvironment: Environment | null
  loading: boolean
  setActiveEnvironmentId: (id: string) => void
  addEnvironment: (
    name: string,
    baseUrl?: string,
    variables?: EnvironmentVariable[]
  ) => void
  deleteEnvironment: (id: string) => void
  updateEnvironment: (id: string, updates: Partial<Environment>) => void
  addVariable: (envId: string) => void
  deleteVariable: (envId: string, varId: string) => void
  updateVariable: (
    envId: string,
    varId: string,
    updates: Partial<EnvironmentVariable>
  ) => void
  resolveVariables: (text: string) => string
}

const EnvironmentContext = React.createContext<
  EnvironmentContextType | undefined
>(undefined)

const DEFAULT_ENVIRONMENTS: Environment[] = [
  {
    id: "dev",
    name: "Development",
    baseUrl: "https://dev-api.claritalk.ai",
    variables: [
      {
        id: "dev-token",
        key: "access_token",
        value: "",
        enabled: true,
        isSecret: true,
        description: "Bearer authentication token for Dev environment",
      },
    ],
  },
  {
    id: "local",
    name: "Local",
    baseUrl: "http://localhost:3001",
    variables: [
      {
        id: "local-token",
        key: "access_token",
        value: "",
        enabled: true,
        isSecret: true,
        description: "Bearer authentication token for Local environment",
      },
    ],
  },
]

export function EnvironmentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [environments, setEnvironments] =
    React.useState<Environment[]>(DEFAULT_ENVIRONMENTS)
  const [activeEnvironmentId, setActiveEnvironmentIdState] = React.useState<
    string | null
  >(null)
  const [loading, setLoading] = React.useState(true)

  // Load initial data and migrate from localStorage if needed
  React.useEffect(() => {
    async function loadData() {
      try {
        let envs = await getEnvironments()

        if (typeof window !== "undefined") {
          const storedEnvs = localStorage.getItem("skaper-environments")
          const storedActiveId = localStorage.getItem(
            "skaper-active-environment-id"
          )

          if (storedEnvs) {
            try {
              const parsedEnvs = JSON.parse(storedEnvs) as Environment[]
              if (parsedEnvs.length > 0) {
                await bulkSyncEnvironments({ data: parsedEnvs })
                // Refetch to get fresh SQLite database data
                envs = await getEnvironments()
                localStorage.removeItem("skaper-environments")
              }
            } catch (err) {
              console.error(
                "Failed to migrate localStorage environments to SQLite:",
                err
              )
            }
          }

          if (storedActiveId) {
            setActiveEnvironmentIdState(storedActiveId)
          }
        }

        if (envs.length > 0) {
          setEnvironments(envs)
          const currentActiveId =
            typeof window !== "undefined"
              ? localStorage.getItem("skaper-active-environment-id")
              : null
          const activeId = currentActiveId || envs[0].id
          const hasActive = envs.some((env) => env.id === activeId)
          setActiveEnvironmentIdState(hasActive ? activeId : envs[0].id)
        } else {
          // If SQLite DB is empty, seed it with DEFAULT_ENVIRONMENTS
          await bulkSyncEnvironments({ data: DEFAULT_ENVIRONMENTS })
          const seeded = await getEnvironments()
          setEnvironments(seeded)
          setActiveEnvironmentIdState(seeded[0]?.id || "dev")
        }
      } catch (err) {
        console.error("Failed to load environments from SQLite:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const setActiveEnvironmentId = React.useCallback((id: string) => {
    setActiveEnvironmentIdState(id)
    if (typeof window !== "undefined") {
      localStorage.setItem("skaper-active-environment-id", id)
    }
  }, [])

  const activeEnvironment = React.useMemo(() => {
    return (
      environments.find((env) => env.id === activeEnvironmentId) ||
      environments[0] ||
      null
    )
  }, [environments, activeEnvironmentId])

  const addEnvironment = React.useCallback(
    (name: string, baseUrl = "", variables?: EnvironmentVariable[]) => {
      const newEnv: Environment = {
        id: Math.random().toString(36).substring(2, 9),
        name,
        baseUrl,
        variables: variables || [
          {
            id: Math.random().toString(36).substring(2, 9),
            key: "access_token",
            value: "",
            enabled: true,
            isSecret: true,
            description: "Bearer authentication token",
          },
        ],
      }
      setEnvironments((prev) => [...prev, newEnv])
      setActiveEnvironmentIdState(newEnv.id)
      if (typeof window !== "undefined") {
        localStorage.setItem("skaper-active-environment-id", newEnv.id)
      }

      // Save to SQLite asynchronously
      saveEnvironmentServer({
        data: {
          id: newEnv.id,
          name: newEnv.name,
          baseUrl: newEnv.baseUrl,
        },
      })
        .then(() => {
          const promises = newEnv.variables.map((v) =>
            saveVariableServer({
              data: { envId: newEnv.id, variable: v },
            })
          )
          return Promise.all(promises)
        })
        .catch((err) =>
          console.error("Failed to save new environment to SQLite:", err)
        )
    },
    []
  )

  const deleteEnvironment = React.useCallback(
    (id: string) => {
      setEnvironments((prev) => {
        const filtered = prev.filter((env) => env.id !== id)
        if (activeEnvironmentId === id) {
          const nextActive = filtered[0]?.id || null
          setActiveEnvironmentIdState(nextActive)
          if (typeof window !== "undefined" && nextActive) {
            localStorage.setItem("skaper-active-environment-id", nextActive)
          }
        }
        return filtered
      })

      // Delete in SQLite asynchronously
      deleteEnvironmentServer({ data: id }).catch((err) =>
        console.error("Failed to delete environment from SQLite:", err)
      )
    },
    [activeEnvironmentId]
  )

  const updateEnvironment = React.useCallback(
    (id: string, updates: Partial<Environment>) => {
      setEnvironments((prev) => {
        const updatedEnvs = prev.map((env) =>
          env.id === id ? { ...env, ...updates } : env
        )
        const updatedEnv = updatedEnvs.find((env) => env.id === id)
        if (updatedEnv) {
          if (updates.name !== undefined || updates.baseUrl !== undefined) {
            saveEnvironmentServer({
              data: {
                id: updatedEnv.id,
                name: updatedEnv.name,
                baseUrl: updatedEnv.baseUrl,
              },
            }).catch((err) =>
              console.error("Failed to update environment in SQLite:", err)
            )
          }
          if (updates.variables !== undefined) {
            // Save updated/duplicated variables to SQLite
            for (const v of updates.variables) {
              saveVariableServer({
                data: { envId: updatedEnv.id, variable: v },
              }).catch((err) =>
                console.error("Failed to save variable in SQLite:", err)
              )
            }
          }
        }
        return updatedEnvs
      })
    },
    []
  )

  const addVariable = React.useCallback((envId: string) => {
    const newVar: EnvironmentVariable = {
      id: Math.random().toString(36).substring(2, 9),
      key: "new_variable",
      value: "",
      enabled: true,
      description: "",
    }
    setEnvironments((prev) =>
      prev.map((env) =>
        env.id === envId
          ? { ...env, variables: [...env.variables, newVar] }
          : env
      )
    )

    saveVariableServer({
      data: { envId, variable: newVar },
    }).catch((err) =>
      console.error("Failed to save new variable to SQLite:", err)
    )
  }, [])

  const deleteVariable = React.useCallback((envId: string, varId: string) => {
    setEnvironments((prev) =>
      prev.map((env) =>
        env.id === envId
          ? { ...env, variables: env.variables.filter((v) => v.id !== varId) }
          : env
      )
    )

    deleteVariableServer({
      data: { envId, varId },
    }).catch((err) =>
      console.error("Failed to delete variable from SQLite:", err)
    )
  }, [])

  const updateVariable = React.useCallback(
    (envId: string, varId: string, updates: Partial<EnvironmentVariable>) => {
      setEnvironments((prev) => {
        const updatedEnvs = prev.map((env) => {
          if (env.id !== envId) return env
          const updatedVars = env.variables.map((v) => {
            if (v.id !== varId) return v
            const updatedVar = { ...v, ...updates }
            saveVariableServer({
              data: { envId, variable: updatedVar },
            }).catch((err) =>
              console.error("Failed to update variable in SQLite:", err)
            )
            return updatedVar
          })
          return { ...env, variables: updatedVars }
        })
        return updatedEnvs
      })
    },
    []
  )

  const resolveVariables = React.useCallback(
    (text: string): string => {
      if (!text) return text
      let resolved = text
      activeEnvironment.variables.forEach((variable) => {
        if (variable.enabled && variable.key.trim()) {
          const placeholder = `{{${variable.key.trim()}}}`
          resolved = resolved.replaceAll(placeholder, variable.value)
        }
      })
      return resolved
    },
    [activeEnvironment]
  )

  const value = React.useMemo(
    () => ({
      environments,
      activeEnvironmentId,
      activeEnvironment,
      loading,
      setActiveEnvironmentId,
      addEnvironment,
      deleteEnvironment,
      updateEnvironment,
      addVariable,
      deleteVariable,
      updateVariable,
      resolveVariables,
    }),
    [
      environments,
      activeEnvironmentId,
      activeEnvironment,
      loading,
      setActiveEnvironmentId,
      addEnvironment,
      deleteEnvironment,
      updateEnvironment,
      addVariable,
      deleteVariable,
      updateVariable,
      resolveVariables,
    ]
  )

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading environment database...</span>
        </div>
      </div>
    )
  }

  return (
    <EnvironmentContext.Provider value={value}>
      {children}
    </EnvironmentContext.Provider>
  )
}

export function useEnvironment() {
  const context = React.useContext(EnvironmentContext)
  if (context === undefined) {
    throw new Error("useEnvironment must be used within an EnvironmentProvider")
  }
  return context
}
