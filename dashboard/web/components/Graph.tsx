import * as d3 from "d3";
import { useEffect, useRef } from "react";

import type { GraphEdge, GraphNode } from "../types.js";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  search: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

type SimNode = GraphNode & d3.SimulationNodeDatum;
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string;
}

const end = (v: SimNode | string | number): SimNode => v as SimNode;

function radius(n: GraphNode): number {
  if (n.kind === "project") return 9;
  return 4 + Math.sqrt(n.dependents ?? 0) * 3;
}

function fill(n: GraphNode): string {
  if (n.kind === "project") return "var(--surface)";
  switch (n.status) {
    case "in_progress":
      return "var(--accent)";
    case "closed":
      return "var(--border)";
    case "deferred":
      return "var(--border-strong)";
    default:
      return (n.blockers ?? 0) > 0 || n.status === "blocked" ? "var(--bg)" : "var(--text-muted)";
  }
}

function stroke(n: GraphNode): string {
  if (n.kind === "project") return "var(--text)";
  if ((n.blockers ?? 0) > 0 || n.status === "blocked") return "var(--accent)";
  if (n.ready === true) return "var(--text)";
  return "var(--border-strong)";
}

function dash(type: string): string | null {
  if (type === "parent-child") return "5 4";
  if (type === "discovered-from" || type === "relates_to") return "1.5 4";
  return null;
}

