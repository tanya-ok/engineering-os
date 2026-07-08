# Work tracking

engineering-os separates knowledge (the vaults) from work (what is being done
about it). The work layer follows the same rule as the vaults: **unified
reading, segregated writing**.

## The three trackers

| Tracker | Holds | Who writes | Horizon |
|---|---|---|---|
| **beads** (`bd`) | The agent's task graph: what it is doing, dependencies, the ready queue | AI agents | per-session to multi-week |
| **Linear** (optional) | Human-facing tickets, stakeholder-visible | you | quarterly |
| **the vault** | The narrative: roadmap, decisions, open loops, weekly reviews | you + agents | durable |

beads is the source of truth for agent execution; it is local and git-backed,
so it needs no account and no cloud. Linear is an optional adapter for teams
that want a human tracker (see the roadmap). The vault is where planning lives
as prose: `_Index/Open Loops.md`, `Architecture/decisions/`, and `Weekly/`.

## beads conventions

- **Install and initialize.** beads is [Steve Yegge's `bd`](https://github.com/steveyegge/beads).
  Install it, then `bd init` at the repo root (or in your project workspace).
  The `.beads/` directory is committed so the task graph travels with the repo.
- **Titles** are capitalized, concise, English, no brackets.
- **Labels** carry the domain: `domain:CloudOps`, `domain:SecOps`, and so on,
  so work filters by the same five domains as the vault.
- **Priority** is `0`-`4` (0 = critical), not "high"/"low".
- **Ready** means no open blockers. Start from `bd ready`, not from a guess.
- **Dependencies** are explicit (`bd dep add`); the ready queue is derived from
  them.

## Announcement protocol

An agent working the task graph announces state changes in one line so the human
always sees what is happening, before the tool call:

- **Claim** when starting a task.
- **Block** when a dependency stops it, with what is blocking.
- **Pause / Resume** when switching context.
- **Complete** when closing, with a one-line result.

## What not to do

- Do not track agent work in scattered markdown TODOs or a chat list. beads is
  the single source of truth for what agents are doing.
- Do not write human-facing tickets into beads; those belong in Linear (or your
  human tracker). Keep the two audiences separate.
