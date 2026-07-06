#!/usr/bin/env bash
# Identity-leak gate. Blocks content that would tie this public repo to a
# specific person, machine, or employer. Generic patterns are built in;
# maintainers add private patterns (names, org identifiers) to
# scripts/anonymization-patterns.local.txt (gitignored, one regex per line).
#
# Usage:
#   scripts/anonymization-check.sh staged   # pre-commit: staged diff
#   scripts/anonymization-check.sh range    # pre-push / CI: diff vs origin/main
#   scripts/anonymization-check.sh all      # full working tree scan
set -euo pipefail

MODE="${1:-all}"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SELF_DIR" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

EXCLUDES=(':(exclude)scripts/anonymization-check.sh' ':(exclude).gitleaks.toml')

BUILTIN_PATTERNS=(
  '/Users/[a-z0-9_-]+/'
  '/home/[a-z0-9_-]+/'
  'op://'
  'iCloud~md~obsidian'
  'Mobile Documents'
)

LOCAL_LIST="scripts/anonymization-patterns.local.txt"

collect_content() {
  case "$MODE" in
    staged)
      git diff --cached -U0 -- . "${EXCLUDES[@]}" | grep '^+' || true
      ;;
    range)
      if git rev-parse --verify -q origin/main >/dev/null; then
        git diff origin/main...HEAD -U0 -- . "${EXCLUDES[@]}" | grep '^+' || true
      else
        collect_all
      fi
      ;;
    all)
      collect_all
      ;;
    *)
      echo "Unknown mode: $MODE (use staged|range|all)" >&2
      exit 2
      ;;
  esac
}

collect_all() {
  git ls-files -- . "${EXCLUDES[@]}" | while IFS= read -r f; do
    sed "s|^|$f: |" "$f" 2>/dev/null || true
  done
}

CONTENT="$(collect_content)"
[ -z "$CONTENT" ] && exit 0

FAIL=0
for pattern in "${BUILTIN_PATTERNS[@]}"; do
  if MATCHES="$(printf '%s\n' "$CONTENT" | grep -inE "$pattern" | head -5)"; then
    [ -z "$MATCHES" ] && continue
    echo "BLOCKED by builtin pattern: $pattern"
    printf '%s\n' "$MATCHES"
    FAIL=1
  fi
done

if [ -f "$LOCAL_LIST" ]; then
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    case "$pattern" in \#*) continue ;; esac
    if MATCHES="$(printf '%s\n' "$CONTENT" | grep -inE "$pattern" | head -5)"; then
      [ -z "$MATCHES" ] && continue
      echo "BLOCKED by local pattern: $pattern"
      printf '%s\n' "$MATCHES"
      FAIL=1
    fi
  done < "$LOCAL_LIST"
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Anonymization gate failed. Remove the flagged content; never bypass this check."
  exit 1
fi
echo "Anonymization gate passed ($MODE)."
