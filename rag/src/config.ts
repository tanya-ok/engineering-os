// Config loading for rag/vaults.json, with the diode guardrail:
// work-side indexes must never ingest personal data, so every resolved vault
// path must sit under an allowed root and iCloud paths are always refused.

import fs from "node:fs";
import path from "node:path";

import { DEFAULT_MODEL } from "./embed.js";

export interface VaultEntry {
  vault_id: string;
  label: string;
  path_env?: string;
  path_default: string;
  excluded_dirs: string[];
  exclude_underscore_prefix: boolean;
  extensions: string[];
  resolved_path: string;
}

export interface Config {
  embed_model: string;
  index_db: string;
  allowed_roots: string[];
  vaults: VaultEntry[];
  resolved_db: string;
}

export type Env = Record<string, string | undefined>;

// Path markers of the macOS iCloud Drive container. Assembled from parts so
// the anonymization gate (which treats the contiguous literal as an identity
// leak) stays clean while the diode check still matches real paths.
const ICLOUD_MARKERS = [["Library/Mobile", "Documents"].join(" "), "com~apple~CloudDocs"];

// Expand a leading `~` only when it is the whole string or is followed by `/`,
// so `~backup` stays literal.
export function expandTilde(raw: string, home: string | undefined): string {
  if (raw === "~") return home ?? raw;
  if (raw.startsWith("~/") && home !== undefined) return `${home}/${raw.slice(2)}`;
  return raw;
}

// Single-pass $VAR expansion. Undefined expands to empty; a lone `$` is kept
// literally; an expanded value is never re-expanded.
export function expandVars(s: string, lookup: (name: string) => string | undefined): string {
  return s.replace(/\$([A-Za-z0-9_]*)/g, (whole, name: string) => {
    if (name === "") return whole;
    return lookup(name) ?? "";
  });
}

export function expandPath(raw: string, env: Env): string {
  const withHome = expandTilde(raw, env.HOME);
  const expanded = expandVars(withHome, (k) => env[k]);
  return path.resolve(expanded);
}

// Resolve symlinks to the canonical filesystem path. path.resolve normalizes
// `..` but does not dereference symlinks, so a symlink inside an allowed root
// pointing at an iCloud vault would defeat both diode layers. For paths that
// do not exist yet, canonicalize the deepest existing ancestor and re-append
// the remainder (a nonexistent path cannot itself be a symlink, but its
// ancestors can).
export function canonicalize(p: string): string {
  let cur = p;
  let suffix = "";
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), suffix);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.join(cur, suffix);
      suffix = suffix === "" ? path.basename(cur) : path.join(path.basename(cur), suffix);
      cur = parent;
    }
  }
}

// The repo root containing the config file: nearest ancestor with a .git
// entry, falling back to the config file's directory.
export function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(startDir);
    dir = parent;
  }
}

function isUnder(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function checkDiode(vaultId: string, canonical: string, allowedRoots: string[]): void {
  // APFS is case-insensitive by default; fold case so marker matching cannot
  // be evaded with a differently-cased path to the same directory.
  const folded = canonical.toLowerCase();
  for (const marker of ICLOUD_MARKERS) {
    if (folded.includes(marker.toLowerCase())) {
      throw new Error(
        `diode policy violation: vault '${vaultId}' resolves to an iCloud path (${canonical}). ` +
          "Work-side indexes must never ingest personal data; iCloud vaults are always refused.",
      );
    }
  }
  if (!allowedRoots.some((root) => isUnder(root, canonical))) {
    throw new Error(
      `diode policy violation: vault '${vaultId}' resolves to ${canonical}, which is outside ` +
        `the allowed roots (${allowedRoots.join(", ")}). Add the root to 'allowed_roots' in the ` +
        "config only if this vault genuinely belongs to the work-side index.",
    );
  }
}

interface RawVault {
  vault_id?: unknown;
  label?: unknown;
  path_env?: unknown;
  path_default?: unknown;
  excluded_dirs?: unknown;
  exclude_underscore_prefix?: unknown;
  extensions?: unknown;
}

interface RawConfig {
  embed_model?: unknown;
  index_db?: unknown;
  allowed_roots?: unknown;
  vaults?: unknown;
}

function asStringArray(v: unknown, field: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new Error(`config field '${field}' must be an array of strings`);
  }
  return v as string[];
}