export function ForceGraph({ nodes, edges, search, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (el === null) return;
    const svg = d3.select(el);
    svg.selectAll("*").remove();
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type }));

    const q = search.trim().toLowerCase();
    const matches = (n: GraphNode): boolean =>
      q !== "" &&
      (n.id.toLowerCase().includes(q) ||
        n.title.toLowerCase().includes(q) ||
        (n.labels ?? []).some((l) => l.toLowerCase().includes(q)));

    const sim = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => (l.type === "member" ? 70 : 110))
          .strength((l) => (l.type === "member" ? 0.25 : 0.6)),
      )
      .force("charge", d3.forceManyBody().strength(-220).theta(0.9))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force(
        "collision",
        d3.forceCollide<SimNode>().radius((d) => radius(d) + 10),
      );

    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "var(--border-strong)");

    const g = svg.append("g");
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.15, 4])
        .on("zoom", (e) => g.attr("transform", e.transform)),
    );
    svg.on("click", () => onSelect(null));

    const link = g
      .append("g")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (l) => (l.type === "member" ? "var(--border)" : "var(--border-strong)"))
      .attr("stroke-width", (l) => (l.type === "member" ? 0.6 : l.type === "blocks" ? 1.3 : 0.9))
      .attr("stroke-opacity", (l) => (l.type === "member" ? 0.5 : 0.75))
      .attr("stroke-dasharray", (l) => dash(l.type))
      .attr("marker-end", (l) => (l.type === "blocks" ? "url(#arrow)" : null));

    const node = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (e, d) => {
            if (!e.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (e, d) => {
            d.fx = e.x;
            d.fy = e.y;
          })
          .on("end", (e, d) => {
            if (!e.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    node
      .filter((d) => d.kind === "project")
      .append("rect")
      .attr("x", -9)
      .attr("y", -9)
      .attr("width", 18)
      .attr("height", 18)
      .attr("rx", 3)
      .attr("fill", fill)
      .attr("stroke", stroke)
      .attr("stroke-width", 1.4);

    node
      .filter((d) => d.kind === "issue")
      .append("circle")
      .attr("r", radius)
      .attr("fill", fill)
      .attr("stroke", stroke)
      .attr("stroke-width", (d) =>
        d.id === selectedId ? 2.5 : d.ready || (d.blockers ?? 0) > 0 ? 1.6 : 1,
      )
      .attr("fill-opacity", (d) => (d.status === "closed" ? 0.5 : 0.9));

    node
      .append("text")
      .text((d) =>
        d.kind === "project" ? d.title : d.title.length > 28 ? `${d.title.slice(0, 26)}…` : d.title,
      )
      .attr("text-anchor", "middle")
      .attr("dy", (d) => radius(d) + 12)
      .attr("fill", (d) =>
        matches(d)
          ? "var(--accent)"
          : d.kind === "project"
            ? "var(--text)"
            : "var(--text-secondary)",
      )
      .attr("font-size", (d) => (d.kind === "project" ? "12px" : "9.5px"))
      .attr("font-family", (d) => (d.kind === "project" ? "var(--font-serif)" : "var(--font-mono)"))
      .attr("font-weight", (d) => (matches(d) || d.id === selectedId ? 600 : 400))
      .style("pointer-events", "none");

    const neighbours = (id: string): Set<string> => {
      const nb = new Set<string>([id]);
      for (const l of simLinks) {
        if (end(l.source).id === id) nb.add(end(l.target).id);
        if (end(l.target).id === id) nb.add(end(l.source).id);
      }
      return nb;
    };
    const baseOpacity = (d: SimNode) => (d.status === "closed" ? 0.5 : 0.9);
    const focus = (id: string | null) => {
      if (id === null) {
        node.attr("opacity", 1).select("circle").attr("fill-opacity", baseOpacity);
        link.attr("stroke-opacity", (l) => (l.type === "member" ? 0.5 : 0.75));
        return;
      }
      const nb = neighbours(id);
      node.attr("opacity", (d) => (nb.has(d.id) ? 1 : 0.12));
      link.attr("stroke-opacity", (l) =>
        end(l.source).id === id || end(l.target).id === id ? 0.95 : 0.04,
      );
    };

    node
      .on("mouseover", (_e, d) => focus(d.id))
      .on("mouseout", () => focus(selectedId))
      .on("click", (e, d) => {
        e.stopPropagation();
        onSelect(d.kind === "issue" ? d.id : null);
      });

    if (q !== "") {
      node.attr("opacity", (d) => (matches(d) || d.kind === "project" ? 1 : 0.2));
    } else {
      focus(selectedId);
    }

    sim.on("tick", () => {
      link
        // Draw blocks edges from the blocker to the dependent so arrows show execution order.
        .attr("x1", (l) => (l.type === "blocks" ? end(l.target).x : end(l.source).x) ?? 0)
        .attr("y1", (l) => (l.type === "blocks" ? end(l.target).y : end(l.source).y) ?? 0)
        .attr("x2", (l) => {
          const a = l.type === "blocks" ? end(l.source) : end(l.target);
          const b = l.type === "blocks" ? end(l.target) : end(l.source);
          if (l.type !== "blocks") return a.x ?? 0;
          const dx = (a.x ?? 0) - (b.x ?? 0);
          const dy = (a.y ?? 0) - (b.y ?? 0);
          const len = Math.hypot(dx, dy) || 1;
          return (a.x ?? 0) - (dx / len) * (radius(a) + 2);
        })
        .attr("y2", (l) => {
          const a = l.type === "blocks" ? end(l.source) : end(l.target);
          const b = l.type === "blocks" ? end(l.target) : end(l.source);
          if (l.type !== "blocks") return a.y ?? 0;
          const dx = (a.x ?? 0) - (b.x ?? 0);
          const dy = (a.y ?? 0) - (b.y ?? 0);
          const len = Math.hypot(dx, dy) || 1;
          return (a.y ?? 0) - (dy / len) * (radius(a) + 2);
        });
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      sim.stop();
    };
  }, [nodes, edges, search, selectedId, onSelect]);

  if (nodes.length === 0) return <div className="empty">Nothing matches the current filters.</div>;
  return (
    <div className="canvas">
      <svg ref={svgRef} role="img" aria-label="Dependency graph" />
      <div className="legend">
        <span>
          <i /> blocks
        </span>
        <span>
          <i className="dashed" /> parent-child
        </span>
        <span>
          <i className="dotted" /> discovered / relates
        </span>
        <span>
          <b style={{ color: "var(--accent)" }}>●</b> in progress
        </span>
        <span>
          <b style={{ color: "var(--accent)" }}>○</b> blocked
        </span>
        <span>ring = ready</span>
      </div>
    </div>
  );
}
