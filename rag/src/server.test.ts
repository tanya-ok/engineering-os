import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, f32ToBuffer, open } from "./db.js";
import type { Embedder } from "./embed.js";
import { buildFtsQuery, createApp, rrfFuse } from "./server.js";

const DIM = 4;

// Stub embedder: deterministic vectors, no model download.
const stubEmbedder = {
  dim: DIM,
  modelId: "stub",
  embedQuery: async () => Float32Array.from([1, 0, 0, 0]),
  embedPassages: async (texts: string[]) => texts.map(() => Float32Array.from([1, 0, 0, 0])),
} as unknown as Embedder;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "eos-server-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function seededApp() {
  const db = open(path.join(dir, "index.db"));
  ensureSchema(db, DIM, "stub");
  db.prepare("INSERT INTO files(id, vault_id, path, mtime) VALUES (1, 'work', '/v/a.md', 1)").run();
  db.prepare(
    "INSERT INTO chunks(id, file_id, vault_id, namespace, heading, content) VALUES (1, 1, 'work', 'CloudOps', 'H', 'certificate rotation runbook content')",
  ).run();
  db.prepare("INSERT INTO embeddings(chunk_id, embedding) VALUES (?, ?)").run(
    BigInt(1),
    f32ToBuffer(Float32Array.from([1, 0, 0, 0])),
  );
  db.prepare("INSERT INTO chunks_fts(rowid, content) VALUES (1, 'certificate rotation')").run();
  return createApp(db, stubEmbedder, "stub");
}

async function search(app: ReturnType<typeof seededApp>, body: unknown) {
  return app.request("/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("search validation", () => {
  it("empty or missing query is 400", async () => {
    const app = seededApp();
    expect((await search(app, { query: "  " })).status).toBe(400);
    expect((await search(app, {})).status).toBe(400);
  });

  it("top outside 1..50 or non-integer is 400", async () => {
    const app = seededApp();
    expect((await search(app, { query: "x", top: 0 })).status).toBe(400);
    expect((await search(app, { query: "x", top: 500 })).status).toBe(400);
    expect((await search(app, { query: "x", top: 2.5 })).status).toBe(400);
    expect((await search(app, { query: "x", top: 50 })).status).toBe(200);
  });

  it("valid search returns the contract fields", async () => {
    const app = seededApp();
    const res = await search(app, { query: "certificate rotation", top: 3, hybrid: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hits: Record<string, unknown>[] };
    expect(body.hits.length).toBe(1);
    const hit = body.hits[0];
    expect(hit).toMatchObject({
      chunk_id: 1,
      vault_id: "work",
      namespace: "CloudOps",
      path: "/v/a.md",
      heading: "H",
    });
    expect(typeof hit?.content).toBe("string");
    expect(typeof hit?.score).toBe("number");
  });

  it("health reports counts and model", async () => {
    const app = seededApp();
    const res = await app.request("/health");
    expect(await res.json()).toEqual({ status: "ok", model: "stub", files: 1, chunks: 1 });
  });
});

describe("fts query shape", () => {
  it("trigram passes the raw query as one quoted string", () => {
    expect(buildFtsQuery('rotate "the" cert', "trigram")).toBe('"rotate ""the"" cert"');
  });

  it("unicode61 builds OR-of-terms", () => {
    expect(buildFtsQuery("как оформить decision", "unicode61")).toBe(
      '"как" OR "оформить" OR "decision"',
    );
  });
});

describe("rrf", () => {
  it("rewards agreement between rankings", () => {
    const fused = rrfFuse([1, 2, 3], [1, 4, 5]);
    const both = 2 * (1 / 61);
    expect(fused.get(1)).toBeCloseTo(both, 12);
    expect(fused.get(2)).toBeCloseTo(1 / 62, 12);
    expect(fused.get(4)).toBeCloseTo(1 / 62, 12);
  });

  it("empty fts list is pure vector", () => {
    const fused = rrfFuse([7, 8], []);
    expect(fused.size).toBe(2);
    expect(fused.get(7)).toBeCloseTo(1 / 61, 12);
  });
});
