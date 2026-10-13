# Quickstart

About 15 minutes, most of it a one-time dependency install and model download.

## Requirements

- Node.js 26 (the version pinned in `.tool-versions`) and pnpm (the version
  pinned in each package's `packageManager` field; `corepack enable pnpm`
  picks it up).
- Obsidian (optional but recommended for editing the vaults).

## Clone and build

```sh
git clone https://github.com/tanya-ok/engineering-os.git
cd engineering-os
./scripts/setup.sh   # checks node + pnpm, builds rag/, copies example configs
```

`setup.sh` installs and builds `rag/`, then copies `.env.example`,
`rag/vaults.example.json`, and `rag/routing.example.json` to their live
counterparts. The first index run downloads the embedding model
(`intfloat/multilingual-e5-small`, quantized, about 120 MB); it is cached
under `~/.engineering-os/models`.

## Index the vaults

```sh
node rag/dist/cli.js index --config rag/vaults.json
```

This indexes the three shipped vault templates (work, ai, user). Point it at
your own vaults by editing `rag/vaults.json` or setting the `EOS_*_VAULT_PATH`
environment variables. Vault paths must sit under the config's
`allowed_roots` (default: this repo), and iCloud paths are always refused -
the diode rule that keeps personal data out of a work-side index.

## Serve and search

```sh
node rag/dist/cli.js serve --config rag/vaults.json   # --port N / --host H to override

curl -s -X POST http://127.0.0.1:8765/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "how do I record an architecture decision", "top": 5, "hybrid": true}'
```

Request fields: `query`, `top` (integer 1-50), `vaults`, `namespaces`,
`hybrid` (BM25 + vector via RRF), `mmr` + `mmr_lambda` (diversity rerank). See
the [RAG layer](rag.md) page for the full API.

## Make it yours

Open `vault-template/` in Obsidian and start replacing the example notes. Point
an AI agent at the local search server for grounded answers from your own notes.

## Container runtime boundary

Engineering OS runs directly on the host: Node.js serves retrieval and the
dashboard, while local files and Beads hold state. No Docker or Podman daemon is
required. Keep private vaults and indexes outside the shared container lab.

When reviewing the portfolio, connect to the sibling security lab through its
documented local interface. Container workloads use Lima, Kubernetes and
containerd; the knowledge layer does not need an additional container or VM.
