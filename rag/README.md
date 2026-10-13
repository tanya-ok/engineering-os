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
node rag/dist/cli.js serve --config rag/vaults.json [--port N] [--host H] [--allow-remote]
```

Run the commands from the repo root so the default `--config rag/vaults.json`
and the vault template paths resolve. A `.env` in the current directory is
loaded automatically; real environment variables win over `.env` values.

## Using your own vaults

The templates are the default. To index live vaults, keep every real path in
local, gitignored files (`.env` and `rag/vaults.json`), never in the repo:

1. Set the vault paths in `.env`:
   ```sh
   EOS_VAULT_PATH=~/vaults/work
   EOS_AI_VAULT_PATH=~/vaults/ai
   EOS_USER_VAULT_PATH=~/vaults/user
   ```
2. Add their parent to `allowed_roots` in `rag/vaults.json`, for example
   `"allowed_roots": ["~/vaults"]`. Paths outside the allowed roots and any
   iCloud path fail with a diode policy error.
3. Check the result before indexing:
   ```sh
   node rag/dist/cli.js doctor --config rag/vaults.json
   ```

`doctor` is read-only. It reports, per vault, the resolved path, whether it
came from the env variable or fell back to `path_default`, and how many files
are indexable. For the index it reports a missing database, an embedding model
mismatch, configured vaults without rows, and indexed files outside the
configured paths. That last warning means the index was built from another
config: running `index` now would prune those rows, so fix the paths first.
It exits 1 on errors (missing vault directory, missing index, model mismatch).

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
| `src/cli.ts` | CLI: `index`, `serve`, and `doctor` verbs |
| `src/doctor.ts` | Read-only vault and index health report |
| `src/config.ts` | Load `vaults.json`, env-driven paths, diode guardrail |
| `src/chunk.ts` | Heading-aware markdown chunker (code-point safe) |
| `src/embed.ts` | transformers.js embedding, model whitelist, e5 prefixes |
| `src/db.ts` | SQLite + sqlite-vec + FTS5 schema (trigram with fallback) |
| `src/indexer.ts` | Incremental indexer (mtime-based) |
| `src/server.ts` | Hono search server |

See [context isolation and freshness](../docs/portable-portfolio.md#context-and-reproducibility)
for separate-index boundaries and real-model evaluation. Search filters do not authorize access.
