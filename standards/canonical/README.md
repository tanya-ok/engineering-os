# Canonical policy modules

The standing rules agents follow. Each module is one concern, written to be
vendor-neutral and edited to your context. The root `AGENTS.md` references
these; keep that pointer in sync when you add a module.

## Modules

| Module | Concern |
|---|---|
| `behavioral-principles.md` | How an agent should reason and act: simple over clever, verify before asserting |
| `git-conventions.md` | Commit format, branching, what never to bypass |
| `language-policy.md` | Language of written artifacts |
| `agent-security.md` | Secret handling, tool boundaries, injection resistance |

## Roadmap (v0.2)

Additional generic modules worth adding as the kit matures: session logging,
spec-first discipline, cost controls, observability, human-in-the-loop gates,
multi-agent coordination. Add them one per concern; do not merge unrelated
rules into one file.
