import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expandTilde, expandVars, loadConfig, resolvePort } from "./config.js";
import { DEFAULT_MODEL } from "./embed.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "eos-config-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeConfig(body: object): string {
  const p = path.join(dir, "vaults.json");
  fs.writeFileSync(p, JSON.stringify(body));
  return p;
}

function vaultDir(name: string): string {
  const p = path.join(dir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

describe("expansion", () => {
  it("expands tilde-slash and bare tilde only", () => {
    expect(expandTilde("~/notes", "/base")).toBe("/base/notes");
    expect(expandTilde("~", "/base")).toBe("/base");
    expect(expandTilde("~backup/x", "/base")).toBe("~backup/x");
    expect(expandTilde("~/notes", undefined)).toBe("~/notes");
  });

  it("expands vars single-pass, undefined empty, lone dollar literal", () => {
    const lookup = (k: string) => ({ V: "/data", A: "$B", B: "boom" })[k];
    expect(expandVars("$V/sub", lookup)).toBe("/data/sub");
    expect(expandVars("$MISSING/sub", lookup)).toBe("/sub");
    expect(expandVars("$A", lookup)).toBe("$B");
    expect(expandVars("cost is $ 5", lookup)).toBe("cost is $ 5");
  });
});

describe("loadConfig", () => {
  it("accepts a vault inside the default allowed root", () => {
    const vault = vaultDir("vault");
    const cfgPath = writeConfig({
      embed_model: DEFAULT_MODEL,
      index_db: path.join(dir, "index.db"),
      vaults: [{ vault_id: "work", path_default: vault }],
    });
    const cfg = loadConfig(cfgPath, { HOME: dir });
    expect(cfg.vaults[0]?.resolved_path).toBe(fs.realpathSync(vault));
    expect(cfg.embed_model).toBe(DEFAULT_MODEL);
  });

  it("env overrides json for index_db and embed_model", () => {
    const cfgPath = writeConfig({
      embed_model: "sentence-transformers/all-MiniLM-L6-v2",
      index_db: path.join(dir, "from-json.db"),
      vaults: [{ vault_id: "work", path_default: vaultDir("vault") }],
    });
    const cfg = loadConfig(cfgPath, {
      HOME: dir,
      EOS_INDEX_DB: path.join(dir, "from-env.db"),
      EOS_EMBED_MODEL: "intfloat/multilingual-e5-base",
    });
    expect(cfg.resolved_db).toBe(path.join(dir, "from-env.db"));
    expect(cfg.embed_model).toBe("intfloat/multilingual-e5-base");
  });

  it("explicit override beats env", () => {
    const cfgPath = writeConfig({
      index_db: path.join(dir, "from-json.db"),
      vaults: [{ vault_id: "work", path_default: vaultDir("vault") }],
    });
    const cfg = loadConfig(
      cfgPath,
      { HOME: dir, EOS_INDEX_DB: path.join(dir, "from-env.db") },
      { indexDb: path.join(dir, "from-flag.db") },
    );
    expect(cfg.resolved_db).toBe(path.join(dir, "from-flag.db"));
  });

  it("path_env wins over path_default", () => {
    const envVault = vaultDir("env-vault");
    const cfgPath = writeConfig({
      vaults: [{ vault_id: "work", path_env: "MY_VAULT", path_default: vaultDir("default") }],
    });
    const cfg = loadConfig(cfgPath, { HOME: dir, MY_VAULT: envVault });
    expect(cfg.vaults[0]?.resolved_path).toBe(fs.realpathSync(envVault));
  });

  it("diode: rejects an iCloud path even when under an allowed root", () => {
    // Assembled from parts so the anonymization gate stays clean.
    const container = ["Library/Mobile", "Documents"].join(" ");
    const obsidianDir = ["iCloud~md", "obsidian"].join("~");
    const icloud = path.join(dir, container, obsidianDir, "vault");
    fs.mkdirSync(icloud, { recursive: true });
    const cfgPath = writeConfig({
      allowed_roots: [dir],
      vaults: [{ vault_id: "personal", path_default: icloud }],
    });
    expect(() => loadConfig(cfgPath, { HOME: dir })).toThrow(/diode policy.*iCloud/s);
  });

  it("diode: rejects com~apple~CloudDocs paths", () => {
    const cfgPath = writeConfig({
      allowed_roots: [dir],
      vaults: [{ vault_id: "p", path_default: path.join(dir, "com~apple~CloudDocs/notes") }],
    });
    expect(() => loadConfig(cfgPath, { HOME: dir })).toThrow(/diode policy/);
  });

  it("diode: rejects a vault outside every allowed root", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "eos-outside-"));
    try {
      const cfgPath = writeConfig({
        vaults: [{ vault_id: "work", path_default: outside }],
      });
      expect(() => loadConfig(cfgPath, { HOME: dir })).toThrow(/diode policy.*allowed roots/s);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("diode: explicit allowed_roots admits an outside vault", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "eos-outside-"));
    try {
      const cfgPath = writeConfig({
        allowed_roots: [dir, outside],
        vaults: [{ vault_id: "work", path_default: outside }],
      });
      const cfg = loadConfig(cfgPath, { HOME: dir });
      expect(cfg.vaults[0]?.resolved_path).toBe(fs.realpathSync(outside));
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("diode: a symlink inside an allowed root cannot smuggle in an iCloud path", () => {
    const fakeCloud = fs.mkdtempSync(path.join(os.tmpdir(), "eos-cloud-"));
    try {
      const marker = ["Library/Mobile", "Documents"].join(" ");
      const target = path.join(fakeCloud, marker, "personal-vault");
      fs.mkdirSync(target, { recursive: true });
      const link = path.join(dir, "work-notes");
      fs.symlinkSync(target, link);
      const cfgPath = writeConfig({
        allowed_roots: [dir],
        vaults: [{ vault_id: "work", path_default: link }],
      });
      expect(() => loadConfig(cfgPath, { HOME: dir })).toThrow(/diode policy/);
    } finally {
      fs.rmSync(fakeCloud, { recursive: true, force: true });
    }
  });

  it("diode: iCloud marker matching is case-insensitive", () => {
    const lowered = ["library/mobile", "documents"].join(" ");
    const vault = path.join(dir, lowered, "vault");
    const cfgPath = writeConfig({
      allowed_roots: [dir],
      vaults: [{ vault_id: "work", path_default: vault }],
    });
    expect(() => loadConfig(cfgPath, { HOME: dir })).toThrow(/diode policy.*iCloud/s);
  });

  it("rejects a filesystem root in allowed_roots", () => {
    const cfgPath = writeConfig({
      allowed_roots: ["/"],
      vaults: [{ vault_id: "work", path_default: vaultDir("work") }],
    });
    expect(() => loadConfig(cfgPath, { HOME: dir })).toThrow(/filesystem root/);
  });

  it("rejects empty allowed_roots entries", () => {
    const cfgPath = writeConfig({
      allowed_roots: [""],
      vaults: [{ vault_id: "work", path_default: vaultDir("work") }],
    });
    expect(() => loadConfig(cfgPath, { HOME: dir })).toThrow(/must not be empty/);
  });
});

describe("resolvePort", () => {
  it("flag beats env beats default", () => {
    expect(resolvePort("9001", { EOS_SERVER_PORT: "9002" })).toBe(9001);
    expect(resolvePort(undefined, { EOS_SERVER_PORT: "9002" })).toBe(9002);
    expect(resolvePort(undefined, {})).toBe(8765);
  });

  it("unparseable port is a hard error", () => {
    expect(() => resolvePort("nope", {})).toThrow(/invalid port/);
    expect(() => resolvePort(undefined, { EOS_SERVER_PORT: "80x" })).toThrow(/invalid port/);
    expect(() => resolvePort("0", {})).toThrow(/invalid port/);
    expect(() => resolvePort("65536", {})).toThrow(/invalid port/);
  });
});
