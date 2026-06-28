import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
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

export function DocsPanel({ operation }: { operation: ApiOperation }) {
  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <div>
        <p className="mt-2 text-sm leading-6 text-[#a5a5a5]">
          {operation.description ?? operation.summary}
        </p>
      </div>
      <div className="overflow-hidden rounded-sm">
        <div className="py-3">
          <h3 className="text-base font-normal tracking-normal text-[#d6d6d6]">
            Responses
          </h3>
        </div>
        <Accordion
          type="multiple"
          className="max-w-full rounded-lg border"
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
                      ? "mr-2 rounded bg-green-700 px-2 py-0.5 text-xs font-medium text-green-100"
                      : "mr-2 rounded bg-red-700 px-2 py-0.5 text-xs font-medium text-red-100"
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
              <SelectTrigger className="w-full">
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
            <TabsList>
              <TabsTrigger value="example">Example Value</TabsTrigger>
              <TabsTrigger value="schema">Schema</TabsTrigger>
            </TabsList>
            <TabsContent value="example">
              <ScrollArea className="max-h-80 rounded-md border bg-muted">
                <pre className="p-4 text-sm leading-6 text-foreground">
                  {JSON.stringify(response.example, null, 2)}
                </pre>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="schema">
              <ResponseSchema response={response} />
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

function ResponseSchema({ response }: { response: ApiResponse }) {
  const schemaFields = formatSchema(response.schema)

  if (typeof schemaFields === "string") {
    return (
      <ScrollArea className="max-h-80 rounded-md border bg-muted">
        <div className="p-4 font-mono text-sm text-muted-foreground">
          {schemaFields}
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="max-h-80 rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48 pl-8 text-muted-foreground">
              Field
            </TableHead>
            <TableHead className="w-48 text-muted-foreground">Type</TableHead>
            <TableHead className="w-32 text-muted-foreground">
              Required
            </TableHead>
            <TableHead className="min-w-64 pr-8 text-muted-foreground">
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
            {!hasDetails && <div className="size-3.5 shrink-0" />}
            {name}
          </div>
        </TableCell>
        <TableCell className="py-3 font-mono text-muted-foreground">
          {type}
        </TableCell>
        <TableCell className="py-3">
          {required ? (
            <span className="rounded border border-red-900/50 bg-red-900/30 px-1.5 py-0.5 text-xs font-medium text-red-400">
              Yes
            </span>
          ) : (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
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
