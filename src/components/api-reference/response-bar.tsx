import { ChevronDownIcon, HistoryIcon } from "lucide-react"
import type { ApiOperation } from "@/lib/openapi"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ResponseBar({ operation }: { operation: ApiOperation }) {
  const previewResponse = operation.responses[0]

  return (
    <Sheet modal={false}>
      <div className="flex h-12 shrink-0 items-center justify-between border-t border-border bg-card">
        <div className="flex h-full items-center">
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex h-full cursor-pointer items-center border-r border-border px-8 text-[15px] font-semibold text-foreground hover:bg-accent/40"
            >
              Response
            </button>
          </SheetTrigger>
          <button
            type="button"
            className="flex h-full cursor-pointer items-center gap-2 px-8 text-[15px] text-muted-foreground hover:bg-accent/40 hover:text-foreground"
          >
            <HistoryIcon />
            History
            <ChevronDownIcon />
          </button>
        </div>
        <SheetTrigger asChild>
          <button
            type="button"
            className="mr-4 flex size-8 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDownIcon className="rotate-180" />
            <span className="sr-only">Open response panel</span>
          </button>
        </SheetTrigger>
      </div>
      <SheetContent
        side="bottom"
        portal={false}
        className="bottom-12 h-[52svh] gap-0 border-zinc-800 bg-zinc-950 p-0 text-zinc-50 sm:max-w-none shadow-2xl"
      >
        <SheetHeader className="border-b border-zinc-800 bg-zinc-900/40 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <SheetTitle className="font-mono text-sm text-zinc-100">Response Terminal</SheetTitle>
          </div>
          <SheetDescription className="font-mono text-xs text-zinc-400">
            <span className="text-zinc-500">$</span> curl -X {operation.method} {operation.requestUrl}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(52svh-5rem)] bg-zinc-950">
          <div className="space-y-6 p-6">
            <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/50">
                    <TableHead className="w-28 font-mono text-xs text-zinc-400">
                      Code
                    </TableHead>
                    <TableHead className="font-mono text-xs text-zinc-400">
                      Description
                    </TableHead>
                    <TableHead className="w-52 font-mono text-xs text-zinc-400">
                      Media type
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operation.responses.map((response) => (
                    <TableRow key={response.code} className="border-zinc-800 hover:bg-zinc-900/20">
                      <TableCell className="font-mono text-sm text-emerald-400">
                        {response.code}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-zinc-300">
                        {response.description}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-zinc-500">
                        {response.contentTypes[0] ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
              <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs font-mono font-medium text-zinc-300 flex items-center justify-between">
                <span>{previewResponse.code} example</span>
                <span className="text-[10px] text-zinc-500 font-mono">JSON</span>
              </div>
              <ScrollArea className="max-h-64 bg-zinc-950">
                <pre className="p-4 font-mono text-xs leading-5 text-emerald-400/90 selection:bg-emerald-950 selection:text-emerald-200">
                  {JSON.stringify(previewResponse.example ?? {}, null, 2)}
                </pre>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
