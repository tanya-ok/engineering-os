# rag-rs - experimental Rust RAG layer

A single-binary reimplementation of the Python `rag/` layer. Same index format,
same `vaults.json` config, same `/search` contract. No Python, no PyTorch: text
embedding runs through [fastembed](https://crates.io/crates/fastembed) (ONNX
Runtime) with quantized models, and storage is SQLite via
[sqlite-vec](https://github.com/asg017/sqlite-vec) plus FTS5.

Status: experiment on branch `experiment/rust-rag`. The Python layer remains the
reference on `main` until this reaches full parity in the wild.

## Why

The Python layer's heaviest cost is onboarding: `uv sync` pulls PyTorch (~2 GB)
on first run. The Rust binary is self-contained and distributable through GitHub
Releases, so a user downloads one file instead of installing a toolchain.

## Build and run

```sh
cargo build --release
cp rag/vaults.example.json rag/vaults.json   # if not already present

./target/release/eos-rag index --config rag/vaults.json
./target/release/eos-rag serve --config rag/vaults.json
```

The `/health` and `POST /search` endpoints match the Python server exactly:
`query`, `top`, `vaults`, `namespaces`, `hybrid`, `mmr`, `mmr_lambda`.

## Model mapping

The config `embed_model` (a HuggingFace-style id) maps to a fastembed model.
Supported out of the box: `all-MiniLM-L6-v2` (default), `all-MiniLM-L12-v2`,
`multilingual-e5-{small,base,large}`, `bge-small-en-v1.5`. Unknown ids fall
back to MiniLM-L6.

## Parity check

Indexed against the shipped three-vault template, this produces the same 79
chunks and the same top hits as the Python implementation.
