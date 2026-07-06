# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Added
- Vault template with five infrastructure domains (CloudOps, FinOps, DevOps,
  SecOps, Architecture), `_Index/` session-context files, ADR scaffolding,
  and weekly review structure.
- Local hybrid RAG layer: incremental indexer (`rag/build_index.py`) and
  search server (`rag/server.py`) over SQLite + sqlite-vec + FTS5, with
  RRF fusion and optional MMR reranking.
- Anonymization gate (lefthook + CI) and gitleaks configuration.
- One-command setup script.
