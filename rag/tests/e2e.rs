//! End-to-end test: build the real binary, index a small vault with the real
//! embedding model, serve it, and query over HTTP. This exercises the whole
//! path (chunker, fastembed, sqlite-vec, FTS5, RRF, axum) that the unit tests
//! cannot cover in isolation.
//!
//! The first run downloads the embedding model into the default cache
//! (~/.engineering-os/models); subsequent runs reuse it. Needs network on the
//! first run only.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_eos-rag")
}

/// Kill the server when the test ends, however it ends.
struct ChildGuard(Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn write_vault(dir: &Path) -> PathBuf {
    let vault = dir.join("vault");
    fs::create_dir_all(vault.join("CloudOps")).unwrap();
    fs::write(
        vault.join("CloudOps/runbook.md"),
        "# TLS rotation runbook\n\nRotate the certificate on the public load \
         balancer and verify the handshake returns the new certificate serial. \
         Watch the load balancer logs for fifteen minutes after the swap.",
    )
    .unwrap();
    fs::write(
        vault.join("CloudOps/costs.md"),
        "# Cost review\n\nObject storage grew after the audit doubled log \
         retention. Add a lifecycle rule for logs older than ninety days.",
    )
    .unwrap();

    let cfg = dir.join("vaults.json");
    let index_db = dir.join("index.db");
    fs::write(
        &cfg,
        format!(
            r#"{{
  "embed_model": "sentence-transformers/all-MiniLM-L6-v2",
  "index_db": "{}",
  "vaults": [
    {{ "vault_id": "work", "path_default": "{}", "excluded_dirs": [], "extensions": [".md"] }}
  ]
}}"#,
            index_db.display(),
            vault.display()
        ),
    )
    .unwrap();
    cfg
}

#[test]
fn index_then_serve_then_search() {
    let tmp = tempfile::tempdir().unwrap();
    let cfg = write_vault(tmp.path());
    let cfg_arg = cfg.to_str().unwrap();

    // 1. Index the vault with the real model.
    let out = Command::new(bin())
        .args(["index", "--config", cfg_arg])
        .output()
        .expect("failed to run index");
    assert!(
        out.status.success(),
        "index failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        stdout.contains("chunks total"),
        "unexpected index output: {stdout}"
    );

    // 2. Re-index: nothing changed on disk, so no file is reprocessed.
    let out2 = Command::new(bin())
        .args(["index", "--config", cfg_arg])
        .output()
        .expect("failed to re-run index");
    assert!(out2.status.success());
    let stdout2 = String::from_utf8_lossy(&out2.stdout);
    assert!(
        stdout2.contains("0 chunks written this run"),
        "incremental re-index should write nothing, got: {stdout2}"
    );

    // 3. Serve and query over HTTP.
    let port = 18765;
    let child = Command::new(bin())
        .args(["serve", "--config", cfg_arg])
        .env("EOS_SERVER_PORT", port.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("failed to spawn serve");
    let _guard = ChildGuard(child);

    let base = format!("http://127.0.0.1:{port}");
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        if ureq::get(&format!("{base}/health")).call().is_ok() {
            break;
        }
        assert!(Instant::now() < deadline, "server never became ready");
        std::thread::sleep(Duration::from_millis(500));
    }

    // Valid search returns the runbook as the top hit.
    let resp: serde_json::Value = ureq::post(&format!("{base}/search"))
        .send_json(serde_json::json!({
            "query": "how do I rotate a TLS certificate",
            "top": 3,
            "hybrid": true,
        }))
        .expect("search request failed")
        .body_mut()
        .read_json()
        .expect("search response was not json");
    let hits = resp["hits"].as_array().expect("hits array");
    assert!(!hits.is_empty(), "expected at least one hit");
    let top = hits[0]["path"].as_str().unwrap();
    assert!(
        top.contains("runbook.md"),
        "top hit should be the TLS runbook, got {top}"
    );

    // Empty query is a client error (400), not a silent empty 200.
    let status = match ureq::post(&format!("{base}/search"))
        .send_json(serde_json::json!({ "query": "  " }))
    {
        Ok(r) => r.status().as_u16(),
        Err(ureq::Error::StatusCode(code)) => code,
        Err(other) => panic!("unexpected transport error: {other}"),
    };
    assert_eq!(status, 400, "empty query should be a 400");
}
