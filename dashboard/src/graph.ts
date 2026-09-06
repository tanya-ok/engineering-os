// Graph model over the issue set: issue nodes, optional project hub nodes,
// dependency edges, plus per-project summaries and the ready queue.

import type { Issue } from "./types.js";

export type NodeKind = "issue" | "project";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  project: string;
  status?: string;
  priority?: number;
  issue_type?: string;
  labels?: string[];
  domain?: string;
  /** Open blockers (dependencies of type `blocks` that are not closed). */
  blockers?: number;
  /** Issues that this one blocks. */
  dependents?: number;
  ready?: boolean;
}

export interface GraphEdge {
  /** The dependent issue (it depends on `target`), or the member for `member` edges. */
  source: string;
  /** The blocker / parent / origin, or the project hub for `member` edges. */
  target: string;
  type: string;
}

export interface ProjectSummary {
  id: string;
  total: number;
  /** Not closed, deferred or in progress; includes blocked issues. */
  open: number;
  in_progress: number;
  blocked: number;
  ready: number;
  closed: number;
  deferred: number;
  epics: { id: string; title: string; status: string }[];
  domains: string[];
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  projects: ProjectSummary[];
}

export interface GraphOptions {
  includeClosed?: boolean;
  membership?: boolean;
  projects?: string[];
}

export const CLOSED = "closed";
export const MEMBER = "member";
const SYMMETRIC_TYPES = new Set(["relates_to"]);

export function projectNodeId(project: string): string {
  return `project:${project}`;
}

export function indexById(issues: Issue[]): Map<string, Issue> {
  return new Map(issues.map((i) => [i.id, i]));
}

export function openBlockers(issue: Issue, byId: Map<string, Issue>): number {
  let n = 0;
  for (const d of issue.dependencies) {
    if (d.type !== "blocks") continue;
    const dep = byId.get(d.to);
    if (dep !== undefined && dep.status !== CLOSED) n += 1;
  }
  return n;
}

/** Mirrors `bd ready`: open, with no open blocker. */
export function isReady(issue: Issue, byId: Map<string, Issue>): boolean {
  return issue.status === "open" && openBlockers(issue, byId) === 0;
}

export function isBlocked(issue: Issue, byId: Map<string, Issue>): boolean {
  if (issue.status === CLOSED) return false;
  return issue.status === "blocked" || openBlockers(issue, byId) > 0;
}

export function readyQueue(issues: Issue[]): Issue[] {
  const byId = indexById(issues);
  return issues
    .filter((i) => isReady(i, byId))
    .sort((a, b) => a.priority - b.priority || b.updated_at.localeCompare(a.updated_at));
}

export function summarizeProjects(issues: Issue[]): ProjectSummary[] {
  const byId = indexById(issues);
  const map = new Map<string, ProjectSummary>();
  for (const i of issues) {
    let s = map.get(i.project);
    if (s === undefined) {
      s = {
        id: i.project,
        total: 0,
        open: 0,
        in_progress: 0,
        blocked: 0,
        ready: 0,
        closed: 0,
        deferred: 0,
        epics: [],
        domains: [],
      };
      map.set(i.project, s);
    }
    s.total += 1;
    if (i.status === CLOSED) s.closed += 1;
    else if (i.status === "deferred") s.deferred += 1;
    else if (i.status === "in_progress") s.in_progress += 1;
    else s.open += 1;
    // blocked and ready partition the open set (plus explicit `blocked` status)
    if (isBlocked(i, byId)) s.blocked += 1;
    if (isReady(i, byId)) s.ready += 1;
    if (i.issue_type === "epic") s.epics.push({ id: i.id, title: i.title, status: i.status });
    if (i.domain !== undefined && !s.domains.includes(i.domain)) s.domains.push(i.domain);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildGraph(issues: Issue[], opts: GraphOptions = {}): Graph {
  const byId = indexById(issues);
  const wanted = new Set(opts.projects ?? []);
  const visible = issues.filter(
    (i) =>
      (opts.includeClosed === true || i.status !== CLOSED) &&
      (wanted.size === 0 || wanted.has(i.project)),
  );
  const visibleIds = new Set(visible.map((i) => i.id));

  const dependents = new Map<string, number>();
  for (const i of issues) {
    for (const d of i.dependencies) {
      if (d.type === "blocks") dependents.set(d.to, (dependents.get(d.to) ?? 0) + 1);
    }
  }

  const nodes: GraphNode[] = visible.map((i) => ({
    id: i.id,
    kind: "issue",
    title: i.title,
    project: i.project,
    status: i.status,
    priority: i.priority,
    issue_type: i.issue_type,
    labels: i.labels,
    domain: i.domain,
    blockers: openBlockers(i, byId),
    dependents: dependents.get(i.id) ?? 0,
    ready: isReady(i, byId),
  }));

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const i of visible) {
    for (const d of i.dependencies) {
      if (!visibleIds.has(d.to)) continue;
      const ends = SYMMETRIC_TYPES.has(d.type) ? [d.from, d.to].sort() : [d.from, d.to];
      const key = `${ends[0]}>${ends[1]}:${d.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: d.from, target: d.to, type: d.type });
    }
  }

  if (opts.membership !== false) {
    for (const p of new Set(visible.map((i) => i.project))) {
      nodes.push({ id: projectNodeId(p), kind: "project", title: p, project: p });
    }
    for (const i of visible) {
      edges.push({ source: i.id, target: projectNodeId(i.project), type: MEMBER });
    }
  }

  const projects = summarizeProjects(issues).filter((p) => wanted.size === 0 || wanted.has(p.id));
  return { nodes, edges, projects };
}
