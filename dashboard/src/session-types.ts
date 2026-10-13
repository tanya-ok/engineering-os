export interface PlannedSession {
  id: string;
  repository: string;
  task: string;
  created_at: string;
  status: "awaiting_qualification" | "cancelled";
  base_commit: string;
  dirty: boolean;
  reason: string;
}

export interface QualificationStatus {
  checked_at: string;
  runtime_version: string;
  runtime_compatible: boolean;
  model: string;
  model_read_passed: boolean;
  isolation_passed: boolean;
  reason: string;
}
