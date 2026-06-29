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
`)
