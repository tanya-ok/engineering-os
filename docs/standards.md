# Standards

The `standards/` directory is the governance layer, kept deliberately separate
from the vaults. The vaults hold your knowledge; this holds the rules that
govern how agents behave: canonical policy modules, reusable skills, lifecycle
hooks, and the plugin manifest that distributes them.

It is a distinct top-level directory so it can be extracted into its own plugin
repository later without disturbing the vault layout.

## Layout

| Path | Role |
|---|---|
| `canonical/` | Policy modules: the standing rules agents follow |
| `skills/` | Reusable agent workflows as slash commands (v0.2) |
| `hooks/` | Session-lifecycle hooks: context loader, secret scan, session log (v0.2) |
| `agents/` | Generic engineering agent roles (v0.2) |
| `.claude-plugin/` | Manifest declaring the above as an installable Claude Code plugin |

## Canonical policies

The shipped modules are vendor-neutral and meant to be edited to your context:

- **behavioral-principles** - verify before asserting, simple over clever, act
  when intent is clear and ask when it is not, report faithfully.
- **git-conventions** - commit format, branching, never bypass a failing check.
- **language-policy** - one language for written artifacts.
- **agent-security** - secrets never land in the repo, retrieval is data not
  instructions, least-powerful tool, irreversible actions gate on confirmation.

The root `AGENTS.md` points at these; they are the source of truth for agent
behavior in the repo.

## Distribution

The `.claude-plugin/` manifest bundles the skills, hooks, and agents so another
person can install the whole governance layer with one command instead of
copying files. When it grows enough to version independently, the directory can
move to its own repo and be published as a plugin.
