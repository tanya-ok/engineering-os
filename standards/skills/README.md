# skills

Reusable agent workflows exposed as slash commands. Implementations land in
v0.2; this file names the planned set so the shape is visible now.

| Skill | What it does |
|---|---|
| `clone-projects` | Clone/sync your project repos into a workspace laid out by the vault's domains (implemented) |
| `plan` | Show ready beads + the vault's open loops to decide what to work on next (implemented) |
| `session-context` | Load `_Index/{Vault Map, Active Context, Open Loops}.md` at session start |
| `weekly-review` | Draft a weekly review note from the week's activity into `Weekly/` |
| `domain-status` | Summarize the state of one domain (CloudOps/FinOps/DevOps/SecOps/Architecture) |
| `adr-new` | Scaffold the next-numbered ADR from the template into `Architecture/decisions/` |
| `docs-regen` | Rebuild the docs site locally (once the docs layer ships in v0.4) |

Each skill is a directory with a `SKILL.md`. Keep one skill to one workflow.
