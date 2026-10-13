# Planning and synthetic demo

From the repository root (Node 26):

```sh
pnpm --dir dashboard install --frozen-lockfile
pnpm --dir dashboard build
node dashboard/dist/cli.js serve --fixture
```

The default browser address is http://127.0.0.1:8766. No private overlay is read
in fixture mode and session planning is disabled. No model or cloud account is needed.
For an extended, fully invented portfolio on a separate port:

```sh
node dashboard/dist/cli.js serve --jsonl dashboard/fixtures/beads.demo.jsonl --port 8876
```

Do not pass a private config for this demo. It contains 73 issues across 12
invented projects: open, in-progress, blocked, closed and deferred tasks;
quarter-boundary completions; one undated closure; one conflicting plan; and
an excluded epic. Expected quarterly counts: Q3 planned 71 / completed 12;
Q4 planned 0 / completed 11; unknown closure 1; conflicting plan 1.

The original 30-issue fixture is retained and enriched with quarter labels.
The extended fixture was constructed independently, never scrubbed from real exports.

## Using plans

Use an explicit ignored dashboard/dashboard.json overlay with project ids and
local repository paths. Only configured Git repository roots can receive plans.
Save records the current commit and dirty status; Cancel changes only the plan.
No process starts. Runtime records live in ignored dashboard/data/.

Claude Code can work directly in an owning repository. Update its existing
Beads tracker after acceptance, then reload the dashboard. File-based snapshots
must be re-exported by their producer. No hooks are installed globally.

## Experimental qualification

The optional scripts/qualify-local.py and scripts/qualify-runner.py use temporary
synthetic files on macOS. Supply --expected-version explicitly, --output to a
private directory, and --model for the model probe. They do not download models
or authorize real execution. The adapter requires an explicit runtime contract.
No machine-specific qualification results are shipped.

## Roadmap and measurement

Quarter labels express current intent, not immutable commitments. Closed counts
use UTC closure timestamps; missing timestamps remain unknown. Epics are excluded.
Human time, agent runtime, historical throughput and cycle time need separate
explicit records. Next steps: optional session links with idempotent events,
reviewed quarter baselines, manual time entries and only then historical charts.
A Claude Stop event is not task acceptance. Personal and work trackers stay separate.
