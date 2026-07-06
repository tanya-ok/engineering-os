#!/usr/bin/env python3
"""Incremental vault indexer for engineering-os.

Chunks markdown by heading, embeds with sentence-transformers, stores in
SQLite (sqlite-vec for vectors, FTS5 for lexical search). Re-run any time;
only files whose mtime changed are reprocessed. The index is derived state:
deleting the DB and rebuilding is always safe.

Usage:
    python rag/build_index.py --config rag/vaults.json
    python rag/build_index.py --config rag/vaults.json --rebuild
    python rag/build_index.py --config rag/vaults.json --watch
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

import sqlite_vec

MAX_CHUNK_CHARS = 1500
MIN_CHUNK_CHARS = 40

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    vault_id TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    mtime REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    vault_id TEXT NOT NULL,
    namespace TEXT,
    heading TEXT,
    content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_vault ON chunks(vault_id, namespace);
"""


def expand(p: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(p))).resolve()


def load_config(path: str) -> dict:
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    for vault in cfg["vaults"]:
        env = vault.get("path_env")
        raw = os.environ.get(env) if env else None
        vault["resolved_path"] = expand(raw or vault["path_default"])
    cfg["resolved_db"] = expand(os.environ.get("EOS_INDEX_DB") or cfg.get("index_db", "~/.engineering-os/index.db"))
    cfg["resolved_model"] = os.environ.get("EOS_EMBED_MODEL") or cfg.get(
        "embed_model", "sentence-transformers/all-MiniLM-L6-v2"
    )
    return cfg


def connect(db_path: Path, check_same_thread: bool = True) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=check_same_thread)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_schema(conn: sqlite3.Connection, dim: int, model: str) -> None:
    conn.executescript(SCHEMA)
    stored_model = conn.execute("SELECT value FROM meta WHERE key = 'embed_model'").fetchone()
    if stored_model and stored_model[0] != model:
        sys.exit(
            f"Index was built with model '{stored_model[0]}', config says '{model}'. "
            "Run with --rebuild to reindex from scratch."
        )
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS embeddings "
        f"USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{dim}])"
    )
    conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content)")
    conn.execute(
        "INSERT INTO meta(key, value) VALUES ('embed_model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (model,),
    )
    conn.commit()


def chunk_markdown(text: str) -> list[tuple[str, str]]:
    """Split by headings, then hard-split oversized sections.

    Returns (heading, content) pairs. Content includes the heading line so
    lexical search matches heading terms.
    """
    sections: list[tuple[str, list[str]]] = [("", [])]
    for line in text.splitlines():
        if line.startswith("#"):
            sections.append((line.lstrip("# ").strip(), [line]))
        else:
            sections[-1][1].append(line)

    chunks: list[tuple[str, str]] = []
    for heading, lines in sections:
        body = "\n".join(lines).strip()
        if len(body) < MIN_CHUNK_CHARS:
            continue
        while len(body) > MAX_CHUNK_CHARS:
            cut = body.rfind("\n\n", 0, MAX_CHUNK_CHARS)
            if cut < MIN_CHUNK_CHARS:
                cut = MAX_CHUNK_CHARS
            chunks.append((heading, body[:cut].strip()))
            body = body[cut:].strip()
        if len(body) >= MIN_CHUNK_CHARS:
            chunks.append((heading, body))
    return chunks


def scan_vault(vault: dict) -> dict[str, float]:
    root = vault["resolved_path"]
    excluded = set(vault.get("excluded_dirs", []))
    exclude_underscore = vault.get("exclude_underscore_prefix", False)
    extensions = tuple(vault.get("extensions", [".md"]))
    found: dict[str, float] = {}
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in extensions:
            continue
        parent_parts = path.relative_to(root).parts[:-1]
        if any(part in excluded for part in parent_parts):
            continue
        # Underscore-prefixed folders (e.g. _inbox/ staging) stay out of the
        # index for vaults that opt in; a work vault keeps _Index/ indexed.
        if exclude_underscore and any(part.startswith("_") for part in parent_parts):
            continue
        found[str(path)] = path.stat().st_mtime
    return found


