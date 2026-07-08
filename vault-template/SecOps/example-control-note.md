---
type: control
domain: secops
status: example
---

# Control: encryption at rest for primary data stores (example)

Example note. Replace with your own control documentation.

## What it protects

All primary databases and object storage buckets holding user data.

## Implementation

- Storage-level encryption enabled with provider-managed keys.
- Key rotation handled by the provider; custom key policy documented separately.

## Verification

- Quarterly: automated check lists any unencrypted store; result attached here.
- Evidence: link to the latest check output.

## Gaps

- Ephemeral scratch volumes are not covered; accepted risk, reviewed yearly.
