import type { GraphNode } from "./graph.js";
export function quarterly(nodes: GraphNode[]) {
  const rows = new Map<string, { planned: number; completed: number }>();
  const row = (key: string) => {
    const value = rows.get(key) ?? { planned: 0, completed: 0 };
    rows.set(key, value);
    return value;
  };
  let unknown = 0;
  let ambiguous = 0;
  for (const node of nodes) {
    if (node.kind !== "issue" || !["task", "bug", "feature"].includes(node.issue_type ?? "task"))
      continue;
    const labels = [
      ...new Set((node.labels ?? []).filter((x) => /^quarter:\d{4}-Q[1-4]$/.test(x))),
    ];
    if (labels.length === 1 && labels[0]) row(labels[0].slice(8)).planned++;
    if (labels.length > 1) ambiguous++;
    if (node.status !== "closed") continue;
    const date = node.closed_at ? new Date(node.closed_at) : null;
    if (!date || !Number.isFinite(date.getTime())) {
      unknown++;
      continue;
    }
    row(`${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`).completed++;
  }
  return { rows: [...rows].sort(([a], [b]) => b.localeCompare(a)), unknown, ambiguous };
}
