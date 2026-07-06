# AI vault

The agent's persistent self across sessions. An AI coding agent starts every
session with no memory of the last one; this vault is where it keeps the parts
of itself that should carry over: who it is in this working relationship, the
rules it has learned for collaborating with you, and its own observations.

Reading is unified: this vault is indexed alongside the work and user vaults,
so the agent can retrieve its own past notes. Writing is governed by
`rag/routing.json`: the agent writes here (and only here) when the content is
about itself or the collaboration.

## Structure

| Folder | What lives there | Who writes |
|---|---|---|
| `identity/` | Who the agent is in this relationship: role, scope, boundaries. Changes rarely and deliberately. | you (mostly), agent (identity changes only) |
| `interaction-rules/` | How to work with you: when to ask vs act, escalation, defaults. Grows as you correct the agent. | you + agent |
| `observations/` | Dated notes the agent writes about how sessions went, patterns it noticed, corrections it received. | agent |

## The point

Without this vault, every session re-learns the same lessons. With it, a
correction you give once ("always ask before pushing") becomes a durable rule
the agent reads back on its next session. The `observations/` folder is the
agent's working memory; `interaction-rules/` is where repeated observations get
promoted into standing rules.
