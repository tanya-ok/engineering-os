import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expandPath, loadDashboardConfig, publicConfig, runtimeConfig } from "./config.js";

let dir = "";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "eos-dashboard-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (obj: unknown): string => {
  const p = path.join(dir, "dashboard.json");
  fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj));
  return p;
};

describe("loadDashboardConfig", () => {
  it("returns an empty config when the file is missing", () => {
    expect(loadDashboardConfig(path.join(dir, "nope.json"))).toEqual({});
  });

  it("expands ~ and $VARS in paths", () => {
    const cfg = loadDashboardConfig(
      write({ beads_root: "~/work", jsonl: "$WS/export.jsonl", projects: { p: { path: "~/p" } } }),
      { HOME: "/data/sample", WS: "/data" },
    );
    expect(cfg.beads_root).toBe("/data/sample/work");
    expect(cfg.jsonl).toBe("/data/export.jsonl");
    expect(cfg.projects?.p?.path).toBe("/data/sample/p");
  });

  it("rejects malformed JSON and wrong field types", () => {
    expect(() => loadDashboardConfig(write("{nope"))).toThrow(/dashboard config/);
    expect(() => loadDashboardConfig(write({ ttl_seconds: "soon" }))).toThrow(/ttl_seconds/);
    expect(() => loadDashboardConfig(write({ projects: ["x"] }))).toThrow(/projects/);
    expect(() => loadDashboardConfig(write({ beads_root: 1 }))).toThrow(/beads_root/);
  });

  it("exposes only presentation fields to the browser", () => {
    const pub = publicConfig({
      beads_root: "/private/workspace",
      external_ref_url: "https://tracker.example/{ref}",
      projects: { p: { label: "P", url: "https://example.com/p", path: "/private/project" } },
    });
    expect(pub).toEqual({
      external_ref_url: "https://tracker.example/{ref}",
      projects: { p: { label: "P", url: "https://example.com/p" } },
    });
    expect(JSON.stringify(pub)).not.toContain("private");
  });
});

describe("expandPath", () => {
  it("leaves unknown variables untouched and resolves the result", () => {
    expect(expandPath("/x/$NOPE/y", {})).toBe("/x/$NOPE/y");
    expect(expandPath("~", { HOME: "/data/sample" })).toBe("/data/sample");
  });
});

describe("runtimeConfig", () => {
  it("does not load an implicit overlay", () => {
    expect(runtimeConfig(false)).toEqual({});
  });
  it("ignores even an explicitly selected invalid private config in demo mode", () => {
    expect(runtimeConfig(true, write("{private-invalid"))).toEqual({});
  });
  it("loads an explicitly selected workspace overlay", () => {
    expect(runtimeConfig(false, write({ beads_root: "/data/work" })).beads_root).toBe("/data/work");
  });
});
