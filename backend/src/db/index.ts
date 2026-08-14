import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

const dbDir = path.dirname(path.resolve(config.databasePath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(path.resolve(config.databasePath));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function runMigrations(): void {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);
}

runMigrations();
