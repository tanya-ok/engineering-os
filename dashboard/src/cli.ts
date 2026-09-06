#!/usr/bin/env node
// eos-dashboard: work-graph dashboard over beads.
// Verbs: serve (HTTP API + browser app) and graph (print the graph JSON).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type { Source } from "./beads.js";
import { loadDashboardConfig, publicConfig } from "./config.js";
import { buildGraph } from "./graph.js";
import { createApp, startServer } from "./server.js";
import { IssueStore } from "./store.js";

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(PKG_DIR, "fixtures", "beads.sample.jsonl");
const PUBLIC_DIR = path.join(PKG_DIR, "public");
const DEFAULT_CONFIG = path.join(PKG_DIR, "dashboard.json");
const DEFAULT_PORT = 8766;
const DEFAULT_TTL_SECONDS = 30;

const USAGE = `eos-dashboard - work-graph dashboard over beads

Usage:
  eos-dashboard serve [--root <dir> | --jsonl <file> | --fixture] [--port N] [--host H] [--config <file>]
  eos-dashboard graph [--root <dir> | --jsonl <file> | --fixture] [--all] [--config <file>]

Source resolution: flags, then EOS_BEADS_JSONL / EOS_BEADS_ROOT, then the
config file (dashboard/dashboard.json), then a .beads directory in the current
directory, then the shipped anonymized fixture.

Options:
  --root <dir>      workspace with a .beads directory (runs 'bd export' there)
  --jsonl <file>    a 'bd export' JSONL file
  --fixture         use the shipped sample data
  --config <file>   local overlay (default: dashboard/dashboard.json)
  --port <N>        serve port (default: EOS_DASHBOARD_PORT or ${DEFAULT_PORT})
  --host <H>        serve bind address (default: EOS_DASHBOARD_HOST or 127.0.0.1)
  --all             graph: include closed issues
`;

interface Args {
  verb: "serve" | "graph";
  root?: string;
  jsonl?: string;
  fixture: boolean;
  config: string;
  port?: string;
  host?: string;
  all: boolean;
}

function fail(message: string): never {
  console.error(`error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const [verb, ...rest] = argv;
  if (verb !== "serve" && verb !== "graph") {
    fail(verb === undefined ? "missing command" : `unknown command '${verb}'`);
  }
  const args: Args = { verb, fixture: false, config: DEFAULT_CONFIG, all: false };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const takeValue = (): string => {
      const v = rest[i + 1];
      if (v === undefined) fail(`${flag} requires a value`);
      i += 1;
      return v;
    };
    switch (flag) {
      case "--root":
        args.root = takeValue();
        break;
      case "--jsonl":
        args.jsonl = takeValue();
        break;
      case "--fixture":
        args.fixture = true;
        break;
      case "--config":
        args.config = takeValue();
        break;
      case "--port":
        if (verb !== "serve") fail("--port only applies to serve");
        args.port = takeValue();
        break;
      case "--host":
        if (verb !== "serve") fail("--host only applies to serve");
        args.host = takeValue();
        break;
      case "--all":
        if (verb !== "graph") fail("--all only applies to graph");
        args.all = true;
        break;
      default:
        fail(`unknown flag '${flag}'`);
    }
  }
  const chosen = [args.root, args.jsonl, args.fixture ? "fixture" : undefined].filter(
    (v) => v !== undefined,
  );
  if (chosen.length > 1) fail("use only one of --root, --jsonl, --fixture");
  return args;
}

export function resolveSource(
  args: Pick<Args, "root" | "jsonl" | "fixture">,
  env: NodeJS.ProcessEnv,
  cfg: { beads_root?: string; jsonl?: string },
  cwd: string,
): Source {
  if (args.fixture) return { kind: "jsonl", path: FIXTURE };
  if (args.jsonl !== undefined) return { kind: "jsonl", path: args.jsonl };
  if (args.root !== undefined) return { kind: "bd", root: args.root };
  if (env.EOS_BEADS_JSONL) return { kind: "jsonl", path: env.EOS_BEADS_JSONL };
  if (env.EOS_BEADS_ROOT) return { kind: "bd", root: env.EOS_BEADS_ROOT };
  if (cfg.jsonl !== undefined) return { kind: "jsonl", path: cfg.jsonl };
  if (cfg.beads_root !== undefined) return { kind: "bd", root: cfg.beads_root };
  if (fs.existsSync(path.join(cwd, ".beads"))) return { kind: "bd", root: cwd };
  return { kind: "jsonl", path: FIXTURE };
}

function resolvePort(flag: string | undefined, env: NodeJS.ProcessEnv): number {
  const raw = flag ?? env.EOS_DASHBOARD_PORT ?? String(DEFAULT_PORT);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`invalid port '${raw}'`);
  return port;
}

async function main(): Promise<void> {
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadDashboardConfig(args.config);
  const source = resolveSource(args, process.env, cfg, process.cwd());
  const ttlMs = (cfg.ttl_seconds ?? DEFAULT_TTL_SECONDS) * 1000;
  const store = new IssueStore(source, ttlMs);

  if (args.verb === "graph") {
    const issues = await store.get();
    process.stdout.write(`${JSON.stringify(buildGraph(issues, { includeClosed: args.all }))}\n`);
    return;
  }

  const issues = await store.get();
  console.log(`Loaded ${issues.length} issues from ${store.sourceLabel}`);
  const app = createApp(store, PUBLIC_DIR, publicConfig(cfg));
  startServer(
    app,
    args.host ?? process.env.EOS_DASHBOARD_HOST ?? "127.0.0.1",
    resolvePort(args.port, process.env),
  );
}

main().catch((e: unknown) => {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
});
