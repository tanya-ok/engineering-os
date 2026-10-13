import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { checkIndex, checkVaults, hasErrors } from "./doctor.js";
import { DEFAULT_MODEL } from "./embed.js";

let dir: string;

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "eos-doctor-")));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function setup(vaultPath: string) {
  const cfgPath = path.join(dir, "vaults.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      embed_model: DEFAULT_MODEL,
      index_db: path.join(dir, "index.db"),
      allowed_roots: [dir],
      vaults: [
        {
          vault_id: "work",
          path_env: "EOS_TEST_VAULT",
          path_default: vaultPath,
          exclude_underscore_prefix: true,
        },
      ],
    }),
  );
  return cfgPath;
}

function writeIndex(model: string, vaultIds: string[], root = dir): void {
  const db = new Database(path.join(dir, "index.db"));
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
  db.exec("CREATE TABLE files (id INTEGER PRIMARY KEY, vault_id TEXT, path TEXT, mtime REAL)");
  db.prepare("INSERT INTO meta VALUES ('embed_model', ?)").run(model);
  for (const id of vaultIds) {
    db.prepare("INSERT INTO files(vault_id, path, mtime) VALUES (?, ?, 0)").run(
      id,
      path.join(root, `${id}.md`),
    );
  }
  db.close();
}

describe("checkVaults", () => {
  it("errors on a missing vault directory and names the source", () => {
    const cfg = loadConfig(setup(path.join(dir, "absent")), { HOME: dir });
    const [f] = checkVaults(cfg, {});
    expect(f?.level).toBe("error");
    expect(f?.message).toContain("EOS_TEST_VAULT unset");
  });

  it("warns on an empty vault and counts files outside staging folders", () => {
    const vault = path.join(dir, "vault");
    fs.mkdirSync(path.join(vault, "_inbox"), { recursive: true });
    fs.writeFileSync(path.join(vault, "_inbox", "staged.md"), "x");
    const cfg = loadConfig(setup(vault), { HOME: dir });
    expect(checkVaults(cfg, {})[0]?.level).toBe("warn");

    fs.mkdirSync(path.join(vault, "SecOps"));
    fs.writeFileSync(path.join(vault, "SecOps", "note.md"), "x");
    const [ok] = checkVaults(cfg, { EOS_TEST_VAULT: vault });
    expect(ok?.level).toBe("ok");
    expect(ok?.message).toContain("1 files (env EOS_TEST_VAULT)");
  });

  it("reports a blank env value as the default, like loadConfig", () => {
    const cfg = loadConfig(setup(path.join(dir, "absent")), { HOME: dir, EOS_TEST_VAULT: " " });
    const [f] = checkVaults(cfg, { EOS_TEST_VAULT: " " });
    expect(f?.message).toContain("path_default (EOS_TEST_VAULT unset)");
  });
});

describe("checkIndex", () => {
  it("errors when the index is missing", () => {
    const cfg = loadConfig(setup(dir), { HOME: dir });
    expect(hasErrors(checkIndex(cfg))).toBe(true);
  });

  it("errors on a model mismatch", () => {
    writeIndex("sentence-transformers/all-MiniLM-L6-v2", ["work"]);
    const cfg = loadConfig(setup(dir), { HOME: dir });
    const findings = checkIndex(cfg);
    expect(hasErrors(findings)).toBe(true);
    expect(findings[0]?.message).toContain("--rebuild");
  });

  it("warns on configured vaults without rows and on stale vault rows", () => {
    writeIndex(DEFAULT_MODEL, ["old"]);
    const cfg = loadConfig(setup(dir), { HOME: dir });
    const findings = checkIndex(cfg);
    expect(hasErrors(findings)).toBe(false);
    expect(findings.map((f) => f.message)).toEqual([
      "no files indexed for vault work",
      "holds rows for unconfigured vault old",
    ]);
  });

  it("warns when indexed files lie outside the configured vault path", () => {
    writeIndex(DEFAULT_MODEL, ["work"], "/elsewhere");
    const cfg = loadConfig(setup(dir), { HOME: dir });
    const findings = checkIndex(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("1 files of vault work lie outside");
  });

  it("reports ok for a healthy index", () => {
    writeIndex(DEFAULT_MODEL, ["work"]);
    const cfg = loadConfig(setup(dir), { HOME: dir });
    const findings = checkIndex(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("ok");
  });
});
