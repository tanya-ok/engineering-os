// Read-only health report for a vault registry and its index, so a silent
// fallback to the templates or a missing vault path is visible before search.

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { Config, Env, VaultEntry } from "./config.js";

export type Level = "ok" | "warn" | "error";

export interface Finding {
  level: Level;
  subject: string;
  message: string;
}

export function countFiles(vault: VaultEntry): number {
  let n = 0;
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (vault.excluded_dirs.includes(entry.name)) continue;
        if (vault.exclude_underscore_prefix && entry.name.startsWith("_")) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile() && vault.extensions.some((ext) => entry.name.endsWith(ext))) {
        n += 1;
      }
    }
  };
  walk(vault.resolved_path);
  return n;
}

export function checkVaults(cfg: Config, env: Env): Finding[] {
  return cfg.vaults.map((v) => {
    const fromEnv = v.path_env !== undefined && env[v.path_env] !== undefined;
    const source = fromEnv
      ? `env ${v.path_env}`
      : `path_default (${v.path_env ?? "no path_env"} unset)`;
    const subject = `vault ${v.vault_id}`;
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(v.resolved_path);
    } catch {
      stat = undefined;
    }
    if (stat === undefined || !stat.isDirectory()) {
      return {
        level: "error",
        subject,
        message: `${v.resolved_path} is not a directory (${source})`,
      };
    }
    const files = countFiles(v);
    if (files === 0) {
      return {
        level: "warn",
        subject,
        message: `${v.resolved_path} has no indexable files (${source})`,
      };
    }
    return { level: "ok", subject, message: `${v.resolved_path}, ${files} files (${source})` };
  });
}

export function checkIndex(cfg: Config): Finding[] {
  const subject = "index";
  if (!fs.existsSync(cfg.resolved_db)) {
    return [
      { level: "error", subject, message: `${cfg.resolved_db} missing; run 'eos-rag index'` },
    ];
  }
  let db: Database.Database;
  try {
    db = new Database(cfg.resolved_db, { readonly: true, fileMustExist: true });
  } catch (e) {
    return [
      {
        level: "error",
        subject,
        message: `cannot open ${cfg.resolved_db}: ${(e as Error).message}`,
      },
    ];
  }
  try {
    const hasMeta = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
      .get();
    if (hasMeta === undefined) {
      return [
        {
          level: "error",
          subject,
          message: `${cfg.resolved_db} has no schema; run 'eos-rag index'`,
        },
      ];
    }
    const model = (
      db.prepare("SELECT value FROM meta WHERE key = 'embed_model'").get() as
        | { value: string }
        | undefined
    )?.value;
    const findings: Finding[] = [];
    if (model !== cfg.embed_model) {
      findings.push({
        level: "error",
        subject,
        message: `built with '${model ?? "none"}', config says '${cfg.embed_model}'; run 'eos-rag index --rebuild'`,
      });
    }
    const rows = db
      .prepare("SELECT vault_id, COUNT(*) AS n FROM files GROUP BY vault_id")
      .all() as { vault_id: string; n: number }[];
    const indexed = new Map(rows.map((r) => [r.vault_id, r.n]));
    for (const v of cfg.vaults) {
      if ((indexed.get(v.vault_id) ?? 0) === 0) {
        findings.push({
          level: "warn",
          subject,
          message: `no files indexed for vault ${v.vault_id}`,
        });
      }
    }
    const paths = db.prepare("SELECT vault_id, path FROM files").all() as {
      vault_id: string;
      path: string;
    }[];
    for (const v of cfg.vaults) {
      const outside = paths.filter(
        (r) => r.vault_id === v.vault_id && !isUnder(v.resolved_path, r.path),
      ).length;
      if (outside > 0) {
        findings.push({
          level: "warn",
          subject,
          message:
            `${outside} files of vault ${v.vault_id} lie outside ${v.resolved_path}; ` +
            "the index was built from another config and 'eos-rag index' would prune them",
        });
      }
    }
    const configured = new Set(cfg.vaults.map((v) => v.vault_id));
    for (const id of indexed.keys()) {
      if (!configured.has(id)) {
        findings.push({
          level: "warn",
          subject,
          message: `holds rows for unconfigured vault ${id}`,
        });
      }
    }
    if (findings.length === 0) {
      const total = rows.reduce((sum, r) => sum + r.n, 0);
      findings.push({
        level: "ok",
        subject,
        message: `${cfg.resolved_db}, ${total} files, model ${model}`,
      });
    }
    return findings;
  } finally {
    db.close();
  }
}

function isUnder(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function formatReport(findings: Finding[]): string {
  return findings
    .map((f) => `${f.level.toUpperCase().padEnd(5)} ${f.subject}: ${f.message}`)
    .join("\n");
}

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.level === "error");
}
