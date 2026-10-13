import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { normalizeIssue } from "./beads.js";
import { buildGraph, readyQueue } from "./graph.js";
import { IssueStore } from "./store.js";
import { qualifyIssue, readTracker, type TrackerSource, workItemId } from "./work-items.js";

const dirs: string[] = [];
function dir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "eos-adapter-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function source(kind: "jsonl" | "json" | "github", file: string, id = "local"): TrackerSource {
  return { source_id: id, repository_id: "demo", source: { kind, path: file } };
}
it("renders equivalent beads, portable JSON and GitHub snapshots", async () => {
  const d = dir();
  fs.writeFileSync(
    path.join(d, "beads"),
    JSON.stringify({ id: "1", title: "Review", status: "open" }),
  );
  fs.writeFileSync(
    path.join(d, "json"),
    JSON.stringify({
      schema_version: "WorkItems/v1",
      items: [{ id: "1", title: "Review", status: "open" }],
    }),
  );
  fs.writeFileSync(
    path.join(d, "github"),
    JSON.stringify([
      { number: 1, title: "Review", state: "open" },
      { number: 2, title: "Pull request", pull_request: {} },
    ]),
  );
  const results = await Promise.all(
    (["jsonl", "json", "github"] as const).map((k) =>
      readTracker(source(k, path.join(d, k === "jsonl" ? "beads" : k))),
    ),
  );
  const graphs = results.map((items) => buildGraph(items));
  expect(graphs[1]).toEqual(graphs[0]);
  expect(graphs[2]).toEqual(graphs[0]);
  expect(results[2]?.[0]?.work_item?.capabilities.dependencies).toBe(false);
  expect(results[0]?.[0]?.work_item?.capabilities.write).toBe(false);
});
it("isolates overlapping native IDs and refuses duplicate IDs within a source", async () => {
  expect(workItemId("a:b", "repo", "1")).not.toBe(workItemId("a", "b:repo", "1"));
  const raw = normalizeIssue({ id: "same-1", title: "Review" });
  if (!raw) throw new Error("Fixture invalid");
  const a = qualifyIssue(raw, source("jsonl", "unused", "a"), "now");
  const b = qualifyIssue(raw, source("jsonl", "unused", "b"), "now");
  expect(a.id).not.toBe(b.id);
  expect(buildGraph([a, b]).nodes.filter((n) => n.kind === "issue")).toHaveLength(2);
  const file = path.join(dir(), "dupes");
  fs.writeFileSync(file, `${JSON.stringify(raw)}\n${JSON.stringify(raw)}`);
  await expect(readTracker(source("jsonl", file))).rejects.toThrow("Duplicate");
});
it("preserves unknown states and keeps unresolved dependencies out of ready", () => {
  const raw = normalizeIssue({
    id: "a-1",
    title: "Review",
    status: "surprise",
    dependencies: [{ depends_on_id: "missing" }],
  });
  if (!raw) throw new Error("Fixture invalid");
  const item = qualifyIssue(raw, source("jsonl", "unused"), "now");
  expect(item.status).toBe("unknown");
  expect(item.work_item?.raw_status).toBe("surprise");
  expect(readyQueue([item])).toEqual([]);
  expect(readyQueue([{ ...item, status: "open" }])).toEqual([]);
});
it("retains only the failed source snapshot while a healthy source advances", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  const d = dir(),
    a = path.join(d, "a"),
    b = path.join(d, "b");
  const row = (title: string) => JSON.stringify({ id: "1", title });
  fs.writeFileSync(a, row("A1"));
  fs.writeFileSync(b, row("B1"));
  const store = new IssueStore(
    { kind: "portfolio", sources: [source("jsonl", a, "a"), source("jsonl", b, "b")] },
    1,
  );
  expect(await store.get()).toHaveLength(2);
  fs.writeFileSync(a, row("A2"));
  fs.writeFileSync(b, "broken");
  vi.advanceTimersByTime(10);
  expect((await store.get()).map((i) => i.title).sort()).toEqual(["A2", "B1"]);
  expect(store.lastError).toBeDefined();
  expect(store.sourceStatus().filter((s) => s.error)).toHaveLength(1);
  fs.writeFileSync(b, row("B2"));
  vi.advanceTimersByTime(15000);
  expect((await store.get()).map((i) => i.title).sort()).toEqual(["A2", "B2"]);
  expect(store.lastError).toBeUndefined();
});
it("exposes initial source failure separately from a healthy empty snapshot", async () => {
  const d = dir(),
    empty = path.join(d, "empty");
  fs.writeFileSync(empty, "");
  const store = new IssueStore(
    {
      kind: "portfolio",
      sources: [source("jsonl", empty, "a"), source("jsonl", path.join(d, "absent"), "b")],
    },
    1000,
  );
  expect(await store.get()).toEqual([]);
  expect(store.lastError).toBeDefined();
  expect(store.sourceStatus().map((s) => s.count)).toEqual([0, null]);
});

it("marks missing endpoints and resolves explicit cross-repository references", async () => {
  const d = dir(),
    a = path.join(d, "a"),
    b = path.join(d, "b");
  fs.writeFileSync(
    a,
    JSON.stringify({
      schema_version: "WorkItems/v1",
      items: [
        {
          id: "1",
          title: "A",
          dependencies: [
            { target_ref: { source_id: "b", repository_id: "other", native_id: "1" } },
            { depends_on_id: "absent" },
          ],
        },
      ],
    }),
  );
  fs.writeFileSync(
    b,
    JSON.stringify({
      schema_version: "WorkItems/v1",
      items: [{ id: "1", title: "B", status: "closed" }],
    }),
  );
  const sa = source("json", a, "a"),
    sb = { ...source("json", b, "b"), repository_id: "other" };
  const store = new IssueStore({ kind: "portfolio", sources: [sa, sb] }, 1000);
  const items = await store.get();
  const own = items.find((i) => i.work_item?.source_id === "a");
  expect(own?.dependencies[0]?.to).toBe(workItemId("b", "other", "1"));
  expect(own?.dependencies.map((d) => d.unresolved)).toEqual([false, true]);
  expect(
    store.sourceStatus().find((s) => s.id === JSON.stringify(["a", "demo"]))?.unresolved_edges,
  ).toBe(1);
  expect(readyQueue(items)).toEqual([]);
  expect(
    buildGraph(items, { includeClosed: true }).edges.some(
      (e) => e.target === workItemId("b", "other", "1"),
    ),
  ).toBe(true);
});

it("does not invent readiness for GitHub snapshots with missing or unknown states", async () => {
  const file = path.join(dir(), "github-unknown");
  fs.writeFileSync(
    file,
    JSON.stringify([
      { number: 1, title: "No state" },
      { number: 2, title: "New state", state: "triage" },
    ]),
  );
  const issues = await readTracker(source("github", file));
  expect(issues.map((i) => i.status)).toEqual(["unknown", "unknown"]);
  expect(issues[1]?.work_item?.raw_status).toBe("triage");
  expect(readyQueue(issues)).toEqual([]);
});
