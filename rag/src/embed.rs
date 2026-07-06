//! Embedding via fastembed (ONNX Runtime, no PyTorch). Maps the config's
//! HuggingFace-style model id to a fastembed model.

use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};

pub struct Embedder {
    model: TextEmbedding,
    pub dim: usize,
}

/// Supported model ids. Kept explicit so an unknown id is a hard error rather
/// than a silent downgrade that would build an index at the wrong dimension.
const SUPPORTED: &[(&str, EmbeddingModel)] = &[
    (
        "sentence-transformers/all-MiniLM-L6-v2",
        EmbeddingModel::AllMiniLML6V2,
    ),
    (
        "sentence-transformers/all-MiniLM-L12-v2",
        EmbeddingModel::AllMiniLML12V2,
    ),
    (
        "intfloat/multilingual-e5-small",
        EmbeddingModel::MultilingualE5Small,
    ),
    (
        "intfloat/multilingual-e5-base",
        EmbeddingModel::MultilingualE5Base,
    ),
    (
        "intfloat/multilingual-e5-large",
        EmbeddingModel::MultilingualE5Large,
    ),
    ("BAAI/bge-small-en-v1.5", EmbeddingModel::BGESmallENV15),
];

fn resolve_model(id: &str) -> Result<EmbeddingModel> {
    SUPPORTED
        .iter()
        .find(|(name, _)| *name == id)
        .map(|(_, m)| m.clone())
        .with_context(|| {
            let names: Vec<&str> = SUPPORTED.iter().map(|(n, _)| *n).collect();
            format!(
                "unknown embed model {id:?}. Supported: {}",
                names.join(", ")
            )
        })
}

/// Where downloaded ONNX models are cached. Defaults under ~/.engineering-os so
/// a run never litters the working directory. Override with EOS_MODEL_CACHE.
fn model_cache_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("EOS_MODEL_CACHE") {
        return Ok(PathBuf::from(dir));
    }
    let home = std::env::var_os("HOME")
        .context("HOME is not set; set EOS_MODEL_CACHE to choose a model cache directory")?;
    Ok(PathBuf::from(home).join(".engineering-os").join("models"))
}

impl Embedder {
    pub fn new(model_id: &str) -> Result<Embedder> {
        let model = resolve_model(model_id)?;
        let mut model = TextEmbedding::try_new(
            InitOptions::new(model)
                .with_cache_dir(model_cache_dir()?)
                .with_show_download_progress(true),
        )?;
        let probe = model.embed(vec!["dimension probe"], None)?;
        let dim = probe.first().map(|v| v.len()).unwrap_or(0);
        if dim == 0 {
            bail!("embedding probe returned no vector; the model failed to produce embeddings");
        }
        Ok(Embedder { model, dim })
    }

    pub fn embed_batch(&mut self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        self.model.embed(texts, None)
    }

    pub fn embed_one(&mut self, text: &str) -> Result<Vec<f32>> {
        let mut out = self.model.embed(vec![text], None)?;
        out.pop()
            .context("embedding a single query returned no vector")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_model_resolves() {
        assert!(resolve_model("sentence-transformers/all-MiniLM-L6-v2").is_ok());
        assert!(resolve_model("intfloat/multilingual-e5-small").is_ok());
    }

    #[test]
    fn unknown_model_is_an_error_not_a_downgrade() {
        let err = resolve_model("intfloat/multilingual-e5-larg").unwrap_err();
        assert!(err.to_string().contains("unknown embed model"));
    }
}
