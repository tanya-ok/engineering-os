# rag - local hybrid RAG layer

A single Rust binary (`eos-rag`) that indexes your vaults and serves grounded
search. No Python, no PyTorch: text embedding runs through
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

`GET /health` returns index stats. `POST /search` takes:

- `query` (required), `top` (1-50, default 8)
- `vaults`: restrict to these vault_ids
- `namespaces`: restrict to these top-level folders
- `hybrid`: fuse vector kNN with BM25 (FTS5) via reciprocal rank fusion
- `mmr` + `mmr_lambda`: maximal marginal relevance rerank (1.0 = pure relevance)

```sh
curl -s -X POST http://127.0.0.1:8765/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "certificate rotation", "top": 5, "hybrid": true, "mmr": true}'
```

## Model choice

The config `embed_model` (a HuggingFace-style id) maps to a fastembed model.
Default `all-MiniLM-L6-v2` (384 dim, ~90 MB, English-first). For multilingual
notes set `intfloat/multilingual-e5-{small,base,large}` in `vaults.json` or the
`EOS_EMBED_MODEL` env var. Changing the model requires `--rebuild`; the indexer
refuses to mix dimensions.

## Layout

| File | Role |
|---|---|
| `src/main.rs` | CLI: `index` and `serve` subcommands |
| `src/config.rs` | Load `vaults.json`, resolve env-driven paths |
| `src/chunk.rs` | Heading-aware markdown chunker |
| `src/embed.rs` | fastembed model resolution and embedding |
| `src/db.rs` | SQLite + sqlite-vec + FTS5 schema and helpers |
| `src/index.rs` | Incremental indexer (mtime-based) |
| `src/server.rs` | axum search server |
