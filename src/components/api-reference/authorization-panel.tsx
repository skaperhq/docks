import type { ApiOperation } from "@/lib/openapi"

export function AuthorizationPanel({ operation }: { operation: ApiOperation }) {
  return (
    <section className="max-w-4xl">
      <h2 className="mb-4 text-[17px] font-semibold text-foreground">
        Authorization
      </h2>
      <div className="grid max-w-2xl grid-cols-[11rem_minmax(0,1fr)] overflow-hidden rounded-md border border-border">
        <div className="border-r border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Type
        </div>
        <div className="px-4 py-3 text-sm text-foreground">
          {operation.hasAuth ? "Bearer Token" : "No Auth"}
        </div>
        <div className="border-t border-r border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Token
        </div>
        <div className="border-t border-border px-4 py-3 font-mono text-sm text-muted-foreground">
          {operation.hasAuth ? "{{access_token}}" : "-"}
        </div>
      </div>
    </section>
  )
}