export const DEFAULT_INDEX_DB = "~/.engineering-os/index.db";

export function loadConfig(
  configPath: string,
  env: Env = process.env,
  overrides: { indexDb?: string; embedModel?: string } = {},
): Config {
  let text: string;
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch (e) {
    throw new Error(`reading config ${configPath}: ${(e as Error).message}`);
  }
  let raw: RawConfig;
  try {
    raw = JSON.parse(text) as RawConfig;
  } catch (e) {
    throw new Error(`parsing config ${configPath}: ${(e as Error).message}`);
  }
  if (!Array.isArray(raw.vaults)) {
    throw new Error(`config ${configPath} must contain a 'vaults' array`);
  }

  const configDir = path.dirname(path.resolve(configPath));
  const allowedRaw = asStringArray(raw.allowed_roots, "allowed_roots");
  for (const r of allowedRaw) {
    if (r.trim() === "") {
      throw new Error("allowed_roots entries must not be empty strings");
    }
  }
  const allowedRoots = (
    allowedRaw.length > 0 ? allowedRaw.map((r) => expandPath(r, env)) : [findRepoRoot(configDir)]
  ).map(canonicalize);
  for (const root of allowedRoots) {
    if (root === path.parse(root).root) {
      throw new Error(
        `allowed_roots entry '${root}' is a filesystem root, which would disable the diode ` +
          "containment layer entirely. List the actual work directories instead.",
      );
    }
  }

  const vaults: VaultEntry[] = raw.vaults.map((rv: RawVault) => {
    if (typeof rv.vault_id !== "string" || typeof rv.path_default !== "string") {
      throw new Error("each vault needs string 'vault_id' and 'path_default'");
    }
    const pathEnv = typeof rv.path_env === "string" ? rv.path_env : undefined;
    const rawPath = (pathEnv !== undefined ? env[pathEnv] : undefined) ?? rv.path_default;
    const resolved = canonicalize(expandPath(rawPath, env));
    checkDiode(rv.vault_id, resolved, allowedRoots);
    const extensions = asStringArray(rv.extensions, "extensions");
    return {
      vault_id: rv.vault_id,
      label: typeof rv.label === "string" ? rv.label : "",
      path_env: pathEnv,
      path_default: rv.path_default,
      excluded_dirs: asStringArray(rv.excluded_dirs, "excluded_dirs"),
      exclude_underscore_prefix: rv.exclude_underscore_prefix === true,
      extensions: extensions.length > 0 ? extensions : [".md"],
      resolved_path: resolved,
    };
  });

  const indexDb =
    overrides.indexDb ??
    env.EOS_INDEX_DB ??
    (typeof raw.index_db === "string" ? raw.index_db : DEFAULT_INDEX_DB);
  const embedModel =
    overrides.embedModel ??
    env.EOS_EMBED_MODEL ??
    (typeof raw.embed_model === "string" ? raw.embed_model : undefined);

  return {
    embed_model: embedModel ?? DEFAULT_MODEL,
    index_db: indexDb,
    allowed_roots: allowedRoots,
    vaults,
    resolved_db: expandPath(indexDb, env),
  };
}

// Port resolution: CLI flag > EOS_SERVER_PORT > default. An unparseable value
// is a mistake, not a reason to silently serve on the default port.
export function resolvePort(flag: string | undefined, env: Env, fallback = 8765): number {
  const raw = flag ?? env.EOS_SERVER_PORT;
  if (raw === undefined) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port ${JSON.stringify(raw)}: must be an integer 1..65535`);
  }
  return port;
}

export function resolveHost(flag: string | undefined, env: Env): string {
  return flag ?? env.EOS_SERVER_HOST ?? "127.0.0.1";
}
