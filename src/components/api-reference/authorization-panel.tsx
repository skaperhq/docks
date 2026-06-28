import type { ApiOperation } from "@/lib/openapi"
import { useEnvironment } from "@/components/environment-provider"
import { Link } from "@tanstack/react-router"
import { AlertCircle, Eye, EyeOff, Settings } from "lucide-react"
import * as React from "react"

export function AuthorizationPanel({ operation }: { operation: ApiOperation }) {
  const { activeEnvironment } = useEnvironment()
  const [showToken, setShowToken] = React.useState(false)

  const accessTokenVar = activeEnvironment?.variables.find(
    (v) => v.key === "access_token" && v.enabled
  )
  const tokenValue = accessTokenVar?.value || ""

  return (
    <section className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-foreground">
          Authorization
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          This endpoint requires standard Bearer token authentication.
        </p>
      </div>

      <div className="grid max-w-2xl grid-cols-[11rem_minmax(0,1fr)] overflow-hidden rounded-md border border-border">
        <div className="border-r border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Type
        </div>
        <div className="px-4 py-3 text-sm text-foreground">
          {operation.hasAuth ? "Bearer Token" : "No Auth"}
        </div>
        <div className="border-t border-r border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Token placeholder
        </div>
        <div className="border-t border-border px-4 py-3 font-mono text-sm text-muted-foreground">
          {operation.hasAuth ? "{{access_token}}" : "-"}
        </div>

        {operation.hasAuth && (
          <>
            <div className="border-t border-r border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Resolved value
            </div>
            <div className="border-t border-border px-4 py-3 text-sm text-foreground flex items-center justify-between font-mono">
              <span className="truncate max-w-[20rem]">
                {tokenValue ? (
                  showToken ? (
                    tokenValue
                  ) : (
                    "••••••••••••••••"
                  )
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not configured</span>
                )}
              </span>
              {tokenValue && (
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {operation.hasAuth && !tokenValue && (
        <div className="max-w-2xl bg-amber-500/10 border border-amber-500/20 rounded-md p-3.5 flex gap-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-4.5 shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div>
              <span className="font-semibold">Authorization Token Missing:</span> The active environment{" "}
              <span className="font-semibold">({activeEnvironment?.name || "None"})</span> has no value set for{" "}
              <code className="font-mono bg-muted/80 px-1 rounded text-foreground">access_token</code>.
            </div>
            <Link
              to="/environment"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded transition-colors"
            >
              <Settings className="size-3" />
              Configure in Environment settings
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
