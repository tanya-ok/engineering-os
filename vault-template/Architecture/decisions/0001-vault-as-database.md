---
type: adr
status: accepted
---

# ADR-0001: plain markdown vault as the primary datastore

## Status

Accepted

## Context

A personal engineering knowledge system needs storage that survives tool
churn, works offline, diffs cleanly in git, and is directly editable by both
a human (Obsidian, any editor) and an AI agent. Databases make agent access
easy but human editing and portability hard.

## Decision

We will keep all knowledge as plain markdown files in an Obsidian-compatible
vault. Structured access is provided by a derived, rebuildable index
(SQLite + sqlite-vec + FTS5); the index is never the source of truth.

## Consequences

- Any tool that reads files can participate; no lock-in.
- The index can be deleted and rebuilt at any time.
- Cross-note queries require the index; raw grep is the fallback.
- Concurrent writes need care: writers must use atomic replace, not truncate.

## Alternatives considered

- SQLite as primary store: better queries, loses human editability and diffs.
- Hosted note service: adds an account dependency and an exfiltration surface.
