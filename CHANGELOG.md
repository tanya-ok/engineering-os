# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Security
- Closed the open Dependabot alerts in `rag/`: hono 4.13.7 (CORS ReDoS,
  language-middleware DoS, proxy `Connection` header, `memo()` cross-request
  leak), @hono/node-server 2.1.1 (WebSocket-abort memory leak), and pnpm
  overrides that lift the transitive sharp (libvips CVEs), adm-zip (4 GB
  allocation) and postcss (source-map path traversal) to patched versions.

### Fixed
- CI `test` job no longer times out: onnxruntime-node's postinstall tried to
  download CUDA binaries from NuGet on every Linux install. `rag/.npmrc` and
  the workflow now set `onnxruntime-node-install=skip` (CPU-only embeddings).

### Changed
- `rag/` dependency refresh: better-sqlite3 13, vitest 5, Biome 2.5.12,
  `@types/node` pinned to the Node 24 LTS line, pnpm 10.34.5. Pinned GitHub
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
