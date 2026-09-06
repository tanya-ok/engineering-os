import { useCallback, useEffect, useMemo, useState } from "react";

import { getJson } from "./api.js";
import { Detail } from "./components/Detail.js";
import { ForceGraph } from "./components/Graph.js";
import { Projects } from "./components/Projects.js";
import { Ready } from "./components/Ready.js";
import { Sidebar } from "./components/Sidebar.js";
import {
  EDGE_TYPES,
  type Filters,
  type Graph,
  type GraphNode,
  type Health,
  type PublicConfig,
  STATUSES,
  type View,
} from "./types.js";

export function isBlockedNode(n: GraphNode): boolean {
  return n.status === "blocked" || (n.blockers ?? 0) > 0;
}

function initialFilters(graph: Graph): Filters {
  const types = new Set(
    graph.nodes.filter((n) => n.kind === "issue").map((n) => n.issue_type ?? "task"),
  );
  return {
    projects: new Set(graph.projects.map((p) => p.id)),
    statuses: new Set(STATUSES.filter((s) => s !== "closed")),
    types,
    edgeTypes: new Set(EDGE_TYPES),
    membership: true,
    search: "",
  };
}

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<PublicConfig>({ projects: {} });
  const [filters, setFilters] = useState<Filters | null>(null);
  const [view, setView] = useState<View>("graph");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    try {
      const [g, h, c] = await Promise.all([
        getJson<Graph>(`/api/graph?include_closed=1&membership=1${fresh ? "&fresh=1" : ""}`),
        getJson<Health>("/api/health"),
        getJson<PublicConfig>("/api/config"),
      ]);
      setGraph(g);
      setHealth(h);
      setConfig(c);
      setFilters((f) => f ?? initialFilters(g));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const visible = useMemo(() => {
    if (graph === null || filters === null)
      return { nodes: [] as GraphNode[], edges: graph?.edges ?? [] };
    const q = filters.search.trim().toLowerCase();
    const nodes = graph.nodes.filter((n) => {
      if (!filters.projects.has(n.project)) return false;
      if (n.kind === "project") return filters.membership;
      if (!filters.statuses.has(n.status ?? "open")) return false;
      if (!filters.types.has(n.issue_type ?? "task")) return false;
      return true;
    });
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => {
      if (!ids.has(e.source) || !ids.has(e.target)) return false;
      return e.type === "member" ? filters.membership : filters.edgeTypes.has(e.type);
    });
    return { nodes, edges, search: q };
  }, [graph, filters]);

  const issueNodes = visible.nodes.filter((n) => n.kind === "issue");
  const stats = {
    total: issueNodes.length,
    ready: issueNodes.filter((n) => n.ready === true).length,
    blocked: issueNodes.filter(isBlockedNode).length,
    inProgress: issueNodes.filter((n) => n.status === "in_progress").length,
  };

  const selectProject = (id: string) => {
    setFilters((f) => (f === null ? f : { ...f, projects: new Set([id]) }));
    setView("graph");
  };

  return (
    <div className="app">
      <Sidebar
        graph={graph}
        filters={filters}
        setFilters={setFilters}
        view={view}
        setView={setView}
        health={health}
        onReload={() => void load(true)}
      />
      <main className="main">
        <div className="topbar">
          <h2>
            {view === "graph"
              ? "Dependency graph"
              : view === "projects"
                ? "Projects"
                : "Ready queue"}
          </h2>
          <span className="stat">
            <b>{stats.total}</b> issues
          </span>
          <span className="stat">
            <b>{stats.ready}</b> ready
          </span>
          <span className="stat accent">
            <b>{stats.blocked}</b> blocked
          </span>
          <span className="stat accent">
            <b>{stats.inProgress}</b> in progress
          </span>
        </div>
        {error !== null ? <div className="error">{error}</div> : null}
        {graph === null || filters === null ? (
          <div className="empty">Loading the work graph...</div>
        ) : view === "graph" ? (
          <ForceGraph
            nodes={visible.nodes}
            edges={visible.edges}
            search={filters.search}
            selectedId={selected}
            onSelect={setSelected}
          />
        ) : view === "projects" ? (
          <Projects
            projects={graph.projects.filter((p) => filters.projects.has(p.id))}
            config={config}
            onPick={selectProject}
            onSelectIssue={setSelected}
          />
        ) : (
          <Ready nodes={issueNodes} onSelect={setSelected} />
        )}
      </main>
      {selected !== null ? (
        <Detail
          id={selected}
          config={config}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
