#!/usr/bin/env bash
# Exercise the public gate in disposable repositories, without real user data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/eos-anonymization-test.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME='Test Author' GIT_COMMITTER_NAME='Test Author'
export GIT_AUTHOR_EMAIL='test@example.invalid' GIT_COMMITTER_EMAIL='test@example.invalid'
REDACTION_MARKER=synthetic-private-marker
SECRET="$(printf '/%s/%s/' home "$REDACTION_MARKER")"
PASSED=0

new_repo() {
  mkdir -p "$TEST_ROOT/$1/scripts"
  cd "$TEST_ROOT/$1"
  git init -q
  git config core.hooksPath /dev/null
  cp "$SCRIPT_DIR/anonymization-check.sh" scripts/
  printf 'scripts/anonymization-patterns.local.txt\nignored.txt\n' > .gitignore
  printf 'Portable sample data\n' > note.txt
  git add .
  git commit -qm 'Initial fixture'
  git update-ref refs/remotes/origin/main HEAD
}

expect() {
  local expected="$1" mode="$2" label="$3" status=0 output
  output="$(bash scripts/anonymization-check.sh "$mode" 2>&1)" || status=$?
  if [ "$status" -ne "$expected" ]; then
    printf 'FAIL: %s (expected exit %s, got %s)\n' "$label" "$expected" "$status" >&2
    exit 1
  fi
  case "$output" in
    *"$REDACTION_MARKER"*) echo "FAIL: matched content was disclosed" >&2; exit 1 ;;
  esac
  PASSED=$((PASSED + 1))
  printf 'PASS: %s\n' "$label"
}

new_repo clean
expect 0 all 'Clean working tree passes'
expect 0 staged 'Empty staged diff passes'
expect 0 range 'Empty commit range passes'
printf '%s\n' "$SECRET" > ignored.txt
expect 0 all 'Ignored local file is excluded'
printf '%s\n' "$SECRET" > untracked.txt
expect 1 all 'Nonignored untracked file is scanned'
rm untracked.txt
printf '%s\n' "$SECRET" > 'untracked file with spaces.txt'
expect 1 all 'Untracked filename with spaces is handled'

new_repo many
awk -v secret="$SECRET" 'BEGIN { for (i = 0; i < 20000; i++) print secret }' > note.txt
expect 1 all 'Many matches fail without SIGPIPE bypass'
git add note.txt
printf 'Clean unstaged content\n' > note.txt
expect 1 staged 'Staged content is checked independently of the working tree'

new_repo history
printf '%s\n' "$SECRET" > note.txt
git add note.txt
git commit -qm 'Introduce synthetic leak'
printf 'Portable sample data\n' > note.txt
git add note.txt
git commit -qm 'Remove synthetic leak'
expect 0 all 'Current tree is clean after removal'
expect 1 range 'Introduced then removed content is found in history'
git update-ref -d refs/remotes/origin/main
expect 1 range 'Missing upstream scans reachable history'

new_repo private_rule
printf 'synthetic-private-marker\n' > scripts/anonymization-patterns.local.txt
printf '%s\n' 'synthetic-private-marker' > note.txt
expect 1 all 'Local rules are enforced'
printf '[\n' > scripts/anonymization-patterns.local.txt
expect 1 all 'Invalid local expression fails closed'
printf 'All %s anonymization regression checks passed.\n' "$PASSED"
