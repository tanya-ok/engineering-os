# engineering-os

A personal OS for cloud and infrastructure engineers: your notes as a queryable
knowledge base, wired into AI coding agents.

**What you get from one clone:**

- An Obsidian vault template scaffolded for the five domains an infra engineer
  actually works in: **CloudOps, FinOps, DevOps, SecOps, Architecture**.
- A local **hybrid RAG index** over your vault: SQLite + sqlite-vec + FTS5,
  vector search fused with BM25, optional MMR reranking. No cloud, no Postgres,
  no external services. Your notes never leave your machine.
- An HTTP search server your AI agent (Claude Code or any MCP-capable client)
  can query for grounded context.
- ADR scaffolding, weekly review structure, and an index layer
  (`_Index/Vault Map`, `Active Context`, `Open Loops`) designed to be loaded
  into an agent session as working context.

## Quickstart (15 minutes)

```sh
git clone https://github.com/YOUR_USER/engineering-os.git
cd engineering-os
./scripts/setup.sh          # checks uv + pnpm, installs deps, copies .env.example

# index the shipped vault template (or point at your own vault)
uv run python rag/build_index.py --config rag/vaults.json

# start the search server
uv run python rag/server.py

# query it
curl -s -X POST http://127.0.0.1:8765/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "how do I record an architecture decision", "top": 5, "hybrid": true}'
```

Then open `vault-template/` in Obsidian and make it yours.

## How it works

```
Obsidian vault (markdown)  =  the database
        |
        v
rag/build_index.py         =  chunk + embed + store (incremental, mtime-based)
        |
        v
~/.engineering-os/index.db =  SQLite: chunks + vec0 embeddings + FTS5
        |
        v
rag/server.py (:8765)      =  POST /search  (vector kNN + BM25 via RRF, MMR)
        |
        v
your AI agent              =  grounded answers from YOUR notes
```

Reading is unified: every registered vault is indexed into one database.
Writing is yours: the vault stays plain markdown, editable in Obsidian or by
an agent following the conventions in `AGENTS.md`.

## The five domains

| Domain | What lives there |
|---|---|
| `CloudOps/` | Cloud infrastructure, networking, monitoring, runbooks |
| `FinOps/` | Cost reviews, tagging policy, budget alerts, savings plans |
| `DevOps/` | CI/CD pipelines, release flows, deployment automation |
| `SecOps/` | Security controls, compliance notes, secret rotation, audits |
| `Architecture/` | ADRs (`decisions/`), contracts, capacity planning |

Each domain folder ships with a README describing its conventions and one
example note showing the expected shape.

## Requirements

- Python 3.12 (managed by [uv](https://docs.astral.sh/uv/))
- Node.js 24 (Active LTS; only needed for lint tooling)
- Obsidian (optional but recommended)

First index run downloads the embedding model
(`sentence-transformers/all-MiniLM-L6-v2`, ~90 MB). Swap the model in
`rag/vaults.json` if you want multilingual retrieval.

## Roadmap

- v0.1: vault template + RAG layer (this)
- v0.2: Claude Code skills and hooks (session context loader, weekly review, ADR scaffolder)
- v0.3: beads task-graph integration for agent work tracking
- v0.4: docs site (MkDocs Material, GitHub Pages)

## License

MIT. See [LICENSE](LICENSE).
