# Publication and demonstration gates

This page defines acceptance criteria, not an approval badge. Publication stays
separate from local preparation. No remote deployment is implied by a successful
local documentation build.

## Reproduce the project

Run from a fresh checkout with the documented runtime and package manager:

```sh
bash scripts/setup.sh
pnpm --dir dashboard test
pnpm --dir rag test
EOS_E2E=1 pnpm --dir rag test
```

Follow the [demonstration guide](portable-portfolio.md). Capture the source revision, environment,
command, observed positive and negative outcomes and cleanup result. Saved
screenshots or an older report must identify their capture date. Re-run an
applicable integration check after changing the behavior it exercises.

Real local multilingual model retrieval and a six-project beads portfolio were exercised. Retrieval filters are not authorization. Use separate processes and indexes for separate trust domains. No private vault belongs in a review packet.

## Build the documentation

Documentation tooling is separate from the application runtime:

```sh
python3 -m venv .venv-docs
.venv-docs/bin/python -m pip install -r requirements-docs.txt
.venv-docs/bin/zensical build --strict --clean
.venv-docs/bin/zensical serve --dev-addr 127.0.0.1:8000
```

The pinned generator produces `site/`. Check navigation, code blocks, diagrams,
search and project-subpath asset URLs in a browser. Never add private overlays,
state databases, credentials or private vaults to documentation sources.

## GitHub Pages handoff

The prepared workflow builds on pull requests and publishes only from `main`
after an authorized push or explicit workflow dispatch. It uploads the static
`site/` directory and uses the GitHub Pages environment with job-scoped
`pages: write` and `id-token: write`; no long-lived deploy key is required.
The repository owner must select GitHub Actions as the Pages source before the
first deployment. Preparing this file does not enable Pages or execute a deploy.

Before publication, inspect the exact staged diff and distributable contents,
run the repository privacy/secret gates, reproduce the demo from a clean checkout,
verify the strict docs build and retain its evidence. Remote CI and the resulting
Pages URL still need verification after publication is explicitly authorized.

Generator behavior and configuration follow the
[official Zensical guide](https://zensical.org/docs/create-your-site/).

## Local evidence on 2026-10-07

A clean temporary source copy installed locked dependencies and built both
packages on Node 26.10.0 with the then-declared pnpm 10.34.5 (historical; see the
package-manager upgrade below). Its 46 retrieval unit tests, 63 dashboard tests
and both type checks passed. The bootstrap left the protobufjs dependency build
script disabled by policy; it was not approved or executed. Three real-model
checks passed in the same clean copy: English retrieval, Russian cross-language
retrieval and rejection of an oversized result limit. These use the shipped public
templates, not private vaults.

Package allowlists include compiled runtime files, public examples and the MIT
license. Local vault/routing configurations, private tracker overlays, source
tests and databases are excluded. The dashboard package includes the built
web bundle as well as its HTML and public fixture. Build before packing.
Run `node scripts/check-packages.mjs` after building both packages; CI runs the
archive checks per package to catch missing assets and private configuration.

The runtime dependency refresh uses transformers.js 4.3.1, with minimum
patched transitive versions in the source lockfile overrides. The production
audit of the updated source lockfile reported zero advisories on 2026-10-07.
Overrides belong to the root consumer and are not inherited from a dependency;
archive contents and a separately installed package tree must both be checked.
See [npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides)
and the [upstream release](https://github.com/huggingface/transformers.js/releases/tag/4.3.1).
This dated audit is not a permanent security guarantee.

## Package-manager upgrade requested on 2026-10-07

Both applications now pin pnpm 12.10.1, the stable npm `latest` release checked
on this date. Earlier pnpm 10.34.5 results above are historical, not the final
acceptance evidence. Build permissions moved from the removed
`onlyBuiltDependencies` setting into per-package `pnpm-workspace.yaml`
`allowBuilds` maps. Unreviewed build scripts still fail closed; protobufjs is
explicitly denied. Overrides retain their security floors.

The bootstrap exports `ONNXRUNTIME_NODE_INSTALL=skip` by default for CPU-only
inference; CI already uses the same environment setting. pnpm 12 reads only
authentication/registry settings from `.npmrc`, so the obsolete RAG `.npmrc`
setting was removed. When installing the RAG package manually, set that variable
before `pnpm install --frozen-lockfile`.

See [pnpm installation](https://pnpm.io/installation),
[build configuration migration](https://pnpm.io/settings/build#allowbuilds)
and [configuration sources](https://pnpm.io/settings).

The final pnpm 12.10.1 clean copy passed bootstrap/build, all 49 retrieval
checks including the real model, all 63 dashboard tests, both type/lint gates
and both archive-content checks. The migrated lockfiles preserve the original
application dependency document and add the pnpm 12 tool lock document.

## Retained package evidence

| Runtime revision | Local archive | SHA-256 |
|---|---|---|
| `4f54acb` | `eos-rag-0.2.1.tgz` | `05b3b83b4cc9884736c9b3cd58651215182eaeb64a3e504717d3dc20b516f0e7` |
| `4f54acb` | `eos-dashboard-0.1.0.tgz` | `75caf352e8ae18ffa8228af8a69a10869af4bf311843447b1fa2bf0149e3ee14` |

The independently installed archives passed their actual-process demo on
2026-10-07, including refused inputs and owned-process/data cleanup. The apps
use real local HTTP services and the actual multilingual embedding model over
synthetic notes and the shipped fixture. Builds and package installation used
pnpm 12.10.1; `npm pack` produced the final archives. These are local demonstrations,
not production or remote CI evidence.

## Revision references

Revision hashes in dated records that do not resolve in this repository identify
development commits. They were squashed into the 2026-10-13 release commit and are
archived locally. The release tree was checked again after the squash.
