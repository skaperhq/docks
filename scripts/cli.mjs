#!/usr/bin/env node

import { createHash } from "node:crypto"
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import {
  buildKnowledge,
  createKnowledgeExplainOutput,
  createKnowledgePathOutput,
  createKnowledgeQueryOutput,
  explainKnowledgeNode,
  findKnowledgePath,
  knowledgeStatus,
  loadLocalGraph,
  openKnowledgeDatabase,
  queryKnowledge,
  readDocksConfig,
  runUpstreamAction,
  writeDocksConfig,
} from "./knowledge-runtime.mjs"
import { migrateDocksPostgres } from "./postgres-runtime.mjs"

const runtimeDirectory = dirname(fileURLToPath(import.meta.url))
const [command, ...commandArguments] = process.argv.slice(2)

try {
  if (!command || command === "--help" || command === "-h") {
    printHelp()
    process.exit(command ? 0 : 1)
  }
  if (command === "install" || command === "uninstall") {
    await runInstaller(command, commandArguments)
  } else if (command === "db") {
    await runDatabaseCommand(commandArguments)
  } else if (command === "knowledge") {
    await runKnowledgeCommand(commandArguments)
  } else if (command === "actions") {
    await configureActions(commandArguments)
  } else if (command === "action") {
    await runActionCommand(commandArguments)
  } else {
    throw new Error(`Unknown command: ${command}`)
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

async function runInstaller(mode, values) {
  const parsed = parseOptions(values, {
    flags: new Set(["global", "force"]),
  })
  if (parsed.positionals.length)
    throw new Error(
      `Usage: docks ${mode} [--global]${mode === "install" ? " [--force]" : ""}`
    )
  const global = parsed.flags.has("global")
  const target = global
    ? join(homedir(), ".agents", "skills", "docks")
    : join(process.cwd(), ".agents", "skills", "docks")
  if (mode === "uninstall") {
    await rm(target, { recursive: true, force: true })
    process.stdout.write(`Removed Docks skill from ${target}\n`)
    return
  }

  const source = await resolveSkillSource()
  const sourceHashes = await hashDirectory(source)
  const existingStamp = await readJson(join(target, ".docks-version.json"))
  if (await pathExists(target)) {
    const unmodified =
      existingStamp && (await hashesMatch(target, existingStamp.files))
    if (!unmodified && !parsed.flags.has("force")) {
      throw new Error(
        `Refusing to overwrite modified skill files in ${target}. Pass --force to replace them.`
      )
    }
    if (unmodified && sameHashes(existingStamp.files, sourceHashes)) {
      process.stdout.write(`Docks skill is already installed at ${target}\n`)
      if (!global) await ensureProjectConfig()
      return
    }
  }

  await mkdir(dirname(target), { recursive: true })
  const temporaryRoot = await mkdtemp(join(dirname(target), ".docks-install-"))
  const temporary = join(temporaryRoot, "docks")
  await cp(source, temporary, { recursive: true })
  await writeFile(
    join(temporary, ".docks-version.json"),
    `${JSON.stringify({ version: await packageVersion(), files: sourceHashes }, null, 2)}\n`
  )
  const backup = `${target}.previous`
  await rm(backup, { recursive: true, force: true })
  if (await pathExists(target)) await rename(target, backup)
  try {
    await rename(temporary, target)
    await rm(backup, { recursive: true, force: true })
    await rm(temporaryRoot, { recursive: true, force: true })
  } catch (error) {
    if (await pathExists(backup)) await rename(backup, target).catch(() => {})
    await rm(temporaryRoot, { recursive: true, force: true })
    throw error
  }
  if (!global) await ensureProjectConfig()
  process.stdout.write(`Installed Docks skill at ${target}\n`)
}

async function runKnowledgeCommand(values) {
  const [subcommand, ...rest] = values
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printKnowledgeHelp()
    return
  }
  const valueOptions = new Set(["workspace", "url"])
  const parsed = parseOptions(rest, {
    flags: new Set(["include-response-bodies"]),
    values: valueOptions,
  })
  await tryLoadDotEnv()
  let config = await readDocksConfig()
  if (parsed.values.url) {
    config.url = parsed.values.url
    config = await writeDocksConfig(config)
  }
  const pool = await openKnowledgeDatabase(config)
  try {
    const workspaceId = parsed.values.workspace
    if (subcommand === "status") {
      assertPositionals(parsed, 0)
      const initialStatus = await knowledgeStatus({
        pool,
        config,
        workspaceId,
        includeResponseBodies: parsed.flags.has("include-response-bodies"),
      })
      if (initialStatus.stale) {
        await buildKnowledge({
          pool,
          config,
          workspaceId,
          includeResponseBodies: parsed.flags.has("include-response-bodies"),
        })
      }
      const status = initialStatus.stale
        ? await knowledgeStatus({
            pool,
            config,
            workspaceId,
            includeResponseBodies: parsed.flags.has(
              "include-response-bodies"
            ),
          })
        : initialStatus
      process.stdout.write(
        `${JSON.stringify(
          {
            ...status,
            stale: false,
            refreshed: initialStatus.stale,
            previousDocumentHash:
              initialStatus.manifest?.documentHash ?? null,
          },
          null,
          2
        )}\n`
      )
      return
    }
    if (subcommand === "build") {
      assertPositionals(parsed, 0)
      const result = await buildKnowledge({
        pool,
        config,
        workspaceId,
        includeResponseBodies: parsed.flags.has("include-response-bodies"),
      })
      process.stdout.write(
        `Built ${result.graph.nodes.length} nodes and ${result.graph.edges.length} edges in ${result.output}\n`
      )
      return
    }
    if (!["query", "explain", "path"].includes(subcommand)) {
      throw new Error(`Unknown knowledge command: ${subcommand}`)
    }
    const expected = subcommand === "path" ? 2 : 1
    assertPositionals(parsed, expected)
    const graph = await loadFreshGraph(pool, config, workspaceId)
    const result =
      subcommand === "query"
        ? createKnowledgeQueryOutput(
            graph,
            parsed.positionals[0],
            queryKnowledge(graph, parsed.positionals[0], 8)
          )
        : subcommand === "explain"
          ? createKnowledgeExplainOutput(
              graph,
              explainKnowledgeNode(graph, parsed.positionals[0])
            )
          : createKnowledgePathOutput(
              findKnowledgePath(
                graph,
                parsed.positionals[0],
                parsed.positionals[1]
              )
            )
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await pool?.end().catch(() => {})
  }
}

async function configureActions(values) {
  const [subcommand, ...rest] = values
  if (subcommand !== "configure")
    throw new Error("Usage: docks actions configure [options]")
  const parsed = parseOptions(rest, {
    repeated: new Set([
      "allow-origin",
      "allow-method",
      "allow-operation",
      "header-env",
    ]),
    values: new Set([
      "database-url-env",
      "workspace",
      "knowledge-output",
      "timeout",
      "max-response-bytes",
    ]),
  })
  assertPositionals(parsed, 0)
  const config = await readDocksConfig()
  if (parsed.values["database-url-env"])
    config.databaseUrlEnv = parsed.values["database-url-env"]
  if (parsed.values.workspace) config.workspaceId = parsed.values.workspace
  if (parsed.values["knowledge-output"])
    config.knowledgeOutput = parsed.values["knowledge-output"]
  if (parsed.repeated["allow-origin"].length)
    config.actions.allowedOrigins = parsed.repeated["allow-origin"]
  if (parsed.repeated["allow-method"].length)
    config.actions.allowedMethods = parsed.repeated["allow-method"]
  if (parsed.repeated["allow-operation"].length)
    config.actions.allowedOperations = parsed.repeated["allow-operation"]
  for (const mapping of parsed.repeated["header-env"]) {
    const [header, environment] = parseMapping(mapping, "--header-env")
    config.actions.headerEnvironment[header] = environment
  }
  if (parsed.values.timeout)
    config.actions.timeoutMs = positiveInteger(
      parsed.values.timeout,
      "--timeout"
    )
  if (parsed.values["max-response-bytes"]) {
    config.actions.maxResponseBytes = positiveInteger(
      parsed.values["max-response-bytes"],
      "--max-response-bytes"
    )
  }
  const written = await writeDocksConfig(config)
  process.stdout.write(`${JSON.stringify(written, null, 2)}\n`)
}

async function runActionCommand(values) {
  const [subcommand, selector, ...rest] = values
  if (subcommand !== "run" || !selector)
    throw new Error("Usage: docks action run <operation> [options]")
  const parsed = parseOptions(rest, {
    flags: new Set(["confirmed-write", "save-response"]),
    values: new Set([
      "workspace",
      "parameters-json",
      "body-file",
      "content-type",
    ]),
  })
  assertPositionals(parsed, 0)
  await tryLoadDotEnv()
  const config = await readDocksConfig()
  const pool = await openKnowledgeDatabase(config)
  try {
    const workspaceId = parsed.values.workspace ?? config.workspaceId
    const graph = await loadFreshGraph(pool, config, workspaceId)
    const resolvedWorkspace = (
      await knowledgeStatus({ pool, config, workspaceId })
    ).workspace.id
    const parameters = parsed.values["parameters-json"]
      ? JSON.parse(parsed.values["parameters-json"])
      : {}
    const body = parsed.values["body-file"]
      ? await readFile(resolve(parsed.values["body-file"]), "utf8")
      : undefined
    const result = await runUpstreamAction({
      graph,
      config,
      selector,
      parameters,
      body,
      contentType: parsed.values["content-type"],
      confirmedWrite: parsed.flags.has("confirmed-write"),
      saveResponse: parsed.flags.has("save-response"),
      pool,
      workspaceId: resolvedWorkspace,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await pool?.end().catch(() => {})
  }
}

async function runDatabaseCommand(values) {
  const [subcommand, ...rest] = values
  if (subcommand !== "migrate")
    throw new Error("Usage: docks db migrate [options]")
  const parsed = parseOptions(rest, {
    flags: new Set(["dry-run", "ssl-no-verify"]),
    values: new Set(["database-url-env"]),
  })
  assertPositionals(parsed, 0)
  if (parsed.flags.has("dry-run")) {
    const result = await migrateDocksPostgres({
      client: { query() {} },
      dryRun: true,
    })
    process.stdout.write(`${result.sql.trim()}\n`)
    return
  }
  await tryLoadDotEnv()
  const environmentName = parsed.values["database-url-env"] ?? "DATABASE_URL"
  const connectionString = process.env[environmentName]
  if (!connectionString)
    throw new Error(`Missing PostgreSQL URL in ${environmentName}.`)
  const result = await migrateDocksPostgres({
    connectionString,
    sslNoVerify: parsed.flags.has("ssl-no-verify"),
  })
  process.stdout.write(
    result.applied.length
      ? `Applied: ${result.applied.join(", ")}\n`
      : "Docks database is already up to date.\n"
  )
}

async function loadFreshGraph(pool, config, workspaceId) {
  const status = await knowledgeStatus({ pool, config, workspaceId })
  if (status.stale) await buildKnowledge({ pool, config, workspaceId })
  return loadLocalGraph(config)
}

function parseOptions(values, schema = {}) {
  const result = { positionals: [], flags: new Set(), values: {}, repeated: {} }
  for (const name of schema.repeated ?? []) result.repeated[name] = []
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith("--")) {
      result.positionals.push(value)
      continue
    }
    const name = value.slice(2)
    if (schema.flags?.has(name)) {
      result.flags.add(name)
      continue
    }
    if (schema.values?.has(name) || schema.repeated?.has(name)) {
      const next = values[index + 1]
      if (!next || next.startsWith("--"))
        throw new Error(`${value} requires a value.`)
      index += 1
      if (schema.repeated?.has(name)) result.repeated[name].push(next)
      else result.values[name] = next
      continue
    }
    throw new Error(`Unknown option: ${value}`)
  }
  return result
}

async function resolveSkillSource() {
  const candidates = [
    join(runtimeDirectory, "agent-skill", "docks"),
    resolve(runtimeDirectory, "../agent-skill/docks"),
  ]
  for (const candidate of candidates) {
    if (await pathExists(join(candidate, "SKILL.md"))) return candidate
  }
  throw new Error("The packaged Docks skill files are missing.")
}

async function ensureProjectConfig() {
  const path = join(process.cwd(), ".docks", "config.json")
  if (!(await pathExists(path))) await writeDocksConfig(await readDocksConfig())
}

async function hashDirectory(root) {
  const hashes = {}
  for (const path of await walk(root)) {
    const name = path.slice(root.length + 1)
    hashes[name] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex")
  }
  return hashes
}

async function hashesMatch(root, expected = {}) {
  for (const [name, hash] of Object.entries(expected)) {
    try {
      const actual = createHash("sha256")
        .update(await readFile(join(root, name)))
        .digest("hex")
      if (actual !== hash) return false
    } catch {
      return false
    }
  }
  const actualNames = (await walk(root))
    .map((path) => path.slice(root.length + 1))
    .filter((name) => name !== ".docks-version.json")
  return actualNames.length === Object.keys(expected).length
}

async function walk(root) {
  const paths = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) paths.push(...(await walk(path)))
    else paths.push(path)
  }
  return paths.sort()
}

