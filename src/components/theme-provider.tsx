import * as React from "react"
import { ThemeProviderContext } from "@/components/theme-context"
import type { Theme } from "@/components/theme-context"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "docks-ui-theme",
  ...props
}: ThemeProviderProps) {
  // Keep the provider component isolated so Fast Refresh preserves context users.
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)

  React.useEffect(() => {
    const savedTheme = localStorage.getItem(storageKey)
    if (
      savedTheme === "light" ||
      savedTheme === "dark" ||
      savedTheme === "system"
    ) {
      setThemeState(savedTheme)
    }
  }, [storageKey])

  React.useEffect(() => {
    const root = window.document.documentElement

    const applyTheme = (nextTheme: Theme) => {
      root.classList.remove("light", "dark")

      if (nextTheme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
          .matches
          ? "dark"
          : "light"

        root.classList.add(systemTheme)
        return
      }

      root.classList.add(nextTheme)
    }

    applyTheme(theme)
  }, [theme])

  React.useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const handleChange = () => {
      const root = window.document.documentElement
      root.classList.remove("light", "dark")
      const systemTheme = mediaQuery.matches ? "dark" : "light"
      root.classList.add(systemTheme)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
