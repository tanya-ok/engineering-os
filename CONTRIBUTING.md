# Contributing

Thanks for considering a contribution.

## Setup

```sh
./scripts/setup.sh              # checks cargo, builds the binary, copies example configs
lefthook install               # installs the pre-commit / pre-push gates (needs: brew install lefthook)
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
- **Lint before pushing.** `cargo fmt --manifest-path rag/Cargo.toml --check`
  and `cargo clippy --manifest-path rag/Cargo.toml --all-targets -- -D warnings`.
- **Test.** `cargo test --manifest-path rag/Cargo.toml`. This includes the
  end-to-end test in `rag/tests/e2e.rs`, which builds the binary and runs a
  real index and search; its first run downloads the embedding model (needs
  network once, then cached). Run `cargo test --lib` for just the fast unit
  tests.
- Conventional-style commits: `type: Subject` (feat, fix, docs, ci, chore,
  refactor, test, security).

## Pull requests

CI runs, per job: Rust lint (rustfmt + clippy `--all-targets`), the test suite
(unit + end-to-end), a dependency audit (`cargo audit`), a secret scan, and the
anonymization gate against the full PR diff. A red anonymization job is never
overridden; fix the content.
