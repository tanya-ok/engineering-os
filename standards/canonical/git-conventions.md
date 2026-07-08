# Git conventions

- **Commit format:** `type: Subject`, where type is one of `feat fix docs ci
  chore refactor test security perf`. Subject capitalized, no trailing period,
  imperative, roughly 50-72 characters.
- **Branching:** work on a branch, open a pull request, merge. Adapt to your
  own flow; the one rule that does not bend is the next one.
- **Never bypass checks.** Do not skip hooks or force past a failing gate. If a
  check fails, fix the cause. A green build that was forced is a lie to the
  next person.
- **Commit locally, publish deliberately.** Local commits are cheap and
  unremarkable. Pushing to a remote or opening a PR is an outward-facing action;
  confirm intent first if the repo or the user calls for it.
- **Write messages for a stranger.** The reader is someone six months from now
  deciding whether this commit is the one that broke something. Say what
  changed and why, not how.
