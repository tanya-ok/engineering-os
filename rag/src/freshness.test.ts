import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { open } from "./db.js";
import type { Embedder } from "./embed.js";
import { checkIndexScope, indexAll } from "./indexer.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "eos-fresh-"));
  dirs.push(d);
  const vault = path.join(d, "vault");
  fs.mkdirSync(vault);
  const file = path.join(vault, "note.md");
  fs.writeFileSync(file, `# Decision\n${"Original deployment boundary. ".repeat(4)}`);
  const cfgFile = path.join(d, "config.json");
  fs.writeFileSync(
    cfgFile,
    JSON.stringify({
      index_db: path.join(d, "index.db"),
      vaults: [{ vault_id: "work", path_default: vault }],
    }),
  );
  const cfg = loadConfig(cfgFile);
  const db = open(cfg.resolved_db);
  const embedder = {
    dim: 4,
    embedPassages: async (texts: string[]) => texts.map(() => Float32Array.from([1, 0, 0, 0])),
  } as unknown as Embedder;
  return { d, vault, file, cfg, db, embedder, cfgFile };
}
it("refreshes edited content even when the file modification time is preserved", async () => {
  const { file, cfg, db, embedder } = fixture();
  try {
    await indexAll(cfg, embedder, db);
    const old = fs.statSync(file);
    expect((await indexAll(cfg, embedder, db)).filesIndexed).toBe(0);
    fs.writeFileSync(file, `# Decision\n${"Changed deployment boundary. ".repeat(4)}`);
    fs.utimesSync(file, old.atime, old.mtime);
    expect((await indexAll(cfg, embedder, db)).filesIndexed).toBe(1);
    expect(
      (db.prepare("SELECT content FROM chunks").get() as { content: string }).content,
    ).toContain("Changed");
    fs.unlinkSync(file);
    expect((await indexAll(cfg, embedder, db)).filesPruned).toBe(1);
  } finally {
    db.close();
  }
});
it("refuses an old broader index after configuration narrows or moves the vault", async () => {
  const { d, cfg, db, embedder } = fixture();
  try {
    await indexAll(cfg, embedder, db);
    expect(() => checkIndexScope(db, cfg)).not.toThrow();
    expect(() => checkIndexScope(db, { ...cfg, vaults: [] })).toThrow("unconfigured");
    expect(() =>
      checkIndexScope(db, {
        ...cfg,
        vaults: cfg.vaults.map((v) => ({ ...v, resolved_path: path.join(d, "other") })),
      }),
    ).toThrow("outside");
    expect(() =>
      checkIndexScope(db, {
        ...cfg,
        vaults: cfg.vaults.map((v) => ({ ...v, extensions: [".txt"] })),
      }),
    ).toThrow("excluded");
  } finally {
    db.close();
  }
});
it("refuses overlapping vault paths and repeated IDs", () => {
  const { vault, cfgFile, db } = fixture();
  db.close();
  const vaults = [
    { vault_id: "work", path_default: vault },
    { vault_id: "private", path_default: path.join(vault, "nested") },
  ];
  fs.writeFileSync(cfgFile, JSON.stringify({ vaults }));
  expect(() => loadConfig(cfgFile)).toThrow("overlap");
  vaults[1] = { vault_id: "work", path_default: path.join(path.dirname(vault), "other") };
  fs.writeFileSync(cfgFile, JSON.stringify({ vaults }));
  expect(() => loadConfig(cfgFile)).toThrow("unique");
});
