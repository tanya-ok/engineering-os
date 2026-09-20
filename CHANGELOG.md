# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Security
- Require explicit dashboard overlays and ignore them in demo mode. Remove
  filesystem paths and raw source errors from browser-facing responses.
- Harden the anonymization gate and add redacted secret scanning to CI.
- Closed the open Dependabot alerts in `rag/`: hono 4.13.7 (CORS ReDoS,
  language-middleware DoS, proxy `Connection` header, `memo()` cross-request
  leak), @hono/node-server 2.1.1 (WebSocket-abort memory leak), and pnpm
  overrides that lift the transitive sharp (libvips CVEs), adm-zip (4 GB
  allocation) and postcss (source-map path traversal) to patched versions.

### Added
- Work-graph dashboard (`dashboard/`, `eos-dashboard`): a local Hono API plus
  a React and d3 browser app over `bd export`. Issues grouped by project (the
  id prefix), `blocks` / `parent-child` / `discovered-from` / `relates_to`
  edges, per-project counts, the ready queue, and a detail panel. Ships with an
  anonymized fixture; the private wiring lives in a gitignored
  `dashboard/dashboard.json` (see `dashboard.example.json`).

### Fixed
- Secret scanning handles root commits and rewritten history without computing
  a nonexistent parent; verify the pinned scanner archive before installation.
- CI `test` job no longer times out: onnxruntime-node's postinstall tried to
  download CUDA binaries from NuGet on every Linux install. `rag/.npmrc` and
  the workflow now set `onnxruntime-node-install=skip` (CPU-only embeddings).

### Changed
- Require Node 26 and use it in both CI package jobs and setup checks.
- Update `@types/node` to 26.4.1 in both packages; matching the Node 26 runtime and CI.
- Update the pinned Pages deployment action to 5.0.1.
- `rag/` dependency refresh: better-sqlite3 13, vitest 5, Biome 2.5.12,
  pnpm 10.34.5. Pinned GitHub
  Actions bumped (checkout 7.0.1, setup-node 7.0.0, setup-python 7.0.0,
  pnpm/action-setup 6.0.10).
- RAG layer rewritten in TypeScript (`rag/`, still `eos-rag`):
  transformers.js (ONNX, quantized) for embeddings, Hono for the HTTP server,
  better-sqlite3 + sqlite-vec for storage. The CLI verbs, `vaults.json`
  schema, and `/search` response contract are unchanged. New in the port:
  default model `intfloat/multilingual-e5-small` with automatic e5
  `passage:`/`query:` prefixes, trigram FTS5 for Cyrillic lexical search
  (unicode61 fallback), `.env` actually loaded, `--port`/`--host` flags,
  `top` validated to 1..50, and a diode guardrail (`allowed_roots`, iCloud
  paths always refused). CI now runs Biome + tsc + vitest; the prebuilt-binary
  release workflow is gone.

### Added
- Three-vault model: work vault (five infrastructure domains, `_Index/`,
  weekly reviews), AI vault (agent identity, interaction rules, observations),
  user vault (communication style, environment, facts, `_inbox/` staging).
- Write-routing contract (`rag/routing.example.json`): unified reading across
  all vaults, segregated writing by content type.
- Standards layer (`standards/`): canonical policy modules, plugin manifest,
  and skills/hooks/agents scaffolding for the governance layer.
- Local hybrid RAG layer (`eos-rag`, in `rag/`): transformers.js (ONNX, no
  PyTorch) + SQLite via sqlite-vec + FTS5, with RRF fusion and optional MMR
  reranking. `index` and `serve` verbs. Per-vault `exclude_underscore_prefix`
  keeps `_inbox/` staging out of retrieval while indexing `_Index/`.
- Anonymization gate (lefthook + CI) and gitleaks configuration.
- Test coverage: unit tests for the chunker, RRF fusion, config path
  expansion and the diode guardrail, mtime skip logic, search validation, and
  the dimension guard, plus a gated end-to-end test (`rag/src/e2e.test.ts`,
  `EOS_E2E=1`) that indexes and searches the shipped templates with the real
  model.
- CI jobs: Biome lint, `tsc --noEmit`, the unit test suite, and the
  anonymization gate.
- One-command setup script.

### Notes
- An earlier Python prototype (sentence-transformers + FastAPI) was replaced
  before the first release to drop the PyTorch install from onboarding; the
  compiled-binary implementation that replaced it was in turn rewritten in
  TypeScript (see Changed above). The index format, `vaults.json` config, and
  `/search` contract survived both rewrites.
