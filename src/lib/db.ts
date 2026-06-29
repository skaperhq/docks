import Database from "better-sqlite3"
import path from "node:path"

if (typeof window !== "undefined") {
  throw new Error("This module must only be imported on the server.")
}

const DB_PATH = path.resolve(process.cwd(), "sqlite.db")
export const db = new Database(DB_PATH)

// Enable WAL mode for concurrent performance
db.pragma("journal_mode = WAL")

// Create tables if they do not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment_variables (
    id TEXT PRIMARY KEY,
    environment_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_secret INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    FOREIGN KEY(environment_id) REFERENCES environments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS api_request_tabs (
    operation_id TEXT PRIMARY KEY,
    request_tab TEXT NOT NULL DEFAULT 'Docs',
    draft_json TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_workspace_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS saved_responses (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    status INTEGER NOT NULL,
    ok INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)
