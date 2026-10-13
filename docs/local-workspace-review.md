# Local workspace review

This prototype borrows the context → proposal → saved session workflow from
personal-os. It inventories repositories and can request sequential proposals
from a locally installed Ollama model. It does not execute agent commands or
apply proposals. No dependencies are required beyond Node and Git.

```sh
node scripts/workspace.mjs "$WORKSPACE_ROOT" "$REPORT_PARENT/run-001"
node --test scripts/workspace.test.mjs
node scripts/workspace.mjs "$WORKSPACE_ROOT" "$REPORT_PARENT/run-002" --model "$OLLAMA_MODEL" --limit 2
```

The output parent must already exist outside the inspected workspace. Each run
contains a private `report.json` and a self-contained `index.html`. Use a new
output directory for each session; proposals are saved after each repository.
A report contains private repository names and paths: never add it to Git.
The model endpoint defaults to `http://127.0.0.1:11434`. Only numeric loopback
HTTP origins are accepted, redirects are refused, and the selected model must
already be installed. There is no cloud fallback or automatic model download.

Discovery includes nested repositories and repositories with no commits.
Symbolic links, dependency directories, archive, and agent worktrees under
`.claude`, `.codex`, and `.worktrees` are excluded. Other explicitly named Git
worktrees can appear as separate entries. Git status does not acquire optional
locks. Repository scripts, hooks, task trackers, and source files are not run or
read for model context. Metadata does not establish code quality or test status.

Model output is escaped in the HTML report. Empty, truncated, and strongly
repetitive responses fail instead of being treated as usable proposals.
Transport success still does not establish proposal quality: review it yourself.
This prototype does not claim to sandbox a coding agent; no model tools exist.

## Next implementation stages

1. Connect the inventory to the existing Beads dashboard without exposing
   filesystem paths through its public API.
2. Add explicit task selection, repository allowlists, isolated worktrees, and
   a per-repository run ledger before enabling a coding agent.
3. Add reviewable diffs and conflict checks before applying agent changes.
4. Add resumable sessions and source-grounded context. Keep personal and work
   task databases separate.

Do not copy personal-os auto-apply flows or personal domain data. Keep workspace
configuration and execution reports private. These stages need separate tests;
this prototype is a review and planning step, not unattended coding automation.
