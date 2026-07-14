import { mkdir, readFile, writeFile } from "node:fs/promises"
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
  .replace("export function skaperUI", "function skaperUI")
  .replace(
    "export default skaperUI",
    "module.exports = skaperUI\nmodule.exports.skaperUI = skaperUI"
  )

await writeFile(resolve(outputDirectory, "index.js"), serverModule)
await writeFile(resolve(outputDirectory, "index.cjs"), commonJsModule)
