import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import * as schema from "./schema";

// Default to <cwd>/data; allow an override so out-of-tree entry points (e.g. the
// PostToolUse session-log hook, which runs with cwd = the user's project) can
// point at the NirmiqLearn install's data dir.
const DATA_DIR = process.env.NIRMIQ_DATA_DIR
  ? path.resolve(process.env.NIRMIQ_DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "nirmiqlearn.db");

mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
