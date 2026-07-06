# rag/ - local hybrid retrieval layer

Everything runs on your machine. The vault is the source of truth; the index
is derived and rebuildable.

## Setup

```sh
uv sync                                    # installs deps from pyproject.toml
cp rag/vaults.example.json rag/vaults.json # then edit paths
```

## Index

```sh
uv run python rag/build_index.py --config rag/vaults.json
```

- Incremental: only files with changed mtime are reprocessed.
- `--rebuild`: drop and reindex (required after changing the embedding model).
- `--watch`: keep running and reindex every few seconds (add the `watch`
  extra for filesystem-event support later).
- Folders whose name starts with `_` are excluded from indexing by
  convention: use `_inbox/`-style staging folders for content that is not
  ready for retrieval.

## Serve and query

```sh
uv run python rag/server.py --config rag/vaults.json
curl -s http://127.0.0.1:8765/health

curl -s -X POST http://127.0.0.1:8765/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "certificate rotation", "top": 5, "hybrid": true, "mmr": true}'
```

Request fields: `query`, `top` (1-50), `vaults` (list of vault_ids),
`namespaces` (top-level folders), `hybrid` (BM25 + vector via RRF),
`mmr` + `mmr_lambda` (diversity rerank, 1.0 = pure relevance).

## Model choice

Default `all-MiniLM-L6-v2` (384 dim, ~90 MB, fast on CPU, English-first).
For multilingual notes set in `vaults.json` or env `EOS_EMBED_MODEL`:
`sentence-transformers/paraphrase-multilingual-mpnet-base-v2` (768 dim,
larger and slower, much better cross-lingual retrieval). Changing the model
requires `--rebuild`; the indexer refuses to mix dimensions.
