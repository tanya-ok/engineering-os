# Active Context

Updated: 2026-01-01

The live snapshot of what is going on. Keep it short; an agent loads this at
session start. Update when a work stream starts, changes state, or ends.

## Work streams

| Stream | Domain | State | Notes |
|---|---|---|---|
| Example: staging cluster upgrade | CloudOps | In progress | Control plane done, node pools pending |
| Example: monthly cost review | FinOps | Scheduled | Waiting for month-end invoice data |

## Constraints and hard rules

- List the rules an agent must never break in your environment
  (regions, accounts, forbidden commands, deploy windows).

## Environment

- Describe your clouds, accounts, and tooling at the level an agent needs
  to be useful without asking.

## Repository maintenance snapshot

Updated: 2026-09-06. This section tracks the kit itself; example work streams
above remain template content.

- Local task source: this repository's `.beads/` (prefix `eos`); never route
  kit maintenance into another workspace tracker.
- Dashboard source isolation and dependency/privacy audit completed under
  `eos-security.1` and `eos-security.2`.
- Published author metadata needs a separate decision (`eos-security.3`);
  no history rewrite or publication was performed.
- RAG was unavailable during the audit; live personal vault setup remains
  `eos-t61`. Do not interpret template examples as live infrastructure facts.

- `eos-byn` completed: both packages use `@types/node` 26.4.1; typecheck,
  build, lint and unit tests pass. Runtime minimum and CI remain Node 24.

- 2026-09-07: Node runtime minimum and CI updated to 26; verified on 26.3.1.
  Consolidated draft review is `eos-review`. The owner alone merges changes.
- Historical email cleanup verified in an isolated mirror; published refs
  remain unchanged pending a separately reviewed administrative replacement.

Draft PR #23 is awaiting owner review. Related dependency PRs 14, 18 and 22
are superseded. Published history cleanup remains a separate operation.
