import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bufferToF32, ensureSchema, f32ToBuffer, ftsMode, getMeta, open } from "./db.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "eos-db-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("db", () => {
  it("f32 buffer round trip", () => {
    const v = Float32Array.from([0, 1.5, -2.25, 3.125e10]);
    expect([...bufferToF32(f32ToBuffer(v))]).toEqual([...v]);
  });

  it("open probes vec_version", () => {
    const db = open(path.join(dir, "probe.db"));
    const row = db.prepare("SELECT vec_version() AS v").get() as { v: string };
    expect(row.v).toMatch(/^v?\d/);
    db.close();
  });

  it("dim and model guards trigger on change and suggest --rebuild", () => {
    const db = open(path.join(dir, "guard.db"));
    ensureSchema(db, 384, "model-a");
    ensureSchema(db, 384, "model-a");
    expect(() => ensureSchema(db, 768, "model-a")).toThrow(/--rebuild/);
    expect(() => ensureSchema(db, 384, "model-b")).toThrow(/--rebuild/);
    db.close();
  });

  it("records the FTS mode in meta and the table works", () => {
    const db = open(path.join(dir, "fts.db"));
    ensureSchema(db, 4, "model-a");
    const mode = getMeta(db, "fts_mode");
    expect(["trigram", "unicode61"]).toContain(mode);
    expect(ftsMode(db)).toBe(mode);

    db.prepare("INSERT INTO chunks_fts(rowid, content) VALUES (?, ?)").run(
      1,
      "certificate rotation runbook",
    );
    const hits = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?")
      .all('"certificate"') as { rowid: number }[];
    expect(hits).toHaveLength(1);
  });

  it("trigram mode matches Cyrillic substrings", () => {
    const db = open(path.join(dir, "cyr.db"));
    ensureSchema(db, 4, "model-a");
    if (ftsMode(db) !== "trigram") return;
    db.prepare("INSERT INTO chunks_fts(rowid, content) VALUES (?, ?)").run(
      1,
      "как оформить architecture decision record",
    );
    const hits = db
      .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?")
      .all('"оформ"') as { rowid: number }[];
    expect(hits).toHaveLength(1);
  });

  it("vec0 kNN returns nearest neighbours", () => {
    const db = open(path.join(dir, "vec.db"));
    ensureSchema(db, 4, "model-a");
    const ins = db.prepare("INSERT INTO embeddings(chunk_id, embedding) VALUES (?, ?)");
    ins.run(BigInt(1), f32ToBuffer(Float32Array.from([1, 0, 0, 0])));
    ins.run(BigInt(2), f32ToBuffer(Float32Array.from([0, 1, 0, 0])));
    const rows = db
      .prepare(
        "SELECT chunk_id FROM embeddings WHERE embedding MATCH ? AND k = ? ORDER BY distance",
      )
      .all(f32ToBuffer(Float32Array.from([0.9, 0.1, 0, 0])), 2) as { chunk_id: number }[];
    expect(rows.map((r) => r.chunk_id)).toEqual([1, 2]);
  });
});
