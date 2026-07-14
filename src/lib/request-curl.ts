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
  const method = snapshot.mode === "sse" ? "GET" : snapshot.method
  const parts = [`curl --request ${method}`, shellQuote(snapshot.url)]

  // Native EventSource only sends the resolved URL and browser cookies. The
  // preserved header/body drafts are deliberately excluded from its cURL view.
  if (snapshot.mode === "sse") {
    return parts.join(" \\\n  ")
  }

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
      const value =
        row.type === "file" ? `@${row.fileName || row.value}` : row.value
      parts.push(`--form ${shellQuote(`${row.key.trim()}=${value}`)}`)
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
