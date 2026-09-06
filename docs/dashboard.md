# Work-graph dashboard

`eos-dashboard` renders the beads task graph the way the vault renders
knowledge: issues grouped by **project**, dependency edges, the **ready queue**,
and per-project counts. It is a local Hono API plus a React and d3 browser app,
and it reads beads through `bd export` only, so it never writes to the tracker.


## Run it

```sh
pnpm --dir dashboard install && pnpm --dir dashboard run build
node dashboard/dist/cli.js serve --fixture                   # anonymized sample data
node dashboard/dist/cli.js serve --root ~/path/to/workspace  # your .beads workspace
```

Open http://127.0.0.1:8766. With no flag the source is resolved from
`EOS_BEADS_JSONL` / `EOS_BEADS_ROOT`, then `dashboard/dashboard.json`, then a
`.beads` directory in the current directory, then the shipped fixture.

## What a project is

beads ids carry their workspace as a prefix: `harbor-gps-r2s` belongs to
`harbor-gps`. The dashboard groups by that prefix, so a multi-repo workspace
that shares one `.beads` database still reads as separate projects. `repo:`
and `domain:` labels are shown as chips and filters; the five vault domains
come through the `domain:` label convention from
[work tracking](working-layer.md).

## The three views

| View | Question it answers |
|---|---|
| **Graph** | What blocks what, and where does each project's work cluster? Solid arrows are `blocks` edges drawn blocker to dependent; dashed is `parent-child`; dotted is `discovered-from` / `relates_to`. Square hubs are projects. Vermillion fill is in progress, a vermillion ring is blocked, a dark ring is ready. |
| **Projects** | How much is open, ready, blocked, in progress, deferred, closed per project, with domains and epics. |
| **Ready** | What can start now: `bd ready` semantics, open issues with no open `blocks` dependency, ordered by priority. |

Click a node or row for the detail panel: labels, description, notes, what it
depends on and what depends on it, and links when the local overlay provides
them.

## Keep the private parts private

The repository ships only an anonymized fixture. Everything that ties the
dashboard to a real workspace lives in `dashboard/dashboard.json`, which is
gitignored:

```json
{
  "beads_root": "~/work/workspace",
  "external_ref_url": "https://tracker.example/issue/{ref}",
  "projects": {
    "harbor-gps": { "label": "Harbor GPS", "path": "~/work/workspace/gps", "url": "https://example.com/harbor" }
  }
}
```

Only `external_ref_url` and the project `label` / `url` fields reach the
browser. Paths and the workspace location stay server-side, and the server
binds `127.0.0.1` unless told otherwise. The full API is documented in
`dashboard/README.md`; `eos-dashboard graph` prints the same graph as JSON
for agents and scripts.
