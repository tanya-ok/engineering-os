import { useCallback, useEffect, useMemo, useState } from "react";

import { getJson } from "./api.js";
import { Detail } from "./components/Detail.js";
import { Documentation } from "./components/Documentation.js";
import { ForceGraph } from "./components/Graph.js";
import { Operations } from "./components/Operations.js";
import { Projects } from "./components/Projects.js";
import { Quarters } from "./components/Quarters.js";
import { Ready } from "./components/Ready.js";
import { Reviews } from "./components/Reviews.js";
import { Sidebar } from "./components/Sidebar.js";
import {
  edgeTypesOf,
  type Filters,
  type Graph,
  type GraphNode,
  type Health,
  type PublicConfig,
  STATUSES,
  VIEW_TITLES,
  type View,
} from "./types.js";

export function isBlockedNode(n: GraphNode): boolean {
  return n.status === "blocked" || (n.blockers ?? 0) > 0 || n.parent_blocked === true;
}

function initialFilters(graph: Graph): Filters {
  const types = new Set(
    graph.nodes.filter((n) => n.kind === "issue").map((n) => n.issue_type ?? "task"),
  );
  return {
    projects: new Set(graph.projects.map((p) => p.id)),
    statuses: new Set(STATUSES.filter((s) => s !== "closed")),
    types,
    edgeTypes: new Set(edgeTypesOf(graph.edges)),
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
      const [g, c] = await Promise.all([
        getJson<Graph>(`/api/graph?include_closed=1&membership=1${fresh ? "&fresh=1" : ""}`),
        getJson<PublicConfig>("/api/config"),
      ]);
      // After the graph, so loaded_at reflects the reload that just ran.
      const h = await getJson<Health>("/api/health");
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
          <h2>{VIEW_TITLES[view]}</h2>
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
        {view === "docs" ? (
          <Documentation />
        ) : view === "operations" ? (
          <Operations />
        ) : view === "reviews" ? (
          <Reviews onSelect={setSelected} />
        ) : view === "sessions" ? (
          <Operations section="plans" />
        ) : graph === null || filters === null ? (
          <div className="empty">Loading the work graph...</div>
        ) : view === "graph" ? (
          <ForceGraph
            nodes={visible.nodes}
            edges={visible.edges}
            search={filters.search}
            selectedId={selected}
            onSelect={setSelected}
          />
        ) : view === "quarters" ? (
          <Quarters nodes={graph.nodes} />
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
