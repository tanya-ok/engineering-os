# Proposed AI Assurance profile

**Pending maintainer review. No installation or execution evidence is included.**

Scope: Local RAG/dashboard privacy, host guards and routed-work contracts using test data; no access to real vaults or model evaluation.

Prepared base: `72c5874e5874231ab9486b26264b5f56e18aa7db`.
This base revision is not published; verify its remote availability before opening.
Candidate source: AI Assurance 0.2.1, commit
`353d374a00b43479870a6dee300dd200529cc60c`, verified locally against an immutable Git bundle.
This source revision is not published; remote availability must be checked before adoption.
The source checkout and CLI must be trusted separately from a target lock.

| Control | Proposed bounded claim | Existing evidence surface |
|---|---|---|
| access-boundary | Local service host guards reject access through an untrusted host. | `rag/src/host-guard.test.ts`, `dashboard/src/host-guard.test.ts` |
| data-exposure | Configuration and package checks avoid including private vault paths or overlays. | `rag/src/config.test.ts`, `scripts/check-packages.mjs`, `scripts/anonymization-check.test.sh` |
| untrusted-instructions | Retrieved context has no implied write authority; behavior evaluation remains a separate required gap. | `standards/canonical/agent-security.md`, `rag/src/server.test.ts` |
| consequential-actions | Work-item review transitions are constrained by the dashboard contract. | `dashboard/src/reviews.test.ts`, `dashboard/src/work-items.test.ts` |
| evidence-lineage | Freshness and indexing tests keep retrieval provenance explicit. | `rag/src/freshness.test.ts`, `rag/src/indexer.test.ts` |
| bounded-claims | Offline unit results do not claim real vault integrity or model-grounding accuracy. | `.github/workflows/ci.yml`, `rag/src/e2e.test.ts` |

CI workflow: `.github/workflows/ci.yml`. Candidate checks: `test (rag)`, `test (dashboard)`, `anonymization`.
These names come from workflow definitions. Before accepting records, match the
actual provider job names, exact project commit, completed job conclusion and
run URL. A CI suite's success is coarse evidence; it cannot establish untested
claims or substitute for review of individual test coverage.

All six controls are proposed for scoped review, with missing proof retained as
`not_verified`. This is not an accepted applicability decision. Only a maintainer
may approve or change applicability. Any future exclusion needs rationale and
`decided_by`. Agents must not manufacture executed records or approve exclusions.

CI skips model-download E2E tests. Current tests do not validate resistance to semantic prompt injection or correctness of real-vault writes. Linear remains optional.

## Adoption gate

1. Review claims and approve the project-specific profile; keep limitations.
2. Use a trusted collector to select real CI evidence for an existing full
   40-hex project commit, a non-future timestamp, and a run URL or artifact hash.
   The current installer also requires publicly verifiable GitHub run/job metadata.
3. Keep records outside this proposal until independently collected. There are
   no empty evidence arrays or fabricated execution outcomes here.
4. Obtain explicit installation approval. Then use the separately reviewed CLI,
   source commit and approved candidate. Do not install by copying this directory.

`proposal.json` is a review envelope, deliberately not an installer input.
No `.ai-assurance/` directory, managed AGENTS block, workflow, dependency, tracker
integration or model call is added. No publication, deployment or certification
is implied. Linear and other trackers remain optional adapters.
