import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, f32ToBuffer, open } from "./db.js";
import type { Embedder } from "./embed.js";
import { buildFtsQuery, createApp, rrfFuse } from "./server.js";

const DIM = 4;
const BASE = "http://127.0.0.1:8765";

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
  return createApp(db, stubEmbedder, "stub", { host: "127.0.0.1", port: 8765 });
}

async function search(app: ReturnType<typeof seededApp>, body: unknown) {
  return app.request(`${BASE}/search`, {
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
    const res = await app.request(`${BASE}/health`);
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

it("bounds a search body without a Content-Length header", async () => {
  const app = seededApp();
  const res = await app.request(`${BASE}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "x".repeat(70000) }),
  });
  expect(res.status).toBe(413);
});

describe("local request guard", () => {
  let app: ReturnType<typeof seededApp>;
  beforeEach(() => {
    app = seededApp();
  });
  const post = (url: string, headers: Record<string, string>, body = '{"query":"x"}') =>
    app.request(url, { method: "POST", headers, body });
  const json = { "content-type": "application/json" };

  it("accepts loopback Host names on the bound port", async () => {
    for (const host of ["127.0.0.1:8765", "localhost:8765", "[::1]:8765"]) {
      expect((await post(`${BASE}/search`, { ...json, host })).status).toBe(200);
    }
  });

  it("rejects rebinding Host names and other ports", async () => {
    for (const host of ["attacker.example:8765", "127.0.0.1:9999", "localhost"]) {
      expect((await post(`${BASE}/search`, { ...json, host })).status).toBe(403);
    }
    const health = await app.request(`${BASE}/health`, {
      headers: { host: "rebind.example:8765" },
    });
    expect(health.status).toBe(403);
  });

  it("requires a JSON content type on POST", async () => {
    expect((await post(`${BASE}/search`, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post(`${BASE}/search`, {})).status).toBe(415);
    const withCharset = { "content-type": "application/json; charset=utf-8" };
    expect((await post(`${BASE}/search`, withCharset)).status).toBe(200);
  });

  it("rejects foreign origins and cross-site fetches", async () => {
    expect((await post(`${BASE}/search`, { ...json, origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect((await post(`${BASE}/search`, { ...json, origin: "null" })).status).toBe(403);
    expect((await post(`${BASE}/search`, { ...json, "sec-fetch-site": "cross-site" })).status).toBe(
      403,
    );
    expect((await post(`${BASE}/search`, { ...json, "sec-fetch-site": "same-site" })).status).toBe(
      403,
    );
    expect((await post(`${BASE}/search`, { ...json, origin: BASE })).status).toBe(200);
  });
});
