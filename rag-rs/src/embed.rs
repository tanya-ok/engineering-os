//! Embedding via fastembed (ONNX Runtime, no PyTorch). Maps the config's
//! HuggingFace-style model id to a fastembed model.

use anyhow::Result;
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};

pub struct Embedder {
    model: TextEmbedding,
    pub dim: usize,
}

fn resolve_model(id: &str) -> EmbeddingModel {
    match id {
        "sentence-transformers/all-MiniLM-L6-v2" => EmbeddingModel::AllMiniLML6V2,
        "sentence-transformers/all-MiniLM-L12-v2" => EmbeddingModel::AllMiniLML12V2,
        "intfloat/multilingual-e5-small" => EmbeddingModel::MultilingualE5Small,
        "intfloat/multilingual-e5-base" => EmbeddingModel::MultilingualE5Base,
        "intfloat/multilingual-e5-large" => EmbeddingModel::MultilingualE5Large,
        "BAAI/bge-small-en-v1.5" => EmbeddingModel::BGESmallENV15,
        _ => EmbeddingModel::AllMiniLML6V2,
    }
}

impl Embedder {
    pub fn new(model_id: &str) -> Result<Embedder> {
        let mut model = TextEmbedding::try_new(
            InitOptions::new(resolve_model(model_id)).with_show_download_progress(true),
        )?;
        let probe = model.embed(vec!["dimension probe"], None)?;
        let dim = probe.first().map(|v| v.len()).unwrap_or(0);
        Ok(Embedder { model, dim })
    }

    pub fn embed_batch(&mut self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        self.model.embed(texts, None)
    }

    pub fn embed_one(&mut self, text: &str) -> Result<Vec<f32>> {
        let mut out = self.model.embed(vec![text.to_string()], None)?;
        Ok(out.pop().unwrap_or_default())
    }
}
