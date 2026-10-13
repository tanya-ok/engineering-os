export function Documentation() {
  return (
    <article className="doc-page">
      <h3>Start here</h3>
      <p>
        Projects groups tasks. Dependency graph shows relationships. Ready queue finds unblocked
        work. Quarterly review compares target-quarter labels with actual closure dates. Data
        sources shows freshness and failures.
      </p>
      <Diagram name="architecture" title="Local data flow" />
      <h3>Use your own repository</h3>
      <p>
        Start with --fixture for synthetic data. Real sources require --root, --jsonl or an explicit
        --config file. Add repository paths to the private projects configuration to enable saved
        plans. Paths stay on the server. No tracker is created or migrated automatically.
      </p>
      <h3>Work directly in Claude Code</h3>
      <p>
        Select an existing issue in its owning repository. Follow that repository’s instructions,
        implement and test, then update its tracker after human acceptance. Reload the dashboard to
        see the result. A snapshot file must be refreshed by its exporter first. No Claude Code
        hooks are installed by this application.
      </p>
      <Diagram
        name="agent-workflow"
        title="Direct agent workflow and proposed dashboard execution"
      />
      <h3>Plans are not executions</h3>
      <p>
        Save plan records the repository, task, starting commit and dirty state. Cancel plan cancels
        that record, not a running external agent. Automatic execution is disabled. The experimental
        OpenCode adapter supports compatibility checks, diff retrieval and abort; it is not
        connected to task dispatch. Qualification reports are local evidence, never permission to
        execute.
      </p>
      <h3>Quarterly reporting</h3>
      <p>
        Add one label such as quarter:2026-Q3 in your tracker. Planned counts follow that label;
        completed counts follow closed_at in UTC. Tasks, bugs and features count; epics do not.
        These are independent counts, not a completion percentage. All projects are included,
        independently of graph filters. Missing dates and conflicting labels are shown separately.
      </p>
      <Diagram name="quarterly-data" title="Quarterly data and future metric collection" />
      <p>
        Only the current snapshot is available. Reopened tasks and changed labels cannot reconstruct
        historical baselines. No human effort is inferred from agent runtime, tokens or commits.
      </p>
      <h3>Source health and isolation</h3>
      <p>
        A failed refresh retains the last complete graph and delays retries. A successful file read
        does not prove that its export is current. Source diagnostics hide filesystem paths. Demo
        mode ignores the private overlay and disables plan creation. Note search is a separate
        service, not automatically connected to agent plans.
      </p>
      <h3>Not implemented</h3>
      <p>
        Automatic execution, Claude session ingestion, timers, immutable planning baselines and
        historical KPI targets remain proposed. Provider selection and authorization must precede
        any transfer of private context.
      </p>
    </article>
  );
}
function Diagram({ name, title }: { name: string; title: string }) {
  return (
    <figure style={{ margin: "24px 0", overflowX: "auto" }}>
      <a href={`/diagrams/${name}.svg`} target="_blank" rel="noreferrer">
        <img
          src={`/diagrams/${name}.svg`}
          alt={title}
          style={{ width: "100%", minWidth: 720, height: "auto" }}
        />
      </a>
      <figcaption>{title} · Open image for full size</figcaption>
    </figure>
  );
}
