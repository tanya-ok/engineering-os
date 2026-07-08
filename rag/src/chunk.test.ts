import { describe, expect, it } from "vitest";

import { chunkMarkdown, MAX_CHUNK_CHARS } from "./chunk.js";

function cpLength(s: string): number {
  return [...s].length;
}

describe("chunkMarkdown", () => {
  it("drops sections shorter than the minimum", () => {
    expect(chunkMarkdown("# Tiny\n\ntoo short")).toEqual([]);
  });

  it("keeps a normal section as one chunk including its heading line", () => {
    const text = `# Runbook\n\n${"word ".repeat(40)}`;
    const chunks = chunkMarkdown(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content.startsWith("# Runbook")).toBe(true);
    expect(chunks[0]?.heading).toBe("Runbook");
  });

  it("splits an oversized section on the last paragraph break", () => {
    const para = "x".repeat(900);
    const chunks = chunkMarkdown(`# Big\n${para}\n\n${para}`);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(cpLength(c.content)).toBeLessThanOrEqual(MAX_CHUNK_CHARS + "# Big\n".length);
    }
  });

  it("hard-cuts an oversized section without paragraph breaks", () => {
    const chunks = chunkMarkdown(`# Solid\n${"y".repeat(4000)}`);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(cpLength(c.content)).toBeLessThanOrEqual(MAX_CHUNK_CHARS + 16);
    }
  });

  it("counts Cyrillic in code points and never corrupts it", () => {
    const chunks = chunkMarkdown(`# Заголовок\n${"ф".repeat(4000)}`);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(cpLength(c.content)).toBeLessThanOrEqual(MAX_CHUNK_CHARS + 16);
      expect(c.content.isWellFormed()).toBe(true);
    }
  });

  it("never splits surrogate pairs", () => {
    const chunks = chunkMarkdown(`# Emoji\n${"\u{1F680}".repeat(4000)}`);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.content.isWellFormed()).toBe(true);
      expect(cpLength(c.content)).toBeLessThanOrEqual(MAX_CHUNK_CHARS + 16);
    }
  });

  it("multiple headings become separate chunks", () => {
    const body = "content ".repeat(10);
    const chunks = chunkMarkdown(`# One\n${body}\n# Two\n${body}`);
    expect(chunks.map((c) => c.heading)).toEqual(["One", "Two"]);
  });
});
