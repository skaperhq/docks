"use client"

import * as React from "react"
import "./styles.css"
import { EnvironmentProvider } from "./components/environment-provider"
import { ThemeProvider } from "./components/theme-provider"
import type { Theme } from "./components/theme-context"
import { createIndexedDbStorageAdapter } from "./lib/indexed-db-storage"
import {
  isDocksStorageAdapterConfigured,
  setDocksStorageAdapter,
} from "./lib/storage-adapter"
import type { StorageAdapter } from "./lib/storage-adapter"
import { EnvironmentPage } from "./routes/environment"
import { WorkspacePage } from "./routes/index"
import { cn } from "./lib/utils"

type SkaperProps = {
  className?: string
  initialOperationId?: string
  initialPage?: "workspace" | "environment"
  defaultTheme?: Theme
  storageAdapter?: StorageAdapter
}

/**
 * Embeddable Skaper API workspace. It uses IndexedDB by default and can be
 * mounted anywhere in a React application without requiring the host router.
 */
export function SkaperApp({
  className,
  initialOperationId,
  initialPage = "workspace",
  defaultTheme = "system",
  storageAdapter,
}: SkaperProps) {
  const [page, setPage] = React.useState(initialPage)
  const [operationId, setOperationId] = React.useState(initialOperationId)

  if (storageAdapter) {
    setDocksStorageAdapter(storageAdapter)
  } else if (!isDocksStorageAdapterConfigured()) {
    setDocksStorageAdapter(createIndexedDbStorageAdapter())
  }

  function selectOperation(nextOperationId?: string) {
    setOperationId(nextOperationId)
    setPage("workspace")
  }

  return (
    <div className={cn("h-svh min-h-[36rem] w-full", className)}>
      <ThemeProvider defaultTheme={defaultTheme}>
        <EnvironmentProvider>
          {page === "environment" ? (
            <EnvironmentPage
              onSelectWorkspace={() => setPage("workspace")}
              onSelectOperation={(nextOperationId) =>
                selectOperation(nextOperationId)
              }
            />
          ) : (
            <WorkspacePage
              operationId={operationId}
              onOperationChange={selectOperation}
              onSelectEnvironment={() => setPage("environment")}
            />
          )}
        </EnvironmentProvider>
      </ThemeProvider>
    </div>
  )
}
