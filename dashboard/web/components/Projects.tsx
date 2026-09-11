import type { ProjectSummary, PublicConfig } from "../types.js";

interface Props {
  projects: ProjectSummary[];
  config: PublicConfig;
  onPick: (id: string) => void;
  onSelectIssue: (id: string) => void;
}

export function Projects({ projects, config, onPick, onSelectIssue }: Props) {
  if (projects.length === 0) return <div className="empty">No projects selected.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th className="num">Open</th>
            <th className="num">Ready</th>
            <th className="num">Blocked</th>
            <th className="num">In progress</th>
            <th className="num">Deferred</th>
            <th className="num">Closed</th>
            <th>Domains</th>
            <th>Epics</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const meta = config.projects[p.id];
            return (
              <tr key={p.id} className="row" onClick={() => onPick(p.id)}>
                <td>
                  <div>{meta?.label ?? p.id}</div>
                  <div className="mono muted">
                    {meta?.label ? `${p.id} · ` : ""}
                    {meta?.url ? (
                      <a href={meta.url} onClick={(e) => e.stopPropagation()}>
                        open project
                      </a>
                    ) : null}
                  </div>
                </td>
                <td className="num">{p.open}</td>
                <td className="num">{p.ready}</td>
                <td className="num" style={{ color: p.blocked > 0 ? "var(--accent)" : undefined }}>
                  {p.blocked}
                </td>
                <td className="num">{p.in_progress}</td>
                <td className="num">{p.deferred}</td>
                <td className="num muted">{p.closed}</td>
                <td className="mono muted">{p.domains.join(" ")}</td>
                <td>
                  {p.epics.map((e) => (
                    <div key={e.id}>
                      <button
                        type="button"
                        style={{ border: "none", padding: 0 }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onSelectIssue(e.id);
                        }}
                      >
                        {e.title}
                      </button>{" "}
                      <span className="mono muted">{e.status}</span>
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
