# Concepts

## Three vaults

The knowledge base is three plain-markdown Obsidian vaults, each with a
distinct job:

| Vault | Holds | Why it exists |
|---|---|---|
| **work** (`vault-template/`) | Runbooks, cost reviews, pipelines, controls, ADRs | Your infrastructure knowledge, split into five domains |
| **ai** (`ai-vault-template/`) | The agent's identity, learned interaction rules, observations | So a correction you give once survives to the next session |
| **user** (`user-vault-template/`) | Your communication style, local environment, stable facts | So the agent matches you instead of guessing |

## Unified reading, segregated writing

**Reading is unified.** All three vaults are indexed into one database, so an
agent retrieves across your work knowledge, its own memory, and your user model
in a single query.

**Writing is segregated** by a routing contract (`rag/routing.json`):

- Agent self-knowledge (identity, interaction rules, observations) goes to the
  **ai** vault.
- Durable facts about you are staged in the **user** vault's `_inbox/`, which
  stays out of retrieval until you promote them. Unreviewed guesses never
  ground an answer.
- Operational work lands in the **work** vault's domain it belongs to.

This split is what separates the kit from a generic "second brain": the agent
has a place to keep what it learns without polluting your curated notes.

## The hybrid retrieval pipeline

```
three markdown vaults  ->  eos-rag index  ->  ~/.engineering-os/index.db  ->  eos-rag serve (:8765)  ->  your AI agent
                           chunk + embed       SQLite: vec0 + FTS5            POST /search
```

- **Chunking** splits notes by heading, keeping the heading with its body so
  lexical search matches heading terms.
- **Embedding** runs through transformers.js (ONNX, quantized weights) with no
  Python or PyTorch. The default model is multilingual; e5 prefixes are added
  automatically.
- **Search** fuses a vector kNN ranking with a BM25 (FTS5) ranking using
  reciprocal rank fusion, then optionally reranks for diversity with MMR.

The vault stays the source of truth; the SQLite index is derived and can be
rebuilt at any time.
