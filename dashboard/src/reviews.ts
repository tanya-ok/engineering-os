// Local coordinator v1 reports become read-only ReviewEvidence/v1 cards.
import fs from "node:fs";
import type { ReviewCard, ReviewEvidence, ReviewSource } from "./review-types.js";

function read(file: string): Record<string, unknown> {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Review file too large");
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid report");
  return raw as Record<string, unknown>;
}
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid review record");
  return raw as Record<string, unknown>;
}
export function readReviews(sources: ReviewSource[]): ReviewEvidence {
  const out: ReviewEvidence = {
    schema_version: "ReviewEvidence/v1",
    read_only: true,
    approval: false,
    reviews: [],
    sources: [],
  };
  for (const source of sources) {
    try {
      const manifest = read(source.manifest),
        report = read(source.report);
      if (manifest.schema_version !== 1 || !Array.isArray(report.projects))
        throw new Error("Unsupported coordinator schema");
      const execution = manifest.execution === undefined ? {} : record(manifest.execution);
      const isolated =
        execution.isolated_project_runs === undefined
          ? {}
          : record(execution.isolated_project_runs);
      const reused = execution.reused === undefined ? {} : record(execution.reused);
      const cards: ReviewCard[] = report.projects.map((raw) => {
        const project = record(raw);
        if (
          typeof project.project !== "string" ||
          typeof project.revision !== "string" ||
          !Array.isArray(project.findings)
        )
          throw new Error("Invalid project");
        const name = project.project;
        const run = isolated[name] ?? reused[name] ?? source.run_id;
        const reviews = project.reviews === undefined ? {} : record(project.reviews);
        return {
          source_id: source.id,
          project: name,
          run_id: typeof run === "string" ? run : null,
          revision: project.revision,
          dirty: project.dirty === true,
          complete: report.complete === true && project.complete === true,
          findings: project.findings.map((raw) => {
            const finding = record(raw);
            if (typeof finding.id !== "string" || typeof finding.title !== "string")
              throw new Error("Invalid finding");
            const id = finding.id;
            const votes = Object.entries(reviews).flatMap(([stage, rawReview]) => {
              const review = record(rawReview);
              if (!Array.isArray(review.votes)) return [];
              return review.votes.flatMap((rawVote) => {
                const vote = record(rawVote);
                if (vote.finding_id !== id) return [];
                return [
                  {
                    stage,
                    decision: typeof vote.verdict === "string" ? vote.verdict : "unknown",
                    rationale: typeof vote.reason === "string" ? vote.reason : "",
                  },
                ];
              });
            });
            return {
              id,
              title: finding.title,
              status: typeof finding.status === "string" ? finding.status : "unresolved",
              investigation_task: source.tasks?.[name]?.[id] ?? null,
              votes,
            };
          }),
        };
      });
      out.reviews.push(...cards);
      out.sources.push({ id: source.id, error: null });
    } catch {
      out.sources.push({
        id: source.id,
        error: "Review source unavailable or incompatible. No approval inferred.",
      });
    }
  }
  return out;
}
