---
type: pipeline
domain: devops
status: example
---

# Pipeline: main service CI/CD (example)

Example note. Replace with your own pipeline documentation.

## Triggers

- Pull request: lint, unit tests, build.
- Merge to main: everything above plus integration tests and staging deploy.
- Tag `v*`: production deploy behind a manual approval gate.

## Stages

1. Lint and typecheck.
2. Unit tests with coverage floor.
3. Build artifact, push to registry with the commit SHA tag.
4. Deploy to staging, run smoke tests.
5. Manual approval, then blue/green production deploy.

## Failure playbook

- Smoke test failure: deploy stops automatically, staging keeps the previous
  release. Check the smoke log first; it names the failing endpoint.
- Production deploy failure: traffic never shifted; delete the green stack.
