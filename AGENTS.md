# AGENTS - Operational Policy

Rules for any AI agent (Claude Code, local LLMs, MCP clients) working in this
repo or in a vault created from `vault-template/`.

## The contract: unified reading, segregated writing

- **Reading**: all registered vaults are indexed together. Query the RAG
  server (`POST :8765/search`) for grounded context instead of guessing.
- **Writing**: every write lands in the domain folder it belongs to
  (CloudOps, FinOps, DevOps, SecOps, Architecture, Weekly). When unsure,
  default to the most specific domain and tag the note `needs-routing`.

## Boundaries

### Always
- Write vault files atomically (temp file + rename); never truncate in place.
- Keep `_Index/Active Context.md` and `_Index/Open Loops.md` current when
  work state changes; they are the session-start context for every agent.
- New architecture decisions go to `Architecture/decisions/` using the ADR
  template, numbered sequentially.
- English only in all committed artifacts.

### Ask first
- Changing the vault folder structure or index schema.
- Adding dependencies.

### Never
- Hardcode personal paths; every path comes from config or env.
- Commit secrets, tokens, or anything matching the anonymization gate
  (`scripts/anonymization-check.sh` runs on pre-commit and pre-push).
- Rewrite `rag/build_index.py` chunking logic without regenerating the index.

## Key files

| File | Role |
|---|---|
| `vault-template/` | Starter vault: five domains + `_Index/` + `Weekly/` |
| `rag/build_index.py` | Incremental indexer: chunk, embed, store |
| `rag/server.py` | Search server: /health, /search (hybrid + MMR) |
| `rag/vaults.example.json` | Vault registry template (env-driven paths) |
| `scripts/anonymization-check.sh` | Leak gate: generic patterns + optional local list |
| `scripts/setup.sh` | One-command bootstrap for a fresh clone |
