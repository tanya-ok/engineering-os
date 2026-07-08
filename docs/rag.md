# RAG layer

A TypeScript package, `eos-rag`, that indexes your vaults and serves grounded
search. No Python, no PyTorch: embedding runs through
[transformers.js](https://github.com/huggingface/transformers.js) (ONNX,
quantized weights) and storage is SQLite via
[sqlite-vec](https://github.com/asg017/sqlite-vec) plus FTS5.

## Build and run

```sh
pnpm --dir rag install && pnpm --dir rag run build   # from the repo root
cp rag/vaults.example.json rag/vaults.json           # if not already present

node rag/dist/cli.js index --config rag/vaults.json
node rag/dist/cli.js serve --config rag/vaults.json
```

Run the commands from the repo root so the default `--config rag/vaults.json`
and the vault template paths resolve.

A `.env` file in the current directory is loaded automatically (real
environment variables win over `.env` values). The serve port comes from
`--port`, then `EOS_SERVER_PORT`, then 8765; the bind address from `--host`,
then `EOS_SERVER_HOST`, then 127.0.0.1. An unparseable port is a hard error,
not a silent fallback.

## Search API

`GET /health` returns `{status, model, files, chunks}`. `POST /search` accepts:

| Field | Meaning |
|---|---|
| `query` | required search text |
| `top` | number of hits, integer 1-50 (default 8); out-of-range values are a 400 |
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

The config `embed_model` is a whitelisted HuggingFace-style id. Default
`intfloat/multilingual-e5-small` (384 dim): in review testing it scored 10/10
on top-1 retrieval over the shipped templates, including cross-lingual RU/EN
queries, at roughly MiniLM size. Also available:
`sentence-transformers/all-MiniLM-L6-v2` (English-first) and
`intfloat/multilingual-e5-{base,large}` for higher quality at higher cost. An
unknown id is a hard error listing the whitelist, never a silent downgrade.

e5-family models are trained with `passage:` / `query:` prefixes; eos-rag adds
them automatically at index time and search time, so retrieval quality does
not silently degrade. Changing the model requires `index --rebuild`; the
dimension guard refuses to mix models in one index.

Models are cached under `~/.engineering-os/models` (override with
`EOS_MODEL_CACHE`).

## Lexical search and Cyrillic

The FTS5 table uses the `trigram` tokenizer when the bundled SQLite supports
it, which makes BM25 work for inflected languages (Russian included) and
substring matches. If trigram is unavailable the layer falls back to
`unicode61` and records the mode in the index metadata; in that mode hybrid
queries are built as OR-of-terms instead of an exact phrase, so multi-word
queries still match.

## The diode guardrail

Reading is unified across the registered vaults, but the config is guarded:
every resolved vault path must live under one of `allowed_roots` (default: the
repo root containing the config file), and any path inside the macOS iCloud
Drive container (including Obsidian's iCloud vaults and `com~apple~CloudDocs`)
is always rejected with an error naming the diode policy. Work-side indexes
must never ingest personal data; pointing the work index at an iCloud-synced
personal vault fails loudly instead of silently mixing the two worlds.

## Incremental and safe

Indexing is incremental (only files whose mtime changed are reprocessed, and
files deleted on disk are pruned). Each file is embedded before any database
write, and all of its row changes run in one transaction, so a failed embed or
a crash mid-run can never leave a file marked fresh with its content missing.
