export interface WorkItem {
  schema_version: "WorkItem/v1";
  source_id: string;
  repository_id: string;
  native_id: string;
  raw_status: string;
  status: string;
  capabilities: { read: true; write: false; dependencies: boolean };
  provenance: { adapter: string; observed_at: string };
}
