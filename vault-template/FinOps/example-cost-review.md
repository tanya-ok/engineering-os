---
type: cost-review
domain: finops
status: example
---

# Cost review: 2026-01 (example)

Example note. Replace with your own monthly reviews.

## Top movers

| Service | Delta vs last month | Why |
|---|---|---|
| Object storage | +18% | Log retention doubled after the audit request |
| Compute | -7% | Batch workloads moved to spot capacity |

## Anomalies

- Data transfer spike on Jan 12-14, traced to a misconfigured replication job.

## Actions

- [ ] Add lifecycle rule for logs older than 90 days.
- [ ] Alert on daily data-transfer cost above the agreed threshold.
