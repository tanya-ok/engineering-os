# Vault Map

Master index. Folder purposes are stable; do not add new top-level folders
without updating this map.

| Folder | Purpose | Written by |
|---|---|---|
| `_Index/` | Navigation and live context (this file, Active Context, Open Loops) | you + agents |
| `CloudOps/` | Cloud infrastructure, networking, monitoring, runbooks | you + agents |
| `FinOps/` | Cost reviews, tagging, budgets, savings | you + agents |
| `DevOps/` | CI/CD, release flow, deployment automation | you + agents |
| `SecOps/` | Security controls, compliance, secret rotation, audits | you + agents |
| `Architecture/` | ADRs in `decisions/`, contracts in `contracts/`, capacity notes | you + agents |
| `Weekly/` | Weekly reviews: what moved, what is blocked, what is next | agents (draft) + you (final) |

## Conventions

- One note = one topic. Link related notes with `[[wikilinks]]`.
- Dated notes: `YYYY-MM-DD-<slug>.md`.
- Frontmatter: `type`, `domain`, `status` where it helps retrieval.
- Session-start context for agents = the three `_Index/` files.
