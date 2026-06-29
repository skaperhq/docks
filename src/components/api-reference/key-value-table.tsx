import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { KeyValueRow } from "./types"
import {
  emptyKeyValueRow,
  normalizeKeyValueRow,
  shouldCreateRow,
  leanCellInputClassName,
} from "./utils"

export function KeyValueTable({
  title,
  rows,
  onRowsChange,
  emptyMessage,
}: {
  title: string
  rows: KeyValueRow[]
  badge?: string
  emptyMessage: string
  onRowsChange: (rows: KeyValueRow[]) => void
}) {
  function updateRow(index: number, patch: Partial<KeyValueRow>) {
    const nextRows =
      index >= rows.length
        ? shouldCreateRow(patch)
          ? [...rows, normalizeKeyValueRow({ ...emptyKeyValueRow, ...patch })]
          : rows
        : rows.map((row, rowIndex) =>
            rowIndex === index ? { ...row, ...patch } : row
          )

    if (nextRows !== rows) {
      onRowsChange(nextRows)
    }
  }

  const visibleRows = React.useMemo(() => [...rows, emptyKeyValueRow], [rows])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-muted-background/90 text-[14px] font-normal">
          {title}
        </h2>
      </div>
      <div
        aria-label={rows.length === 0 ? emptyMessage : undefined}
        className="overflow-hidden border border-border bg-background"
      >
        <Table className="table-fixed border-collapse">
          <TableHeader>
            <TableRow className="border-border bg-background hover:bg-background">
              <TableHead className="h-8.5 w-14 border-r border-border px-0" />
              <TableHead className="h-8.5 w-[31%] border-r border-border px-4 text-[13px] font-normal text-muted-foreground">
                Key
              </TableHead>
              <TableHead className="h-8.5 w-[31%] border-r border-border px-4 text-[13px] font-normal text-muted-foreground">
                Value
              </TableHead>
              <TableHead className="h-8.5 border-border px-4 text-[13px] font-normal text-muted-foreground">
                Description
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row, index) => (
              <EditableKeyValueRow
                key={`${title}-${index}`}
                row={row}
                isPlaceholder={index === rows.length}
                onChange={(patch) => updateRow(index, patch)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function EditableKeyValueRow({
  row,
  isPlaceholder,
  onChange,
}: {
  row: KeyValueRow
  isPlaceholder?: boolean
  onChange: (patch: Partial<KeyValueRow>) => void
}) {
  return (
    <TableRow className="border-border hover:bg-transparent">
      <TableCell className="h-8.5 border-r border-border px-0 py-0 text-center">
        {isPlaceholder ? null : (
          <Checkbox
            checked={row.enabled !== false}
            onCheckedChange={(checked) => onChange({ enabled: checked === true })}
            className="mx-auto"
            aria-label={`Enable ${row.key || "row"}`}
          />
        )}
      </TableCell>
      <TableCell className="h-8.5 border-r border-border px-0 py-0">
        <Input
          value={row.key}
          onChange={(event) => onChange({ key: event.target.value })}
          placeholder="Key"
          className={cn(
            leanCellInputClassName,
            isPlaceholder && "text-[12px] font-normal text-muted-foreground/60"
          )}
        />
      </TableCell>
      <TableCell className="h-8.5 border-r border-border px-0 py-0">
        <Input
          value={row.value}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder="Value"
          className={cn(
            leanCellInputClassName,
            isPlaceholder && "text-[12px] font-normal text-muted-foreground/60"
          )}
        />
      </TableCell>
      <TableCell className="h-8.5 border-border px-0 py-0">
        <Input
          value={row.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Description"
          className={cn(
            leanCellInputClassName,
            "font-sans",
            isPlaceholder && "text-[12px] font-normal text-muted-foreground/60"
          )}
        />
      </TableCell>
    </TableRow>
  )
}
