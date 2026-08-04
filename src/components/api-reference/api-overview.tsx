import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  LoaderCircleIcon,
  ServerIcon,
  Settings2Icon,
  TagsIcon,
} from "lucide-react"
import * as React from "react"
import { CopyPageAction } from "./copy-page-action"
import type { SavedResponseSummary } from "./types"
import { getBgMethodClassName, getMethodClassName } from "./utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  apiInfo,
  apiOperations,
  apiServers,
  apiSpecVersion,
} from "@/lib/openapi"
import { buildApiOverviewMarkdown } from "@/lib/page-markdown"
import { cn } from "@/lib/utils"

export function ApiOverview({
  savedResponses,
  loadingSavedResponseId,
  onSelectSavedResponse,
  onSelectEnvironment,
}: {
  savedResponses: SavedResponseSummary[]
  loadingSavedResponseId?: string | null
  onSelectSavedResponse: (response: SavedResponseSummary) => void
  onSelectEnvironment: () => void
}) {
  const tags = new Set(apiOperations.map((operation) => operation.tag))
  const overviewMarkdown = React.useMemo(buildApiOverviewMarkdown, [])

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col">
      <header className="flex flex-col gap-6 py-5 sm:py-7">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-none font-mono">
                V{apiInfo.version}
              </Badge>
              <Badge variant="outline" className="rounded-none font-mono">
                OPENAPI {apiSpecVersion}
              </Badge>
            </div>
            <h1 className="font-mono text-3xl font-medium tracking-tight text-foreground uppercase">
              {apiInfo.title}
            </h1>
            {apiInfo.description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {apiInfo.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onSelectEnvironment}
              className="rounded-none font-mono uppercase"
            >
              <Settings2Icon data-icon="inline-start" />
              Environment
            </Button>
            <CopyPageAction markdown={overviewMarkdown} title={apiInfo.title} />
          </div>
        </div>
      </header>

      <Separator />

      <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-mono text-lg font-medium text-foreground uppercase">
                API surface
              </h2>
              <p className="text-sm text-muted-foreground">
                A live summary generated from this OpenAPI document.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <OverviewStat
                label="Endpoints"
                value={apiOperations.length}
                icon={ArrowLeftRightIcon}
              />
              <OverviewStat label="Tags" value={tags.size} icon={TagsIcon} />
              <OverviewStat
                label="Servers"
                value={apiServers.length}
                icon={ServerIcon}
              />
            </div>
          </section>
        </div>
      </div>

      <Separator />

      <section className="flex flex-col gap-5 py-8">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-mono text-base font-medium text-foreground uppercase">
              Saved responses
            </h2>
            <p className="text-sm text-muted-foreground">
              Responses saved from previous requests.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-none border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Response</TableHead>
                <TableHead className="w-50">Endpoint</TableHead>
                <TableHead className="w-20">Method</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-24">Duration</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead className="w-32">Saved</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedResponses.length > 0 ? (
                savedResponses.map((response) => (
                  <TableRow key={response.id}>
                    <TableCell className="max-w-44 truncate font-normal text-foreground">
                      {response.name}
                    </TableCell>
                    <TableCell className="max-w-20">
                      <p className="truncate text-muted-foreground">
                        {response.path}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p
                        className={cn(
                          getMethodClassName(response.method),
                          getBgMethodClassName(response.method),
                          "w-fit rounded-none px-2 py-0.5 text-center text-xs font-semibold uppercase"
                        )}
                      >
                        {response.method}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "font-mono text-xs tabular-nums",
                          response.ok ? "text-foreground" : "text-destructive"
                        )}
                      >
                        {response.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {Math.round(response.durationMs)} ms
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatSavedResponseSize(response.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSavedResponseDate(response.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open saved response ${response.name}`}
                        onClick={() => onSelectSavedResponse(response)}
                        disabled={loadingSavedResponseId === response.id}
                      >
                        {loadingSavedResponseId === response.id ? (
                          <LoaderCircleIcon className="animate-spin" />
                        ) : (
                          <ArrowRightIcon data-icon="inline-end" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No saved responses yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </section>
  )
}

function OverviewStat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: LucideIcon
}) {
  return (
    <Card size="sm" className="rounded-none bg-background">
      <CardHeader>
        <CardDescription className="font-mono uppercase">
          {label}
        </CardDescription>
        <CardTitle className="tabular-nums">{value}</CardTitle>
        <CardAction>
          <Icon
            className="text-foreground"
            aria-hidden="true"
            strokeWidth={1.2}
          />
        </CardAction>
      </CardHeader>
    </Card>
  )
}

function formatSavedResponseDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatSavedResponseSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`

  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`
  return `${(kilobytes / 1024).toFixed(1)} MB`
}
