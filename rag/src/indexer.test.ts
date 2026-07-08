import path from "node:path";

import { describe, expect, it } from "vitest";

import { namespaceOf, needsReindex } from "./indexer.js";

describe("indexer", () => {
  it("reindex decision follows the mtime epsilon", () => {
    expect(needsReindex(undefined, 100)).toBe(true);
    expect(needsReindex(100, 100)).toBe(false);
    expect(needsReindex(100, 100.0005)).toBe(false);
    expect(needsReindex(100, 101)).toBe(true);
  });

  it("namespace is the first folder component", () => {
    const root = path.sep === "/" ? "/vault" : "C:\\vault";
    expect(namespaceOf(path.join(root, "CloudOps", "run.md"), root)).toBe("CloudOps");
    expect(namespaceOf(path.join(root, "top.md"), root)).toBe("");
  });
});
