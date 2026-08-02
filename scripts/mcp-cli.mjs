#!/usr/bin/env node

import { createServer } from "node:http"
import { spawn } from "node:child_process"
import process from "node:process"
import { createSkaperMcp } from "./mcp-runtime.mjs"
import { migrateSkaperPostgres } from "./postgres-runtime.mjs"

const [command, ...args] = process.argv.slice(2)

if (command === "add" || command === "connect") {
  await addToClient(args)
  process.exit(0)
}

if (command === "db") {
  try {
    await runDatabaseCommand(args)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  process.exit(0)
}

if (command === "--help" || command === "-h" || !command) {
  printHelp()
  process.exit(command ? 0 : 1)
}

if (command !== "mcp") {
  fail(`Unknown command: ${command}`)
}

const parsed = parseArguments(args)
const source = parsed.positionals[0]
if (!source) fail("skaper mcp requires an OpenAPI URL or file path.")
if (parsed.positionals.length > 1)
  fail("skaper mcp accepts exactly one OpenAPI source.")

const transport = parsed.values.transport ?? "stdio"
if (transport !== "stdio" && transport !== "http") {
  fail("--transport must be stdio or http.")
}

const host = parsed.values.host ?? "127.0.0.1"
const port = parsePositiveInteger(parsed.values.port ?? "3210", "--port")
const path = normalizePath(parsed.values.path ?? "/mcp")
const token = readConfiguredSecret(
  parsed.values["mcp-token-env"],
  "--mcp-token-env"
)

if (
  transport === "http" &&
  !isLoopbackHost(host) &&
  !token &&
  parsed.flags.has("allow-unauthenticated") === false
) {
  fail(
    "Refusing to bind an unauthenticated MCP server outside loopback. Configure --mcp-token-env or explicitly pass --allow-unauthenticated."
  )
}

const apiHeaders = Object.fromEntries(
  parsed.repeated["api-header-env"].map((mapping) =>
    readHeaderEnvironmentMapping(mapping, "--api-header-env")
  )
)
const openapiHeaders = Object.fromEntries(
  parsed.repeated["spec-header-env"].map((mapping) =>
    readHeaderEnvironmentMapping(mapping, "--spec-header-env")
  )
)
const forward = Object.fromEntries(
  parsed.repeated["forward-header"].map((mapping) =>
    parseMapping(mapping, "--forward-header")
  )
)
const allowedMethods = parsed.repeated["allow-method"].length
  ? parsed.repeated["allow-method"]
  : undefined
const allowedOperations = parsed.repeated["allow-operation"]
const allowedOrigins = parsed.repeated["allow-origin"]
const allowedHosts = buildAllowedHosts(host, port)

let mcp
try {
  mcp = await createSkaperMcp({
    openapi: source,
    ...(parsed.values["base-url"]
      ? { baseUrl: parsed.values["base-url"] }
      : {}),
    ...(Object.keys(openapiHeaders).length ? { openapiHeaders } : {}),
    ...(Object.keys(apiHeaders).length ? { apiHeaders } : {}),
    ...(Object.keys(forward).length ? { clientHeaders: { forward } } : {}),
    ...(token ? { mcpBearerToken: token } : {}),
    ...(transport === "http" ? { allowedHosts } : {}),
    execution: {
      ...(allowedMethods ? { allowedMethods } : {}),
      allowedOperations,
      allowedOrigins,
      ...(parsed.values.timeout
        ? {
            timeoutMs: parsePositiveInteger(parsed.values.timeout, "--timeout"),
          }
        : {}),
      ...(parsed.values["max-response-bytes"]
        ? {
            maxResponseBytes: parsePositiveInteger(
              parsed.values["max-response-bytes"],
              "--max-response-bytes"
            ),
          }
        : {}),
    },
  })
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

if (transport === "stdio") {
  await mcp.connectStdio()
} else {
  const server = createServer(async (request, response) => {
    const pathname = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? host}`
    ).pathname
    if (pathname !== path) {
      response.statusCode = pathname === "/health" ? 200 : 404
      response.setHeader("content-type", "application/json; charset=utf-8")
      response.end(
        JSON.stringify(
          pathname === "/health" ? { status: "ok" } : { error: "Not found" }
        )
      )
      return
    }
    await mcp.nodeHandler(request, response)
  })
  server.listen(port, host, () => {
    process.stderr.write(
      `Skaper MCP listening on http://${host}:${port}${path}\n`
    )
  })
  const shutdown = async () => {
    server.close()
    await mcp.close()
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

function parseArguments(values) {
  const positionals = []
  const parsedValues = {}
  const flags = new Set()
  const repeated = {
    "allow-method": [],
    "allow-operation": [],
    "allow-origin": [],
    "api-header-env": [],
    "forward-header": [],
    "spec-header-env": [],
  }
  const valueOptions = new Set([
    "base-url",
    "host",
    "max-response-bytes",
    "mcp-token-env",
    "path",
    "port",
    "timeout",
    "transport",
  ])

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === "--help" || value === "-h") {
      printMcpHelp()
      process.exit(0)
    }
    if (!value.startsWith("--")) {
      positionals.push(value)
      continue
    }
    const name = value.slice(2)
    if (name === "allow-unauthenticated") {
      flags.add(name)
      continue
    }
    if (name in repeated || valueOptions.has(name)) {
      const next = values[index + 1]
      if (!next || next.startsWith("--")) fail(`${value} requires a value.`)
      index += 1
      if (name in repeated) repeated[name].push(next)
      else parsedValues[name] = next
      continue
    }
    fail(`Unknown option: ${value}`)
  }

  return { positionals, values: parsedValues, flags, repeated }
}

