"use client"

import * as React from "react"
import "./styles.css"
import { EnvironmentProvider } from "./components/environment-provider"
import { ThemeProvider } from "./components/theme-provider"
import type { Theme } from "./components/theme-context"
import { createIndexedDbStorageAdapter } from "./lib/indexed-db-storage"
import {
  createHttpStorageAdapter,
  getRuntimeStorageUrl,
} from "./lib/http-storage"
import {
  isDocksStorageAdapterConfigured,
  setDocksStorageAdapter,
} from "./lib/storage-adapter"
import type { StorageAdapter } from "./lib/storage-adapter"
import { EnvironmentPage } from "./routes/environment"
import { WorkspacePage } from "./routes/index"
import { cn } from "./lib/utils"
import { getRuntimeWorkspaceId, getWorkspaceStorageKey } from "./lib/workspace"

type DocksProps = {
  className?: string
  initialOperationId?: string
  initialPage?: "workspace" | "environment"
  defaultTheme?: Theme
  storageAdapter?: StorageAdapter
  workspaceId?: string
}

/**
 * Embeddable Docks API workspace. It uses IndexedDB by default and can be
 * mounted anywhere in a React application without requiring the host router.
 */
export function DocksApp({
  className,
  initialOperationId,
  initialPage = "workspace",
  defaultTheme = "system",
  storageAdapter,
  workspaceId = getRuntimeWorkspaceId(),
}: DocksProps) {
  const [page, setPage] = React.useState(initialPage)
  const [operationId, setOperationId] = React.useState(initialOperationId)

  if (storageAdapter) {
    setDocksStorageAdapter(storageAdapter)
  } else if (!isDocksStorageAdapterConfigured()) {
    const storageUrl = getRuntimeStorageUrl()
    setDocksStorageAdapter(
      storageUrl
        ? createHttpStorageAdapter(storageUrl)
        : createIndexedDbStorageAdapter(workspaceId)
    )
  }

  function selectOperation(nextOperationId?: string) {
    setOperationId(nextOperationId)
    setPage("workspace")
  }

  return (
    <div className={cn("h-svh min-h-144 w-full", className)}>
      <ThemeProvider
        defaultTheme={defaultTheme}
        storageKey={getWorkspaceStorageKey(workspaceId, "ui-theme")}
      >
        <EnvironmentProvider workspaceId={workspaceId}>
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