function sameHashes(left = {}, right = {}) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function packageVersion() {
  for (const path of [
    resolve(runtimeDirectory, "../package.json"),
    resolve(runtimeDirectory, "../../package.json"),
  ]) {
    const value = await readJson(path)
    if (value?.version) return value.version
  }
  return "0.0.0"
}

async function tryLoadDotEnv() {
  try {
    for (const line of (
      await readFile(join(process.cwd(), ".env"), "utf8")
    ).split("\n")) {
      let value = line.trim()
      if (!value || value.startsWith("#")) continue
      if (value.startsWith("export ")) value = value.slice(7).trim()
      const separator = value.indexOf("=")
      if (separator <= 0) continue
      const name = value.slice(0, separator).trim()
      let content = value.slice(separator + 1).trim()
      if (
        (content.startsWith('"') && content.endsWith('"')) ||
        (content.startsWith("'") && content.endsWith("'"))
      ) {
        content = content.slice(1, -1)
      }
      if (!process.env[name]) process.env[name] = content
    }
  } catch {}
}

function parseMapping(value, option) {
  const separator = value.indexOf("=")
  if (separator <= 0 || separator === value.length - 1)
    throw new Error(`${option} expects header=ENV_NAME.`)
  return [value.slice(0, separator).trim(), value.slice(separator + 1).trim()]
}

