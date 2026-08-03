import type {
  RequestMethod,
  RequestMode,
  RequestTransport,
} from "./api-reference-actions"
import type {
  KeyValueRow,
  RequestBodyDraft,
  RequestDraft,
} from "@/components/api-reference/types"

export type ParsedCurlRequest = {
  name: string
  method: RequestMethod
  transport: RequestTransport
  mode: RequestMode
  url: string
  draft: RequestDraft
  warnings: string[]
}

type ParsedOptions = {
  url?: string
  method?: string
  forceGet: boolean
  headers: KeyValueRow[]
  data: string[]
  dataUrlEncoded: string[]
  forms: string[]
  binary?: string
  json?: string
  user?: string
  bearer?: string
  cookies: string[]
  warnings: string[]
}

const supportedMethods = new Set<RequestMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
])

/** Parses a cURL command as data. It never invokes a shell or evaluates input. */
export function parseCurlCommand(command: string): ParsedCurlRequest {
  const tokens = tokenizeCurl(command)
  if (tokens[0]?.toLowerCase() === "curl") tokens.shift()
  if (tokens.length === 0) throw new Error("Paste a cURL command to import.")

  const parsed: ParsedOptions = {
    forceGet: false,
    headers: [],
    data: [],
    dataUrlEncoded: [],
    forms: [],
    cookies: [],
    warnings: [],
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const long = splitLongOption(token)
    if (long) {
      const take = () => long.value ?? requireValue(tokens, ++index, long.name)
      switch (long.name) {
        case "--url":
          parsed.url = take()
          break
        case "--request":
          parsed.method = take()
          break
        case "--get":
          parsed.forceGet = true
          break
        case "--head":
          parsed.method = "HEAD"
          break
        case "--header":
          appendHeader(parsed, take())
          break
        case "--cookie":
          parsed.cookies.push(take())
          break
        case "--user":
          parsed.user = take()
          break
        case "--oauth2-bearer":
          parsed.bearer = take()
          break
        case "--data":
        case "--data-ascii":
        case "--data-raw":
          parsed.data.push(take())
          break
        case "--data-binary":
          parsed.binary = take()
          break
        case "--data-urlencode":
          parsed.dataUrlEncoded.push(take())
          break
        case "--form":
        case "--form-string":
          parsed.forms.push(take())
          break
        case "--json":
          parsed.json = take()
          break
        default:
          parsed.warnings.push(`Ignored unsupported cURL option ${long.name}.`)
      }
      continue
    }

    const compact = splitShortOption(token)
    if (compact) {
      const take = () =>
        compact.value ?? requireValue(tokens, ++index, compact.name)
      switch (compact.name) {
        case "-X":
          parsed.method = take()
          break
        case "-H":
          appendHeader(parsed, take())
          break
        case "-d":
          parsed.data.push(take())
          break
        case "-F":
          parsed.forms.push(take())
          break
        case "-u":
          parsed.user = take()
          break
        case "-b":
          parsed.cookies.push(take())
          break
        case "-G":
          parsed.forceGet = true
          break
        case "-I":
          parsed.method = "HEAD"
          break
        default:
          parsed.warnings.push(
            `Ignored unsupported cURL option ${compact.name}.`
          )
      }
      continue
    }

    if (token.startsWith("-")) {
      parsed.warnings.push(`Ignored unsupported cURL option ${token}.`)
    } else if (!parsed.url) {
      parsed.url = token
    } else {
      parsed.warnings.push(`Ignored extra positional argument ${token}.`)
    }
  }

  if (!parsed.url) throw new Error("The cURL command does not contain a URL.")
  const { url, params } = splitUrlAndQuery(parsed.url)
  const body = buildBody(parsed)
  const inferredMethod =
    parsed.method ??
    (parsed.forceGet ? "GET" : body.mode === "none" ? "GET" : "POST")
  const method = inferredMethod.toUpperCase() as RequestMethod
  if (!supportedMethods.has(method)) {
    throw new Error(`Unsupported HTTP method ${inferredMethod}.`)
  }

  if (parsed.forceGet && body.mode !== "none") {
    const bodyParams = bodyToQueryRows(body)
    params.push(...bodyParams)
    body.mode = "none"
    body.value = ""
    body.formDataRows = []
    body.urlEncodedRows = []
  }

  addAuthAndCookieHeaders(parsed)

  return {
    name: createCurlRequestName(method, url),
    method,
    transport: "http",
    mode: "standard",
    url,
    draft: { params, headers: parsed.headers, body },
    warnings: unique(parsed.warnings),
  }
}

