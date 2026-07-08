// End-to-end test over the shipped vault templates with the real embedding
// model. Requires a model download on first run, so it is gated:
//   EOS_E2E=1 pnpm test
// Set EOS_MODEL_CACHE to keep the download out of ~/.engineering-os.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { open } from "./db.js";
import { DEFAULT_MODEL, Embedder, modelCacheDir } from "./embed.js";
import { indexAll } from "./indexer.js";
import { createApp } from "./server.js";

const enabled = process.env.EOS_E2E === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe.skipIf(!enabled)("e2e over the shipped vault templates", () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof open>;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "eos-e2e-"));
    const cfgPath = path.join(dir, "vaults.json");
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        embed_model: DEFAULT_MODEL,
        index_db: path.join(dir, "index.db"),
        allowed_roots: [repoRoot],
        vaults: [
          {
            vault_id: "work",
            path_default: path.join(repoRoot, "vault-template"),
            excluded_dirs: [".obsidian", ".git", ".trash"],
            extensions: [".md"],
          },
        ],
      }),
    );
    const cfg = loadConfig(cfgPath, process.env);
    const embedder = await Embedder.create(cfg.embed_model, modelCacheDir());
    db = open(cfg.resolved_db);
    const stats = await indexAll(cfg, embedder, db);
    expect(stats.chunksWritten).toBeGreaterThan(0);
    app = createApp(db, embedder, cfg.embed_model);
  }, 900_000);

  afterAll(() => {
    db?.close();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function search(body: unknown) {
    return app.request("/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("english query ranks the ADR material first", async () => {
    const res = await search({ query: "how do I record an architecture decision", top: 5 });
    expect(res.status).toBe(200);
    const { hits } = (await res.json()) as { hits: { path: string }[] };
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toMatch(/Architecture/);
  }, 120_000);

  it("russian query retrieves cross-lingually", async () => {
    const res = await search({ query: "как оформить architecture decision", top: 5, hybrid: true });
    expect(res.status).toBe(200);
    const { hits } = (await res.json()) as { hits: { path: string }[] };
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /Architecture/.test(h.path))).toBe(true);
  }, 120_000);

  it("rejects top=500", async () => {
    expect((await search({ query: "adr", top: 500 })).status).toBe(400);
  });
});
