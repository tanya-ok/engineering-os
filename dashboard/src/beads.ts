// Issue sources and the beads JSONL parser. Two sources: `bd export` run in a
// workspace that has a .beads directory, or a JSONL file with the same shape.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { Dependency, Issue } from "./types.js";

const execFileAsync = promisify(execFile);
const EXPORT_MAX_BYTES = 64 * 1024 * 1024;

export type Source = { kind: "bd"; root: string } | { kind: "jsonl"; path: string };

/** The project is the id prefix: everything before the last hyphen. */
export function projectOf(id: string): string {
  const cut = id.lastIndexOf("-");
  return cut > 0 ? id.slice(0, cut) : id;
}

export function domainOf(labels: string[]): string | undefined {
  const label = labels.find((l) => l.startsWith("domain:"));
  return label === undefined ? undefined : label.slice("domain:".length);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function normalizeDependencies(issueId: string, raw: unknown): Dependency[] {
  if (!Array.isArray(raw)) return [];
  const out: Dependency[] = [];
  for (const d of raw) {
    if (typeof d !== "object" || d === null) continue;
    const r = d as Record<string, unknown>;
    // `bd export` shape: {issue_id, depends_on_id, type}.
    // `bd show --json` shape: {id, dependency_type, ...full issue}.
    const to = str(r.depends_on_id) ?? str(r.id);
    if (to === undefined) continue;
    out.push({
      from: str(r.issue_id) ?? issueId,
      to,
      type: str(r.type) ?? str(r.dependency_type) ?? "blocks",
    });
  }
  return out;
}

/** Returns undefined for records that are not issues (memories, malformed rows). */
export function normalizeIssue(raw: unknown): Issue | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const title = str(r.title);
  if (id === undefined || title === undefined) return undefined;
  const labels = Array.isArray(r.labels)
    ? r.labels.filter((l): l is string => typeof l === "string")
    : [];
  return {
    id,
    title,
    status: str(r.status) ?? "open",
    priority: typeof r.priority === "number" ? r.priority : 4,
    issue_type: str(r.issue_type) ?? "task",
    labels,
    dependencies: normalizeDependencies(id, r.dependencies),
    created_at: str(r.created_at) ?? "",
    updated_at: str(r.updated_at) ?? "",
    closed_at: str(r.closed_at),
    close_reason: str(r.close_reason),
    assignee: str(r.assignee),
    owner: str(r.owner),
    external_ref: str(r.external_ref),
    description: str(r.description),
    notes: str(r.notes),
    project: projectOf(id),
    domain: domainOf(labels),
  };
}

export function parseExport(text: string): Issue[] {
  const issues: Issue[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`invalid JSON on line ${i + 1}`);
    }
    const issue = normalizeIssue(parsed);
    if (issue !== undefined) issues.push(issue);
  }
  return issues;
}

export async function loadIssues(source: Source): Promise<Issue[]> {
  if (source.kind === "jsonl") {
    return parseExport(fs.readFileSync(source.path, "utf8"));
  }
  const root = path.resolve(source.root);
  if (!fs.existsSync(path.join(root, ".beads"))) {
    throw new Error(`no .beads directory under ${root}`);
  }
  const { stdout } = await execFileAsync("bd", ["export", "--no-memories"], {
    cwd: root,
    maxBuffer: EXPORT_MAX_BYTES,
  });
  return parseExport(stdout);
}

export function describeSource(source: Source): string {
  return source.kind === "bd"
    ? `bd export in ${path.resolve(source.root)}`
    : `jsonl ${path.resolve(source.path)}`;
}
