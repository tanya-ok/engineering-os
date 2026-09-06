// Optional local overlay (dashboard/dashboard.json, gitignored): where the
// beads workspace lives, per-project labels and links, and how to turn an
// external_ref into a URL. The shipped skeleton needs none of it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ProjectMeta {
  label?: string;
  path?: string;
  url?: string;
}

export interface DashboardConfig {
  beads_root?: string;
  jsonl?: string;
  ttl_seconds?: number;
  /** Template with `{ref}`, e.g. `https://tracker.example/issue/{ref}`. */
  external_ref_url?: string;
  projects?: Record<string, ProjectMeta>;
}

export interface PublicConfig {
  external_ref_url?: string;
  projects: Record<string, ProjectMeta>;
}

export function expandPath(p: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = p;
  if (out === "~" || out.startsWith("~/")) out = path.join(env.HOME ?? os.homedir(), out.slice(1));
  out = out.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (m, name: string) => env[name] ?? m);
  return path.resolve(out);
}

function optString(r: Record<string, unknown>, key: string): string | undefined {
  const v = r[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`dashboard config: '${key}' must be a string`);
  return v;
}

export function loadDashboardConfig(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
): DashboardConfig {
  if (!fs.existsSync(file)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`dashboard config ${file}: ${(e as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`dashboard config ${file}: must be a JSON object`);
  }
  const r = raw as Record<string, unknown>;
  const cfg: DashboardConfig = {};
  const root = optString(r, "beads_root");
  if (root !== undefined) cfg.beads_root = expandPath(root, env);
  const jsonl = optString(r, "jsonl");
  if (jsonl !== undefined) cfg.jsonl = expandPath(jsonl, env);
  cfg.external_ref_url = optString(r, "external_ref_url");
  if (r.ttl_seconds !== undefined) {
    if (typeof r.ttl_seconds !== "number" || r.ttl_seconds < 0) {
      throw new Error("dashboard config: 'ttl_seconds' must be a non-negative number");
    }
    cfg.ttl_seconds = r.ttl_seconds;
  }
  if (r.projects !== undefined) {
    if (typeof r.projects !== "object" || r.projects === null || Array.isArray(r.projects)) {
      throw new Error("dashboard config: 'projects' must be an object keyed by project id");
    }
    cfg.projects = {};
    for (const [id, meta] of Object.entries(r.projects as Record<string, unknown>)) {
      if (typeof meta !== "object" || meta === null) {
        throw new Error(`dashboard config: project '${id}' must be an object`);
      }
      const m = meta as Record<string, unknown>;
      const entry: ProjectMeta = {};
      const label = optString(m, "label");
      if (label !== undefined) entry.label = label;
      const p = optString(m, "path");
      if (p !== undefined) entry.path = expandPath(p, env);
      const url = optString(m, "url");
      if (url !== undefined) entry.url = url;
      cfg.projects[id] = entry;
    }
  }
  return cfg;
}

export function publicConfig(cfg: DashboardConfig): PublicConfig {
  const out: PublicConfig = { projects: cfg.projects ?? {} };
  if (cfg.external_ref_url !== undefined) out.external_ref_url = cfg.external_ref_url;
  return out;
}
