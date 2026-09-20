#!/usr/bin/env bash
set -euo pipefail
SCAN_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scan-secrets.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
cd "$FIXTURE_DIR"
git init -q
git config user.name Fixture
git config user.email fixture@example.test
cat > .gitleaks.toml <<'CONFIG'
[[rules]]
id = "fixture-secret"
description = "Synthetic regression marker"
regex = 'eos-fixture-[0-9]{12}'
path = '^note.txt$'
CONFIG
git add .gitleaks.toml
git commit -qm 'Clean root'
bash "$SCAN_SCRIPT" > clean.log 2>&1
echo 'PASS: Clean single-commit history scans successfully'
# A separate history makes the matching file part of the root commit.
mkdir with-secret
cp .gitleaks.toml with-secret/
cd with-secret
git init -q
git config user.name Fixture
git config user.email fixture@example.test
marker="eos-fixture-$(printf '%012d' 123)"
printf '%s\n' "$marker" > note.txt
git add .gitleaks.toml note.txt
git commit -qm 'Root containing synthetic marker'
expect_detection() {
  local status=0
  bash "$SCAN_SCRIPT" > "$FIXTURE_DIR/result.log" 2>&1 || status=$?
  [ "$status" -eq 1 ] || { echo "Expected detection, got $status"; exit 1; }
  if grep -Fq "$marker" "$FIXTURE_DIR/result.log"; then
    echo 'Matched content was not redacted'
    exit 1
  fi
}
expect_detection
echo 'PASS: Root-commit marker is detected and redacted'
git rm -q note.txt
git commit -qm 'Remove synthetic marker'
expect_detection
echo 'PASS: Marker removed in a later commit remains detectable'
