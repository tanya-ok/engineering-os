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
- Local hybrid RAG layer: incremental indexer (`rag/build_index.py`) and
  search server (`rag/server.py`) over SQLite + sqlite-vec + FTS5, with
  RRF fusion and optional MMR reranking. Per-vault `exclude_underscore_prefix`
  keeps `_inbox/` staging out of retrieval while indexing `_Index/`.
- Anonymization gate (lefthook + CI) and gitleaks configuration.
- One-command setup script.
