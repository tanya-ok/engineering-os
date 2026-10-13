# Work-graph dashboard

`eos-dashboard` renders the beads task graph the way the vault renders
knowledge: issues grouped by **project**, dependency edges, the **ready queue**,
and per-project counts. It is a local Hono API plus a React and d3 browser app,
and it reads local trackers without writing to them. Optional portable sources
and review reports are described in [portable portfolio](portable-portfolio.md).


## Run it

```sh
pnpm --dir dashboard install && pnpm --dir dashboard run build
node dashboard/dist/cli.js serve --fixture                   # anonymized sample data
node dashboard/dist/cli.js serve --root ~/path/to/workspace  # your .beads workspace
```

Open http://127.0.0.1:8766. With no flag the source is resolved from
`EOS_BEADS_JSONL` / `EOS_BEADS_ROOT`, then an explicit `--config` file, then a
`.beads` directory in the current directory, then the shipped fixture.

## What a project is

beads ids carry their workspace as a prefix: `orchard-search-r2s` belongs to
`orchard-search`. The dashboard groups by that prefix, so a multi-repo workspace
that shares one `.beads` database still reads as separate projects. `repo:`
and `domain:` labels are shown as chips and filters; the five vault domains
come through the `domain:` label convention from
[work tracking](working-layer.md).

## The three views

| View | Question it answers |
|---|---|
| **Graph** | What blocks what, and where does each project's work cluster? Solid arrows are `blocks` edges drawn blocker to dependent; dashed is `parent-child`; dotted is every other link type (`discovered-from`, `relates-to`, ...). Square hubs are projects. Vermillion fill is in progress, a vermillion ring is blocked, a dark ring is ready. |
| **Projects** | How much is open, ready, blocked, in progress, deferred, closed per project, with domains and epics. |
| **Ready** | What can start now, with `bd ready` semantics, ordered by priority. |

## Ready and blocked

Checked against `bd ready` and `bd blocked` from bd 1.0.0 on a scratch
workspace covering each case below; the unit tests mirror it. One deliberate
difference: a missing blocker keeps the issue blocked, where `bd ready` lists it.

| Case | Ready? |
|---|---|
| Status `open`, no open `blocks` dependency | yes |
| Status `in_progress`, `blocked`, `deferred`, or `closed` | no |
| `defer_until` in the future (status stays `open`) | no, counted as deferred |
| A `blocks` dependency on any non-closed issue, including in-progress, blocked, or deferred ones | no |
| A `blocks` dependency on an id missing from the export (external ref, other workspace) | no, it stays blocked and the detail panel marks it "not in source" |
| Parent (`parent-child`) has an open `blocks` dependency | no, shown as "parent blocked" |
| Parent is only status-blocked or deferred, or grandparent is blocked | yes, propagation is one level |
| `relates-to`, `discovered-from`, and other link types | never block |

Older exports spell the relation `relates_to`; it is read as `relates-to`.
The edge filter lists the link types present in the data.

Click a node or row for the detail panel: labels, description, notes, what it
depends on and what depends on it, and links when the local overlay provides
them. Dependencies missing from the source are marked "not in source". The
sidebar shows how long ago the source was loaded; `reload` forces a fresh
`bd export`.

## Keep the private parts private

The repository ships only an anonymized fixture. Everything that ties the
dashboard to a real workspace lives in `dashboard/dashboard.json`, which is
gitignored:

```json
{
  "beads_root": "~/work/workspace",
  "external_ref_url": "https://tracker.example/issue/{ref}",
  "projects": {
    "orchard-search": { "label": "Orchard Search", "path": "~/work/workspace/search", "url": "https://example.com/orchard" }
  }
}
```

Only `external_ref_url` and the project `label` / `url` fields reach the
browser; both link fields must be absolute http or https URLs. Paths and the
workspace location stay server-side. The server binds `127.0.0.1`, refuses
non-loopback hosts without `--allow-remote`, accepts only loopback `Host`
headers, and checks `Origin` against the bound loopback origin on POST. The
full API is documented in `dashboard/README.md`; `eos-dashboard graph` prints
the same graph as JSON for agents and scripts.

Private overlays are loaded only with `--config dashboard/dashboard.json`.
`--fixture` ignores overlays, including an explicitly supplied config, so demo
labels and links cannot come from a private workspace. Health and source errors
expose source kinds, not filesystem paths.
