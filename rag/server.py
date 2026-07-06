#!/usr/bin/env python3
"""Search server for the engineering-os index.

Endpoints:
    GET  /health   liveness + index stats
    POST /search   hybrid retrieval over the indexed vaults

Search modes:
    default        vector kNN (cosine, normalized embeddings)
    hybrid=true    vector kNN fused with BM25 (FTS5) via reciprocal rank fusion
    mmr=true       maximal marginal relevance rerank for result diversity

Binds to 127.0.0.1 by default. No auth; do not expose beyond localhost.

Usage:
    python rag/server.py --config rag/vaults.json
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import struct
from contextlib import asynccontextmanager

import sqlite_vec
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from build_index import connect, load_config

RRF_K = 60
STATE: dict = {}


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top: int = Field(default=8, ge=1, le=50)
    vaults: list[str] | None = Field(default=None, description="restrict to these vault_ids")
    namespaces: list[str] | None = Field(default=None, description="restrict to top-level folders")
    hybrid: bool = Field(default=False, description="fuse vector kNN with BM25 via RRF")
    mmr: bool = Field(default=False, description="rerank for diversity")
    mmr_lambda: float = Field(default=0.7, ge=0.0, le=1.0)


class SearchHit(BaseModel):
    chunk_id: int
    vault_id: str
    namespace: str
    path: str
    heading: str
    content: str
    score: float


class SearchResponse(BaseModel):
    hits: list[SearchHit]


def deserialize(blob: bytes) -> list[float]:
    return list(struct.unpack(f"{len(blob) // 4}f", blob))


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


def chunk_meta(conn: sqlite3.Connection, ids: list[int]) -> dict[int, tuple]:
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    rows = conn.execute(
        f"""SELECT c.id, c.vault_id, c.namespace, f.path, c.heading, c.content
            FROM chunks c JOIN files f ON f.id = c.file_id WHERE c.id IN ({marks})""",
        ids,
    )
    return {r[0]: r for r in rows}


def passes_filters(meta: tuple, req: SearchRequest) -> bool:
    if req.vaults and meta[1] not in req.vaults:
        return False
    if req.namespaces and meta[2] not in req.namespaces:
        return False
    return True


def mmr_rerank(
    candidates: list[int],
    scores: dict[int, float],
    vectors: dict[int, list[float]],
    top: int,
    lam: float,
) -> list[int]:
    selected: list[int] = []
    pool = [c for c in candidates if c in vectors]
    while pool and len(selected) < top:
        best, best_val = None, float("-inf")
        for cand in pool:
            redundancy = max((cosine(vectors[cand], vectors[s]) for s in selected), default=0.0)
            val = lam * scores.get(cand, 0.0) - (1 - lam) * redundancy
            if val > best_val:
                best, best_val = cand, val
        selected.append(best)
        pool.remove(best)
    return selected


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = STATE["cfg"]
    from sentence_transformers import SentenceTransformer

    print(f"Loading embedding model {cfg['resolved_model']}...")
    STATE["model"] = SentenceTransformer(cfg["resolved_model"])
    if not cfg["resolved_db"].exists():
        raise SystemExit(f"Index not found at {cfg['resolved_db']}. Run rag/build_index.py first.")
    # Read-only usage from FastAPI's worker threads; sqlite serializes access.
    STATE["conn"] = connect(cfg["resolved_db"], check_same_thread=False)
    yield
    STATE["conn"].close()


app = FastAPI(title="engineering-os search", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    conn = STATE["conn"]
    chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    files = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    return {"status": "ok", "model": STATE["cfg"]["resolved_model"], "files": files, "chunks": chunks}


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    conn: sqlite3.Connection = STATE["conn"]
    qvec = STATE["model"].encode(req.query, normalize_embeddings=True).tolist()

    # Wide pool when anything filters or reranks after the kNN.
    pool_size = req.top * 6 if (req.vaults or req.namespaces or req.hybrid or req.mmr) else req.top
    knn = conn.execute(
        "SELECT chunk_id, distance FROM embeddings WHERE embedding MATCH ? AND k = ? ORDER BY distance",
        (sqlite_vec.serialize_float32(qvec), pool_size),
    ).fetchall()
    vec_rank = {cid: rank for rank, (cid, _dist) in enumerate(knn, start=1)}

    fused: dict[int, float] = {cid: 1.0 / (RRF_K + rank) for cid, rank in vec_rank.items()}
    if req.hybrid:
        fts_query = '"' + req.query.replace('"', '""') + '"'
        try:
            bm25 = conn.execute(
                "SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?",
                (fts_query, pool_size),
            ).fetchall()
        except sqlite3.OperationalError as err:
            raise HTTPException(status_code=400, detail=f"FTS query error: {err}") from err
        for rank, (cid,) in enumerate(bm25, start=1):
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (RRF_K + rank)

    meta = chunk_meta(conn, list(fused))
    candidates = [
        cid for cid, _ in sorted(fused.items(), key=lambda kv: -kv[1]) if cid in meta and passes_filters(meta[cid], req)
    ]

    if req.mmr and len(candidates) > 1:
        vectors: dict[int, list[float]] = {}
        for cid in candidates:
            row = conn.execute("SELECT embedding FROM embeddings WHERE chunk_id = ?", (cid,)).fetchone()
            if row:
                vectors[cid] = deserialize(row[0])
        candidates = mmr_rerank(candidates, fused, vectors, req.top, req.mmr_lambda)
    else:
        candidates = candidates[: req.top]

    hits = [
        SearchHit(
            chunk_id=cid,
            vault_id=meta[cid][1],
            namespace=meta[cid][2] or "",
            path=meta[cid][3],
            heading=meta[cid][4] or "",
            content=meta[cid][5],
            score=round(fused[cid], 6),
        )
        for cid in candidates
    ]
    return SearchResponse(hits=hits)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="rag/vaults.json")
    args = parser.parse_args()
    STATE["cfg"] = load_config(args.config)
    host = os.environ.get("EOS_SERVER_HOST", "127.0.0.1")
    port = int(os.environ.get("EOS_SERVER_PORT", "8765"))
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
