# Architecture

Non-trivial decisions are recorded as ADRs (Architecture Decision Records) in
`vault-template/Architecture/decisions/`, sequentially numbered and never
deleted; superseded ones are marked as such. The template lives at
`decisions/adr-template.md`.

## The founding decision

The first record, ADR-0001, sets the foundation: **plain markdown is the
primary datastore**.

> We will keep all knowledge as plain markdown files in an Obsidian-compatible
> vault. Structured access is provided by a derived, rebuildable index
> (SQLite + sqlite-vec + FTS5); the index is never the source of truth.

Consequences:

- Any tool that reads files can participate; no lock-in.
- The index can be deleted and rebuilt at any time.
- Cross-note queries require the index; raw grep is the fallback.
- Concurrent writes need care, so writers use atomic replace, not truncate.

## Why this shape

Two design choices define the rest of the system:

- **Zero infrastructure.** Storage is file-based SQLite plus the markdown
  vaults. There is no database server to run and nothing to provision, so the
  whole thing works offline on a laptop.
- **A lean TypeScript service.** The RAG layer is a small Node.js package
  (built once with tsc, run with plain node), so the heaviest dependency of
  the earlier prototype (a multi-gigabyte PyTorch install) is gone. It was
  first shipped as a Rust binary and later ported to TypeScript to match the
  rest of the toolchain.

Write a new ADR whenever a decision carries a real trade-off. If you argued
about it for more than ten minutes, it deserves a record.
