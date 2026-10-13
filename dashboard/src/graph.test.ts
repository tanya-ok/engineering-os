import { describe, expect, it } from "vitest";

import {
  buildGraph,
  isBlocked,
  isReady,
  parentBlocked,
  readyQueue,
  summarizeProjects,
} from "./graph.js";
import type { Issue } from "./types.js";

function issue(id: string, over: Partial<Issue> = {}): Issue {
  return {
    id,
    title: id,
    status: "open",
    priority: 2,
    issue_type: "task",
    labels: [],
    dependencies: [],
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    project: id.slice(0, id.lastIndexOf("-")),
    ...over,
  };
}

const dep = (from: string, to: string, type = "blocks") => ({ from, to, type });

describe("ready and blocked", () => {
  const closedBlocker = issue("p-a", { status: "closed" });
  const openBlocker = issue("p-b");
  const readyOne = issue("p-c", { dependencies: [dep("p-c", "p-a")] });
  const blockedOne = issue("p-d", { dependencies: [dep("p-d", "p-b")] });
  const child = issue("p-e", { dependencies: [dep("p-e", "p-b", "parent-child")] });
  const all = [closedBlocker, openBlocker, readyOne, blockedOne, child];
  const byId = new Map(all.map((i) => [i.id, i]));

  it("treats a closed blocker as cleared", () => {
    expect(isReady(readyOne, byId)).toBe(true);
    expect(isBlocked(readyOne, byId)).toBe(false);
  });

  it("treats an open blocker as blocking", () => {
    expect(isReady(blockedOne, byId)).toBe(false);
    expect(isBlocked(blockedOne, byId)).toBe(true);
  });

  it("does not count parent-child as a blocker", () => {
    expect(isReady(child, byId)).toBe(true);
  });

  it("orders the ready queue by priority", () => {
    const q = readyQueue([issue("p-x", { priority: 3 }), issue("p-y", { priority: 0 })]);
    expect(q.map((i) => i.id)).toEqual(["p-y", "p-x"]);
  });
});

describe("summarizeProjects", () => {
  it("counts by derived state per project", () => {
    const issues = [
      issue("a-1"),
      issue("a-2", { status: "in_progress" }),
      issue("a-3", { status: "closed" }),
      issue("a-4", { dependencies: [dep("a-4", "a-1")] }),
      issue("a-5", { issue_type: "epic", labels: ["domain:SecOps"], domain: "SecOps" }),
      issue("b-1", { status: "deferred" }),
    ];
    const [a, b] = summarizeProjects(issues);
    expect(a).toMatchObject({
      id: "a",
      total: 5,
      open: 3,
      in_progress: 1,
      blocked: 1,
      closed: 1,
      ready: 2,
    });
    expect(a?.epics).toEqual([{ id: "a-5", title: "a-5", status: "open" }]);
    expect(a?.domains).toEqual(["SecOps"]);
    expect(b).toMatchObject({ id: "b", total: 1, deferred: 1, open: 0 });
  });
});

describe("buildGraph", () => {
  const issues = [
    issue("a-1"),
    issue("a-2", { status: "closed" }),
    issue("a-3", { dependencies: [dep("a-3", "a-1"), dep("a-3", "a-2")] }),
    issue("b-1", { dependencies: [dep("b-1", "a-1", "relates-to")] }),
    issue("a-1x", { id: "a-1x", dependencies: [dep("a-1x", "b-1", "relates-to")] }),
  ];

  it("hides closed issues and their edges by default", () => {
    const g = buildGraph(issues, { membership: false });
    expect(g.nodes.map((n) => n.id)).not.toContain("a-2");
    expect(g.edges).toContainEqual({ source: "a-3", target: "a-1", type: "blocks" });
    expect(g.edges.some((e) => e.target === "a-2")).toBe(false);
  });

  it("includes closed issues on request", () => {
    const g = buildGraph(issues, { includeClosed: true, membership: false });
    expect(g.nodes.map((n) => n.id)).toContain("a-2");
  });

  it("adds a hub node and a member edge per project", () => {
    const g = buildGraph(issues);
    expect(
      g.nodes
        .filter((n) => n.kind === "project")
        .map((n) => n.id)
        .sort(),
    ).toEqual(["project:a", "project:b"]);
    expect(g.edges).toContainEqual({ source: "a-1", target: "project:a", type: "member" });
  });

  it("filters to the requested projects", () => {
    const g = buildGraph(issues, { projects: ["b"], membership: false });
    expect(g.nodes.map((n) => n.id)).toEqual(["b-1"]);
    expect(g.edges).toEqual([]);
    expect(g.projects.map((p) => p.id)).toEqual(["b"]);
  });

  it("marks blockers, dependents and readiness on issue nodes", () => {
    const g = buildGraph(issues, { membership: false });
    const a1 = g.nodes.find((n) => n.id === "a-1");
    const a3 = g.nodes.find((n) => n.id === "a-3");
    expect(a1).toMatchObject({ dependents: 1, blockers: 0, ready: true });
    expect(a3).toMatchObject({ blockers: 1, ready: false });
  });

  it("keeps one edge for a relates-to link recorded on both sides", () => {
    const both = [
      issue("a-1", { dependencies: [dep("a-1", "b-1", "relates-to")] }),
      issue("b-1", { dependencies: [dep("b-1", "a-1", "relates-to")] }),
    ];
    const g = buildGraph(both, { membership: false });
    expect(g.edges).toHaveLength(1);
  });
});

