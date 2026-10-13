export type { Graph, GraphEdge, GraphNode, ProjectSummary } from "../src/graph.js";
export type { Issue } from "../src/types.js";

export interface ProjectMeta {
  label?: string;
  url?: string;
}

export interface PublicConfig {
  external_ref_url?: string;
  projects: Record<string, ProjectMeta>;
}

export interface Health {
  status: string;
  source: string;
  issues: number;
  projects: number;
  loaded_at: string | null;
  last_error: string | null;
}

export interface LinkedIssue {
  id: string;
  type: string;
  title: string | null;
  status: string | null;
  /** Target is not in the source; a missing `blocks` target still blocks. */
  missing: boolean;
}

export interface IssueState {
  ready: boolean;
  open_blockers: number;
  parent_blocked: boolean;
}

export interface IssueDetail {
  issue: import("../src/types.js").Issue;
  state: IssueState;
  dependencies: LinkedIssue[];
  dependents: LinkedIssue[];
}

export type View =
  | "graph"
  | "projects"
  | "ready"
  | "quarters"
  | "sessions"
  | "operations"
  | "docs"
  | "reviews";
export const VIEWS: View[] = [
  "graph",
  "projects",
  "ready",
  "quarters",
  "sessions",
  "operations",
  "reviews",
  "docs",
];
export const VIEW_TITLES: Record<View, string> = {
  graph: "Dependency graph",
  projects: "Projects",
  ready: "Ready queue",
  quarters: "Quarterly review",
  sessions: "Agent plans",
  operations: "Data sources",
  docs: "How it works",
  reviews: "Reviews",
};

export interface Filters {
  projects: Set<string>;
  statuses: Set<string>;
  types: Set<string>;
  edgeTypes: Set<string>;
  membership: boolean;
  search: string;
}

export const STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "unknown",
  "closed",
] as const;
/** Edge types in the graph, excluding project membership, known ones first. */
export function edgeTypesOf(edges: { type: string }[]): string[] {
  const known = ["blocks", "parent-child", "discovered-from", "relates-to"];
  const present = new Set(edges.map((e) => e.type).filter((t) => t !== "member"));
  const rest = [...present].filter((t) => !known.includes(t)).sort();
  return [...known.filter((t) => present.has(t)), ...rest];
}
