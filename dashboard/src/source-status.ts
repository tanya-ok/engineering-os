export interface SourceStatus {
  unresolved_edges?: number;
  id: string;
  label: string;
  kind: "bd" | "jsonl" | "json" | "github" | "portfolio";
  last_attempt_at: string | null;
  last_read_at: string | null;
  snapshot_at: string | null;
  count: number | null;
  error: string | null;
  graph_loaded_at: string | null;
  stale: boolean;
}
