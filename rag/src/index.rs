//! Incremental indexer. Mirrors the Python build_index.py: only files whose
//! mtime changed are reprocessed; underscore-prefixed folders are excluded per
//! the vault's exclude_underscore_prefix flag.

use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use anyhow::Result;
use rusqlite::Connection;
use walkdir::WalkDir;

use crate::chunk::chunk_markdown;
use crate::config::{Config, VaultEntry};
use crate::db::{self, f32_to_bytes};
use crate::embed::Embedder;

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

        for gone in in_db.keys().filter(|p| !on_disk.contains_key(*p)) {
            if let Ok(file_id) =
                conn.query_row("SELECT id FROM files WHERE path = ?1", [gone], |r| {
                    r.get::<_, i64>(0)
                })
            {
                delete_file_rows(conn, file_id)?;
                conn.execute("DELETE FROM files WHERE id = ?1", [file_id])?;
            }
        }

        for (path, mtime) in &on_disk {
            if in_db
                .get(path)
                .map(|m| (m - mtime).abs() < 0.001)
                .unwrap_or(false)
            {
                continue;
            }
            let text = match std::fs::read_to_string(path) {
                Ok(t) => t,
                Err(e) => {
                    println!("[{}] unreadable {}: {}", vault.vault_id, path, e);
                    continue;
                }
            };

            let file_id =
                match conn.query_row("SELECT id FROM files WHERE path = ?1", [path], |r| {
                    r.get::<_, i64>(0)
                }) {
                    Ok(id) => {
                        delete_file_rows(conn, id)?;
                        conn.execute(
                            "UPDATE files SET mtime = ?1 WHERE id = ?2",
                            rusqlite::params![mtime, id],
                        )?;
                        id
                    }
                    Err(_) => {
                        conn.execute(
                            "INSERT INTO files(vault_id, path, mtime) VALUES (?1, ?2, ?3)",
                            rusqlite::params![vault.vault_id, path, mtime],
                        )?;
                        conn.last_insert_rowid()
                    }
                };

            let root = &vault.resolved_path;
            let rel = Path::new(path)
                .strip_prefix(root)
                .unwrap_or(Path::new(path));
            let namespace = rel
                .components()
                .next()
                .filter(|_| rel.components().count() > 1)
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .unwrap_or_default();

            let chunks = chunk_markdown(&text);
            if chunks.is_empty() {
                continue;
            }
            let vectors =
                embedder.embed_batch(chunks.iter().map(|c| c.content.clone()).collect())?;
            for (c, vec) in chunks.iter().zip(vectors.iter()) {
                conn.execute(
                    "INSERT INTO chunks(file_id, vault_id, namespace, heading, content) VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![file_id, vault.vault_id, namespace, c.heading, c.content],
                )?;
                let cid = conn.last_insert_rowid();
                conn.execute(
                    "INSERT INTO embeddings(chunk_id, embedding) VALUES (?1, ?2)",
                    rusqlite::params![cid, f32_to_bytes(vec)],
                )?;
                conn.execute(
                    "INSERT INTO chunks_fts(rowid, content) VALUES (?1, ?2)",
                    rusqlite::params![cid, c.content],
                )?;
            }
            total_new += chunks.len();
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
    Ok(total_new)
}
