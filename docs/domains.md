# The five domains

The work vault is organized around the five areas an infrastructure engineer
actually works in. Each is a top-level folder, which the indexer treats as a
retrieval namespace.

| Domain | What lives there |
|---|---|
| `CloudOps/` | Cloud infrastructure, networking, monitoring, runbooks |
| `FinOps/` | Cost reviews, tagging policy, budget alerts, savings plans |
| `DevOps/` | CI/CD pipelines, release flows, deployment automation |
| `SecOps/` | Security controls, compliance notes, secret rotation, audits |
| `Architecture/` | ADRs (`decisions/`), contracts, capacity planning |

Each domain folder ships with a README describing its conventions and one
example note showing the expected shape. The `_Index/` folder holds the
session-context files (`Vault Map`, `Active Context`, `Open Loops`) an agent
loads at the start of a session, and `Weekly/` holds weekly reviews.

## Searching one domain

Restrict a query to a domain with the `namespaces` field:

```sh
curl -s -X POST http://127.0.0.1:8765/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "cost anomaly", "namespaces": ["FinOps"], "hybrid": true}'
```

## Adapting to your own structure

The domains are a convention, not a requirement. The indexer namespaces by
whatever top-level folders your vault has, so pointing it at an existing vault
(for example a PARA layout with `Projects/` and `Areas/`) works without
reorganizing anything.
