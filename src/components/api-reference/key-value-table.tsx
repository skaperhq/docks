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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileIcon, FilesIcon, XIcon } from "lucide-react"
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
  allowFileValues = false,
}: {
  title: string
  rows: KeyValueRow[]
  badge?: string
  emptyMessage: string
  onRowsChange: (rows: KeyValueRow[]) => void
  allowFileValues?: boolean
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
                allowFileValues={allowFileValues}
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
  allowFileValues,
  onChange,
}: {
  row: KeyValueRow
  isPlaceholder?: boolean
  allowFileValues: boolean
  onChange: (patch: Partial<KeyValueRow>) => void
}) {
  return (
    <TableRow className="border-border hover:bg-transparent">
      <TableCell className="h-8.5 border-r border-border px-0 py-0 text-center">
        {isPlaceholder ? null : (
          <Checkbox
            checked={row.enabled !== false}
            onCheckedChange={(checked) =>
              onChange({ enabled: checked === true })
            }
            className="mx-auto"
            aria-label={`Enable ${row.key || "row"}`}
          />
        )}
      </TableCell>
      <TableCell className="h-8.5 border-r border-border px-0 py-0">
        <div className="flex h-full min-w-0 items-center">
          <Input
            value={row.key}
            onChange={(event) => onChange({ key: event.target.value })}
            placeholder="Key"
            className={cn(
              leanCellInputClassName,
              "min-w-0 flex-1",
              allowFileValues && "border-r border-border",
              isPlaceholder &&
                "text-[12px] font-normal text-muted-foreground/60"
            )}
          />
          {allowFileValues ? (
            <Select
              value={row.type === "file" ? "file" : "text"}
              onValueChange={(type) =>
                onChange({
                  type,
                  value:
                    type === "file"
                      ? (row.fileNames ?? [row.fileName])
                          .filter(Boolean)
                          .join(", ")
                      : row.value,
                  file: type === "file" ? row.file : undefined,
                  fileName: type === "file" ? row.fileName : undefined,
                  files: type === "file" ? row.files : undefined,
                  fileNames: type === "file" ? row.fileNames : undefined,
                })
              }
            >
              <SelectTrigger
                aria-label={`Value type for ${row.key || "new form-data row"}`}
                className="h-full w-24 shrink-0 rounded-none border-0 bg-transparent px-3 text-xs shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="h-8.5 border-r border-border px-0 py-0">
        {allowFileValues && row.type === "file" ? (
          <FileValueEditor
            row={row}
            onChange={onChange}
            fieldName={row.key || "form-data row"}
          />
        ) : (
          <Input
            value={row.value}
            onChange={(event) => onChange({ value: event.target.value })}
            placeholder="Value"
            className={cn(
              leanCellInputClassName,
              isPlaceholder &&
                "text-[12px] font-normal text-muted-foreground/60"
            )}
          />
        )}
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

function FileValueEditor({
  row,
  fieldName,
  onChange,
}: {
  row: KeyValueRow
  fieldName: string
  onChange: (patch: Partial<KeyValueRow>) => void
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [isFocused, setIsFocused] = React.useState(false)
  const fileNames = row.files?.length
    ? row.files.map((file) => file.name)
    : row.fileNames?.length
      ? row.fileNames
      : row.fileName
        ? [row.fileName]
        : []

  function openFilePicker() {
    inputRef.current?.click()
  }

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? [])
    const nextFileNames = files.map((file) => file.name)

    onChange({
      files,
      fileNames: nextFileNames,
      file: files[0],
      fileName: nextFileNames[0],
      value: nextFileNames.join(", "),
    })

    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLElement &&
      containerRef.current?.contains(activeElement)
    ) {
      activeElement.blur()
    }
    setIsFocused(false)
    event.currentTarget.value = ""
  }

  function removeFile(index: number) {
    const nextFiles = row.files?.filter((_, fileIndex) => fileIndex !== index)
    const nextFileNames = fileNames.filter(
      (_, fileIndex) => fileIndex !== index
    )

    onChange({
      files: nextFiles,
      fileNames: nextFileNames,
      file: nextFiles?.[0],
      fileName: nextFileNames[0],
      value: nextFileNames.join(", "),
    })
  }

  return (
    <div
      ref={containerRef}
      role="group"
      tabIndex={0}
      aria-label={`Files for ${fieldName}`}
      className="flex min-h-8.5 min-w-0 items-center rounded-md px-1 outline-none focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-inset"
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget)) {
          setIsFocused(false)
        }
      }}
      onKeyDown={(event) => {
        if (
          event.currentTarget === event.target &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault()
          openFilePicker()
        }
      }}
    >
      <Input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-label={`File picker for ${fieldName}`}
        onChange={selectFiles}
        className="sr-only"
      />

      {fileNames.length === 0 ? (
        <Button
          type="button"
          variant="ghost"
          onClick={openFilePicker}
          aria-label={`Select files for ${fieldName}`}
          className="w-full justify-start"
        >
          <span className="text-muted-foreground">Select files</span>
        </Button>
      ) : !isFocused && fileNames.length > 1 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault()
            containerRef.current?.focus()
          }}
          aria-label={`Expand ${fileNames.length} files for ${fieldName}`}
        >
          <FilesIcon data-icon="inline-start" />
          {fileNames.length} files
        </Button>
      ) : (
        <div
          className="flex min-w-0 flex-1 cursor-text flex-col items-start gap-1 py-1"
          onClick={(event) => {
            if (event.currentTarget === event.target) {
              openFilePicker()
            }
          }}
        >
          {fileNames.map((fileName, index) => (
            <Button
              key={`${fileName}-${index}`}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => removeFile(index)}
              aria-label={`Remove ${fileName}`}
              title={`Remove ${fileName}`}
              className="max-w-full"
            >
              <FileIcon data-icon="inline-start" />
              <span className="truncate">{fileName}</span>
              <XIcon data-icon="inline-end" />
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
