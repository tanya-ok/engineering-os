#!/usr/bin/env bash
# Prepare an isolated mirror for review. Never publish from this script.
set -euo pipefail
: "${EOS_OLD_EMAIL:?Set the author email to replace}"
: "${EOS_NEW_EMAIL:?Set the replacement public email}"
SOURCE="${1:?Source repository required}"
DEST="${2:?New destination directory required}"
[ ! -e "$DEST" ] || { echo 'Destination must not exist.' >&2; exit 1; }
git clone --mirror --no-hardlinks "$SOURCE" "$DEST"
cd "$DEST"
git for-each-ref --format='%(refname) %(objectname)' > before-refs.txt
git rev-list --all | while read -r commit; do git show -s --format=%T "$commit"; done | sort -u > before-trees.txt
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --env-filter '
if [ "$GIT_AUTHOR_EMAIL" = "$EOS_OLD_EMAIL" ]; then
  export GIT_AUTHOR_EMAIL="$EOS_NEW_EMAIL"
fi
if [ "$GIT_COMMITTER_EMAIL" = "$EOS_OLD_EMAIL" ]; then
  export GIT_COMMITTER_EMAIL="$EOS_NEW_EMAIL"
fi
' --tag-name-filter cat -- --all >/dev/null
# Originals remain in the source repository; remove only mirror backup refs.
git for-each-ref --format='%(refname)' refs/original | while read -r ref; do git update-ref -d "$ref"; done
git rev-list --all | while read -r commit; do git show -s --format=%T "$commit"; done | sort -u > after-trees.txt
cmp before-trees.txt after-trees.txt
while read -r ref old; do
  [ "$(git rev-parse "$old^{tree}")" = "$(git rev-parse "$ref^{tree}")" ] || {
    echo 'A branch file tree changed; refusing verification.' >&2
    exit 1
  }
done < before-refs.txt
if git log --all --format='%ae%n%ce' | awk -v old="$EOS_OLD_EMAIL" '$0 == old { found=1 } END { exit !found }'; then
  echo 'Identity cleanup verification failed.' >&2
  exit 1
fi
git for-each-ref --format='%(refname) %(objectname)' > after-refs.txt
echo 'Prepared mirror: all file trees preserved, target email absent from reachable commits. Nothing published.'
