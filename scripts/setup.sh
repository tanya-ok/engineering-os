#!/usr/bin/env bash
# One-command bootstrap for a fresh clone.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install the active LTS (Node 24), e.g. via fnm/nvm/asdf."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node $(node --version) is too old. eos-rag needs Node >= 24 (active LTS)."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install it first: corepack enable pnpm   (or: npm i -g pnpm)"
  exit 1
fi

echo "Installing and building the RAG layer (first run downloads dependencies)..."
pnpm --dir rag install
pnpm --dir rag run build

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
echo "  node rag/dist/cli.js index --config rag/vaults.json   # build the index (first run downloads the model)"
echo "  node rag/dist/cli.js serve --config rag/vaults.json   # start search on :8765"
echo "  open vault-template/ in Obsidian and make it yours"
echo ""
echo "Optional: install the git hooks (needs lefthook: brew install lefthook)"
echo "  lefthook install"
