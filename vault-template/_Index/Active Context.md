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