export function tokenizeCurl(command: string) {
  const source = command.replaceAll(/\\\r?\n/g, " ").trim()
  const tokens: string[] = []
  let token = ""
  let quote: "'" | '"' | null = null
  let escaping = false

  for (const character of source) {
    if (escaping) {
      token += character
      escaping = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaping = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else token += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (/\s/.test(character)) {
      if (token) {
        tokens.push(token)
        token = ""
      }
      continue
    }
    token += character
  }

  if (escaping) token += "\\"
  if (quote) throw new Error("The cURL command contains an unclosed quote.")
  if (token) tokens.push(token)
  return tokens
}

function splitLongOption(token: string) {
  if (!token.startsWith("--")) return null
  const equalsIndex = token.indexOf("=")
  return equalsIndex < 0
    ? { name: token, value: undefined }
    : { name: token.slice(0, equalsIndex), value: token.slice(equalsIndex + 1) }
}

function splitShortOption(token: string) {
  if (!/^-[A-Za-z]/.test(token) || token.startsWith("--")) return null
  const name = token.slice(0, 2)
  const value = token.length > 2 ? token.slice(2) : undefined
  return { name, value }
}

function requireValue(tokens: string[], index: number, option: string) {
  if (index >= tokens.length) throw new Error(`${option} requires a value.`)
  return tokens[index]
}

function appendHeader(parsed: ParsedOptions, value: string) {
  const separator = value.indexOf(":")
  if (separator <= 0) {
    parsed.warnings.push(`Ignored malformed header ${value}.`)
    return
  }
  parsed.headers.push({
    key: value.slice(0, separator).trim(),
    value: value.slice(separator + 1).trim(),
    description: "Imported from cURL",
    enabled: true,
  })
}

function splitUrlAndQuery(value: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error("The cURL URL must be an absolute URL.")
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS cURL URLs can be imported.")
  }
  const params: KeyValueRow[] = Array.from(parsed.searchParams.entries()).map(
    ([key, item]) => ({
      key,
      value: item,
      description: "Imported from URL query",
      enabled: true,
      location: "query",
    })
  )
  parsed.search = ""
  return { url: parsed.toString(), params }
}

function buildBody(parsed: ParsedOptions): RequestBodyDraft {
  if (parsed.forms.length) {
    const formDataRows = parsed.forms.map((item) => parseFormRow(item, parsed))
    return {
      mode: "form-data",
      contentType: "multipart/form-data",
      value: "",
      formDataRows,
      urlEncodedRows: [],
    }
  }
  if (parsed.dataUrlEncoded.length) {
    return {
      mode: "x-www-form-urlencoded",
      contentType: "application/x-www-form-urlencoded",
      value: "",
      formDataRows: [],
      urlEncodedRows: parsed.dataUrlEncoded.map(parseUrlEncodedRow),
    }
  }
  if (parsed.binary !== undefined) {
    if (parsed.binary.startsWith("@")) {
      const binaryFileName = parsed.binary.slice(1)
      parsed.warnings.push(
        `Select ${binaryFileName || "the referenced file"} again before sending this request.`
      )
      return {
        mode: "binary",
        contentType:
          getHeader(parsed.headers, "content-type") ||
          "application/octet-stream",
        value: "",
        binaryFileName,
        formDataRows: [],
        urlEncodedRows: [],
      }
    }
    parsed.data.push(parsed.binary)
  }
  if (parsed.json !== undefined) {
    ensureHeader(parsed.headers, "Content-Type", "application/json")
    ensureHeader(parsed.headers, "Accept", "application/json")
    parsed.data.push(parsed.json)
  }
  if (parsed.data.length) {
    const contentType =
      getHeader(parsed.headers, "content-type") ||
      "application/x-www-form-urlencoded"
    const value = parsed.data.join("&")
    if (
      contentType.split(";", 1)[0]?.trim().toLowerCase() ===
      "application/x-www-form-urlencoded"
    ) {
      return {
        mode: "x-www-form-urlencoded",
        contentType,
        value: "",
        formDataRows: [],
        urlEncodedRows: Array.from(new URLSearchParams(value).entries()).map(
          ([key, item]) => ({
            key,
            value: item,
            description: "Imported from cURL",
            enabled: true,
          })
        ),
      }
    }
    return {
      mode: "raw",
      contentType,
      value,
      formDataRows: [],
      urlEncodedRows: [],
    }
  }
  return {
    mode: "none",
    contentType: "",
    value: "",
    formDataRows: [],
    urlEncodedRows: [],
  }
}

