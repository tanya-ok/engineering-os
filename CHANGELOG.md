# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Added
- Three-vault model: work vault (five infrastructure domains, `_Index/`,
  weekly reviews), AI vault (agent identity, interaction rules, observations),
  user vault (communication style, environment, facts, `_inbox/` staging).
- Write-routing contract (`rag/routing.example.json`): unified reading across
  all vaults, segregated writing by content type.
- Standards layer (`standards/`): canonical policy modules, plugin manifest,
  and skills/hooks/agents scaffolding for the governance layer.
- Local hybrid RAG layer as a single Rust binary (`eos-rag`, in `rag/`):
  fastembed (ONNX Runtime, no PyTorch) + SQLite via sqlite-vec + FTS5, with
  RRF fusion and optional MMR reranking. `index` and `serve` subcommands.
  Per-vault `exclude_underscore_prefix` keeps `_inbox/` staging out of
  retrieval while indexing `_Index/`.
- Anonymization gate (lefthook + CI) and gitleaks configuration.
- Test coverage: unit tests for the chunker, RRF fusion, config path
  expansion, mtime skip logic, and the dimension guard, plus an end-to-end
  test (`rag/tests/e2e.rs`) that indexes and searches through the real binary.
- CI jobs: Rust lint, the full test suite, a `cargo audit` dependency scan,
  a secret scan, and the anonymization gate.
- One-command setup script.

### Notes
- The RAG layer is Rust-only. An earlier Python prototype
  (sentence-transformers + FastAPI) was replaced before the first release to
  keep the toolchain single-language and drop the PyTorch install from
  onboarding. The index format, `vaults.json` config, and `/search` contract
  are unchanged.
