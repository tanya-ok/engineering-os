#!/usr/bin/env bash
# Show the current work picture in one place: the ready beads (agent tasks with
# no open blockers) and the vault's open loops (the human narrative). Use it at
# the start of a session to decide what to pick up next.
#
# Config (environment):
#   EOS_VAULT_PATH   path to the work vault (default: ./vault-template)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VAULT="${EOS_VAULT_PATH:-$REPO_ROOT/vault-template}"

echo "== ready beads (agent tasks, no blockers) =="
if command -v bd >/dev/null 2>&1; then
  if [ -d "$REPO_ROOT/.beads" ] || bd ready >/dev/null 2>&1; then
    bd ready || echo "  (no ready tasks)"
  else
    echo "  beads is not initialized here. Run 'bd init' at the repo root."
  fi
else
  echo "  bd not installed. See standards/canonical/work-tracking.md to set it up."
  echo "  Install: https://github.com/steveyegge/beads"
fi

echo
echo "== open loops (vault narrative) =="
LOOPS="$VAULT/_Index/Open Loops.md"
if [ -r "$LOOPS" ]; then
  cat "$LOOPS"
else
  echo "  no Open Loops file at $LOOPS"
fi

echo
echo "Next: pick a ready bead whose domain matches an open loop, claim it"
echo "(bd update <id> --claim), and announce the claim."