def delete_file_rows(conn: sqlite3.Connection, file_id: int) -> None:
    chunk_ids = [r[0] for r in conn.execute("SELECT id FROM chunks WHERE file_id = ?", (file_id,))]
    for cid in chunk_ids:
        conn.execute("DELETE FROM embeddings WHERE chunk_id = ?", (cid,))
        conn.execute("DELETE FROM chunks_fts WHERE rowid = ?", (cid,))
    conn.execute("DELETE FROM chunks WHERE file_id = ?", (file_id,))


def index_once(cfg: dict, model, rebuild: bool = False) -> None:
    db_path = cfg["resolved_db"]
    if rebuild and db_path.exists():
        db_path.unlink()
        print(f"Removed {db_path} for full rebuild")
    conn = connect(db_path)
    ensure_schema(conn, model.get_sentence_embedding_dimension(), cfg["resolved_model"])

    total_new = 0
    for vault in cfg["vaults"]:
        root = vault["resolved_path"]
        if not root.is_dir():
            print(f"[{vault['vault_id']}] skipped, path not found: {root}")
            continue
        on_disk = scan_vault(vault)
        in_db = dict(conn.execute("SELECT path, mtime FROM files WHERE vault_id = ?", (vault["vault_id"],)))

        for gone in set(in_db) - set(on_disk):
            row = conn.execute("SELECT id FROM files WHERE path = ?", (gone,)).fetchone()
            delete_file_rows(conn, row[0])
            conn.execute("DELETE FROM files WHERE id = ?", (row[0],))

        for path, mtime in on_disk.items():
            if path in in_db and abs(in_db[path] - mtime) < 0.001:
                continue
            try:
                text = Path(path).read_text(encoding="utf-8", errors="replace")
            except OSError as err:
                print(f"[{vault['vault_id']}] unreadable {path}: {err}")
                continue

            row = conn.execute("SELECT id FROM files WHERE path = ?", (path,)).fetchone()
            if row:
                delete_file_rows(conn, row[0])
                conn.execute("UPDATE files SET mtime = ? WHERE id = ?", (mtime, row[0]))
                file_id = row[0]
            else:
                cur = conn.execute(
                    "INSERT INTO files(vault_id, path, mtime) VALUES (?, ?, ?)",
                    (vault["vault_id"], path, mtime),
                )
                file_id = cur.lastrowid

            rel_parts = Path(path).relative_to(root).parts
            namespace = rel_parts[0] if len(rel_parts) > 1 else ""
            pairs = chunk_markdown(text)
            if not pairs:
                continue
            vectors = model.encode([c for _, c in pairs], normalize_embeddings=True)
            for (heading, content), vec in zip(pairs, vectors, strict=True):
                cur = conn.execute(
                    "INSERT INTO chunks(file_id, vault_id, namespace, heading, content) VALUES (?, ?, ?, ?, ?)",
                    (file_id, vault["vault_id"], namespace, heading, content),
                )
                cid = cur.lastrowid
                conn.execute(
                    "INSERT INTO embeddings(chunk_id, embedding) VALUES (?, ?)",
                    (cid, sqlite_vec.serialize_float32(vec.tolist())),
                )
                conn.execute("INSERT INTO chunks_fts(rowid, content) VALUES (?, ?)", (cid, content))
            total_new += len(pairs)
            print(f"[{vault['vault_id']}] indexed {Path(path).name} ({len(pairs)} chunks)")

        conn.commit()

    count = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    print(f"Done. {total_new} chunks written this run, {count} chunks total in {db_path}")
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="rag/vaults.json")
    parser.add_argument("--rebuild", action="store_true", help="drop the index and reindex everything")
    parser.add_argument("--watch", action="store_true", help="keep running, reindex on file changes")
    args = parser.parse_args()

    if not Path(args.config).exists():
        sys.exit(f"Config not found: {args.config}. Copy rag/vaults.example.json to {args.config} first.")

    cfg = load_config(args.config)
    print(f"Loading embedding model {cfg['resolved_model']} (first run downloads it)...")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(cfg["resolved_model"])
    index_once(cfg, model, rebuild=args.rebuild)

    if args.watch:
        print("Watching for changes (Ctrl-C to stop)...")
        try:
            while True:
                time.sleep(5)
                index_once(cfg, model)
        except KeyboardInterrupt:
            print("Stopped.")


if __name__ == "__main__":
    main()
