# Contributing

Thanks for considering a contribution.

## Setup

```sh
./scripts/setup.sh              # checks node + pnpm, builds rag/ and dashboard/, copies example configs
lefthook install               # installs the pre-commit / pre-push gates (needs: brew install lefthook)
```

## Rules

- **Anonymization gate.** This project's content must stay machine-agnostic:
  no absolute home paths, no personal vault names, no organization identifiers,
  no secret-store references. `scripts/anonymization-check.sh` enforces the
  generic patterns on pre-commit, pre-push, and in CI. Maintainers may keep an
  additional private pattern list in
  `scripts/anonymization-patterns.local.txt` (gitignored).
- **Vault template content must be synthetic.** Write example notes from
  scratch. Do not paste sanitized copies of real notes; sanitization leaks.
- **English only** in all committed artifacts.
- **Lint before pushing.** For each package (`rag`, `dashboard`):
  `pnpm --dir <package> exec biome check .` and
  `pnpm --dir <package> run typecheck`.
- **Test.** `pnpm --dir rag test` and `pnpm --dir dashboard test` run the fast
  unit suites. The end-to-end test (`rag/src/e2e.test.ts`) indexes and searches
  the shipped templates with the real model and is gated behind `EOS_E2E=1`;
  its first run downloads the embedding model (needs network once, then
  cached).
- Conventional-style commits: `type: Subject` (feat, fix, docs, ci, chore,
  refactor, test, security).

## Pull requests

CI runs, per job: lint (Biome + `tsc --noEmit`), the unit test suite, and the
anonymization gate against the full PR diff. A red anonymization job is never
overridden; fix the content.
