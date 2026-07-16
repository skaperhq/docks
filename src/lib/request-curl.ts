import type {
  KeyValueRow,
  SavedRequestSnapshot,
} from "@/components/api-reference/types"
import { serializeGraphqlBody } from "./api-request"

/**
 * Creates a reproducible cURL command from the exact request snapshot shown in
 * the workspace. Values are POSIX-shell quoted so whitespace and apostrophes
 * cannot change the command's meaning when it is pasted into a terminal.
 */
export function buildCurlCommand(snapshot: SavedRequestSnapshot) {
  const method = snapshot.method
  const parts = [`curl --request ${method}`, shellQuote(snapshot.url)]

  for (const header of enabledRows(snapshot.headers)) {
    parts.push(
      `--header ${shellQuote(`${header.key.trim()}: ${header.value}`)}`
    )
  }

  if (method !== "GET" && method !== "HEAD") {
    appendBody(parts, snapshot)
  }

  return parts.join(" \\\n  ")
}

function appendBody(parts: string[], snapshot: SavedRequestSnapshot) {
  const body = snapshot.body

  if (body.mode === "raw" && body.value) {
    parts.push(`--data-raw ${shellQuote(body.value)}`)
    return
  }

  if (body.mode === "graphql") {
    const graphqlBody = serializeGraphqlBody(body)
    if (graphqlBody) {
      parts.push(`--data-raw ${shellQuote(graphqlBody)}`)
    }
    return
  }

  if (body.mode === "x-www-form-urlencoded") {
    for (const row of enabledRows(body.urlEncodedRows ?? [])) {
      parts.push(
        `--data-urlencode ${shellQuote(`${row.key.trim()}=${row.value}`)}`
      )
    }
    return
  }

  if (body.mode === "form-data") {
    for (const row of enabledRows(body.formDataRows ?? [])) {
      if (row.type === "file") {
        const fileNames = row.fileNames?.length
          ? row.fileNames
          : [row.fileName || row.value].filter(Boolean)

        for (const fileName of fileNames) {
          parts.push(`--form ${shellQuote(`${row.key.trim()}=@${fileName}`)}`)
        }
      } else {
        parts.push(`--form ${shellQuote(`${row.key.trim()}=${row.value}`)}`)
      }
    }
    return
  }

  if (body.mode === "binary" && body.binaryFileName) {
    parts.push(`--data-binary ${shellQuote(`@${body.binaryFileName}`)}`)
  }
}

function enabledRows(rows: KeyValueRow[]) {
  return rows.filter((row) => row.enabled !== false && row.key.trim())
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}
