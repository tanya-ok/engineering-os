# dashboard - work graph over beads

A local dashboard (`eos-dashboard`) that renders the beads task graph the way
the vault renders knowledge: issues grouped by project, dependency edges,
the ready queue, and per-project counts. Hono API + a React and d3 browser app.

## Build and run

```sh
pnpm --dir dashboard install && pnpm --dir dashboard run build   # from the repo root
node dashboard/dist/cli.js serve --fixture                      # sample data on :8766
node dashboard/dist/cli.js serve --root ~/path/to/workspace     # runs `bd export` there
```

Open http://127.0.0.1:8766. Source resolution when no flag is given:
`EOS_BEADS_JSONL` / `EOS_BEADS_ROOT`, then an explicit `--config` file, then a
`.beads` directory in the current directory, then the shipped anonymized
fixture (`fixtures/beads.sample.jsonl`).

## What it shows

- **Graph**: one node per issue, sized by how many issues it blocks. Solid
  arrows are `blocks` edges drawn in execution order (blocker to dependent);
  dashed lines are `parent-child`; dotted lines are `discovered-from` and
  `relates_to`. Square hubs are projects (the id prefix, e.g. `harbor-gps` for
  `harbor-gps-r2s`). Vermillion fill = in progress, vermillion ring = blocked,
  dark ring = ready. Hover to focus neighbours, click for the detail panel.
- **Projects**: counts per project (open, ready, blocked, in progress,
  deferred, closed), domains from `domain:` labels, epics.
- **Ready**: `bd ready` semantics - open issues with no open `blocks`
  dependency, ordered by priority.

## Local overlay (private, gitignored)

`dashboard/dashboard.json` adds what the public skeleton must not carry:
where the workspace lives, human labels and links per project, and how to turn
an `external_ref` into a URL. See `dashboard.example.json`.

```json
{
  "beads_root": "~/work/workspace",
  "ttl_seconds": 30,
  "external_ref_url": "https://tracker.example/issue/{ref}",
  "projects": {
    "harbor-gps": { "label": "Harbor GPS", "path": "~/work/workspace/gps", "url": "https://example.com/harbor" }
  }
}
```

Only `external_ref_url` and `projects` reach the browser (`GET /api/config`);
paths and the workspace location stay on the server side.

## API

- `GET /api/health` - `{status, source, issues, projects, loaded_at, last_error}`
- `GET /api/graph?include_closed=0&membership=1&project=a,b` - nodes, edges, project summaries
- `GET /api/issues?project=&status=&type=&label=&q=&include_closed=` - filtered issues
- `GET /api/issues/:id` - one issue with resolved dependencies and dependents
- `GET /api/projects` - per-project summaries
- `GET /api/ready?project=` - the ready queue
- Add `fresh=1` to any of these to bypass the cache (`ttl_seconds`, default 30).

`eos-dashboard graph [--all]` prints the same graph JSON to stdout for agents
and scripts.

## Development

```sh
pnpm --dir dashboard run watch      # rebuild the browser bundle on change
pnpm --dir dashboard run typecheck  # server (NodeNext) and web (bundler) programs
pnpm --dir dashboard run lint
pnpm --dir dashboard test
```

Only `bd export --no-memories` is ever executed, read-only, in the configured
workspace. The server binds 127.0.0.1 unless `--host` says otherwise.

Private overlays are loaded only with `--config dashboard/dashboard.json`.
`--fixture` ignores overlays, including an explicitly supplied config, so demo
labels and links cannot come from a private workspace. Health and source errors
expose source kinds, not filesystem paths.
