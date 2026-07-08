# standards - governance layer

The policy and agent-governance layer, kept deliberately separate from the
vaults. The vaults hold your knowledge; this holds the rules that govern how
agents behave: canonical policy modules, reusable skills, lifecycle hooks, and
the plugin manifest that distributes them.

It is a distinct top-level directory so it can be extracted into its own
plugin repository later without disturbing the vault layout. For now it ships
in-repo so a single clone gives you both the knowledge base and the rules.

## Layout

| Path | Role |
|---|---|
| `canonical/` | Policy modules: the standing rules agents follow. Vendor-neutral, edit to taste. |
| `skills/` | Reusable agent workflows exposed as slash commands (implementations land in v0.2). |
| `hooks/` | Session-lifecycle hooks (SessionStart context loader, PreToolUse gates, SessionEnd log). |
| `agents/` | Generic engineering agent roles (implementations land in v0.2). |
| `.claude-plugin/` | Manifest declaring the above as an installable Claude Code plugin. |

## How the pieces connect

`canonical/` modules are the source of truth for behavior. The root
`AGENTS.md` points at them. Skills and hooks operationalize the policies:
a `secret-scan` hook enforces the security module, a `session-context` hook
loads the `_Index/` files named by the operational conventions. The plugin
manifest bundles everything so another person can install the whole governance
layer with one command instead of copying files.

## Extraction path

When this layer grows enough to version independently, move `standards/` into
its own repo (for example `engineering-standards`), publish it as a plugin,
and have `engineering-os` reference it. The directory is structured so that
move is a `git mv` plus a manifest path change, not a rewrite.
