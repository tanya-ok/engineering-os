# Contributing

Thanks for considering a contribution.

## Setup

```sh
./scripts/setup.sh
pnpm exec lefthook install   # installs the pre-commit / pre-push gates
```

## Rules

- **Anonymization gate.** This project's content must stay machine-agnostic:
  no absolute home paths, no personal vault names, no employer identifiers,
  no secret-store references. `scripts/anonymization-check.sh` enforces the
  generic patterns on pre-commit, pre-push, and in CI. Maintainers may keep an
  additional private pattern list in
  `scripts/anonymization-patterns.local.txt` (gitignored).
- **Vault template content must be synthetic.** Write example notes from
  scratch. Do not paste sanitized copies of real notes; sanitization leaks.
- **English only** in all committed artifacts.
- **Lint before pushing.** `pnpm run lint` for JS/JSON, `uv run ruff check rag/`
  for Python.
- Conventional-style commits: `type: Subject` (feat, fix, docs, ci, chore,
  refactor, test, security).

## Pull requests

CI runs lint, secret scan, and the anonymization gate against the full PR
diff. A red anonymization job is never overridden; fix the content.
