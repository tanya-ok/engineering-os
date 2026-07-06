//! Incremental indexer: only files whose mtime changed are reprocessed;
//! underscore-prefixed folders are excluded per the vault's
//! exclude_underscore_prefix flag.
//!
//! Each file is embedded BEFORE any database mutation, and all of its row
//! changes (delete old, upsert file, insert chunks) run in one transaction, so
//! a failed embed or a crash mid-run can never leave a file marked fresh with
//! its chunks deleted (which would skip it forever).

use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use anyhow::Result;
use rusqlite::{Connection, params};
use walkdir::WalkDir;

use crate::chunk::chunk_markdown;
use crate::config::{Config, VaultEntry};
use crate::db::{self, f32_to_bytes};
use crate::embed::Embedder;

const MTIME_EPS: f64 = 0.001;

/// A file needs reindexing if it is new or its mtime moved beyond the epsilon.
pub fn needs_reindex(in_db: Option<f64>, mtime: f64) -> bool {
    match in_db {
        Some(prev) => (prev - mtime).abs() >= MTIME_EPS,
        None => true,
    }
}

fn mtime_secs(path: &Path) -> f64 {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

fn scan_vault(vault: &VaultEntry) -> HashMap<String, f64> {
    let root = &vault.resolved_path;
    let mut found = HashMap::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext_ok = vault.extensions.iter().any(|e| {
            path.extension()
                .map(|x| format!(".{}", x.to_string_lossy()))
                == Some(e.clone())
        });
        if !ext_ok {
            continue;
        }
        let rel = match path.strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let parent_parts: Vec<String> = rel
            .parent()
            .map(|p| {
                p.components()
                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default();
        if parent_parts.iter().any(|p| vault.excluded_dirs.contains(p)) {
            continue;
        }
        if vault.exclude_underscore_prefix && parent_parts.iter().any(|p| p.starts_with('_')) {
            continue;
        }
        found.insert(path.to_string_lossy().to_string(), mtime_secs(path));
    }
    found
}

fn delete_file_rows(conn: &Connection, file_id: i64) -> Result<()> {
    let chunk_ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM chunks WHERE file_id = ?1")?;
        let rows = stmt.query_map([file_id], |r| r.get(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for cid in chunk_ids {
        conn.execute("DELETE FROM embeddings WHERE chunk_id = ?1", [cid])?;
        conn.execute("DELETE FROM chunks_fts WHERE rowid = ?1", [cid])?;
    }
    conn.execute("DELETE FROM chunks WHERE file_id = ?1", [file_id])?;
    Ok(())
}

fn namespace_of(path: &str, root: &Path) -> String {
    let rel = Path::new(path)
        .strip_prefix(root)
        .unwrap_or(Path::new(path));
    if rel.components().count() > 1 {
        rel.components()
            .next()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        String::new()
    }
}

pub fn index_all(cfg: &Config, embedder: &mut Embedder, conn: &Connection) -> Result<usize> {
    db::ensure_schema(conn, embedder.dim, &cfg.embed_model)?;
    let mut total_new = 0usize;

    for vault in &cfg.vaults {
        if !vault.resolved_path.is_dir() {
            println!(
                "[{}] skipped, path not found: {}",
                vault.vault_id,
                vault.resolved_path.display()
            );
            continue;
        }
        let on_disk = scan_vault(vault);

        let in_db: HashMap<String, f64> = {
            let mut stmt = conn.prepare("SELECT path, mtime FROM files WHERE vault_id = ?1")?;
            let rows = stmt.query_map([&vault.vault_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
            })?;
            rows.filter_map(|r| r.ok()).collect()
        };

        // Files deleted on disk: remove their rows atomically.
        for gone in in_db.keys().filter(|p| !on_disk.contains_key(*p)) {
            let tx = conn.unchecked_transaction()?;
            if let Ok(id) = tx.query_row("SELECT id FROM files WHERE path = ?1", [gone], |r| {
                r.get::<_, i64>(0)
            }) {
                delete_file_rows(&tx, id)?;
                tx.execute("DELETE FROM files WHERE id = ?1", [id])?;
            }
            tx.commit()?;
        }

        for (path, mtime) in &on_disk {
            if !needs_reindex(in_db.get(path).copied(), *mtime) {
                continue;
            }
            let text = match std::fs::read_to_string(path) {
                Ok(t) => t,
                Err(e) => {
                    println!("[{}] unreadable {}: {}", vault.vault_id, path, e);
                    continue;
                }
            };

            let chunks = chunk_markdown(&text);
            // Embed first: if this fails, ? returns before any DB mutation, so
            // the existing rows and mtime stay intact.
            let vectors = if chunks.is_empty() {
                Vec::new()
            } else {
                embedder.embed_batch(chunks.iter().map(|c| c.content.clone()).collect())?
            };

            let namespace = namespace_of(path, &vault.resolved_path);

            let tx = conn.unchecked_transaction()?;
            let file_id = match tx.query_row("SELECT id FROM files WHERE path = ?1", [path], |r| {
                r.get::<_, i64>(0)
            }) {
                Ok(id) => {
                    delete_file_rows(&tx, id)?;
                    tx.execute(
                        "UPDATE files SET mtime = ?1 WHERE id = ?2",
                        params![mtime, id],
                    )?;
                    id
                }
                Err(_) => {
                    tx.execute(
                        "INSERT INTO files(vault_id, path, mtime) VALUES (?1, ?2, ?3)",
                        params![vault.vault_id, path, mtime],
                    )?;
                    tx.last_insert_rowid()
                }
            };

            for (c, vec) in chunks.iter().zip(vectors.iter()) {
                tx.execute(
                    "INSERT INTO chunks(file_id, vault_id, namespace, heading, content) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![file_id, vault.vault_id, namespace, c.heading, c.content],
                )?;
                let cid = tx.last_insert_rowid();
                tx.execute(
                    "INSERT INTO embeddings(chunk_id, embedding) VALUES (?1, ?2)",
                    params![cid, f32_to_bytes(vec)],
                )?;
                tx.execute(
                    "INSERT INTO chunks_fts(rowid, content) VALUES (?1, ?2)",
                    params![cid, c.content],
                )?;
            }
            tx.commit()?;

            total_new += chunks.len();
            if !chunks.is_empty() {
                println!(
                    "[{}] indexed {} ({} chunks)",
                    vault.vault_id,
                    Path::new(path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy(),
                    chunks.len()
                );
            }
        }
    }
    Ok(total_new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reindex_decision() {
        assert!(needs_reindex(None, 100.0), "new file must index");
        assert!(!needs_reindex(Some(100.0), 100.0), "same mtime skips");
        assert!(
            !needs_reindex(Some(100.0), 100.0005),
            "within epsilon skips"
        );
        assert!(needs_reindex(Some(100.0), 101.0), "changed mtime reindexes");
    }

    #[test]
    fn namespace_extraction() {
        let root = Path::new("/vault");
        assert_eq!(namespace_of("/vault/CloudOps/run.md", root), "CloudOps");
        assert_eq!(namespace_of("/vault/top.md", root), "");
    }
}
