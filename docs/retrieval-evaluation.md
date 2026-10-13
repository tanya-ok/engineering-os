# Retrieval evaluation

Baseline for retrieval budgets, ranking modes, and MCP integration, measured
on the shipped templates. Rerun after any change to chunking, ranking, or the
embedding model.

## Method

- Query set: `rag/eval/queries.json`, 15 English queries over the three
  template vaults. Each query names a gold note and an answer phrase the
  answering chunk must contain.
- Runner: `node rag/eval/run.mjs [queries.json]` from the repo root after
  `pnpm --dir rag run build`. It builds a throwaway index in a temp dir; the
  configured index is never touched. `EOS_EVAL_VERBOSE=1` lists misses.
- Metrics: hit@1, hit@3, MRR@8 on the gold note; "answer in top-3" checks
  that a top-3 chunk contains the answer phrase.
- Corpus: 24 files, 82 chunks. Chunk length p50 168, p90 523, max 1268
  characters (chunker cap 1500).
- Model: `intfloat/multilingual-e5-small`, run locally.

## Ranking

| Mode | hit@1 | hit@3 | MRR@8 | answer in top-3 | p50 ms |
|---|---|---|---|---|---|
| vector | 12/15 | 15/15 | 0.90 | 15/15 | 4 |
| hybrid | 13/15 | 15/15 | 0.93 | 15/15 | 5 |
| vector + MMR (before fix) | 12/15 | 12/15 | 0.80 | 11/15 | 7 |
| hybrid + MMR (before fix) | 13/15 | 13/15 | 0.87 | 12/15 | 5 |
| vector + MMR (after fix) | 12/15 | 15/15 | 0.90 | 15/15 | 5 |
| hybrid + MMR (after fix) | 13/15 | 15/15 | 0.93 | 15/15 | 5 |

- Hybrid is the best mode: one more hit@1 than vector at the same latency.
- MMR had a score-scale bug: RRF scores (about 1/60) were weighed against
  cosine redundancy (about 1), so relevance was ignored after the first pick
  and gold notes fell out of the top 8. Fixed in PR #33 by min-max normalizing
  relevance; MMR now matches the baseline on this set.
- Remaining hit@1 misses rank 2 and are defensible: a README that overlaps the
  gold note (`vault-map` query ranks `SecOps/README.md` first) or a related
  note in the AI vault (`inbox-staging`).
- A 3-query Russian spot check (not committed, English-only repo policy)
  scored 3/3 hit@1 in every mode.

## Budgets

Mean response size per query, hybrid mode. Tokens estimated as characters / 4.

| top | full chunks, chars | ~tokens | 200-char snippets, chars | answer kept | 400-char snippets, chars | answer kept |
|---|---|---|---|---|---|---|
| 3 | 839 | 210 | 512 | 13/15 | 716 | 13/15 |
| 5 | 1511 | 378 | 838 | 13/15 | 1188 | 13/15 |
| 8 | 2850 | 713 | 1338 | 13/15 | 1985 | 13/15 |

- Full chunks at the default `top` 8 cost about 700 tokens. That is small
  next to an agent context window, so budget pressure does not justify
  snippets on a template-sized corpus.
- Prefix snippets lose the answer in 2 of 15 queries at 200 and at 400
  characters: both answers sit in table rows 500 or more characters into the
  chunk. Snippets save about half the size but lose facts that live in tables.
- Full chunks already hold one heading section each, so "full chunk
  retrieval" and the current response are the same thing.

## MCP integration

There is no MCP server today; agents call `POST /search` over HTTP.

| Option | Pros | Cons |
|---|---|---|
| Keep HTTP only | No new dependency; works with any client that can run curl | Agents need a shell tool and a documented request shape |
| Thin MCP wrapper over `/search` (stdio) | Native tool call in MCP clients; typed schema; no shell needed | New dependency (MCP SDK) needs approval; one more process to run |
| MCP wrapper with `search` (snippets) + `get_chunk` (full) | Lowest token cost on large corpora | Two round trips; snippets lose table facts, per the budget table |

## Recommendations

Opinion, based on the numbers above:

- Default agent calls to `hybrid: true`, `top` 5. That keeps hit@3 at 15/15
  for about 380 tokens.
- Enable `mmr` only after PR #33 merges; before it, MMR harms recall.
- Return full chunks, not snippets, until a real vault shows p90 chunk size
  or response size as a problem. Re-measure on the live vault once it is
  configured (see `eos-rag doctor`).
- If MCP is added, use the thin single-tool wrapper over `/search` with the
  same defaults. Adding the MCP SDK is a new dependency and needs owner
  approval per `AGENTS.md`.
