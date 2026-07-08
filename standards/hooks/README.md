# hooks

Session-lifecycle hooks. Implementations land in v0.2; the planned set:

| Trigger | Hook | Effect |
|---|---|---|
| `SessionStart` | `session-context` | Inject the `_Index/` files as working context |
| `PreToolUse` (Bash, Edit, Write) | `secret-scan` | Block content matching the secret / personal-path patterns |
| `SessionEnd` | `session-log` | Append a short audit line and, optionally, a draft weekly-review entry |

Hooks are wired through a `hooks.json` that resolves script paths relative to
the plugin directory, so they work whether the layer is installed as a plugin
or used from a plain clone.
