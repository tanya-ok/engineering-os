---
name: plan
description: Show the current work picture - the ready beads (agent tasks with no blockers) and the vault's open loops - to decide what to pick up next. Use at the start of a session or when planning the next chunk of work.
---

# plan

engineering-os tracks work in two places that answer different questions:

- **beads** (`bd`) - the agent's task graph: what has been queued, what is
  blocked, and what is *ready* right now.
- **the vault** (`_Index/Open Loops.md`) - the human narrative: the loops you
  are trying to close, with owners and next steps.

This skill puts both in front of you at once so planning starts from the real
state instead of a guess.

## Run

```sh
./standards/skills/plan/plan.sh
```

It prints `bd ready` (or a setup hint if beads is not installed yet) followed by
the vault's open loops. Then the loop is:

1. Pick a ready bead whose `domain:` label matches an open loop you care about.
2. Claim it: `bd update <id> --claim`, and announce the claim.
3. When done: `bd close <id> --reason "..."`, and update the open loop.

## Conventions

See `standards/canonical/work-tracking.md` for the full beads conventions
(titles, `domain:` labels, priorities, the ready queue, and the announcement
protocol). The short version: agents write beads, humans write the vault (and
Linear later), and reading is unified across both.
