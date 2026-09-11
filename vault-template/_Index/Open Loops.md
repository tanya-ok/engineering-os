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
