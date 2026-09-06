import type { GraphNode } from "../types.js";

interface Props {
  nodes: GraphNode[];
  onSelect: (id: string) => void;
}

export function Ready({ nodes, onSelect }: Props) {
  const ready = nodes
    .filter((n) => n.ready === true)
    .sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4) || a.id.localeCompare(b.id));
  if (ready.length === 0)
    return <div className="empty">Nothing is ready under the current filters.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th className="num">P</th>
            <th>Title</th>
            <th>Project</th>
            <th>Labels</th>
            <th className="num">Blocks</th>
          </tr>
        </thead>
        <tbody>
          {ready.map((n) => (
            <tr key={n.id} className="row" onClick={() => onSelect(n.id)}>
              <td className="mono">{n.id}</td>
              <td className="num">{n.priority}</td>
              <td>{n.title}</td>
              <td className="mono muted">{n.project}</td>
              <td className="mono muted">{(n.labels ?? []).join(" ")}</td>
              <td className="num">{n.dependents}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
