// Retrieval evaluation over the shipped templates. Builds a throwaway index
// in a temp dir (never the configured one) and prints ranking and budget
// metrics as markdown. Usage from the repo root after `pnpm --dir rag run build`:
//   node rag/eval/run.mjs [queries.json]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../dist/config.js";
import { open } from "../dist/db.js";
import { DEFAULT_MODEL, Embedder, modelCacheDir } from "../dist/embed.js";
import { indexAll } from "../dist/indexer.js";
import { createApp } from "../dist/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const queriesPath = process.argv[2] ?? path.join(here, "queries.json");
const { queries } = JSON.parse(fs.readFileSync(queriesPath, "utf8"));

const MODES = {
  vector: {},
  hybrid: { hybrid: true },
  "vector+mmr": { mmr: true },
  "hybrid+mmr": { hybrid: true, mmr: true },
};
const TOP = 8;
const SNIPPETS = [200, 400];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eos-eval-"));
const cfgPath = path.join(dir, "vaults.json");
const vault = (id, rel, underscore) => ({
  vault_id: id,
  path_default: path.join(repoRoot, rel),
  excluded_dirs: [".obsidian", ".git", ".trash"],
  exclude_underscore_prefix: underscore,
  extensions: [".md"],
});
fs.writeFileSync(
  cfgPath,
  JSON.stringify({
    embed_model: process.env.EOS_EMBED_MODEL ?? DEFAULT_MODEL,
    index_db: path.join(dir, "index.db"),
    allowed_roots: [repoRoot],
    vaults: [
      vault("work", "vault-template", false),
      vault("ai", "ai-vault-template", true),
      vault("user", "user-vault-template", true),
    ],
  }),
);

const log = console.log;
console.log = () => {};
const cfg = loadConfig(cfgPath, { HOME: os.homedir() }, { indexDb: path.join(dir, "index.db") });
const embedder = await Embedder.create(cfg.embed_model, modelCacheDir());
const db = open(cfg.resolved_db);
await indexAll(cfg, embedder, db);
console.log = log;

const chunkLens = db
  .prepare("SELECT length(content) AS n FROM chunks ORDER BY n")
  .all()
  .map((r) => r.n);
const pct = (p) => chunkLens[Math.min(chunkLens.length - 1, Math.floor(p * chunkLens.length))];
const app = createApp(db, embedder, cfg.embed_model);

async function search(query, extra, top = TOP) {
  const res = await app.request("/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, top, ...extra }),
  });
  if (res.status !== 200) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).hits;
}

log(`Model: ${cfg.embed_model}. Queries: ${queries.length}. Chunks: ${chunkLens.length}.`);
log(`Chunk length (chars): p50 ${pct(0.5)}, p90 ${pct(0.9)}, max ${chunkLens.at(-1)}.\n`);
log("| Mode | hit@1 | hit@3 | MRR@8 | answer in top-3 | p50 ms |");
log("|---|---|---|---|---|---|");
const misses = {};
for (const [mode, extra] of Object.entries(MODES)) {
  let h1 = 0;
  let h3 = 0;
  let mrr = 0;
  let ans3 = 0;
  const ms = [];
  misses[mode] = [];
  for (const q of queries) {
    const t0 = performance.now();
    const hits = await search(q.query, extra);
    ms.push(performance.now() - t0);
    const rank = hits.findIndex((h) => h.path.endsWith(q.gold));
    if (rank === 0) h1 += 1;
    else if (process.env.EOS_EVAL_VERBOSE)
      log(
        `  ${mode} ${q.id}: rank ${rank + 1}, top ${hits[0]?.path.split("/").slice(-2).join("/")}`,
      );
    if (rank >= 0 && rank < 3) h3 += 1;
    if (rank >= 0) mrr += 1 / (rank + 1);
    else misses[mode].push(q.id);
    if (hits.slice(0, 3).some((h) => h.content.includes(q.answer))) ans3 += 1;
  }
  ms.sort((a, b) => a - b);
  const n = queries.length;
  log(
    `| ${mode} | ${h1}/${n} | ${h3}/${n} | ${(mrr / n).toFixed(2)} | ${ans3}/${n} | ${ms[Math.floor(n / 2)].toFixed(0)} |`,
  );
}
log("");
for (const [mode, ids] of Object.entries(misses)) {
  if (ids.length > 0) log(`Missed in top-${TOP} (${mode}): ${ids.join(", ")}`);
}

log("\nBudget per response (hybrid), mean over queries, tokens estimated as chars/4:\n");
log(
  "| top | full chunks chars | ~tokens | " +
    SNIPPETS.map((s) => `snippet ${s} chars | answer kept @${s}`).join(" | ") +
    " |",
);
log(`|---|---|---|${SNIPPETS.map(() => "---|---").join("|")}|`);
for (const top of [3, 5, 8]) {
  let full = 0;
  const snip = SNIPPETS.map(() => ({ chars: 0, kept: 0, found: 0 }));
  for (const q of queries) {
    const hits = await search(q.query, { hybrid: true }, top);
    full += hits.reduce((s, h) => s + h.content.length, 0);
    const bearing = hits.find((h) => h.content.includes(q.answer));
    SNIPPETS.forEach((size, i) => {
      snip[i].chars += hits.reduce((s, h) => s + Math.min(size, h.content.length), 0);
      if (bearing !== undefined) {
        snip[i].found += 1;
        if (bearing.content.slice(0, size).includes(q.answer)) snip[i].kept += 1;
      }
    });
  }
  const n = queries.length;
  const cells = snip.map((s) => `${Math.round(s.chars / n)} | ${s.kept}/${s.found}`);
  log(`| ${top} | ${Math.round(full / n)} | ${Math.round(full / n / 4)} | ${cells.join(" | ")} |`);
}

db.close();
fs.rmSync(dir, { recursive: true, force: true });
