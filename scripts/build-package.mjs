import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const uiScript = await readFile(resolve(root, "dist/ui/ui.js"), "utf8")
const uiStyles = await readFile(resolve(root, "dist/ui/styles.css"), "utf8")
const runtime = await readFile(
  resolve(root, "scripts/server-runtime.mjs"),
  "utf8"
)
const outputDirectory = resolve(root, "dist/package")

if (uiScript.includes("process.env")) {
  throw new Error(
    "The browser bundle contains an unresolved process.env reference."
  )
}

await mkdir(outputDirectory, { recursive: true })

const safeScript = uiScript.replaceAll("</script", "<\\/script")
const safeStyles = uiStyles.replaceAll("</style", "<\\/style")
const serverModule = runtime
  .replace(
    "const UI_SCRIPT = null",
    `const UI_SCRIPT = ${JSON.stringify(safeScript)}`
  )
  .replace(
    "const UI_STYLES = null",
    `const UI_STYLES = ${JSON.stringify(safeStyles)}`
  )
const commonJsModule = serverModule
  .replace(
    'import { randomBytes } from "node:crypto"',
    'const { randomBytes } = require("node:crypto")'
  )
  .replace(
    'import { lookup } from "node:dns/promises"',
    'const { lookup } = require("node:dns/promises")'
  )
  .replace(
    'import { isIP } from "node:net"',
    'const { isIP } = require("node:net")'
  )
  .replace(
    'import { Readable } from "node:stream"',
    'const { Readable } = require("node:stream")'
  )
  .replace(
    'import { WebSocket as NodeWebSocket, WebSocketServer } from "ws"',
    'const { WebSocket: NodeWebSocket, WebSocketServer } = require("ws")'
  )
  .replace("export function createDocksRelay", "function createDocksRelay")
  .replace("export function docksUI", "function docksUI")
  .replace(
    "export default docksUI",
    "module.exports = docksUI\nmodule.exports.docksUI = docksUI\nmodule.exports.createDocksRelay = createDocksRelay"
  )

await writeFile(resolve(outputDirectory, "index.js"), serverModule)
await writeFile(resolve(outputDirectory, "index.cjs"), commonJsModule)

await copyFile(
  resolve(root, "scripts/mcp-runtime.mjs"),
  resolve(outputDirectory, "mcp.js")
)
await copyFile(
  resolve(root, "scripts/postgres-runtime.mjs"),
  resolve(outputDirectory, "postgres.js")
)
await mkdir(resolve(outputDirectory, "migrations"), { recursive: true })
await copyFile(
  resolve(root, "migrations/0001_initial.sql"),
  resolve(outputDirectory, "migrations/0001_initial.sql")
)
await copyFile(
  resolve(root, "migrations/0002_custom_request_folders.sql"),
  resolve(outputDirectory, "migrations/0002_custom_request_folders.sql")
)
const mcpCli = await readFile(resolve(root, "scripts/mcp-cli.mjs"), "utf8")
await writeFile(
  resolve(outputDirectory, "cli.js"),
  mcpCli
    .replace('from "./mcp-runtime.mjs"', 'from "./mcp.js"')
    .replace('from "./postgres-runtime.mjs"', 'from "./postgres.js"')
)
await writeFile(
  resolve(outputDirectory, "mcp.cjs"),
  `"use strict"\n\nexports.createDocksMcp = async function createDocksMcp(options) {\n  const runtime = await import("./mcp.js")\n  return runtime.createDocksMcp(options)\n}\n`
)
await writeFile(
  resolve(outputDirectory, "postgres.cjs"),
  `"use strict"\n\nexports.createDocksPostgres = async function createDocksPostgres(options) {\n  const runtime = await import("./postgres.js")\n  return runtime.createDocksPostgres(options)\n}\n\nexports.createPostgresStorageAdapter = async function createPostgresStorageAdapter(options) {\n  const runtime = await import("./postgres.js")\n  return runtime.createPostgresStorageAdapter(options)\n}\n\nexports.migrateDocksPostgres = async function migrateDocksPostgres(options) {\n  const runtime = await import("./postgres.js")\n  return runtime.migrateDocksPostgres(options)\n}\n`
)
await chmod(resolve(outputDirectory, "cli.js"), 0o755)