function parseFormRow(item: string, parsed: ParsedOptions): KeyValueRow {
  const separator = item.indexOf("=")
  const key = separator < 0 ? item : item.slice(0, separator)
  const value = separator < 0 ? "" : item.slice(separator + 1)
  if (value.startsWith("@") || value.startsWith("<")) {
    const fileName = value.slice(1).split(";")[0] || "file"
    parsed.warnings.push(
      `Select ${fileName} again before sending this request.`
    )
    return {
      key,
      value: fileName,
      description: "Imported file reference",
      enabled: true,
      type: "file",
      fileName,
      fileNames: [fileName],
    }
  }
  return { key, value, description: "Imported from cURL", enabled: true }
}

function parseUrlEncodedRow(item: string): KeyValueRow {
  const separator = item.indexOf("=")
  return {
    key: separator < 0 ? item : item.slice(0, separator),
    value: separator < 0 ? "" : item.slice(separator + 1),
    description: "Imported from cURL",
    enabled: true,
  }
}

function addAuthAndCookieHeaders(parsed: ParsedOptions) {
  if (parsed.bearer && !getHeader(parsed.headers, "authorization")) {
    parsed.headers.push({
      key: "Authorization",
      value: `Bearer ${parsed.bearer}`,
      description: "Imported bearer token",
      enabled: true,
    })
  } else if (parsed.user && !getHeader(parsed.headers, "authorization")) {
    parsed.headers.push({
      key: "Authorization",
      value: `Basic ${encodeBase64(parsed.user)}`,
      description: "Imported basic authentication",
      enabled: true,
    })
  }
  if (parsed.cookies.length && !getHeader(parsed.headers, "cookie")) {
    parsed.headers.push({
      key: "Cookie",
      value: parsed.cookies.join("; "),
      description: "Imported cookies",
      enabled: true,
    })
  }
}

function bodyToQueryRows(body: RequestBodyDraft) {
  if (body.mode === "x-www-form-urlencoded") return body.urlEncodedRows ?? []
  if (body.mode !== "raw") return []
  return Array.from(new URLSearchParams(body.value).entries()).map(
    ([key, value]) => ({
      key,
      value,
      description: "Imported from cURL data",
      enabled: true,
      location: "query",
    })
  )
}

function getHeader(headers: KeyValueRow[], name: string) {
  return headers.find(
    (header) => header.key.toLowerCase() === name.toLowerCase()
  )?.value
}

function ensureHeader(headers: KeyValueRow[], key: string, value: string) {
  if (!getHeader(headers, key)) {
    headers.push({
      key,
      value,
      description: "Imported from cURL",
      enabled: true,
    })
  }
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function createCurlRequestName(method: string, url: string) {
  const parsed = new URL(url)
  const path = parsed.pathname === "/" ? parsed.hostname : parsed.pathname
  return `${method} ${path}`
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}
