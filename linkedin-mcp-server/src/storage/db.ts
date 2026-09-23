import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations.js";

/** Opens (creating parent directories as needed) and migrates the SQLite database. */
export function openDatabase(databasePath: string): Database.Database {
  const absolutePath = resolve(databasePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const db = new Database(absolutePath);
  applyMigrations(db);
  return db;
}
