//! Search server. Mirrors the Python /health and /search contract:
//! vector kNN, optional hybrid (BM25 via RRF), optional MMR rerank, and
//! vault/namespace filters.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use anyhow::Result;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::db::{bytes_to_f32, f32_to_bytes};
use crate::embed::Embedder;

const RRF_K: f64 = 60.0;

pub struct Engine {
    pub conn: Connection,
    pub embedder: Embedder,
    pub model: String,
}

type Shared = Arc<Mutex<Engine>>;

#[derive(Deserialize)]
struct SearchRequest {
    query: String,
    #[serde(default = "default_top")]
    top: usize,
    #[serde(default)]
    vaults: Option<Vec<String>>,
    #[serde(default)]
    namespaces: Option<Vec<String>>,
    #[serde(default)]
    hybrid: bool,
    #[serde(default)]
    mmr: bool,
    #[serde(default = "default_lambda")]
    mmr_lambda: f64,
}

fn default_top() -> usize {
    8
}
fn default_lambda() -> f64 {
    0.7
}

#[derive(Serialize)]
struct SearchHit {
    chunk_id: i64,
    vault_id: String,
    namespace: String,
    path: String,
    heading: String,
    content: String,
    score: f64,
}

#[derive(Serialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
}

struct Meta {
    vault_id: String,
    namespace: String,
    path: String,
    heading: String,
    content: String,
}

pub async fn serve(cfg: Config, host: String, port: u16) -> Result<()> {
    let conn = crate::db::open(&cfg.resolved_db)?;
    if conn
        .query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get::<_, i64>(0))
        .is_err()
    {
        anyhow::bail!(
            "index not found or empty at {}; run `eos-rag index` first",
            cfg.resolved_db.display()
        );
    }
    let embedder = Embedder::new(&cfg.embed_model)?;
    let state: Shared = Arc::new(Mutex::new(Engine {
        conn,
        embedder,
        model: cfg.embed_model.clone(),
    }));

    let app = Router::new()
        .route("/health", get(health))
        .route("/search", post(search))
        .with_state(state);

    let addr = format!("{host}:{port}");
    println!("eos-rag serving on http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<Shared>) -> Json<serde_json::Value> {
    let eng = state.lock().unwrap();
    let chunks: i64 = eng
        .conn
        .query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get(0))
        .unwrap_or(0);
    let files: i64 = eng
        .conn
        .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
        .unwrap_or(0);
    Json(serde_json::json!({
        "status": "ok",
        "model": eng.model,
        "files": files,
        "chunks": chunks,
    }))
}

async fn search(
    State(state): State<Shared>,
    Json(req): Json<SearchRequest>,
) -> Json<SearchResponse> {
    let mut eng = state.lock().unwrap();
    let hits = run_search(&mut eng, &req).unwrap_or_default();
    Json(SearchResponse { hits })
}

