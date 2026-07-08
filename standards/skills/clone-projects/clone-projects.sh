#!/usr/bin/env bash
# Clone the project repos listed in a manifest into a workspace laid out by the
# same domains as the vault, so notes and code sit side by side. Idempotent:
# missing repos are cloned, existing ones are skipped (or fetched with --sync).
#
# Config (environment):
#   EOS_GITHUB_ORG      GitHub org or owner to clone from (required)
#   EOS_WORKSPACE_PATH  where to clone (default: a sibling engineering-os-workspace)
#
# Manifest (tab-separated, header row skipped), default <repo-root>/projects.tsv:
#   repo <TAB> domain <TAB> subcategory
# domain is any top-level folder (the five vault domains, or your own).
# subcategory "_" or empty means no extra nesting level.
#
# Usage:
#   EOS_GITHUB_ORG=my-org ./clone-projects.sh [--sync] [path/to/manifest.tsv]
set -euo pipefail

SYNC=0
MANIFEST_ARG=""
for arg in "$@"; do
  case "$arg" in
    --sync) SYNC=1 ;;
    -h | --help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) MANIFEST_ARG="$arg" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MANIFEST="${MANIFEST_ARG:-$REPO_ROOT/projects.tsv}"
ORG="${EOS_GITHUB_ORG:-}"
WORKSPACE="${EOS_WORKSPACE_PATH:-$(dirname "$REPO_ROOT")/engineering-os-workspace}"

if [ -z "$ORG" ]; then
  echo "ERROR: set EOS_GITHUB_ORG to the GitHub org or owner to clone from." >&2
  exit 1
fi
if [ ! -r "$MANIFEST" ]; then
  echo "ERROR: manifest not found: $MANIFEST" >&2
  echo "Copy projects.example.tsv to projects.tsv and list your repos." >&2
  exit 1
fi

have_gh=0
command -v gh >/dev/null 2>&1 && have_gh=1
if [ "$have_gh" -eq 0 ] && ! command -v git >/dev/null 2>&1; then
  echo "ERROR: need either gh (GitHub CLI) or git in PATH." >&2
  exit 1
fi

mkdir -p "$WORKSPACE"
LOG="$WORKSPACE/clone.log"
log() { echo "[$(date "+%Y-%m-%d %H:%M:%S")] $*" | tee -a "$LOG"; }

clone_one() {
  # $1 = repo name, $2 = target dir
  if [ "$have_gh" -eq 1 ]; then
    gh repo clone "$ORG/$1" "$2" >>"$LOG" 2>&1
  else
    git clone "https://github.com/$ORG/$1.git" "$2" >>"$LOG" 2>&1
  fi
}

log "=== clone-projects start (org=$ORG workspace=$WORKSPACE sync=$SYNC) ==="
total=0 cloned=0 skipped=0 fetched=0 failed=0
failed_repos=""

# Process substitution keeps the loop in this shell so counters persist.
while IFS=$'\t' read -r repo domain subcategory _rest; do
  [ -z "${repo:-}" ] && continue
  case "$repo" in \#*) continue ;; esac
  total=$((total + 1))

  if [ -z "${subcategory:-}" ] || [ "$subcategory" = "_" ]; then
    target="$WORKSPACE/$domain/$repo"
  else
    target="$WORKSPACE/$domain/$subcategory/$repo"
  fi

  if [ -d "$target/.git" ]; then
    if [ "$SYNC" -eq 1 ]; then
      if git -C "$target" fetch --prune --quiet >>"$LOG" 2>&1; then
        log "FETCH $repo -> $target"
        fetched=$((fetched + 1))
      else
        log "FAIL  $repo (fetch)"
        failed=$((failed + 1))
        failed_repos="$failed_repos $repo"
      fi
    else
      log "SKIP  $repo -> $target"
      skipped=$((skipped + 1))
    fi
    continue
  fi

  mkdir -p "$(dirname "$target")"
  log "CLONE $repo -> $target"
  if clone_one "$repo" "$target"; then
    cloned=$((cloned + 1))
  else
    log "FAIL  $repo (clone)"
    failed=$((failed + 1))
    failed_repos="$failed_repos $repo"
  fi
done < <(tail -n +2 "$MANIFEST")

log "=== summary: total=$total cloned=$cloned skipped=$skipped fetched=$fetched failed=$failed ==="
echo
echo "Done. total=$total cloned=$cloned skipped=$skipped fetched=$fetched failed=$failed"
echo "Workspace: $WORKSPACE"
echo "Log: $LOG"
if [ "$failed" -gt 0 ]; then
  echo "Failed:$failed_repos" >&2
  exit 1
fi
exit 0
