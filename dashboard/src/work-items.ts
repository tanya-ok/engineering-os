// Read-only WorkItem/v1 adapters. Source identity is configured, never guessed.
import fs from "node:fs";
import { type LocalSource, loadIssues, normalizeIssue } from "./beads.js";
import type { Issue } from "./types.js";

export interface TrackerSource {
  source_id: string;
  repository_id: string;
  label?: string;
  source: LocalSource | { kind: "json" | "github"; path: string };
}

const STATES = new Set(["open", "in_progress", "blocked", "closed", "deferred"]);
export function workItemId(source: string, repository: string, native: string): string {
  return `work:${[source, repository, native].map(encodeURIComponent).join(":")}`;
}
export function qualifyIssue(
  issue: Issue,
  source: TrackerSource,
  observed: string,
  known?: Set<string>,
): Issue {
  const key = (id: string) => workItemId(source.source_id, source.repository_id, id);
  const raw = issue.status;
  const status = STATES.has(raw) ? raw : "unknown";
  return {
    ...issue,
    id: key(issue.id),
    project: source.repository_id,
    status,
    dependencies: issue.dependencies.map((d) => ({
      ...d,
      from: key(issue.id),
      to: d.target_ref
        ? workItemId(d.target_ref.source_id, d.target_ref.repository_id, d.target_ref.native_id)
        : key(d.to),
      unresolved: d.target_ref !== undefined || (known !== undefined && !known.has(d.to)),
    })),
    work_item: {
      schema_version: "WorkItem/v1",
      source_id: source.source_id,
      repository_id: source.repository_id,
      native_id: issue.id,
      raw_status: raw,
      status,
      capabilities: { read: true, write: false, dependencies: source.source.kind !== "github" },
      provenance: { adapter: source.source.kind, observed_at: observed },
    },
  };
}
export async function readTracker(source: TrackerSource): Promise<Issue[]> {
  let items: Issue[];
  if (source.source.kind === "bd" || source.source.kind === "jsonl") {
    items = await loadIssues(source.source);
  } else {
    const bytes = fs.readFileSync(source.source.path);
    if (bytes.length > 64 * 1024 * 1024) throw new Error("Tracker snapshot too large");
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (source.source.kind === "json") {
      const envelope = parsed as { schema_version?: unknown; items?: unknown } | null;
      if (envelope?.schema_version !== "WorkItems/v1" || !Array.isArray(envelope.items))
        throw new Error("Expected WorkItems/v1 snapshot");
      items = envelope.items.map((row) => {
        const item = normalizeIssue(row);
        if (!item) throw new Error("Invalid work item");
        return item;
      });
    } else {
      if (!Array.isArray(parsed)) throw new Error("Expected GitHub issue snapshot array");
      items = parsed
        .filter((row) => !row?.pull_request)
        .map((row) => {
          if (!Number.isSafeInteger(row?.number) || row.number < 1 || typeof row.title !== "string")
            throw new Error("Invalid GitHub issue");
          return normalizeIssue({
            id: String(row.number),
            title: row.title,
            status: typeof row.state === "string" ? row.state : "unknown",
            labels: Array.isArray(row.labels)
              ? row.labels.map((l: unknown) =>
                  typeof l === "string" ? l : (l as { name?: string })?.name,
                )
              : [],
            created_at: row.created_at,
            updated_at: row.updated_at,
            closed_at: row.closed_at,
          }) as Issue;
        });
    }
  }
  const observed = new Date().toISOString();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error("Duplicate native issue ID in one source");
    seen.add(item.id);
  }
  return items.map((item) => qualifyIssue(item, source, observed, seen));
}
