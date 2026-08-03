import { X } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { getMethodClassName } from "./utils"
import { Button } from "@/components/ui/button"

type RequestTabItem = {
  id: string
  method: string
  displayPath: string
  transport?: string
  mode?: string
}

export function RequestTabStrip({
  activeOperationId,
  operations,
  onSelectOperation,
  onCloseOperation,
}: {
  activeOperationId: string
  operations: RequestTabItem[]
  onSelectOperation: (operation: RequestTabItem) => void
  onCloseOperation: (operationId: string) => void
}) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-card text-muted-foreground">
      <div className="flex h-full w-11 items-center justify-center border-r border-border text-muted-foreground">
        <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
      </div>
      <div
        className="flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden bg-muted/30"
        aria-label="Open request tabs"
      >
        {operations.map((apiOperation) => (
          <div
            key={apiOperation.id}
            className={cn(
              "mx-0.5 flex h-[calc(100%-0.25rem)] max-w-40 min-w-32 shrink-0 items-center justify-between self-end rounded-none border border-b-0 border-border bg-card px-1.5 text-left text-sm text-muted-foreground hover:bg-accent/50",
              apiOperation.id === activeOperationId &&
                "bg-background font-medium text-foreground"
            )}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSelectOperation(apiOperation)}
              aria-label={`Open ${apiOperation.displayPath} tab`}
              className="h-full min-w-0 flex-1 justify-start gap-1 overflow-hidden rounded-none px-0 font-normal hover:bg-transparent"
            >
              <span
                className={cn(
                  "font-mono text-[11px] font-normal uppercase",
                  apiOperation.mode === "sse"
                    ? "text-violet-600 dark:text-violet-400"
                    : getMethodClassName(apiOperation.method)
                )}
              >
                {apiOperation.mode === "sse"
                  ? "SSE"
                  : apiOperation.transport === "websocket"
                    ? "WS"
                    : apiOperation.method}
              </span>
              <span className="truncate text-[12px]">
                {apiOperation.displayPath}
              </span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={(event) => {
                event.stopPropagation()
                onCloseOperation(apiOperation.id)
              }}
              aria-label={`Close ${apiOperation.displayPath} tab`}
              className="size-5 rounded-none hover:bg-accent hover:text-foreground"
            >
              <X className="w-3 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
