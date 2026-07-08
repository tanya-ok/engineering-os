# agents

Generic engineering agent roles. Implementations land in v0.2. Only
vendor-neutral roles belong here; anything tied to a specific employer,
compliance regime, or tracker stays out of the public kit.

| Agent | Role |
|---|---|
| `solutions-architect` | Author and review ADRs and design trade-offs |
| `docs-writer` | Write and update runbooks, ADRs, and READMEs |
| `reviewer` | Review a change for correctness and scope creep |

Each agent is a prompt file describing its scope, tools, and boundaries.
