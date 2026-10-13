import { useCallback, useEffect, useState } from "react";
import type { PlannedSession, QualificationStatus } from "../../src/session-types.js";
import type { SourceStatus } from "../../src/source-status.js";
import { getJson } from "../api.js";

interface Plans {
  enabled: boolean;
  qualification: QualificationStatus | null;
  repositories: string[];
  sessions: PlannedSession[];
}
export function Operations({ section = "sources" }: { section?: "sources" | "plans" }) {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [repository, setRepository] = useState("");
  const [task, setTask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        getJson<{ sources: SourceStatus[]; error: string | null }>("/api/sources"),
        getJson<Plans>("/api/sessions"),
      ]);
      setSources(s.sources);
      setGraphError(s.error);
      setPlans(p);
      setRepository((r) => r || p.repositories[0] || "");
      setError(null);
    } catch {
      setError("Could not load operations status. Try refresh.");
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const mutate = async (url: string, body?: object) => {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok)
        throw new Error("Could not save the plan. Check the selected repository and try again.");
      if (body) setTask("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const time = (value: string | null) => (value ? new Date(value).toLocaleString() : "Never");
  return (
    <div className="doc-page">
      {section === "sources" ? (
        <>
          <h3>Tracker freshness</h3>
          <p>
            A successful source read is separate from the last complete graph. Snapshot time is file
            modification time, not proof that the export is current.
          </p>
          {graphError ? <p className="error">{graphError}</p> : null}
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>State</th>
                <th>Last read</th>
                <th>Graph loaded</th>
                <th>Snapshot file</th>
                <th>Issues</th>
                <th>Unresolved dependencies</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.label}
                    <div>{s.error}</div>
                  </td>
                  <td>{s.error ? "Read failed" : s.stale ? "Stale / not loaded" : "Loaded"}</td>
                  <td>{time(s.last_read_at)}</td>
                  <td>{time(s.graph_loaded_at)}</td>
                  <td>{s.kind === "bd" ? "Live export" : time(s.snapshot_at)}</td>
                  <td>{s.count ?? "-"}</td>
                  <td>{s.unresolved_edges ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Execution readiness</h3>
          {plans?.qualification ? (
            <section>
              <p>
                Checked {time(plans.qualification.checked_at)} · Runtime{" "}
                {plans.qualification.runtime_version}:{" "}
                {plans.qualification.runtime_compatible ? "API verified" : "not verified"}
              </p>
              <p>
                Model: {plans.qualification.model} · File-reading test:{" "}
                {plans.qualification.model_read_passed ? "passed" : "not passed"}
              </p>
              <p>
                Isolation smoke test:{" "}
                {plans.qualification.isolation_passed ? "passed" : "not passed"}
              </p>
              <p>{plans.qualification.reason}</p>
            </section>
          ) : (
            <p>No qualification results recorded.</p>
          )}
        </>
      ) : (
        <>
          <h3>Agent session plans</h3>
          <p>
            Working in Claude Code? Update the owning repository’s Beads tracker there, then reload
            this dashboard. Saving a plan here does not send it to Claude Code.
          </p>
          <p>
            Prepare a task for one configured repository. Execution is not enabled: a model and
            isolated runner must pass qualification first.
          </p>
          {error ? <p className="error">{error}</p> : null}
          {plans?.enabled ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate("/api/sessions", { repository, task });
              }}
            >
              <label>
                Repository{" "}
                <select value={repository} onChange={(e) => setRepository(e.target.value)}>
                  {plans.repositories.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <div>
                <label>
                  Task{" "}
                  <textarea
                    value={task}
                    maxLength={4000}
                    onChange={(e) => setTask(e.target.value)}
                    rows={3}
                    style={{ width: "100%" }}
                  />
                </label>
              </div>
              <button type="submit" disabled={busy || !repository || !task.trim()}>
                Save plan
              </button>
            </form>
          ) : (
            <p>Planning is disabled in fixture mode.</p>
          )}
          {plans?.sessions.map((s) => (
            <section key={s.id} style={{ borderTop: "1px solid var(--border)", padding: "16px 0" }}>
              <strong>{s.repository}</strong> · {s.status.replaceAll("_", " ")}
              <p style={{ whiteSpace: "pre-wrap" }}>{s.task}</p>
              <p>
                Starting commit: <code>{s.base_commit.slice(0, 12)}</code> ·{" "}
                {s.dirty ? "Local changes present" : "Clean at planning time"}
              </p>
              <p>{s.reason}</p>
              {s.status !== "cancelled" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void mutate(`/api/sessions/${s.id}/cancel`)}
                >
                  Cancel plan
                </button>
              ) : null}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
