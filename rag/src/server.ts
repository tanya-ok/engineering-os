// Search server: /health and /search. Vector kNN via sqlite-vec, optional
// hybrid lexical pass (BM25 over FTS5) fused with reciprocal rank fusion,
// optional MMR rerank. Binds 127.0.0.1 unless told otherwise.

import { serve as honoServe } from "@hono/node-server";
import type Database from "better-sqlite3";
import { Hono } from "hono";

import type { FtsMode } from "./db.js";
import { bufferToF32, f32ToBuffer, ftsMode } from "./db.js";
import type { Embedder } from "./embed.js";

const RRF_K = 60;
const TOP_MIN = 1;
const TOP_MAX = 50;
const BODY_MAX_BYTES = 64 * 1024;

export interface SearchHit {
  chunk_id: number;
  vault_id: string;
  namespace: string;
  path: string;
  heading: string;
  content: string;
  score: number;
}

interface SearchParams {
  query: string;
  top: number;
  vaults?: string[];
  namespaces?: string[];
  hybrid: boolean;
  mmr: boolean;
  mmr_lambda: number;
}

interface ChunkMeta {
  vault_id: string;
  namespace: string;
  path: string;
  heading: string;
  content: string;
}

function optionalStringArray(v: unknown, field: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new Error(`'${field}' must be an array of strings`);
  }
  // An empty array means "no filter", not "match nothing".
  if (v.length === 0) return undefined;
  return v as string[];
}

function parseSearchBody(body: unknown): SearchParams {
  if (typeof body !== "object" || body === null) throw new Error("body must be a JSON object");
  const b = body as Record<string, unknown>;
  if (typeof b.query !== "string" || b.query.trim() === "") {
    throw new Error("query must not be empty");
  }
  const top = b.top ?? 8;
  if (typeof top !== "number" || !Number.isInteger(top) || top < TOP_MIN || top > TOP_MAX) {
    throw new Error(`top must be an integer ${TOP_MIN}..${TOP_MAX}`);
  }
  const lambda = b.mmr_lambda ?? 0.7;
  if (typeof lambda !== "number" || !Number.isFinite(lambda) || lambda < 0 || lambda > 1) {
    throw new Error("mmr_lambda must be a number between 0 and 1");
  }
  return {
    query: b.query,
    top,
    vaults: optionalStringArray(b.vaults, "vaults"),
    namespaces: optionalStringArray(b.namespaces, "namespaces"),
    hybrid: b.hybrid === true,
    mmr: b.mmr === true,
    mmr_lambda: lambda,
  };
}

// Lexical query shape depends on the tokenizer. Trigram handles raw text well,
// so the whole query becomes one quoted FTS string. unicode61 with an exact
// phrase makes BM25 useless for inflected languages, so it gets OR-of-terms.
export function buildFtsQuery(query: string, mode: FtsMode): string {
  const quote = (s: string): string => `"${s.replaceAll('"', '""')}"`;
  if (mode === "trigram") return quote(query);
  const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.map(quote).join(" OR ");
}

