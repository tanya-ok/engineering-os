#!/usr/bin/env bash
# Identity-leak gate. Blocks content that would tie this public repo to a
# specific person, machine, or employer. Generic patterns are built in;
# maintainers add private patterns (names, org identifiers) to
# scripts/anonymization-patterns.local.txt (gitignored, one regex per line).
#
# Usage:
#   scripts/anonymization-check.sh staged   # pre-commit: staged diff
#   scripts/anonymization-check.sh range    # pre-push / CI: commits not on origin/main
#   scripts/anonymization-check.sh all      # tracked and nonignored untracked files
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

SCAN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/eos-anonymization.XXXXXX")"
trap 'rm -rf "$SCAN_DIR"' EXIT
CONTENT="$SCAN_DIR/content"
MATCHES="$SCAN_DIR/matches"

collect_all() {
  git ls-files --cached --others --exclude-standard -z -- . "${EXCLUDES[@]}" > "$SCAN_DIR/files" || return
  while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    printf '%s\n' "$f"
    cat -- "$f" || return
    printf '\n'
  done < "$SCAN_DIR/files"
}

collect_content() {
  case "$MODE" in
    staged)
      git -c color.ui=false diff --cached --no-ext-diff --no-textconv -U0 -- . "${EXCLUDES[@]}" |
        awk '/^\+/ { print }'
      ;;
    range)
      local revision
      if git rev-parse --verify -q origin/main >/dev/null; then
        revision="origin/main..HEAD"
      else
        revision="HEAD"
      fi
      # Inspect every new commit, including additions later removed, and
      # compare merge commits to each parent. awk drains the whole stream.
      git -c color.ui=false log --root -m -p --format= --no-ext-diff --no-textconv -U0 "$revision" -- . "${EXCLUDES[@]}" |
        awk '/^\+/ { print }'
      ;;
    all)
      collect_all
      ;;
    *)
      echo "Unknown mode (use staged|range|all)" >&2
      return 2
      ;;
  esac
}

if ! collect_content > "$CONTENT" 2>/dev/null; then
  echo "Anonymization gate could not collect content; refusing to pass." >&2
  exit 2
fi

FAIL=0
check_pattern() {
  local pattern="$1" label="$2" status=0
  # Write all matches before limiting display: an early pipe consumer can
  # cause SIGPIPE under pipefail and turn a detection into a false negative.
  LC_ALL=C grep -anEi -- "$pattern" "$CONTENT" > "$MATCHES" 2>/dev/null || status=$?
  case "$status" in
    0)
      echo "BLOCKED by $label (matched content redacted)"
      awk -F: 'NR <= 5 { print "  collected input line " $1 }' "$MATCHES"
      FAIL=1
      ;;
    1) ;;
    *)
      echo "Invalid or unreadable $label; refusing to pass." >&2
      FAIL=1
      ;;
  esac
}

RULE=0
for pattern in "${BUILTIN_PATTERNS[@]}"; do
  RULE=$((RULE + 1))
  check_pattern "$pattern" "builtin rule $RULE"
done

if [ -f "$LOCAL_LIST" ]; then
  RULE=0
  while IFS= read -r pattern || [ -n "$pattern" ]; do
    RULE=$((RULE + 1))
    [ -z "$pattern" ] && continue
    case "$pattern" in \#*) continue ;; esac
    check_pattern "$pattern" "local rule $RULE"
  done < "$LOCAL_LIST"
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Anonymization gate failed. Remove the flagged content; never bypass this check."
  exit 1
fi
echo "Anonymization gate passed ($MODE)."
