#!/usr/bin/env node
// eos-rag: local hybrid RAG for engineering-os.
// Verbs: index (build/update the index) and serve (search API).

import fs from "node:fs";
import process from "node:process";

import { loadConfig, resolveHost, resolvePort } from "./config.js";
import { getMeta, open } from "./db.js";
import { Embedder, modelCacheDir } from "./embed.js";
import { indexAll } from "./indexer.js";
import { startServer } from "./server.js";

const USAGE = `eos-rag - local hybrid RAG for engineering-os

Usage:
  eos-rag index --config <path> [--rebuild]
  eos-rag serve --config <path> [--port N] [--host H]

Options:
  --config <path>   vault registry json (default: rag/vaults.json)
  --rebuild         drop the index database and reindex everything
  --port <N>        serve port (default: EOS_SERVER_PORT or 8765)
  --host <H>        serve bind address (default: EOS_SERVER_HOST or 127.0.0.1)
`;

interface Args {
  verb: "index" | "serve";
  config: string;
  rebuild: boolean;
  port?: string;
  host?: string;
}

function fail(message: string): never {
  console.error(`error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const [verb, ...rest] = argv;
  if (verb !== "index" && verb !== "serve") {
    fail(verb === undefined ? "missing command" : `unknown command '${verb}'`);
  }
  const args: Args = { verb, config: "rag/vaults.json", rebuild: false };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const takeValue = (): string => {
      const v = rest[i + 1];
      if (v === undefined) fail(`${flag} requires a value`);
      i += 1;
      return v;
    };
    switch (flag) {
      case "--config":
        args.config = takeValue();
        break;
      case "--rebuild":
        if (verb !== "index") fail("--rebuild only applies to index");
        args.rebuild = true;
        break;
      case "--port":
        if (verb !== "serve") fail("--port only applies to serve");
        args.port = takeValue();
        break;
      case "--host":
        if (verb !== "serve") fail("--host only applies to serve");
        args.host = takeValue();
        break;
      default:
        fail(`unknown flag '${flag}'`);
    }
  }
  return args;
}

async function runIndex(args: Args): Promise<void> {
  const cfg = loadConfig(args.config);
  if (args.rebuild) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = `${cfg.resolved_db}${suffix}`;
      if (fs.existsSync(p)) fs.rmSync(p);
    }
    console.log(`Removed ${cfg.resolved_db} for full rebuild`);
  }
  console.log(`Loading embedding model ${cfg.embed_model} (first run downloads it)...`);
  const embedder = await Embedder.create(cfg.embed_model, modelCacheDir());
  const db = open(cfg.resolved_db);
  try {
    const stats = await indexAll(cfg, embedder, db);
    const total = (db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
    console.log(
      `Done. ${stats.chunksWritten} chunks written this run ` +
        `(${stats.filesIndexed} files indexed, ${stats.filesPruned} pruned, ` +
        `${(stats.elapsedMs / 1000).toFixed(1)}s), ${total} chunks total in ${cfg.resolved_db}`,
    );
  } finally {
    db.close();
  }
}

async function runServe(args: Args): Promise<void> {
  const cfg = loadConfig(args.config);
  const host = resolveHost(args.host, process.env);
  const port = resolvePort(args.port, process.env);
  const db = open(cfg.resolved_db);
  const hasIndex = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
    .get();
  const storedModel = hasIndex === undefined ? undefined : getMeta(db, "embed_model");
  if (storedModel === undefined) {
    db.close();
    throw new Error(`index not found or empty at ${cfg.resolved_db}; run 'eos-rag index' first`);
  }
  if (storedModel !== cfg.embed_model) {
    db.close();
    throw new Error(
      `index was built with model '${storedModel}', config says '${cfg.embed_model}'. ` +
        "Run index --rebuild to reindex.",
    );
  }
  const embedder = await Embedder.create(cfg.embed_model, modelCacheDir());
  startServer(db, embedder, cfg.embed_model, host, port);
}

async function main(): Promise<void> {
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
  const args = parseArgs(process.argv.slice(2));
  if (args.verb === "index") await runIndex(args);
  else await runServe(args);
}

main().catch((e: unknown) => {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
});
