# Quickstart

About 15 minutes, most of it a one-time build and model download.

## Requirements

- A Rust toolchain (stable) to build the binary, or a prebuilt binary from a
  release.
- Obsidian (optional but recommended for editing the vaults).

## Clone and build

```sh
git clone https://github.com/YOUR_USER/engineering-os.git
cd engineering-os
./scripts/setup.sh   # checks cargo, builds the binary, copies example configs
```

`setup.sh` builds `eos-rag`, then copies `.env.example`, `rag/vaults.example.json`,
and `rag/routing.example.json` to their live counterparts. The first build
downloads the ONNX runtime; the first index run downloads the embedding model
(`all-MiniLM-L6-v2`, about 90 MB). Both are cached.

## Index the vaults

```sh
./rag/target/release/eos-rag index --config rag/vaults.json
```

This indexes the three shipped vault templates (work, ai, user). Point it at
your own vaults by editing `rag/vaults.json` or setting the `EOS_*_VAULT_PATH`
environment variables.

## Serve and search

```sh
./rag/target/release/eos-rag serve --config rag/vaults.json

curl -s -X POST http://127.0.0.1:8765/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "how do I record an architecture decision", "top": 5, "hybrid": true}'
```

Request fields: `query`, `top` (1-50), `vaults`, `namespaces`, `hybrid`
(BM25 + vector via RRF), `mmr` + `mmr_lambda` (diversity rerank). See the
[RAG layer](rag.md) page for the full API.

## Make it yours

Open `vault-template/` in Obsidian and start replacing the example notes. Point
an AI agent at the local search server for grounded answers from your own notes.