// Mirrors a scratch workspace checked against `bd ready` and `bd blocked` in
// bd 1.0.0. One deliberate difference: bd lists l-o (blocked by an id missing
// from the source) as ready; the dashboard keeps it blocked (fail closed).
describe("parity with bd ready", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const all = [
    issue("l-a"),
    issue("l-b", { dependencies: [dep("l-b", "l-a")] }),
    issue("l-c", { status: "in_progress" }),
    issue("l-h", { dependencies: [dep("l-h", "l-c")] }),
    issue("l-i", { status: "blocked" }),
    issue("l-q", { dependencies: [dep("l-q", "l-i")] }),
    issue("l-j", { status: "deferred" }),
    issue("l-p", { dependencies: [dep("l-p", "l-j")] }),
    issue("l-g", { status: "closed" }),
    issue("l-f", { dependencies: [dep("l-f", "l-g")] }),
    issue("l-k", { dependencies: [dep("l-k", "l-a", "relates-to")] }),
    issue("l-o", { dependencies: [dep("l-o", "external:other:cap")] }),
    issue("l-n", { issue_type: "epic" }),
    issue("l-m", { issue_type: "epic", dependencies: [dep("l-m", "l-n")] }),
    issue("l-l", { dependencies: [dep("l-l", "l-m", "parent-child")] }),
    issue("l-g4", { dependencies: [dep("l-g4", "l-l", "parent-child")] }),
    issue("l-e1", { issue_type: "epic", status: "blocked" }),
    issue("l-c1", { dependencies: [dep("l-c1", "l-e1", "parent-child")] }),
    issue("l-e2", { issue_type: "epic", status: "deferred" }),
    issue("l-c2", { dependencies: [dep("l-c2", "l-e2", "parent-child")] }),
    issue("l-r", { defer_until: "2026-12-01T00:00:00Z" }),
    issue("l-s", { defer_until: "2026-01-01T00:00:00Z" }),
  ];

  it("selects the bd ready set, keeping missing blockers blocked", () => {
    expect(
      readyQueue(all, now)
        .map((i) => i.id)
        .sort(),
    ).toEqual(["l-a", "l-c1", "l-c2", "l-f", "l-g4", "l-k", "l-n", "l-s"].sort());
  });

  it("propagates blocking one level down parent-child only", () => {
    const byId = new Map(all.map((i) => [i.id, i]));
    const get = (id: string) => byId.get(id) as (typeof all)[number];
    expect(parentBlocked(get("l-l"), byId)).toBe(true);
    expect(isBlocked(get("l-l"), byId)).toBe(true);
    expect(parentBlocked(get("l-g4"), byId)).toBe(false);
    expect(parentBlocked(get("l-c1"), byId)).toBe(false);
  });

  it("hides future-deferred issues and counts them as deferred", () => {
    const byId = new Map(all.map((i) => [i.id, i]));
    expect(isReady(byId.get("l-r") as (typeof all)[number], byId, now)).toBe(false);
    const [summary] = summarizeProjects(all, now);
    expect(summary).toMatchObject({ deferred: 3, in_progress: 1, ready: 8 });
  });
});
