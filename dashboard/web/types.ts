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
}

export interface IssueDetail {
  issue: import("../src/types.js").Issue;
  dependencies: LinkedIssue[];
  dependents: LinkedIssue[];
}

export type View = "graph" | "projects" | "ready";

export interface Filters {
  projects: Set<string>;
  statuses: Set<string>;
  types: Set<string>;
  edgeTypes: Set<string>;
  membership: boolean;
  search: string;
}

export const STATUSES = ["open", "in_progress", "blocked", "deferred", "closed"] as const;
export const EDGE_TYPES = ["blocks", "parent-child", "discovered-from", "relates_to"] as const;
