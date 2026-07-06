//! Config for the RAG layer: the rag/vaults.json shape.

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

/// Expand a leading `~` only when it is the whole string or is followed by `/`,
/// so `~backup` is left untouched rather than turned into `${HOME}backup`.
fn expand_tilde(raw: &str, home: Option<&str>) -> String {
    if raw == "~" {
        return home.unwrap_or(raw).to_string();
    }
    if let Some(rest) = raw.strip_prefix("~/")
        && let Some(h) = home
    {
        return format!("{h}/{rest}");
    }
    raw.to_string()
}

/// Single-pass `$VAR` expansion. An undefined variable expands to empty; a lone
/// `$` is kept literally. Single pass means a value that itself contains `$` is
/// never re-expanded (no runaway).
fn expand_vars(s: &str, lookup: impl Fn(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find('$') {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 1..];
        let name_len = after
            .char_indices()
            .take_while(|(_, c)| c.is_ascii_alphanumeric() || *c == '_')
            .map(|(i, c)| i + c.len_utf8())
            .last()
            .unwrap_or(0);
        if name_len == 0 {
            out.push('$');
            rest = after;
        } else {
            if let Some(val) = lookup(&after[..name_len]) {
                out.push_str(&val);
            }
            rest = &after[name_len..];
        }
    }
    out.push_str(rest);
    out
}

fn expand(raw: &str) -> PathBuf {
    let home = std::env::var("HOME").ok();
    let s = expand_tilde(raw, home.as_deref());
    let s = expand_vars(&s, |k| std::env::var(k).ok());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tilde_slash_expands() {
        assert_eq!(expand_tilde("~/notes", Some("/base")), "/base/notes");
        assert_eq!(expand_tilde("~", Some("/base")), "/base");
    }

    #[test]
    fn tilde_prefix_without_slash_is_left_alone() {
        assert_eq!(expand_tilde("~backup/x", Some("/base")), "~backup/x");
    }

    #[test]
    fn tilde_without_home_is_left_alone() {
        assert_eq!(expand_tilde("~/notes", None), "~/notes");
    }

    #[test]
    fn vars_expand_and_undefined_is_empty() {
        let lookup = |k: &str| match k {
            "V" => Some("/data".to_string()),
            _ => None,
        };
        assert_eq!(expand_vars("$V/sub", lookup), "/data/sub");
        assert_eq!(expand_vars("$MISSING/sub", lookup), "/sub");
        assert_eq!(expand_vars("no vars here", lookup), "no vars here");
    }

    #[test]
    fn expanded_value_is_not_re_expanded() {
        let lookup = |k: &str| match k {
            "A" => Some("$B".to_string()),
            "B" => Some("boom".to_string()),
            _ => None,
        };
        assert_eq!(expand_vars("$A", lookup), "$B");
    }

    #[test]
    fn lone_dollar_is_kept() {
        assert_eq!(expand_vars("cost is $ 5", |_| None), "cost is $ 5");
    }
}
