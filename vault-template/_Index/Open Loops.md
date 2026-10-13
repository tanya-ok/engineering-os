# Open Loops

Updated: 2026-01-01

Unresolved items that survive across sessions. Review weekly; close loops
explicitly. Each row: what, domain, owner, next step.

| # | Loop | Domain | Next step |
|---|---|---|---|
| 1 | Example: TLS certificates on the legacy load balancer expire in Q2 | CloudOps | Schedule rotation, add expiry alert |
| 2 | Example: untagged resources inflate the shared-cost bucket | FinOps | Write tagging policy note, enforce in CI |
| 3 | Example: postmortem for the January deploy incident not written | DevOps | Draft from the incident channel log |

## Repository maintenance loops

The execution source is the local `.beads/` database. Portable task exports
omit owner email fields; review exports before publishing.

| Issue | Next step |
|---|---|
| eos-security.3 | Decide whether to rewrite published author metadata; explicit authorization required |
| eos-62h | Validate beads semantics and improve daily dashboard navigation |
| eos-t61 | Configure and restore personal project memory |
| eos-cw8 | Evaluate retrieval budgets and MCP after project memory is available |

Completed: `eos-byn` updated Node type definitions to 26.4.1 in both packages;
verification passed with no new dependency audit findings.

- `eos-review`: submit consolidated changes as a draft PR, verify CI and wait
  for owner review. Dependency PRs 14, 18 and 22 are superseded by this work.

Draft PR #23 is awaiting owner review. Related dependency PRs 14, 18 and 22
are superseded. Published history cleanup remains a separate operation.

- 2026-09-12: `eos-secret-scan` fixes CI after history replacement by scanning
  all reachable commits directly, including root commits. Prepared for owner
  draft review; regression checks include a marker removed after the root commit.
  Merged as #24 on 2026-09-20.

The `eos-nmy` portfolio tasks are implemented locally with synthetic and local
source checks. Remaining operator boundaries: published-history administration,
actual private-vault onboarding (`eos-t61`), remote CI and publication. Tracker
writes and cross-provider synchronization require a separate design; the new
adapters read local snapshots only. Real-model ranking evidence covers the fixed
shipped template questions, not every language or a production corpus.

## Publication preparation on 2026-10-07

Local preparation task `eos-f71` is closed after verifying its acceptance criteria.
The clean pnpm 12.10.1 bootstrap, 49 retrieval checks (including the actual local
model), 63 dashboard checks, both type/lint gates and archive-content checks
passed. Independently installed packages demonstrated actual HTTP search and the
work dashboard, refused invalid inputs and cleaned up their owned state.

Distribution allowlists exclude private runtime configuration and include licenses
and the dashboard web bundle. Unknown build scripts remain refused. The concise
Zensical overview and architecture diagram passed strict builds and desktop/mobile
review. Final committed-source and history secret scans returned zero findings.

Publication, remote CI and the public Pages URL have not been executed or verified.
They need a separate owner instruction. Private live vaults remain outside cloud
review packets; this records kit maintenance, not live example work streams.
