type RouteConfig = Record<string, unknown>

// The embeddable package renders page components directly. These small
// adapters let Rolldown discard the app-only file-route wrappers so the host
// does not need TanStack Router at runtime.
export function createFileRoute(_path: string) {
  return <T extends RouteConfig>(config: T) => ({
    ...config,
    useSearch: () => ({ operationId: undefined as string | undefined }),
  })
}

export function useNavigate() {
  return (_options: unknown) => {}
}
