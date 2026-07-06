# RAG layer

A single Rust binary, `eos-rag`, that indexes your vaults and serves grounded
search. No Python, no PyTorch: embedding runs through
[fastembed](https://crates.io/crates/fastembed) (ONNX Runtime, quantized
models) and storage is SQLite via
[sqlite-vec](https://github.com/asg017/sqlite-vec) plus FTS5.

## Build and run

```sh
cargo build --release --manifest-path rag/Cargo.toml   # from the repo root
cp rag/vaults.example.json rag/vaults.json             # if not already present

./rag/target/release/eos-rag index --config rag/vaults.json
./rag/target/release/eos-rag serve --config rag/vaults.json
```

Run the commands from the repo root so the default `--config rag/vaults.json`
and the vault template paths resolve.

## Search API

`GET /health` returns index stats. `POST /search` accepts:

| Field | Meaning |
|---|---|
| `query` | required search text |
| `top` | number of hits, 1-50 (default 8) |
| `vaults` | restrict to these vault ids |
| `namespaces` | restrict to these top-level folders |
| `hybrid` | fuse vector kNN with BM25 (FTS5) via reciprocal rank fusion |
| `mmr`, `mmr_lambda` | maximal marginal relevance rerank (1.0 = pure relevance) |

```sh
curl -s -X POST http://127.0.0.1:8765/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "certificate rotation", "top": 5, "hybrid": true, "mmr": true}'
```

An empty query returns 400; a genuine failure returns 500, so an empty result
set always means "no matches", never "something broke".

## Model choice

The config `embed_model` (a HuggingFace-style id) maps to a fastembed model.
Default `all-MiniLM-L6-v2` (384 dim, English-first, about 90 MB). For
multilingual notes set `intfloat/multilingual-e5-{small,base,large}` in
`vaults.json` or the `EOS_EMBED_MODEL` env var. Changing the model requires
`--rebuild`; the indexer refuses to mix dimensions.

## Incremental and safe

Indexing is incremental (only files whose mtime changed are reprocessed). Each
file is embedded before any database write, and all of its row changes run in
one transaction, so a failed embed or a crash mid-run can never leave a file
marked fresh with its content missing.
