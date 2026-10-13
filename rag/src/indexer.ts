// Incremental indexer: mtime and chunk content determine freshness; files
// deleted on disk are pruned. Each file is embedded BEFORE
// any database mutation, and all of its row changes run in one transaction,
// so a failed embed or a crash mid-run can never leave a file marked fresh
// with its chunks missing.

import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import { chunkMarkdown } from "./chunk.js";
import { type Config, canonicalize, type VaultEntry } from "./config.js";
import { ensureSchema, f32ToBuffer } from "./db.js";
import type { Embedder } from "./embed.js";

const MTIME_EPS = 0.001;

export function needsReindex(inDb: number | undefined, mtime: number): boolean {
  if (inDb === undefined) return true;
  return Math.abs(inDb - mtime) >= MTIME_EPS;
}

export function namespaceOf(filePath: string, root: string): string {
  const rel = path.relative(root, filePath);
  const parts = rel.split(path.sep);
  return parts.length > 1 ? (parts[0] ?? "") : "";
}

function scanVault(vault: VaultEntry): Map<string, number> {
  const found = new Map<string, number>();
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (vault.excluded_dirs.includes(entry.name)) continue;
        if (vault.exclude_underscore_prefix && entry.name.startsWith("_")) continue;
        walk(full);
      } else if (entry.isFile()) {
        if (!vault.extensions.includes(path.extname(entry.name))) continue;
        try {
          found.set(full, fs.statSync(full).mtimeMs / 1000);
        } catch {
          // race with a concurrent delete: skip
        }
      }
    }
  };
  walk(vault.resolved_path);
  return found;
}

function deleteFileRows(db: Database.Database, fileId: number): void {
  const chunkIds = db.prepare("SELECT id FROM chunks WHERE file_id = ?").all(fileId) as {
    id: number;
  }[];
  const delEmb = db.prepare("DELETE FROM embeddings WHERE chunk_id = ?");
  const delFts = db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
  for (const { id } of chunkIds) {
    delEmb.run(id);
    delFts.run(id);
  }
  db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
}

export interface IndexStats {
  filesIndexed: number;
  filesPruned: number;
  chunksWritten: number;
  elapsedMs: number;
}

export async function indexAll(
  cfg: Config,
  embedder: Embedder,
  db: Database.Database,
): Promise<IndexStats> {
  const started = Date.now();
  ensureSchema(db, embedder.dim, cfg.embed_model);
  const stats: IndexStats = { filesIndexed: 0, filesPruned: 0, chunksWritten: 0, elapsedMs: 0 };

  for (const vault of cfg.vaults) {
    if (!fs.existsSync(vault.resolved_path) || !fs.statSync(vault.resolved_path).isDirectory()) {
      throw new Error("Configured vault is unavailable; index is not refreshed");
    }
    const onDisk = scanVault(vault);
    const inDb = new Map<string, number>(
      (
        db.prepare("SELECT path, mtime FROM files WHERE vault_id = ?").all(vault.vault_id) as {
          path: string;
          mtime: number;
        }[]
      ).map((r) => [r.path, r.mtime]),
    );

    for (const gone of inDb.keys()) {
      if (onDisk.has(gone)) continue;
      db.transaction(() => {
        const row = db.prepare("SELECT id FROM files WHERE path = ?").get(gone) as
          | { id: number }
          | undefined;
        if (row !== undefined) {
          deleteFileRows(db, row.id);
          db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
        }
      })();
      stats.filesPruned += 1;
    }

    for (const [filePath, mtime] of onDisk) {
      let text: string;
      try {
        text = fs.readFileSync(filePath, "utf8");
      } catch (e) {
        console.log(`[${vault.vault_id}] unreadable ${filePath}: ${(e as Error).message}`);
        continue;
      }

      const chunks = chunkMarkdown(text);
      if (!needsReindex(inDb.get(filePath), mtime)) {
        const previous = db
          .prepare(`SELECT c.heading, c.content FROM chunks c JOIN files f ON f.id = c.file_id
          WHERE f.path = ? ORDER BY c.id`)
          .all(filePath) as { heading: string; content: string }[];
        if (
          JSON.stringify(previous) ===
          JSON.stringify(chunks.map((c) => ({ heading: c.heading, content: c.content })))
        )
          continue;
      }
      // Embed first: a failure here returns before any DB mutation, so the
      // existing rows and mtime stay intact.
      const vectors = await embedder.embedPassages(chunks.map((c) => c.content));
      const namespace = namespaceOf(filePath, vault.resolved_path);

      db.transaction(() => {
        const existing = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath) as
          | { id: number }
          | undefined;
        let fileId: number;
        if (existing !== undefined) {
          deleteFileRows(db, existing.id);
          db.prepare("UPDATE files SET mtime = ? WHERE id = ?").run(mtime, existing.id);
          fileId = existing.id;
        } else {
          const res = db
            .prepare("INSERT INTO files(vault_id, path, mtime) VALUES (?, ?, ?)")
            .run(vault.vault_id, filePath, mtime);
          fileId = Number(res.lastInsertRowid);
        }
        const insChunk = db.prepare(
          "INSERT INTO chunks(file_id, vault_id, namespace, heading, content) VALUES (?, ?, ?, ?, ?)",
        );
        const insEmb = db.prepare("INSERT INTO embeddings(chunk_id, embedding) VALUES (?, ?)");
        const insFts = db.prepare("INSERT INTO chunks_fts(rowid, content) VALUES (?, ?)");
        chunks.forEach((c, i) => {
          const vec = vectors[i];
          if (vec === undefined) throw new Error(`missing vector for chunk ${i} of ${filePath}`);
          const res = insChunk.run(fileId, vault.vault_id, namespace, c.heading, c.content);
          const cid = Number(res.lastInsertRowid);
          // vec0 requires a true integer binding for its primary key
          insEmb.run(BigInt(cid), f32ToBuffer(vec));
          insFts.run(cid, c.content);
        });
      })();

      stats.filesIndexed += 1;
      stats.chunksWritten += chunks.length;
      if (chunks.length > 0) {
        console.log(
          `[${vault.vault_id}] indexed ${path.basename(filePath)} (${chunks.length} chunks)`,
        );
      }
    }
  }
  stats.elapsedMs = Date.now() - started;
  return stats;
}

// Configuration narrowing must never keep serving rows from an older wider index.
export function checkIndexScope(db: Database.Database, cfg: Config): void {
  const vaults = new Map(cfg.vaults.map((v) => [v.vault_id, v]));
  const files = db.prepare("SELECT vault_id, path FROM files").all() as {
    vault_id: string;
    path: string;
  }[];
  for (const file of files) {
    const vault = vaults.get(file.vault_id);
    if (!vault) throw new Error("Index contains an unconfigured vault; rebuild a separate index");
    const rel = path.relative(vault.resolved_path, canonicalize(file.path));
    if (rel.startsWith("..") || path.isAbsolute(rel))
      throw new Error("Index path is outside the configured vault; rebuild a separate index");
    const parts = rel.split(path.sep);
    if (
      parts
        .slice(0, -1)
        .some(
          (p) =>
            vault.excluded_dirs.includes(p) ||
            (vault.exclude_underscore_prefix && p.startsWith("_")),
        ) ||
      !vault.extensions.includes(path.extname(file.path))
    )
      throw new Error("Index contains an excluded file; refresh before serving");
  }
}