export function rrfFuse(knn: number[], fts: number[]): Map<number, number> {
  const fused = new Map<number, number>();
  knn.forEach((cid, rank) => {
    fused.set(cid, 1 / (RRF_K + rank + 1));
  });
  fts.forEach((cid, rank) => {
    fused.set(cid, (fused.get(cid) ?? 0) + 1 / (RRF_K + rank + 1));
  });
  return fused;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function mmrRerank(
  db: Database.Database,
  candidates: number[],
  scores: Map<number, number>,
  top: number,
  lambda: number,
): number[] {
  const stmt = db.prepare("SELECT embedding FROM embeddings WHERE chunk_id = ?");
  const vectors = new Map<number, Float32Array>();
  for (const cid of candidates) {
    const row = stmt.get(cid) as { embedding: Buffer } | undefined;
    if (row !== undefined) vectors.set(cid, bufferToF32(row.embedding));
  }
  const selected: number[] = [];
  const pool = candidates.filter((c) => vectors.has(c));
  while (pool.length > 0 && selected.length < top) {
    let best = pool[0] as number;
    let bestVal = Number.NEGATIVE_INFINITY;
    for (const cand of pool) {
      const cv = vectors.get(cand) as Float32Array;
      let redundancy = 0;
      for (const s of selected) {
        redundancy = Math.max(redundancy, dot(cv, vectors.get(s) as Float32Array));
      }
      const val = lambda * (scores.get(cand) ?? 0) - (1 - lambda) * redundancy;
      if (val > bestVal) {
        best = cand;
        bestVal = val;
      }
    }
    selected.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return selected;
}

async function runSearch(
  db: Database.Database,
  embedder: Embedder,
  params: SearchParams,
): Promise<SearchHit[]> {
  const qvec = await embedder.embedQuery(params.query);
  const filtering =
    params.vaults !== undefined || params.namespaces !== undefined || params.hybrid || params.mmr;
  const pool = filtering ? params.top * 6 : params.top;

  const knnIds = (
    db
      .prepare(
        "SELECT chunk_id FROM embeddings WHERE embedding MATCH ? AND k = ? ORDER BY distance",
      )
      .all(f32ToBuffer(qvec), pool) as { chunk_id: number }[]
  ).map((r) => r.chunk_id);

  let ftsIds: number[] = [];
  if (params.hybrid) {
    const ftsQuery = buildFtsQuery(params.query, ftsMode(db));
    if (ftsQuery !== "") {
      try {
        ftsIds = (
          db
            .prepare(
              "SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?",
            )
            .all(ftsQuery, pool) as { rowid: number }[]
        ).map((r) => r.rowid);
      } catch {
        ftsIds = [];
      }
    }
  }

  const fused = rrfFuse(knnIds, ftsIds);

  const metaStmt = db.prepare(
    `SELECT c.vault_id, c.namespace, f.path, c.heading, c.content
     FROM chunks c JOIN files f ON f.id = c.file_id WHERE c.id = ?`,
  );
  const meta = new Map<number, ChunkMeta>();
  for (const cid of fused.keys()) {
    const row = metaStmt.get(cid) as
      | {
          vault_id: string;
          namespace: string | null;
          path: string;
          heading: string | null;
          content: string;
        }
      | undefined;
    if (row === undefined) continue;
    const m: ChunkMeta = {
      vault_id: row.vault_id,
      namespace: row.namespace ?? "",
      path: row.path,
      heading: row.heading ?? "",
      content: row.content,
    };
    const passV = params.vaults === undefined || params.vaults.includes(m.vault_id);
    const passN = params.namespaces === undefined || params.namespaces.includes(m.namespace);
    if (passV && passN) meta.set(cid, m);
  }

  const candidates = [...meta.keys()].sort((a, b) => (fused.get(b) ?? 0) - (fused.get(a) ?? 0));
  const ordered =
    params.mmr && candidates.length > 1
      ? mmrRerank(db, candidates, fused, params.top, params.mmr_lambda)
      : candidates.slice(0, params.top);

  return ordered.map((cid) => {
    const m = meta.get(cid) as ChunkMeta;
    return {
      chunk_id: cid,
      vault_id: m.vault_id,
      namespace: m.namespace,
      path: m.path,
      heading: m.heading,
      content: m.content,
      score: Math.round((fused.get(cid) ?? 0) * 1_000_000) / 1_000_000,
    };
  });
}

export function createApp(db: Database.Database, embedder: Embedder, model: string): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    const chunks = (db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
    const files = (db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number }).n;
    return c.json({ status: "ok", model, files, chunks });
  });

  app.post("/search", async (c) => {
    const len = Number(c.req.header("content-length") ?? "0");
    if (!Number.isFinite(len) || len > BODY_MAX_BYTES) {
      return c.text(`request body must be at most ${BODY_MAX_BYTES} bytes`, 413);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.text("body must be valid JSON", 400);
    }
    let params: SearchParams;
    try {
      params = parseSearchBody(body);
    } catch (e) {
      return c.text((e as Error).message, 400);
    }
    try {
      const hits = await runSearch(db, embedder, params);
      return c.json({ hits });
    } catch (e) {
      return c.text(`search error: ${(e as Error).message}`, 500);
    }
  });

  return app;
}

export function startServer(
  db: Database.Database,
  embedder: Embedder,
  model: string,
  host: string,
  port: number,
): void {
  const app = createApp(db, embedder, model);
  honoServe({ fetch: app.fetch, hostname: host, port }, () => {
    console.log(`eos-rag serving on http://${host}:${port}`);
  });
}