function readHeaderEnvironmentMapping(value, option) {
  const [headerName, environmentName] = parseMapping(value, option)
  const headerValue = process.env[environmentName]
  if (!headerValue)
    fail(
      `${option} references missing environment variable ${environmentName}.`
    )
  return [headerName, headerValue]
}

function readConfiguredSecret(environmentName, option) {
  if (!environmentName) return undefined
  const value = process.env[environmentName]
  if (!value)
    fail(
      `${option} references missing environment variable ${environmentName}.`
    )
  return value
}

function parseMapping(value, option) {
  const separator = value.indexOf("=")
  if (separator <= 0 || separator === value.length - 1) {
    fail(`${option} expects source=target.`)
  }
  return [value.slice(0, separator).trim(), value.slice(separator + 1).trim()]
}

function parsePositiveInteger(value, option) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0)
    fail(`${option} must be a positive integer.`)
  return parsed
}

async function runDatabaseCommand(values) {
  if (values.includes("--help") || values.includes("-h")) {
    printDatabaseHelp()
    return
  }
  const [subcommand, ...options] = values
  if (subcommand !== "migrate") {
    fail("Usage: skaper db migrate [options]")
  }
  let environmentName = "DATABASE_URL"
  let dryRun = false
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]
    if (option === "--dry-run") {
      dryRun = true
      continue
    }
    if (option === "--database-url-env") {
      const next = options[index + 1]
      if (!next || next.startsWith("--")) fail(`${option} requires a value.`)
      environmentName = next
      index += 1
      continue
    }
    fail(`Unknown option: ${option}`)
  }

  if (dryRun) {
    const result = await migrateSkaperPostgres({
      client: { query() {} },
      dryRun: true,
    })
    process.stdout.write(`${result.sql.trim()}\n`)
    return
  }

  const connectionString = process.env[environmentName]
  if (!connectionString) {
    fail(`Missing PostgreSQL connection string in ${environmentName}.`)
  }
  const pg = await import("pg")
  const pool = new pg.Pool({ connectionString })
  try {
    const result = await migrateSkaperPostgres({ client: pool })
    process.stdout.write(
      result.applied.length
        ? `Applied Skaper migrations: ${result.applied.join(", ")}\n`
        : "Skaper database is already up to date.\n"
    )
  } finally {
    await pool.end()
  }
}

function normalizePath(value) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    fail("--path must be an absolute path without a query or fragment.")
  }
  return value
}

function isLoopbackHost(value) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "")
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1"
  )
}

function buildAllowedHosts(host, port) {
  const hosts = new Set([host, `${host}:${port}`])
  if (isLoopbackHost(host)) {
    hosts.add("localhost")
    hosts.add(`localhost:${port}`)
    hosts.add("127.0.0.1")
    hosts.add(`127.0.0.1:${port}`)
  }
  return [...hosts]
}

