---
name: clone-projects
description: Clone or sync the project repositories you work on into a local workspace laid out by the same domains as the vault, so notes and code sit side by side. Use when setting up a machine, onboarding a new project, or refreshing all clones.
---

# clone-projects

engineering-os holds your knowledge (the vaults) and, with this skill, the
actual code too. It clones the repositories listed in a manifest into a
workspace organized by the same five domains as the work vault, so
`workspace/CloudOps/` mirrors `vault-template/CloudOps/`: a runbook and the
stack it documents live one directory apart.

## Manifest

Copy `projects.example.tsv` to `projects.tsv` at the repo root and list your
repos. It is tab-separated, the header row is skipped:

```
repo	domain	subcategory
network-stack	CloudOps	_
cost-reports	FinOps	_
ci-pipelines	DevOps	tooling
```

- **repo** - the repository name (the org is supplied separately).
- **domain** - any top-level folder; use the five vault domains
  (CloudOps, FinOps, DevOps, SecOps, Architecture) to keep code and notes aligned.
- **subcategory** - an optional extra nesting level; `_` or empty means none.

`projects.tsv` is gitignored; it is your data, not part of the kit.

## Run

```sh
export EOS_GITHUB_ORG=your-org           # required: the GitHub org or owner
# optional: EOS_WORKSPACE_PATH=~/work    # default is a sibling engineering-os-workspace

./standards/skills/clone-projects/clone-projects.sh          # clone what is missing
./standards/skills/clone-projects/clone-projects.sh --sync   # also fetch --prune existing clones
```

The script is idempotent: existing clones are skipped (or fetched with
`--sync`), so it is safe to re-run. It uses `gh` if available (handles private
repos and auth), otherwise `git clone` over HTTPS. Every action is logged to
`clone.log` in the workspace, and it exits non-zero if any repo failed.

## Layout produced

```
engineering-os-workspace/           (sibling of the engineering-os repo)
  CloudOps/
    network-stack/                  <- git clone
    observability/monitoring/       <- domain/subcategory/repo
  FinOps/
    cost-reports/
  DevOps/
    tooling/ci-pipelines/
```

## Why this shape

The workspace is a derived, disposable checkout of remote repos: delete it and
re-run to rebuild. Keeping it a sibling of the engineering-os repo (not nested
inside) keeps the kit small and avoids committing other people's code. Mirroring
the vault domains means an agent that searched the vault for a CloudOps runbook
can find the matching code in the same domain folder.
