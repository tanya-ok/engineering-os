# rag - local hybrid RAG layer

A TypeScript package (`eos-rag`) that indexes your vaults and serves grounded
search. No Python, no PyTorch: text embedding runs through
[transformers.js](https://github.com/huggingface/transformers.js) (ONNX,
quantized weights) and storage is SQLite via
[sqlite-vec](https://github.com/asg017/sqlite-vec) plus FTS5.

## Build and run

```sh
pnpm --dir rag install && pnpm --dir rag run build   # from the repo root
cp rag/vaults.example.json rag/vaults.json           # if not already present

node rag/dist/cli.js index --config rag/vaults.json
node rag/dist/cli.js serve --config rag/vaults.json [--port N] [--host H]
```

Run the commands from the repo root so the default `--config rag/vaults.json`
and the vault template paths resolve. A `.env` in the current directory is
loaded automatically; real environment variables win over `.env` values.

## Search API

`GET /health` returns `{status, model, files, chunks}`. `POST /search` takes:

- `query` (required), `top` (integer 1-50, default 8; anything else is a 400)
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

Default `intfloat/multilingual-e5-small` (384 dim): strong top-1 retrieval in
review testing, including cross-lingual RU/EN queries, at MiniLM-class size.
The whitelist: `sentence-transformers/all-MiniLM-L6-v2`,
`intfloat/multilingual-e5-{small,base,large}`. An unknown id is a hard error.
e5-family models require `passage:` / `query:` prefixes; eos-rag adds them
automatically at index and search time. Changing the model requires
`index --rebuild`; the dimension guard refuses to mix models in one index.

## The diode guardrail

Every resolved vault path must live under one of `allowed_roots` (default: the
repo root containing the config file), and paths inside the macOS iCloud Drive
container (including Obsidian's iCloud vaults and `com~apple~CloudDocs`) are
always rejected: work-side indexes must never ingest personal data.

## Layout

| File | Role |
|---|---|
| `src/cli.ts` | CLI: `index` and `serve` verbs |
| `src/config.ts` | Load `vaults.json`, env-driven paths, diode guardrail |
| `src/chunk.ts` | Heading-aware markdown chunker (code-point safe) |
| `src/embed.ts` | transformers.js embedding, model whitelist, e5 prefixes |
| `src/db.ts` | SQLite + sqlite-vec + FTS5 schema (trigram with fallback) |
| `src/indexer.ts` | Incremental indexer (mtime-based) |
| `src/server.ts` | Hono search server |
