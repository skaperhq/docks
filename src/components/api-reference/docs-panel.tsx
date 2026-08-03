import * as React from "react"
import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatSchema } from "@/lib/openapi"
import type { ApiOperation, ApiResponse } from "@/lib/openapi"
import { cn } from "@/lib/utils"
import { BodyEditor } from "./body-editor"

export function DocsPanel({
  operation,
  curlCommand,
}: {
  operation: ApiOperation
  curlCommand?: string
}) {
  return (
    <section className="flex w-full max-w-6xl min-w-0 flex-col gap-1">
      <div>
        <p className="text-sm leading-6 text-foreground/90">
          {operation.description ?? operation.summary}
        </p>
      </div>
      {curlCommand ? <CurlExample command={curlCommand} /> : null}
      <div className="overflow-hidden rounded-sm">
        <div className="py-2 pt-0">
          <h6 className="mt-3 text-[13px] font-normal tracking-normal text-foreground/70">
            Responses
          </h6>
        </div>
        <Accordion
          type="multiple"
          className="max-w-full rounded-none border"
          defaultValue={["200"]}
        >
          {operation.responses.map((item) => (
            <AccordionItem
              key={item.code}
              value={item.code}
              className="border-b px-4 last:border-b-0"
            >
              <AccordionTrigger>
                <span
                  className={cn(
                    Number(item.code) < 400
                      ? "mr-2 bg-green-700 px-2 py-0.5 text-xs font-medium text-green-100"
                      : "mr-2 bg-red-700 px-2 py-0.5 text-xs font-medium text-red-100"
                  )}
                >
                  {item.code}
                </span>
                {item.description}
              </AccordionTrigger>
              <AccordionContent>
                <div className="py-5">
                  <ResponseDetails response={item} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

export function CurlExample({ command }: { command: string }) {
  return (
    <div className="flex max-w-full min-w-0 flex-col gap-2">
      <h6 className="text-[13px] font-normal text-foreground/70">cURL</h6>
      <ReadOnlyCodeBlock
        value={command}
        contentType="text/x-shellscript"
        copyLabel="Copy cURL"
        lineWrapping
      />
    </div>
  )
}

function ResponseDetails({ response }: { response: ApiResponse }) {
  const defaultContentType = response.contentTypes[0] ?? "none"
  const hasContent = response.contentTypes.length > 0

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      {hasContent ? (
        <>
          <div className="flex max-w-sm flex-col gap-1.5">
            <span className="text-xs font-normal text-muted-foreground">
              Media type
            </span>
            <Select defaultValue={defaultContentType}>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue placeholder="Select media type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Media Types</SelectLabel>
                  {response.contentTypes.map((contentType) => (
                    <SelectItem key={contentType} value={contentType}>
                      {contentType}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Controls the Accept header.
            </span>
          </div>

          <Tabs defaultValue="example" className="gap-3">
            <TabsList className="rounded-none">
              <TabsTrigger value="example" className="rounded-none">
                Example Value
              </TabsTrigger>
              <TabsTrigger value="schema" className="rounded-none">
                Schema
              </TabsTrigger>
            </TabsList>
            <TabsContent value="example">
              <ReadOnlyCodeBlock
                value={JSON.stringify(response.example, null, 2)}
                contentType={defaultContentType}
                copyLabel="Copy example value"
              />
            </TabsContent>
            <TabsContent value="schema">
              <div className="flex flex-col gap-2">
                <div className="flex justify-end">
                  <CopyButton
                    value={JSON.stringify(response.schema ?? {}, null, 2)}
                    label="Copy response schema"
                  />
                </div>
                <ResponseSchema response={response} />
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This response does not define a response body.
        </p>
      )}
    </div>
  )
}

function ReadOnlyCodeBlock({
  value,
  contentType,
  copyLabel,
  lineWrapping = false,
}: {
  value: string
  contentType: string
  copyLabel: string
  lineWrapping?: boolean
}) {
  return (
    <div
      className="relative max-w-full min-w-0 overflow-hidden rounded-none border border-border bg-background"
      style={{
        height: lineWrapping ? 144 : getCodeBlockHeight(value),
      }}
    >
      <BodyEditor
        value={value}
        contentType={contentType}
        readOnly
        lineWrapping={lineWrapping}
        className="h-full min-w-0 [&_.cm-content]:pr-12"
      />
      <CopyButton
        value={value}
        label={copyLabel}
        className="absolute top-2 right-2 z-10 bg-background/90"
      />
    </div>
  )
}

function CopyButton({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const resetTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn("size-7 rounded-none", className)}
      aria-label={copied ? `${label} copied` : label}
      title={copied ? "Copied" : label}
      onClick={handleCopy}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  )
}

export function getCodeBlockHeight(value: string) {
  const lineCount = Math.max(1, value.split("\n").length)
  // CodeMirror uses 12px vertical content padding, plus the block border.
  // We use a larger chrome height and line height to avoid subpixel clipping
  // and accommodate horizontal scrollbars if any lines overflow.
  const editorChromeHeight = 36
  const lineHeight = 21

  return Math.min(
    360,
    Math.max(72, Math.ceil(lineCount * lineHeight + editorChromeHeight))
  )
}

export function ResponseSchema({ response }: { response: ApiResponse }) {
  const schemaFields = formatSchema(response.schema)

  if (typeof schemaFields === "string") {
    return (
      <ScrollArea
        data-testid="response-schema-scroll-area"
        className="h-80 w-full max-w-full min-w-0 rounded-md border bg-muted"
      >
        <div className="p-4 font-mono text-sm text-muted-foreground">
          {schemaFields}
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea
      data-testid="response-schema-scroll-area"
      className="h-80 w-full max-w-full min-w-0 rounded-none border"
    >
      <Table className="min-w-208">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48 pl-4 text-muted-foreground">
              Field
            </TableHead>
            <TableHead className="w-48 text-muted-foreground">Type</TableHead>
            <TableHead className="w-32 text-muted-foreground">
              Required
            </TableHead>
            <TableHead className="min-w-64 pr-4 text-muted-foreground">
              Description
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schemaFields.map((field) => (
            <CollapsibleSchemaRow key={field.name} {...field} />
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function CollapsibleSchemaRow({
  name,
  required,
  type,
  description,
  defaultValue,
  enum: allowedValues,
  pattern,
  minimum,
  maximum,
  minLength,
  maxLength,
  example,
}: {
  name: string
  required: boolean
  type: string
  description?: string
  defaultValue?: unknown
  enum?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  example?: unknown
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const hasDetails = Boolean(
    description ||
    allowedValues ||
    pattern ||
    minimum !== undefined ||
    maximum !== undefined ||
    minLength !== undefined ||
    maxLength !== undefined ||
    defaultValue !== undefined ||
    example !== undefined
  )

  return (
    <>
      <TableRow
        onClick={() => hasDetails && setIsOpen(!isOpen)}
        className={cn(
          "border-b border-border/50 transition-colors",
          hasDetails ? "cursor-pointer hover:bg-accent/40" : "",
          isOpen && "bg-accent/20"
        )}
      >
        <TableCell className="py-3 pl-4 font-mono text-foreground">
          <div className="flex items-center gap-2">
            {hasDetails && (
              <ChevronDownIcon
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  !isOpen && "-rotate-90"
                )}
              />
            )}
            {name}
          </div>
        </TableCell>
        <TableCell className="py-3 font-mono text-muted-foreground">
          {type}
        </TableCell>
        <TableCell className="py-3">
          {required ? (
            <span className="border border-red-900/50 bg-red-900 px-1.5 py-0.5 text-xs font-medium text-white">
              Yes
            </span>
          ) : (
            <span className="bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              No
            </span>
          )}
        </TableCell>
        <TableCell className="py-3 pr-4 text-muted-foreground">
          <div className="line-clamp-1 max-w-100 text-sm text-muted-foreground">
            {description || "-"}
          </div>
        </TableCell>
      </TableRow>
      {hasDetails && (
        <TableRow
          className={cn(
            "border-b border-border/30 bg-muted/20",
            !isOpen && "hidden"
          )}
        >
          <TableCell colSpan={4} className="p-0">
            <div
              className={cn(
                "overflow-hidden px-8 py-5 text-sm text-muted-foreground transition-all duration-300 ease-in-out",
                isOpen ? "max-h-125 opacity-100" : "max-h-0 opacity-0"
              )}
            >
              <div className="flex flex-col gap-4">
                {description && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                      Description
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {defaultValue !== undefined && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Default
                      </div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {JSON.stringify(defaultValue)}
                      </div>
                    </div>
                  )}

                  {allowedValues && allowedValues.length > 0 && (
                    <div className="col-span-2 space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Allowed Values
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allowedValues.map((val) => (
                          <span
                            key={val}
                            className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-amber-600 dark:text-amber-400"
                          >
                            {val}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {pattern && (
                    <div className="col-span-2 space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Pattern
                      </div>
                      <div className="inline-block rounded border border-cyan-900/40 bg-cyan-950/20 px-2 py-0.5 font-mono text-xs text-cyan-500 dark:text-cyan-400">
                        {pattern}
                      </div>
                    </div>
                  )}

                  {(minimum !== undefined || maximum !== undefined) && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Range
                      </div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {minimum !== undefined ? `[${minimum}` : "[-∞"}
                        {", "}
                        {maximum !== undefined ? `${maximum}]` : "∞]"}
                      </div>
                    </div>
                  )}

                  {(minLength !== undefined || maxLength !== undefined) && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Length
                      </div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {minLength !== undefined ? `Min: ${minLength}` : ""}
                        {minLength !== undefined && maxLength !== undefined
                          ? ", "
                          : ""}
                        {maxLength !== undefined ? `Max: ${maxLength}` : ""}
                      </div>
                    </div>
                  )}

                  {example !== undefined && (
                    <div className="col-span-full mt-2 space-y-1">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground/75 uppercase">
                        Example
                      </div>
                      <pre className="max-h-40 overflow-x-auto rounded border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
                        {typeof example === "object"
                          ? JSON.stringify(example, null, 2)
                          : String(example)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
