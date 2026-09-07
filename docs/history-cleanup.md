# Review historical author cleanup

The public history contains a workplace email in commit metadata. A normal
pull request merge does not remove those ancestors.

`scripts/prepare-history-cleanup.sh SOURCE NEW_DESTINATION` creates an isolated
mirror, replacing only the email supplied by `EOS_OLD_EMAIL` with
`EOS_NEW_EMAIL`. Supply both privately through environment variables. Never
commit the old email. The tool verifies that the set of file trees is unchanged
and the old email is absent from reachable commits. It never pushes.

Review the mirror's `before-refs.txt` and `after-refs.txt`. Rewriting changes
commit identifiers and removes affected signatures. After the owner merges
pending draft changes, prepare a fresh mirror of the current remote and review
the resulting ref changes before any administrative replacement. Do not merge
the rewritten history back into the old history.

Published replacement requires coordination for branches, tags, existing
clones, and GitHub pull-request references. GitHub caches and hidden references
may retain old objects; review GitHub's sensitive-data removal procedure and
contact support if applicable. Do not claim complete removal from GitHub
based solely on the local mirror check.
