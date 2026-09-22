#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { migrateDocksPostgres } from "./postgres-runtime.mjs"

const [command, ...commandArguments] = process.argv.slice(2)

try {
  if (!command || command === "--help" || command === "-h") {
    printHelp()
    process.exit(command ? 0 : 1)
  }
  if (command === "db") {
    await runDatabaseCommand(commandArguments)
  } else {
    throw new Error(`Unknown command: ${command}`)
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
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

function assertPositionals(parsed, count) {
  if (parsed.positionals.length !== count)
    throw new Error(
      `Expected ${count} positional argument${count === 1 ? "" : "s"}.`
    )
}

function printHelp() {
  process.stdout.write(`Docks\n\nUsage:\n  docks db migrate [options]\n`)
}

function fail(message) {
  process.stderr.write(`docks: ${message}\n`)
  process.exitCode = 1
}
