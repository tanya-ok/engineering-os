//! SQLite storage: sqlite-vec for vectors, FTS5 for lexical search.

use std::path::Path;
use std::sync::Once;

use anyhow::{Result, bail};
use rusqlite::Connection;
use rusqlite::ffi::sqlite3_auto_extension;
use sqlite_vec::sqlite3_vec_init;

static VEC_INIT: Once = Once::new();

/// Register sqlite-vec as an auto extension so every connection opened afterward
/// loads it. Note this is process-global: it affects every SQLite connection in
/// the process, not just ours. The `Once` guard makes registration idempotent
/// and race-free. The `transmute` to the extension entry-point signature is the
/// documented sqlite-vec pattern.
#[allow(clippy::missing_transmute_annotations)]
fn register_vec_extension() {
    VEC_INIT.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    });
}

pub fn open(db_path: &Path) -> Result<Connection> {
    register_vec_extension();
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

const SCHEMA: &str = r#"
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
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content);
"#;

pub fn ensure_schema(conn: &Connection, dim: usize, model: &str) -> Result<()> {
    conn.execute_batch(SCHEMA)?;

    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'embed_model'",
            [],
            |r| r.get(0),
        )
        .ok();
    if let Some(prev) = stored
        && prev != model
    {
        bail!("index was built with model '{prev}', config says '{model}'. Rebuild to reindex.");
    }

    // Guard the vector dimension too: two models can share nothing but still
    // both be valid ids, and a dim change silently corrupts the vec0 table.
    let stored_dim: Option<usize> = conn
        .query_row("SELECT value FROM meta WHERE key = 'embed_dim'", [], |r| {
            r.get::<_, String>(0)
        })
        .ok()
        .and_then(|s| s.parse().ok());
    if let Some(prev) = stored_dim
        && prev != dim
    {
        bail!("index was built at dimension {prev}, model now yields {dim}. Rebuild to reindex.");
    }

    conn.execute(
        &format!(
            "CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{dim}])"
        ),
        [],
    )?;
    conn.execute(
        "INSERT INTO meta(key, value) VALUES ('embed_model', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [model],
    )?;
    conn.execute(
        "INSERT INTO meta(key, value) VALUES ('embed_dim', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [dim.to_string()],
    )?;
    Ok(())
}

pub fn f32_to_bytes(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    out
}

pub fn bytes_to_f32(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f32_bytes_round_trip() {
        let v = vec![0.0f32, 1.5, -2.25, 3.125e10, f32::MIN, f32::MAX];
        assert_eq!(bytes_to_f32(&f32_to_bytes(&v)), v);
    }

    #[test]
    fn schema_and_dim_guard() {
        register_vec_extension();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn, 384, "model-a").unwrap();
        // same model + dim is fine
        ensure_schema(&conn, 384, "model-a").unwrap();
        // dim change is rejected
        assert!(ensure_schema(&conn, 768, "model-a").is_err());
        // model change is rejected
        assert!(ensure_schema(&conn, 384, "model-b").is_err());
    }
}