function positiveInteger(value, option) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${option} must be a positive integer.`)
  return parsed
}

function assertPositionals(parsed, count) {
  if (parsed.positionals.length !== count)
    throw new Error(
      `Expected ${count} positional argument${count === 1 ? "" : "s"}.`
    )
}

async function pathExists(path) {
  try {
    const value = await stat(path)
    return value.isDirectory() || value.isFile()
  } catch {
    return false
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return null
  }
}

function printHelp() {
  process.stdout.write(
    `Docks\n\nUsage:\n  docks install [--global] [--force]\n  docks uninstall [--global]\n  docks knowledge status|build|query|explain|path ...\n  docks actions configure [options]\n  docks action run <operation> [options]\n  docks db migrate [options]\n`
  )
}

function printKnowledgeHelp() {
  process.stdout.write(
    `Docks knowledge\n\nUsage:\n  docks knowledge status [--workspace ID] [--url SOURCE]\n  docks knowledge build [--workspace ID] [--url SOURCE] [--include-response-bodies]\n  docks knowledge query <question> [--workspace ID] [--url SOURCE]\n  docks knowledge explain <node> [--workspace ID] [--url SOURCE]\n  docks knowledge path <from> <to> [--workspace ID] [--url SOURCE]\n\nSOURCE may be an HTTP(S) URL or a project-local JSON/YAML file. Passing --url saves it in .docks/config.json. PostgreSQL is optional.\n`
  )
}

function fail(message) {
  process.stderr.write(`docks: ${message}\n`)
  process.exitCode = 1
}
