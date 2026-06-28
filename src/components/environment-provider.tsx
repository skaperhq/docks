import * as React from "react"

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
  setActiveEnvironmentId: (id: string) => void
  addEnvironment: (name: string, baseUrl?: string) => void
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
  const [environments, setEnvironments] = React.useState<Environment[]>(() => {
    if (typeof window === "undefined") return DEFAULT_ENVIRONMENTS
    try {
      const stored = localStorage.getItem("skaper-environments")
      return stored ? JSON.parse(stored) : DEFAULT_ENVIRONMENTS
    } catch {
      return DEFAULT_ENVIRONMENTS
    }
  })

  const [activeEnvironmentId, setActiveEnvironmentIdState] = React.useState<
    string | null
  >(() => {
    if (typeof window === "undefined") return "dev"
    try {
      const stored = localStorage.getItem("skaper-active-environment-id")
      return stored || "dev"
    } catch {
      return "dev"
    }
  })

  // Sync to localStorage
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("skaper-environments", JSON.stringify(environments))
    }
  }, [environments])

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

  const addEnvironment = React.useCallback((name: string, baseUrl = "") => {
    const newEnv: Environment = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      baseUrl,
      variables: [
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
  }, [])

  const deleteEnvironment = React.useCallback(
    (id: string) => {
      setEnvironments((prev) => {
        const filtered = prev.filter((env) => env.id !== id)
        // Fallback active environment if deleted active one
        if (activeEnvironmentId === id) {
          const nextActive = filtered[0]?.id || null
          setActiveEnvironmentIdState(nextActive)
          if (typeof window !== "undefined" && nextActive) {
            localStorage.setItem("skaper-active-environment-id", nextActive)
          }
        }
        return filtered
      })
    },
    [activeEnvironmentId]
  )

  const updateEnvironment = React.useCallback(
    (id: string, updates: Partial<Environment>) => {
      setEnvironments((prev) =>
        prev.map((env) => (env.id === id ? { ...env, ...updates } : env))
      )
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
  }, [])

  const deleteVariable = React.useCallback((envId: string, varId: string) => {
    setEnvironments((prev) =>
      prev.map((env) =>
        env.id === envId
          ? { ...env, variables: env.variables.filter((v) => v.id !== varId) }
          : env
      )
    )
  }, [])

  const updateVariable = React.useCallback(
    (envId: string, varId: string, updates: Partial<EnvironmentVariable>) => {
      setEnvironments((prev) =>
        prev.map((env) =>
          env.id === envId
            ? {
                ...env,
                variables: env.variables.map((v) =>
                  v.id === varId ? { ...v, ...updates } : v
                ),
              }
            : env
        )
      )
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
