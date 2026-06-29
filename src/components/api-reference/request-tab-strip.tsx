import { X } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { ApiOperation } from "@/lib/openapi"
import { cn } from "@/lib/utils"
import { getMethodClassName } from "./utils"

export function RequestTabStrip({
  activeOperationId,
  operations,
  onSelectOperation,
  onCloseOperation,
}: {
  activeOperationId: string
  operations: ApiOperation[]
  onSelectOperation: (operation: ApiOperation) => void
  onCloseOperation: (operationId: string) => void
}) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-card text-muted-foreground">
      <div className="flex h-full w-11 items-center justify-center border-r border-border text-muted-foreground">
        <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
      </div>
      <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden bg-muted/30">
        {operations.map((apiOperation) => (
          <div
            key={apiOperation.id}
            className={cn(
              "flex h-full max-w-40 min-w-32 items-center justify-between border-r-[0.5px] border-border bg-card px-1.5 text-left text-sm text-muted-foreground hover:bg-accent/50",
              apiOperation.id === activeOperationId &&
                "bg-background font-medium text-foreground"
            )}
          >
            <button
              type="button"
              onClick={() => onSelectOperation(apiOperation)}
              aria-label={`Open ${apiOperation.displayPath} tab`}
              className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-hidden text-left"
            >
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  getMethodClassName(apiOperation.method)
                )}
              >
                {apiOperation.method}
              </span>
              <span className="truncate text-[12px]">
                {apiOperation.displayPath}
              </span>
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onCloseOperation(apiOperation.id)
              }}
              aria-label={`Close ${apiOperation.displayPath} tab`}
              className="rounded-sm p-0.5 hover:bg-accent hover:text-foreground"
            >
              <X className="w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
