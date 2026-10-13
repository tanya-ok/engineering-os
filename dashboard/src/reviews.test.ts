import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadDashboardConfig, publicConfig } from "./config.js";
import { readReviews } from "./reviews.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function fixture(complete = true) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "eos-review-"));
  dirs.push(d);
  const report = path.join(d, "report.json"),
    manifest = path.join(d, "manifest.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify({ schema_version: 1, execution: { isolated_project_runs: { demo: "run-1" } } }),
  );
  fs.writeFileSync(
    report,
    JSON.stringify({
      complete,
      projects: [
        {
          project: "demo",
          revision: "abc123",
          dirty: true,
          complete: true,
          findings: [{ id: "F1", title: "Test finding", status: "unresolved" }],
          reviews: {
            verify: {
              votes: [{ finding_id: "F1", verdict: "needs_test", reason: "Insufficient evidence" }],
            },
            kimi: { votes: [{ finding_id: "F1", verdict: "support", reason: "Supported subset" }] },
          },
        },
      ],
    }),
  );
  return { id: "local-review", report, manifest, tasks: { demo: { F1: "work:local:demo:1" } } };
}
it("keeps independent votes, incomplete runs, revisions and explicit investigation links", () => {
  const source = fixture(false),
    before = fs.readFileSync(source.report, "utf8");
  const data = readReviews([source]);
  const card = data.reviews[0];
  expect(data.schema_version).toBe("ReviewEvidence/v1");
  expect(data.read_only).toBe(true);
  expect(data.approval).toBe(false);
  expect(card?.run_id).toBe("run-1");
  expect(card?.complete).toBe(false);
  expect(card?.dirty).toBe(true);
  expect(card?.findings[0]?.status).toBe("unresolved");
  expect(card?.findings[0]?.votes.map((v) => v.decision)).toEqual(["needs_test", "support"]);
  expect(card?.findings[0]?.investigation_task).toBe("work:local:demo:1");
  expect(fs.readFileSync(source.report, "utf8")).toBe(before);
});
it("exposes incompatible/missing sources alongside valid reports without inventing approvals", () => {
  const source = fixture(),
    bad = { ...source, id: "missing", report: `${source.report}.absent` };
  const data = readReviews([source, bad]);
  expect(data.reviews).toHaveLength(1);
  expect(data.sources[1]?.error).toBeTruthy();
  fs.writeFileSync(source.manifest, JSON.stringify({ schema_version: 99 }));
  expect(readReviews([source]).reviews).toEqual([]);
});
it("keeps local source paths and report bindings out of public display config", () => {
  const source = fixture(),
    file = path.join(path.dirname(source.report), "config.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      sources: [
        { source_id: "local", repository_id: "demo", source: { kind: "jsonl", path: "./tasks" } },
      ],
      reviews: [source],
    }),
  );
  const cfg = loadDashboardConfig(file);
  expect(cfg.reviews?.[0]?.tasks).toEqual(source.tasks);
  expect(publicConfig(cfg)).toEqual({ projects: {} });
  fs.writeFileSync(
    file,
    JSON.stringify({
      sources: [
        { source_id: "local", repository_id: "demo", source: { kind: "github", path: "./tasks" } },
        { source_id: "local", repository_id: "demo", source: { kind: "jsonl", path: "./tasks" } },
      ],
    }),
  );
  expect(() => loadDashboardConfig(file)).toThrow("Duplicate");
});
