export interface ReviewSource {
  id: string;
  report: string;
  manifest: string;
  run_id?: string;
  tasks?: Record<string, Record<string, string>>;
}
export interface ReviewCard {
  source_id: string;
  project: string;
  run_id: string | null;
  revision: string;
  dirty: boolean;
  complete: boolean;
  findings: {
    id: string;
    title: string;
    status: string;
    investigation_task: string | null;
    votes: { stage: string; decision: string; rationale: string }[];
  }[];
}
export interface ReviewEvidence {
  schema_version: "ReviewEvidence/v1";
  read_only: true;
  approval: false;
  reviews: ReviewCard[];
  sources: { id: string; error: string | null }[];
}
