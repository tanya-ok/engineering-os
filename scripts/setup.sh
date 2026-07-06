#!/usr/bin/env bash
# One-command bootstrap for a fresh clone.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust toolchain not found. Install it first:"
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   (inspect before running)"
  exit 1
fi

echo "Building the RAG binary (first build downloads the ONNX runtime, this is slow)..."
cargo build --release --manifest-path rag/Cargo.toml

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (defaults work for the demo vaults)."
fi

if [ ! -f rag/vaults.json ]; then
  cp rag/vaults.example.json rag/vaults.json
  echo "Created rag/vaults.json from the example (registers all three vaults)."
fi

if [ ! -f rag/routing.json ]; then
  cp rag/routing.example.json rag/routing.json
  echo "Created rag/routing.json (write-routing contract)."
fi

echo ""
echo "Next steps (run from the repo root):"
echo "  ./rag/target/release/eos-rag index --config rag/vaults.json   # build the index"
echo "  ./rag/target/release/eos-rag serve --config rag/vaults.json   # start search on :8765"
echo "  open vault-template/ in Obsidian and make it yours"
echo ""
echo "Optional: install the git hooks (needs lefthook: brew install lefthook)"
echo "  lefthook install"
