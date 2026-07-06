@AGENTS.md

## Claude Code notes

- Commit format: `type: Subject` (feat, fix, docs, ci, chore, refactor, test, security).
- Run `npx biome check <changed-files>` before committing JS/JSON changes,
  `uv run ruff check rag/` before committing Python changes.
- The anonymization gate is a hard rule: if `scripts/anonymization-check.sh`
  fails, fix the content, never bypass the hook.
