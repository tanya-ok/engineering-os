# The working layer

The vaults hold what you know. The working layer holds what you are *doing*
about it. It follows the same rule as the vaults: unified reading, segregated
writing.

## Three trackers, one picture

| Tracker | Answers | Written by |
|---|---|---|
| **beads** (`bd`) | What is the agent doing? What is ready, what is blocked? | AI agents |
| **the vault** | What are we trying to close, and why? | you + agents |
| **Linear** (optional) | What do stakeholders see? | you |

- **beads** is a local, git-backed task graph ([Steve Yegge's `bd`](https://github.com/steveyegge/beads)).
  No account, no cloud. Agents queue, claim, and close work here; the ready
  queue is derived from explicit dependencies. Tasks carry a `domain:` label so
  work filters by the same five domains as the vault.
- **the vault** is where planning lives as prose: `_Index/Open Loops.md`,
  `Architecture/decisions/`, and `Weekly/`. It is the narrative both the agent
  and you read at the start of a session.
- **Linear** is an optional adapter for a human tracker, kept separate so agent
  execution and stakeholder tickets do not bleed into each other. It is on the
  roadmap, not required.

## The loop

```sh
./standards/skills/plan/plan.sh   # ready beads + the vault's open loops, side by side
```

1. Pick a ready bead whose domain matches an open loop.
2. Claim it, announce the claim, do the work.
3. Close it with a one-line result, and update the open loop.

## Why keep them separate

Agents and humans work on different horizons and need different views. An agent
needs a dependency graph and a ready queue; a stakeholder needs a status and a
milestone. Mixing them makes both worse. Segregated writing keeps each tracker
honest; unified reading (everything is retrievable, and `plan` shows both at
once) keeps them connected. The conventions live in
`standards/canonical/work-tracking.md`.
