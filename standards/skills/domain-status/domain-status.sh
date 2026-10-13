#!/usr/bin/env bash
# Collect the raw material for one domain's status: its notes, the most
# recently modified ones, and the open loops that mention it.
#
# Usage:
#   standards/skills/domain-status/domain-status.sh <Domain>
#
# Config (environment):
#   EOS_VAULT_PATH  path to the work vault (default: <repo-root>/vault-template)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VAULT="${EOS_VAULT_PATH:-$REPO_ROOT/vault-template}"

list_domains() {
  find "$VAULT" -mindepth 1 -maxdepth 1 -type d ! -name '_*' -exec basename {} \; | sort
}

if [ ! -d "$VAULT" ]; then
  echo "no vault at $VAULT. Set EOS_VAULT_PATH to your work vault." >&2
  exit 1
fi

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "usage: domain-status.sh <Domain>"
  echo
  echo "domains in $VAULT:"
  list_domains | sed 's/^/  /'
  exit 1
fi

DIR="$VAULT/$DOMAIN"
if [ ! -d "$DIR" ]; then
  echo "no domain '$DOMAIN' in $VAULT. Available:" >&2
  list_domains | sed 's/^/  /' >&2
  exit 1
fi

echo "== $DOMAIN: notes =="
find "$DIR" -type f -name '*.md' | sort | sed "s|^$VAULT/|  |" || true
echo

echo "== $DOMAIN: most recently modified =="
# BSD stat and GNU stat take different flags; try BSD first, then GNU.
mtimes() {
  find "$DIR" -type f -name '*.md' -exec stat -f '%m %N' {} + 2>/dev/null && return 0
  find "$DIR" -type f -name '*.md' -exec stat -c '%Y %n' {} + 2>/dev/null && return 0
  return 1
}
if mtimes > /dev/null 2>&1; then
  mtimes | sort -rn | head -n 10 | while read -r epoch path; do
    printf '  %s  %s\n' "$(date -r "$epoch" '+%Y-%m-%d' 2>/dev/null || echo '----------')" "${path#"$VAULT"/}"
  done
else
  echo "  (stat unavailable, skipping)"
fi
echo

echo "== $DOMAIN: open loops =="
LOOPS="$VAULT/_Index/Open Loops.md"
if [ -r "$LOOPS" ]; then
  grep -n -i -- "$DOMAIN" "$LOOPS" | sed 's/^/  /' || echo "  (no loop mentions $DOMAIN)"
else
  echo "  no Open Loops file at $LOOPS"
fi
echo

echo "Next: read the notes above, then write the four-line summary"
echo "(covers / moved / open / stale). Do not summarize a note you did not read."
