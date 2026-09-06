// Shared types for the work-graph dashboard. The issue shape mirrors what
// `bd export` emits (beads JSONL), reduced to the fields the dashboard uses.

export interface Dependency {
  /** The issue that carries the dependency: it depends on `to`. */
  from: string;
  /** The issue it depends on: the blocker, parent, or origin. */
  to: string;
  /** beads dependency type: blocks, parent-child, discovered-from, relates_to. */
  type: string;
}

export interface Issue {
  id: string;
  title: string;
  status: string;
  priority: number;
  issue_type: string;
  labels: string[];
  dependencies: Dependency[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  assignee?: string;
  owner?: string;
  external_ref?: string;
  description?: string;
  notes?: string;
  /** Derived: the id prefix, e.g. `northwind-platform` for `northwind-platform-a1b`. */
  project: string;
  /** Derived from a `domain:<Name>` label, if present. */
  domain?: string;
}
