const DEFAULT_WORKSPACE_ID = "development"

type SkaperGlobals = typeof globalThis & {
  __SKAPER_WORKSPACE_ID__?: unknown
}

/** Returns the workspace configured by the server-generated browser entry. */
export function getRuntimeWorkspaceId() {
  const configuredWorkspaceId = (globalThis as SkaperGlobals)
    .__SKAPER_WORKSPACE_ID__

  return typeof configuredWorkspaceId === "string" &&
    configuredWorkspaceId.trim()
    ? configuredWorkspaceId.trim()
    : DEFAULT_WORKSPACE_ID
}

/** Creates a localStorage key whose value cannot leak into another workspace. */
export function getWorkspaceStorageKey(workspaceId: string, key: string) {
  return `skaper:${encodeURIComponent(workspaceId)}:${key}`
}

export { DEFAULT_WORKSPACE_ID }
