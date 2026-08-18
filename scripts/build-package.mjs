import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
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

await rm(outputDirectory, { recursive: true, force: true })
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

const esmServerModule = serverModule.replaceAll(
  '"./postgres-runtime.mjs"',
  '"./postgres.js"'
)
const cjsServerModule = commonJsModule.replaceAll(
  '"./postgres-runtime.mjs"',
  '"./postgres.js"'
)

await writeFile(resolve(outputDirectory, "index.js"), esmServerModule)
await writeFile(resolve(outputDirectory, "index.cjs"), cjsServerModule)

await copyFile(
  resolve(root, "scripts/postgres-runtime.mjs"),
  resolve(outputDirectory, "postgres.js")
)
await copyFile(
  resolve(root, "scripts/knowledge-runtime.mjs"),
  resolve(outputDirectory, "knowledge.js")
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
await copyFile(
  resolve(root, "migrations/0003_agent_knowledge.sql"),
  resolve(outputDirectory, "migrations/0003_agent_knowledge.sql")
)
const cli = await readFile(resolve(root, "scripts/cli.mjs"), "utf8")
await writeFile(
  resolve(outputDirectory, "cli.js"),
  cli
    .replace('from "./knowledge-runtime.mjs"', 'from "./knowledge.js"')
    .replace('from "./postgres-runtime.mjs"', 'from "./postgres.js"')
)
await cp(
  resolve(root, "agent-skill/docks"),
  resolve(outputDirectory, "agent-skill/docks"),
  { recursive: true }
)
await chmod(resolve(outputDirectory, "cli.js"), 0o755)
