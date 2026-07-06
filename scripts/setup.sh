#!/usr/bin/env bash
# One-command bootstrap for a fresh clone.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

missing=0
if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Install it first:"
  echo "  curl -LsSf https://astral.sh/uv/install.sh | sh   (inspect before running)"
  missing=1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install it first:"
  echo "  corepack enable && corepack prepare pnpm@latest --activate"
  missing=1
fi
[ "$missing" -ne 0 ] && exit 1

echo "Installing Python dependencies (uv sync)..."
uv sync

echo "Installing Node dev tooling (pnpm install)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (defaults work for the demo vault)."
fi

if [ ! -f rag/vaults.json ]; then
  cp rag/vaults.example.json rag/vaults.json
  echo "Created rag/vaults.json from the example (points at vault-template/)."
fi

echo "Sanity check: importing sentence_transformers (may take a moment)..."
uv run python -c "import sentence_transformers, sqlite_vec, fastapi" \
  && echo "Python environment OK."

echo ""
echo "Next steps:"
echo "  uv run python rag/build_index.py --config rag/vaults.json   # build the index"
echo "  uv run python rag/server.py --config rag/vaults.json        # start search on :8765"
echo "  pnpm exec lefthook install                                  # enable git hooks"
echo "  open vault-template/ in Obsidian and make it yours"
