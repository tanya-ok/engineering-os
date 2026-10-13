// Optional local overlay (dashboard/dashboard.json, gitignored): where the
// beads workspace lives, per-project labels and links, and how to turn an
// external_ref into a URL. The shipped skeleton needs none of it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkBind, envFlag } from "./host-guard.js";

export interface ProjectMeta {
  label?: string;
  path?: string;
  url?: string;
}

export interface DashboardConfig {
  reviews?: import("./review-types.js").ReviewSource[];
  sources?: import("./work-items.js").TrackerSource[];
  beads_root?: string;
  jsonl?: string;
  ttl_seconds?: number;
  /** Template with `{ref}`, e.g. `https://tracker.example/issue/{ref}`. */
  external_ref_url?: string;
  projects?: Record<string, ProjectMeta>;
}

export interface PublicConfig {
  external_ref_url?: string;
  projects: Record<string, Pick<ProjectMeta, "label" | "url">>;
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

function optHttpUrl(r: Record<string, unknown>, key: string): string | undefined {
  const v = optString(r, key);
  if (v === undefined) return undefined;
  let protocol: string;
  try {
    protocol = new URL(v.replaceAll("{ref}", "ref")).protocol;
  } catch {
    throw new Error(`dashboard config: '${key}' must be an absolute http or https URL`);
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`dashboard config: '${key}' must be an absolute http or https URL`);
  }
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
  if (r.reviews !== undefined) {
    if (!Array.isArray(r.reviews)) throw new Error("reviews must be an array");
    const ids = new Set<string>();
    cfg.reviews = r.reviews.map((raw) => {
      if (
        !raw ||
        typeof raw.id !== "string" ||
        !raw.id ||
        ids.has(raw.id) ||
        typeof raw.report !== "string" ||
        typeof raw.manifest !== "string"
      )
        throw new Error("Review sources require unique id, report and manifest");
      ids.add(raw.id);
      if (
        raw.tasks !== undefined &&
        (typeof raw.tasks !== "object" || raw.tasks === null || Array.isArray(raw.tasks))
      )
        throw new Error("Invalid review task links");
      const tasks: Record<string, Record<string, string>> = {};
      for (const [project, links] of Object.entries(raw.tasks ?? {})) {
        if (!links || typeof links !== "object" || Array.isArray(links))
          throw new Error("Invalid review task links");
        tasks[project] = {};
        for (const [finding, task] of Object.entries(links)) {
          if (typeof task !== "string") throw new Error("Invalid investigation task ID");
          tasks[project][finding] = task;
        }
      }
      return {
        id: raw.id,
        report: expandPath(raw.report, env),
        manifest: expandPath(raw.manifest, env),
        run_id: typeof raw.run_id === "string" ? raw.run_id : undefined,
        tasks,
      };
    });
  }
  const root = optString(r, "beads_root");
  if (root !== undefined) cfg.beads_root = expandPath(root, env);
  const jsonl = optString(r, "jsonl");
  if (jsonl !== undefined) cfg.jsonl = expandPath(jsonl, env);
  cfg.external_ref_url = optHttpUrl(r, "external_ref_url");
  if (r.sources !== undefined) {
    if (!Array.isArray(r.sources) || r.sources.length === 0)
      throw new Error("sources must be nonempty");
    const seen = new Set<string>();
    cfg.sources = r.sources.map((raw) => {
      if (
        !raw ||
        typeof raw.source_id !== "string" ||
        !raw.source_id.trim() ||
        typeof raw.repository_id !== "string" ||
        !raw.repository_id.trim()
      )
        throw new Error("Each source requires source_id and repository_id");
      const identity = JSON.stringify([raw.source_id, raw.repository_id]);
      if (seen.has(identity)) throw new Error("Duplicate source/repository identity");
      seen.add(identity);
      const kind = raw.source?.kind;
      if (!["bd", "jsonl", "json", "github"].includes(kind))
        throw new Error("Unknown source adapter");
      const field = kind === "bd" ? "root" : "path";
      if (typeof raw.source[field] !== "string" || !raw.source[field].trim())
        throw new Error("Source requires a local path");
      return {
        source_id: raw.source_id,
        repository_id: raw.repository_id,
        label: typeof raw.label === "string" ? raw.label : undefined,
        source:
          kind === "bd"
            ? { kind: "bd", root: expandPath(raw.source[field], env) }
            : {
                kind: kind as "jsonl" | "json" | "github",
                path: expandPath(raw.source[field], env),
              },
      };
    });
  }
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
      const url = optHttpUrl(m, "url");
      if (url !== undefined) entry.url = url;
      cfg.projects[id] = entry;
    }
  }
  return cfg;
}

export function publicConfig(cfg: DashboardConfig): PublicConfig {
  const out: PublicConfig = { projects: {} };
  for (const [id, meta] of Object.entries(cfg.projects ?? {})) {
    out.projects[id] = {};
    if (meta.label !== undefined) out.projects[id].label = meta.label;
    if (meta.url !== undefined) out.projects[id].url = meta.url;
  }
  if (cfg.external_ref_url !== undefined) out.external_ref_url = cfg.external_ref_url;
  return out;
}

export function runtimeConfig(fixture: boolean, file?: string): DashboardConfig {
  return fixture || file === undefined ? {} : loadDashboardConfig(file);
}

// Bind host: CLI flag > EOS_DASHBOARD_HOST > 127.0.0.1. Non-loopback needs
// --allow-remote or EOS_DASHBOARD_ALLOW_REMOTE=1.
export function resolveHost(
  flag: string | undefined,
  env: NodeJS.ProcessEnv,
  allowRemote = false,
): { host: string; warning?: string } {
  const host = flag ?? env.EOS_DASHBOARD_HOST ?? "127.0.0.1";
  const warning = checkBind(host, allowRemote || envFlag(env.EOS_DASHBOARD_ALLOW_REMOTE));
  return warning === undefined ? { host } : { host, warning };
}