fn run_search(eng: &mut Engine, req: &SearchRequest) -> Result<Vec<SearchHit>> {
    let qvec = eng.embedder.embed_one(&req.query)?;
    let filtering = req.vaults.is_some() || req.namespaces.is_some() || req.hybrid || req.mmr;
    let pool = if filtering { req.top * 6 } else { req.top };

    // Vector kNN.
    let mut fused: HashMap<i64, f64> = HashMap::new();
    let knn_ids: Vec<i64> = {
        let mut stmt = eng.conn.prepare(
            "SELECT chunk_id FROM embeddings WHERE embedding MATCH ?1 AND k = ?2 ORDER BY distance",
        )?;
        let rows = stmt.query_map(rusqlite::params![f32_to_bytes(&qvec), pool as i64], |r| {
            r.get::<_, i64>(0)
        })?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for (rank, cid) in knn_ids.into_iter().enumerate() {
        fused.insert(cid, 1.0 / (RRF_K + (rank + 1) as f64));
    }

    // BM25 lexical pass fused via RRF.
    if req.hybrid {
        let fts_query = format!("\"{}\"", req.query.replace('"', "\"\""));
        let fts_ids: Vec<i64> = {
            let mut stmt = eng
                .conn
                .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?1 ORDER BY bm25(chunks_fts) LIMIT ?2")?;
            let ids = match stmt.query_map(rusqlite::params![fts_query, pool as i64], |r| {
                r.get::<_, i64>(0)
            }) {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                Err(_) => Vec::new(),
            };
            ids
        };
        for (rank, cid) in fts_ids.into_iter().enumerate() {
            *fused.entry(cid).or_insert(0.0) += 1.0 / (RRF_K + (rank + 1) as f64);
        }
    }

    // Load metadata and apply filters.
    let mut meta: HashMap<i64, Meta> = HashMap::new();
    for cid in fused.keys() {
        if let Ok(m) = eng.conn.query_row(
            "SELECT c.vault_id, c.namespace, f.path, c.heading, c.content
             FROM chunks c JOIN files f ON f.id = c.file_id WHERE c.id = ?1",
            [cid],
            |r| {
                Ok(Meta {
                    vault_id: r.get(0)?,
                    namespace: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    path: r.get(2)?,
                    heading: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    content: r.get(4)?,
                })
            },
        ) {
            let pass_v = req
                .vaults
                .as_ref()
                .map(|vs| vs.contains(&m.vault_id))
                .unwrap_or(true);
            let pass_n = req
                .namespaces
                .as_ref()
                .map(|ns| ns.contains(&m.namespace))
                .unwrap_or(true);
            if pass_v && pass_n {
                meta.insert(*cid, m);
            }
        }
    }

    let mut candidates: Vec<i64> = meta.keys().copied().collect();
    candidates.sort_by(|a, b| fused[b].partial_cmp(&fused[a]).unwrap());

    let ordered = if req.mmr && candidates.len() > 1 {
        mmr_rerank(eng, &candidates, &fused, &qvec, req.top, req.mmr_lambda)?
    } else {
        candidates.into_iter().take(req.top).collect()
    };

    Ok(ordered
        .into_iter()
        .map(|cid| {
            let m = &meta[&cid];
            SearchHit {
                chunk_id: cid,
                vault_id: m.vault_id.clone(),
                namespace: m.namespace.clone(),
                path: m.path.clone(),
                heading: m.heading.clone(),
                content: m.content.clone(),
                score: (fused[&cid] * 1_000_000.0).round() / 1_000_000.0,
            }
        })
        .collect())
}

fn dot(a: &[f32], b: &[f32]) -> f64 {
    a.iter()
        .zip(b)
        .map(|(x, y)| (*x as f64) * (*y as f64))
        .sum()
}

fn mmr_rerank(
    eng: &Engine,
    candidates: &[i64],
    scores: &HashMap<i64, f64>,
    _qvec: &[f32],
    top: usize,
    lambda: f64,
) -> Result<Vec<i64>> {
    let mut vectors: HashMap<i64, Vec<f32>> = HashMap::new();
    for cid in candidates {
        if let Ok(blob) = eng.conn.query_row(
            "SELECT embedding FROM embeddings WHERE chunk_id = ?1",
            [cid],
            |r| r.get::<_, Vec<u8>>(0),
        ) {
            vectors.insert(*cid, bytes_to_f32(&blob));
        }
    }
    let mut selected: Vec<i64> = Vec::new();
    let mut pool: Vec<i64> = candidates
        .iter()
        .copied()
        .filter(|c| vectors.contains_key(c))
        .collect();
    while !pool.is_empty() && selected.len() < top {
        let mut best = pool[0];
        let mut best_val = f64::MIN;
        for &cand in &pool {
            let redundancy = selected
                .iter()
                .map(|s| dot(&vectors[&cand], &vectors[s]))
                .fold(0.0_f64, f64::max);
            let val =
                lambda * scores.get(&cand).copied().unwrap_or(0.0) - (1.0 - lambda) * redundancy;
            if val > best_val {
                best = cand;
                best_val = val;
            }
        }
        selected.push(best);
        pool.retain(|&c| c != best);
    }
    Ok(selected)
}
