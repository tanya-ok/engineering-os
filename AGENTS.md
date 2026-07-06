# AGENTS - Operational Policy

Rules for any AI agent (Claude Code, local LLMs, MCP clients) working in this
repo or in a vault created from `vault-template/`.

## The contract: unified reading, segregated writing

- **Reading**: all three vaults (work, ai, user) are indexed together. Query
  the RAG server (`POST :8765/search`) for grounded context instead of
  guessing.
- **Writing**: routed by content type per `rag/routing.json`.
  - Your own identity, interaction rules, and observations about the
    collaboration go to the **ai** vault.
  - Durable facts about the user are staged in the **user** vault `_inbox/`,
    never written directly into its curated namespaces.
  - Operational work goes to the **work** vault domain it belongs to
    (CloudOps, FinOps, DevOps, SecOps, Architecture, Weekly).
  - When unsure, default to the work vault and tag the note `needs-routing`.

Standing behavioral, git, language, and security policies live in
`standards/canonical/`. Read them; they govern how you act here.

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
| `vault-template/` | Work vault: five domains + `_Index/` + `Weekly/` |
| `ai-vault-template/` | AI vault: identity, interaction rules, observations |
| `user-vault-template/` | User vault: communication, environment, facts, `_inbox/` |
| `rag/` | Rust RAG layer: `eos-rag` binary (index + serve), fastembed + sqlite-vec |
| `rag/src/` | indexer, search server (/health, /search hybrid + MMR), config, chunker |
| `rag/vaults.example.json` | Vault registry template (env-driven paths) |
| `rag/routing.example.json` | Write-routing contract (unified read, segregated write) |
| `standards/` | Governance layer: canonical policies, skills, hooks, plugin manifest |
| `scripts/anonymization-check.sh` | Leak gate: generic patterns + optional local list |
| `scripts/setup.sh` | One-command bootstrap for a fresh clone |
