//! Config shared with the Python implementation: same rag/vaults.json shape.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct VaultEntry {
    pub vault_id: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub label: String,
    pub path_env: Option<String>,
    pub path_default: String,
    #[serde(default)]
    pub excluded_dirs: Vec<String>,
    #[serde(default)]
    pub exclude_underscore_prefix: bool,
    #[serde(default = "default_extensions")]
    pub extensions: Vec<String>,
    #[serde(skip)]
    pub resolved_path: PathBuf,
}

fn default_extensions() -> Vec<String> {
    vec![".md".to_string()]
}

#[derive(Debug, Deserialize)]
pub struct Config {
    #[serde(default = "default_model")]
    pub embed_model: String,
    #[serde(default = "default_index_db")]
    pub index_db: String,
    pub vaults: Vec<VaultEntry>,
    #[serde(skip)]
    pub resolved_db: PathBuf,
}

fn default_model() -> String {
    "sentence-transformers/all-MiniLM-L6-v2".to_string()
}

fn default_index_db() -> String {
    "~/.engineering-os/index.db".to_string()
}

/// Expand ~ and $VARS, then make absolute.
fn expand(raw: &str) -> PathBuf {
    let mut s = raw.to_string();
    if let Some(rest) = s.strip_prefix("~") {
        if let Some(home) = std::env::var_os("HOME") {
            s = format!("{}{}", home.to_string_lossy(), rest);
        }
    }
    // Minimal $VAR expansion for the common case.
    while let Some(start) = s.find('$') {
        let rest = &s[start + 1..];
        let end = rest
            .find(|c: char| !c.is_ascii_alphanumeric() && c != '_')
            .unwrap_or(rest.len());
        let var = &rest[..end];
        let val = std::env::var(var).unwrap_or_default();
        s = format!("{}{}{}", &s[..start], val, &rest[end..]);
    }
    PathBuf::from(s)
}

impl Config {
    pub fn load(path: &Path) -> Result<Config> {
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("reading config {}", path.display()))?;
        let mut cfg: Config = serde_json::from_str(&text)
            .with_context(|| format!("parsing config {}", path.display()))?;

        for v in &mut cfg.vaults {
            let raw = v
                .path_env
                .as_ref()
                .and_then(|e| std::env::var(e).ok())
                .unwrap_or_else(|| v.path_default.clone());
            v.resolved_path = expand(&raw);
        }
        let db_raw = std::env::var("EOS_INDEX_DB").unwrap_or_else(|_| cfg.index_db.clone());
        cfg.resolved_db = expand(&db_raw);
        if let Ok(m) = std::env::var("EOS_EMBED_MODEL") {
            cfg.embed_model = m;
        }
        Ok(cfg)
    }
}
