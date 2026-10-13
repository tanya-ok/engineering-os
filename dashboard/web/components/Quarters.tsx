import { quarterly } from "../../src/quarters.js";
import type { GraphNode } from "../types.js";
export function Quarters({ nodes }: { nodes: GraphNode[] }) {
  const report = quarterly(nodes);
  return (
    <section className="doc-page">
      <h3>Plan and actual completion</h3>
      <p>
        All projects · Beads tasks, bugs and features · UTC. Planning label:{" "}
        <code>quarter:2026-Q3</code>. Add or change it in the owning tracker, including from Claude
        Code, then reload.
      </p>
      <p>
        Planned uses the quarter label; completed uses the closure date. These are independent
        counts, not a completion percentage. Sidebar graph filters do not apply here.
      </p>
      <table>
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Planned</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map(([quarter, values]) => (
            <tr key={quarter}>
              <td>{quarter}</td>
              <td>{values.planned}</td>
              <td>{values.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.rows.length === 0 ? <p>No quarter labels or dated completions available.</p> : null}
      <p>
        Closed without a valid date: {report.unknown}. Conflicting planning labels:{" "}
        {report.ambiguous}.
      </p>
      <p>
        Latest snapshot only. Historical baselines, reopened-task history, KPI targets and time
        tracking are not yet collected. See How it works for definitions.
      </p>
    </section>
  );
}
