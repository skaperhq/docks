import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import appCss from "../styles.css?url"
import { ThemeProvider } from "../components/theme-provider"
import { EnvironmentProvider } from "../components/environment-provider"
import { createIndexedDbStorageAdapter } from "../lib/indexed-db-storage"
import {
  createHttpStorageAdapter,
  getRuntimeStorageUrl,
} from "../lib/http-storage"
import {
  isDocksStorageAdapterConfigured,
  setDocksStorageAdapter,
} from "../lib/storage-adapter"
import { getRuntimeWorkspaceId, getWorkspaceStorageKey } from "../lib/workspace"

const workspaceId = getRuntimeWorkspaceId()
if (!isDocksStorageAdapterConfigured()) {
  const storageUrl = getRuntimeStorageUrl()
  setDocksStorageAdapter(
    storageUrl
      ? createHttpStorageAdapter(storageUrl)
      : createIndexedDbStorageAdapter(workspaceId)
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Docks · API Workspace",
      },
      {
        name: "description",
        content:
          "Explore OpenAPI documentation, compose requests, and manage environments in Docks.",
      },
    ],
    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('docks:development:ui-theme') || 'system';
                const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.classList.toggle('dark', isDark);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider
          storageKey={getWorkspaceStorageKey(workspaceId, "ui-theme")}
        >
          <EnvironmentProvider workspaceId={workspaceId}>
            {children}
          </EnvironmentProvider>
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
