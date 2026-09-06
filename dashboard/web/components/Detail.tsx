import { useEffect, useState } from "react";

import { getJson } from "../api.js";
import type { IssueDetail, LinkedIssue, PublicConfig } from "../types.js";

interface Props {
  id: string;
  config: PublicConfig;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function LinkList({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: LinkedIssue[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="sh">{title}</div>
      <ul className="dep-list">
        {items.map((d) => (
          <li key={`${d.type}:${d.id}`}>
            <span className="chip">{d.type}</span>
            <button type="button" onClick={() => onSelect(d.id)}>
              <span className="mono">{d.id}</span> {d.title ?? ""}
            </button>
            <span className="mono muted" style={{ marginLeft: "auto" }}>
              {d.status ?? ""}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Detail({ id, config, onSelect, onClose }: Props) {
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    getJson<IssueDetail>(`/api/issues/${encodeURIComponent(id)}`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error !== null) {
    return (
      <aside className="detail">
        <button type="button" className="close" onClick={onClose}>
          close
        </button>
        <div className="error">{error}</div>
      </aside>
    );
  }
  if (detail === null) {
    return (
      <aside className="detail">
        <div className="muted mono">{id}</div>
      </aside>
    );
  }
  const { issue, dependencies, dependents } = detail;
  const openBlockers = dependencies.filter((d) => d.type === "blocks" && d.status !== "closed");
  const ready = issue.status === "open" && openBlockers.length === 0;
  const refUrl =
    issue.external_ref !== undefined && config.external_ref_url !== undefined
      ? config.external_ref_url.replace("{ref}", encodeURIComponent(issue.external_ref))
      : undefined;
  const meta = config.projects[issue.project];

  return (
    <aside className="detail">
      <button type="button" className="close" onClick={onClose}>
        close
      </button>
      <div className="mono muted">{issue.id}</div>
      <h3>{issue.title}</h3>
      <div className="chips">
        <span className={`chip status-${issue.status}`}>{issue.status.replace("_", " ")}</span>
        <span className="chip">P{issue.priority}</span>
        <span className="chip">{issue.issue_type}</span>
        {ready ? <span className="chip ready">ready</span> : null}
        {openBlockers.length > 0 ? (
          <span className="chip status-blocked">{openBlockers.length} open blocker(s)</span>
        ) : null}
      </div>
      <div className="mono muted" style={{ marginBottom: 10 }}>
        {meta?.label ?? issue.project}
        {meta?.url ? (
          <>
            {" · "}
            <a href={meta.url}>project</a>
          </>
        ) : null}
        {issue.external_ref ? (
          <>
            {" · "}
            {refUrl ? <a href={refUrl}>{issue.external_ref}</a> : issue.external_ref}
          </>
        ) : null}
      </div>
      {issue.labels.length > 0 ? (
        <div className="chips">
          {issue.labels.map((l) => (
            <span key={l} className="chip">
              {l}
            </span>
          ))}
        </div>
      ) : null}
      {issue.assignee || issue.owner ? (
        <div className="mono muted" style={{ marginBottom: 10 }}>
          {issue.assignee ? `assignee ${issue.assignee}` : ""}
          {issue.assignee && issue.owner ? " · " : ""}
          {issue.owner ? `owner ${issue.owner}` : ""}
        </div>
      ) : null}
      {issue.description ? <pre>{issue.description}</pre> : null}
      {issue.notes ? (
        <>
          <div className="sh">Notes</div>
          <pre>{issue.notes}</pre>
        </>
      ) : null}
      {issue.close_reason ? (
        <>
          <div className="sh">Closed</div>
          <pre>
            {issue.closed_at ? `${issue.closed_at.slice(0, 10)}: ` : ""}
            {issue.close_reason}
          </pre>
        </>
      ) : null}
      <LinkList title="Depends on" items={dependencies} onSelect={onSelect} />
      <LinkList title="Depended on by" items={dependents} onSelect={onSelect} />
      <div className="mono muted" style={{ marginTop: 12 }}>
        created {issue.created_at.slice(0, 10)} · updated {issue.updated_at.slice(0, 10)}
      </div>
    </aside>
  );
}
