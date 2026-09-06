import type { Dispatch, SetStateAction } from "react";

import {
  EDGE_TYPES,
  type Filters,
  type Graph,
  type Health,
  STATUSES,
  type View,
} from "../types.js";

interface Props {
  graph: Graph | null;
  filters: Filters | null;
  setFilters: Dispatch<SetStateAction<Filters | null>>;
  view: View;
  setView: (v: View) => void;
  health: Health | null;
  onReload: () => void;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const STATUS_SWATCH: Record<string, string> = {
  open: "var(--text-muted)",
  in_progress: "var(--accent)",
  blocked: "transparent",
  deferred: "var(--border-strong)",
  closed: "var(--border)",
};

export function Sidebar({ graph, filters, setFilters, view, setView, health, onReload }: Props) {
  const update = (patch: (f: Filters) => Filters) => setFilters((f) => (f === null ? f : patch(f)));
  const issueTypes = graph
    ? [
        ...new Set(
          graph.nodes.filter((n) => n.kind === "issue").map((n) => n.issue_type ?? "task"),
        ),
      ].sort()
    : [];
  const countByStatus = (s: string) =>
    graph?.nodes.filter((n) => n.kind === "issue" && n.status === s).length ?? 0;

  return (
    <aside className="sidebar">
      <h1 className="brand">Work graph</h1>
      <div className="brand-sub">{health?.source ?? "loading"}</div>
      <div className="views">
        {(["graph", "projects", "ready"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            className={view === v ? "active" : ""}
            onClick={() => setView(v)}
          >
            {v}
          </button>
        ))}
      </div>
      <input
        type="search"
        placeholder="search id, title, label"
        value={filters?.search ?? ""}
        onChange={(e) => update((f) => ({ ...f, search: e.target.value }))}
      />

      <div className="sh">Projects</div>
      <div className="filter-list">
        {graph?.projects.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={filters?.projects.has(p.id) ?? false}
              onChange={() => update((f) => ({ ...f, projects: toggle(f.projects, p.id) }))}
            />
            <span className="mono">{p.id}</span>
            <span className="count">{p.total - p.closed}</span>
          </label>
        ))}
      </div>

      <div className="sh">Status</div>
      <div className="filter-list">
        {STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={filters?.statuses.has(s) ?? false}
              onChange={() => update((f) => ({ ...f, statuses: toggle(f.statuses, s) }))}
            />
            <span
              className="swatch"
              style={{
                background: STATUS_SWATCH[s],
                borderColor: s === "blocked" ? "var(--accent)" : undefined,
              }}
            />
            <span>{s.replace("_", " ")}</span>
            <span className="count">{countByStatus(s)}</span>
          </label>
        ))}
      </div>

      <div className="sh">Type</div>
      <div className="filter-list">
        {issueTypes.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={filters?.types.has(t) ?? false}
              onChange={() => update((f) => ({ ...f, types: toggle(f.types, t) }))}
            />
            <span>{t}</span>
          </label>
        ))}
      </div>

      <div className="sh">Edges</div>
      <div className="filter-list">
        {EDGE_TYPES.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={filters?.edgeTypes.has(t) ?? false}
              onChange={() => update((f) => ({ ...f, edgeTypes: toggle(f.edgeTypes, t) }))}
            />
            <span className="mono">{t}</span>
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={filters?.membership ?? true}
            onChange={() => update((f) => ({ ...f, membership: !f.membership }))}
          />
          <span>project hubs</span>
        </label>
      </div>

      <div className="sh">Data</div>
      <div className="mono muted" style={{ marginBottom: 8 }}>
        {health?.loaded_at ? `loaded ${health.loaded_at.slice(11, 19)} UTC` : "not loaded"}
        {health?.last_error ? ` · ${health.last_error}` : ""}
      </div>
      <button type="button" onClick={onReload}>
        reload
      </button>
    </aside>
  );
}
