import { expect, it } from "vitest";
import type { GraphNode } from "./graph.js";
import { quarterly } from "./quarters.js";

const task = (fields: Partial<GraphNode>): GraphNode => ({
  id: "a",
  kind: "issue",
  project: "p",
  title: "Task",
  issue_type: "task",
  ...fields,
});
it("separates planned quarter from actual UTC completion", () => {
  const report = quarterly([
    task({ labels: ["quarter:2026-Q1"], status: "closed", closed_at: "2026-04-01T00:00:00Z" }),
  ]);
  expect(Object.fromEntries(report.rows)).toEqual({
    "2026-Q1": { planned: 1, completed: 0 },
    "2026-Q2": { planned: 0, completed: 1 },
  });
});
it("does not invent dates or double count conflicting plans and epics", () => {
  const report = quarterly([
    task({ labels: ["quarter:2026-Q1", "quarter:2026-Q2"], status: "closed" }),
    task({ issue_type: "epic", status: "closed" }),
  ]);
  expect(report).toEqual({ rows: [], unknown: 1, ambiguous: 1 });
});
it("excludes reopened work and deduplicates labels", () => {
  const report = quarterly([
    task({
      status: "open",
      closed_at: "2026-01-01",
      labels: ["quarter:2026-Q1", "quarter:2026-Q1"],
    }),
  ]);
  expect(Object.fromEntries(report.rows)).toEqual({ "2026-Q1": { planned: 1, completed: 0 } });
});

it("matches the independently constructed extended demo expectations", async () => {
  const { loadIssues } = await import("./beads.js");
  const { buildGraph } = await import("./graph.js");
  const issues = await loadIssues({
    kind: "jsonl",
    path: new URL("../fixtures/beads.demo.jsonl", import.meta.url).pathname,
  });
  expect(issues).toHaveLength(73);
  const graph = buildGraph(issues, { includeClosed: true });
  expect(graph.projects).toHaveLength(12);
  const report = quarterly(graph.nodes);
  expect(Object.fromEntries(report.rows)).toEqual({
    "2026-Q3": { planned: 71, completed: 12 },
    "2026-Q4": { planned: 0, completed: 11 },
  });
  expect(report.unknown).toBe(1);
  expect(report.ambiguous).toBe(1);
});
