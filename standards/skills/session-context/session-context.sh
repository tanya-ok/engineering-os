#!/usr/bin/env bash
# Print the vault's _Index/ files as session context. Used by the
# session-context skill and by the SessionStart hook.
#
# Config (environment):
#   EOS_VAULT_PATH        path to the work vault (default: <repo-root>/vault-template)
#   EOS_CONTEXT_MAX_LINES per-file line cap (default: 200)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VAULT="${EOS_VAULT_PATH:-$REPO_ROOT/vault-template}"
MAX_LINES="${EOS_CONTEXT_MAX_LINES:-200}"

if [ ! -d "$VAULT" ]; then
  echo "no vault at $VAULT. Set EOS_VAULT_PATH to your work vault."
  exit 0
fi

found=0
for name in "Vault Map" "Active Context" "Open Loops"; do
  file="$VAULT/_Index/$name.md"
  echo "== $name =="
  if [ -r "$file" ]; then
    head -n "$MAX_LINES" "$file"
    total="$(wc -l < "$file" | tr -d ' ')"
    if [ "$total" -gt "$MAX_LINES" ]; then
      echo "... truncated at $MAX_LINES of $total lines, read $file for the rest."
    fi
    found=$((found + 1))
  else
    echo "  missing: $file"
  fi
  echo
done

if [ "$found" -eq 0 ]; then
  echo "No _Index/ files found. See vault-template/_Index/ for the expected shape."
fi
