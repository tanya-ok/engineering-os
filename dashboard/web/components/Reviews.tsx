import { useEffect, useState } from "react";
import type { ReviewEvidence } from "../../src/review-types.js";
import { getJson } from "../api.js";
export function Reviews({ onSelect }: { onSelect: (id: string) => void }) {
  const [data, setData] = useState<ReviewEvidence | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void getJson<ReviewEvidence>("/api/reviews")
      .then(setData)
      .catch(() => setError(true));
  }, []);
  return (
    <div className="doc-page">
      <h3>Review evidence</h3>
      <p>Reviews propose investigations. Votes do not approve changes or mark tasks complete.</p>
      {error ? <p className="error">Could not load reviews.</p> : null}
      {data?.sources.length === 0 ? <p>No local review reports configured.</p> : null}
      {data?.sources
        .filter((s) => s.error)
        .map((s) => (
          <p className="error" key={s.id}>
            {s.id}: {s.error}
          </p>
        ))}
      {data?.reviews.map((card) => (
        <section
          key={`${card.source_id}:${card.project}`}
          style={{ borderTop: "1px solid var(--border)", padding: "16px 0" }}
        >
          <h3>
            {card.project} · {card.complete ? "Review completed" : "Incomplete review"}
          </h3>
          <p>
            Run: {card.run_id ?? "Not recorded"} · Revision: <code>{card.revision}</code>
            {card.dirty ? " + local changes" : ""}
          </p>
          {card.findings.map((f) => (
            <div key={f.id}>
              <strong>
                {f.id}: {f.title}
              </strong>
              <p>Finding: {f.status}</p>
              <ul>
                {f.votes.map((v) => (
                  <li key={v.stage}>
                    <details>
                      <summary>
                        {{ verify: "Codex", rebuttal: "Claude", kimi: "Kimi" }[v.stage] ?? v.stage}:{" "}
                        {v.decision}
                      </summary>
                      <p>{v.rationale}</p>
                    </details>
                  </li>
                ))}
              </ul>
              {f.investigation_task ? (
                <button type="button" onClick={() => onSelect(f.investigation_task as string)}>
                  Open investigation task
                </button>
              ) : (
                <p>No investigation task linked.</p>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
