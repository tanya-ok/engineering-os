// SQLite storage: sqlite-vec for vectors, FTS5 for lexical search.
// FTS uses the trigram tokenizer when the bundled SQLite supports it (needed
// for usable Cyrillic lexical search); otherwise unicode61, with the active
// mode recorded in meta so search can adapt its query shape.

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export type FtsMode = "trigram" | "unicode61";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    vault_id TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    mtime REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    vault_id TEXT NOT NULL,
    namespace TEXT,
    heading TEXT,
    content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_vault ON chunks(vault_id, namespace);
`;

export function open(dbPath: string): Database.Database {
  const parent = path.dirname(dbPath);
  fs.mkdirSync(parent, { recursive: true });
  const db = new Database(dbPath);
  sqliteVec.load(db);
  try {
    db.prepare("SELECT vec_version() AS v").get();
  } catch (e) {
    db.close();
    throw new Error(
      `sqlite-vec failed to load (vec_version() probe failed: ${(e as Error).message}). ` +
        "Vector search cannot work; check the sqlite-vec install for this platform.",
    );
  }
  db.pragma("foreign_keys = ON");
  return db;
}

export function getMeta(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function ensureFts(db: Database.Database): FtsMode {
  const stored = getMeta(db, "fts_mode");
  if (stored === "trigram" || stored === "unicode61") return stored;
  let mode: FtsMode = "trigram";
  try {
    db.exec(
      "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, tokenize='trigram')",
    );
  } catch {
    mode = "unicode61";
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content)");
  }
  setMeta(db, "fts_mode", mode);
  return mode;
}

export function ftsMode(db: Database.Database): FtsMode {
  const stored = getMeta(db, "fts_mode");
  return stored === "unicode61" ? "unicode61" : "trigram";
}

export function ensureSchema(db: Database.Database, dim: number, model: string): void {
  db.exec(SCHEMA);

  const storedModel = getMeta(db, "embed_model");
  if (storedModel !== undefined && storedModel !== model) {
    throw new Error(
      `index was built with model '${storedModel}', config says '${model}'. ` +
        "Run index --rebuild to reindex.",
    );
  }
  const storedDim = getMeta(db, "embed_dim");
  if (storedDim !== undefined && Number(storedDim) !== dim) {
    throw new Error(
      `index was built at dimension ${storedDim}, model now yields ${dim}. ` +
        "Run index --rebuild to reindex.",
    );
  }

  ensureFts(db);
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[${dim}])`,
  );
  setMeta(db, "embed_model", model);
  setMeta(db, "embed_dim", String(dim));
}

export function f32ToBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function bufferToF32(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}