async function addToClient(values) {
  if (values.includes("--help") || values.includes("-h")) {
    printAddHelp()
    return
  }

  const positionals = []
  let name = "skaper-api"
  let dryRun = false

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === "--dry-run") {
      dryRun = true
      continue
    }
    if (value === "--name") {
      const next = values[index + 1]
      if (!next || next.startsWith("--")) fail("--name requires a value.")
      name = next.trim()
      index += 1
      continue
    }
    if (value.startsWith("--")) fail(`Unknown option: ${value}`)
    positionals.push(value)
  }

  const [client, endpoint] = positionals
  if (!client || !endpoint || positionals.length !== 2) {
    fail("Usage: skaper add vscode <mcp-url> [--name <name>]")
  }
  if (client.toLowerCase() !== "vscode") {
    fail(`Unsupported client: ${client}. Currently supported: vscode.`)
  }
  if (!name || /[\u0000-\u001f\u007f]/.test(name)) {
    fail("--name must be a non-empty name without control characters.")
  }

  const url = parseMcpUrl(endpoint)
  const definition = {
    name,
    type: "http",
    url: url.href,
  }
  const serialized = JSON.stringify(definition)

  if (dryRun) {
    process.stdout.write(
      `VS Code MCP definition:\n${JSON.stringify(definition, null, 2)}\n\nCommand:\ncode --add-mcp ${JSON.stringify(serialized)}\n`
    )
    return
  }

  const candidates = vscodeCommandCandidates()
  for (const candidate of candidates) {
    const result = await runCommand(candidate, ["--add-mcp", serialized])
    if (result.missing) continue
    if (result.code !== 0) {
      fail(`VS Code exited with status ${result.code}.`)
    }
    process.stdout.write(
      `Added ${JSON.stringify(name)} to VS Code using ${url.href}\n` +
        "Open VS Code Chat and confirm the MCP server trust prompt to start it.\n"
    )
    return
  }

  fail(
    "Could not find the VS Code command-line launcher. In VS Code, run “Shell Command: Install 'code' command in PATH”, then run this command again."
  )
}

function parseMcpUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    fail("The MCP URL must be a valid absolute HTTP(S) URL.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail("The MCP URL must use http or https.")
  }
  if (url.username || url.password) {
    fail("Do not put credentials in the MCP URL.")
  }
  return url
}

function vscodeCommandCandidates() {
  if (process.env.SKAPER_VSCODE_COMMAND) {
    return [process.env.SKAPER_VSCODE_COMMAND]
  }
  return process.platform === "darwin"
    ? [
        "code",
        "code-insiders",
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
      ]
    : ["code", "code-insiders"]
}

function runCommand(commandName, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(commandName, commandArgs, { stdio: "inherit" })
    child.once("error", (error) => {
      resolve({ missing: error.code === "ENOENT", code: 1 })
    })
    child.once("exit", (code) => {
      resolve({ missing: false, code: code ?? 1 })
    })
  })
}

function printHelp() {
  process.stdout.write(
    `Skaper\n\nUsage:\n  skaper add vscode <mcp-url> [options]\n  skaper mcp <openapi-url-or-file> [options]\n  skaper db migrate [options]\n\nRun a command with --help for its options.\n`
  )
}

function printAddHelp() {
  process.stdout.write(
    `Add a hosted Skaper MCP server to an agent client.\n\nUsage:\n  skaper add vscode <mcp-url> [options]\n\nOptions:\n  --name <name>  MCP server name (default: skaper-api)\n  --dry-run      Print the VS Code definition without installing it\n`
  )
}

function printMcpHelp() {
  process.stdout.write(
    `Skaper MCP\n\nUsage:\n  skaper mcp <openapi-url-or-file> [options]\n\nOptions:\n  --transport <stdio|http>       Transport (default: stdio)\n  --host <host>                  HTTP host (default: 127.0.0.1)\n  --port <port>                  HTTP port (default: 3210)\n  --path <path>                  MCP route (default: /mcp)\n  --base-url <url>               Override the OpenAPI server URL\n  --mcp-token-env <name>         Read the MCP bearer token from an environment variable\n  --forward-header <from=to>     Allow and optionally rename a client header\n  --api-header-env <name=env>    Read an upstream API header from an environment variable\n  --spec-header-env <name=env>   Read an OpenAPI-fetch header from an environment variable\n  --allow-method <method>        Allow an HTTP method (repeatable)\n  --allow-operation <id>         Allow an operationId or canonical key (repeatable)\n  --allow-origin <origin>        Allow an exact custom API origin (repeatable)\n  --timeout <milliseconds>       Upstream timeout (default: 30000)\n  --max-response-bytes <bytes>   Response limit (default: 1048576)\n  --allow-unauthenticated        Permit a non-loopback HTTP server without a token\n`
  )
}

function printDatabaseHelp() {
  process.stdout.write(
    `Skaper PostgreSQL migrations\n\nUsage:\n  skaper db migrate [options]\n\nOptions:\n  --database-url-env <name>  Connection-string environment variable (default: DATABASE_URL)\n  --dry-run                  Print the qualified Skaper SQL without connecting\n`
  )
}

function fail(message) {
  process.stderr.write(`skaper: ${message}\n`)
  process.exit(1)
}
