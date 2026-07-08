# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Changed
- RAG layer rewritten from Rust to TypeScript (`rag/`, still `eos-rag`):
  transformers.js (ONNX, quantized) replaces fastembed, Hono replaces axum,
  better-sqlite3 + sqlite-vec replace rusqlite. The CLI verbs, `vaults.json`
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
  Rust implementation that replaced it was in turn ported to TypeScript (see
  Changed above). The index format, `vaults.json` config, and `/search`
  contract survived both rewrites.
