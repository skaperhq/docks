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
    <Sheet>
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
        className="h-[52svh] gap-0 border-border bg-background p-0 text-foreground sm:max-w-none"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-foreground">Response</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {operation.method} {operation.requestUrl}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(52svh-5rem)]">
          <div className="space-y-6 p-6">
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="w-28 text-muted-foreground">
                      Code
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      Description
                    </TableHead>
                    <TableHead className="w-52 text-muted-foreground">
                      Media type
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operation.responses.map((response) => (
                    <TableRow key={response.code}>
                      <TableCell className="font-mono text-foreground">
                        {response.code}
                      </TableCell>
                      <TableCell className="text-foreground/90">
                        {response.description}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {response.contentTypes[0] ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border bg-muted px-4 py-3 text-sm font-medium text-foreground">
                {previewResponse.code} example
              </div>
              <ScrollArea className="max-h-64 bg-muted">
                <pre className="p-4 font-mono text-sm leading-6 text-foreground">
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
