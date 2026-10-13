# Portable portfolio and review evidence

The optional `sources` array in a private dashboard config combines independent
trackers. Each binding supplies `source_id`, `repository_id`, and `source` with
`kind` and `root` (bd) or `path` (jsonl, json, github). All paths are local.
Legacy single-source flags still work and take precedence. Linear is optional;
no tracker credentials, cloud connector or new dependency is required.

Example:

```json
{"sources":[
  {"source_id":"execution","repository_id":"demo","source":{"kind":"bd","root":"$DEMO_REPO"}},
  {"source_id":"stakeholder","repository_id":"demo","source":{"kind":"github","path":"$GITHUB_SNAPSHOT"}}
]}
```

The issue projection contains `work_item` metadata with schema_version
`WorkItem/v1`: source, repository, native ID, normalized/raw status, read/write/
dependency capabilities and observed-at provenance. Identity is a percent-encoded
(source, repository, native ID) tuple. The graph uses that qualified identity;
project membership uses the explicit repository ID. Duplicate IDs inside one
source are refused. JSON snapshots use `{"schema_version":"WorkItems/v1",
"items":[{"id":"1","title":"Review","status":"open"}]}`. The local GitHub-shaped
adapter accepts an issue array, ignores pull requests and declares dependencies
unsupported. It does not fetch APIs or infer issue dependencies.

Unknown status is visible and never ready. Missing blocking dependencies remain
blocked and carry `unresolved: true`; `/api/sources` counts unresolved edges.
Explicit cross-repository references use `target_ref: {source_id, repository_id,
native_id}` on a dependency. Native string IDs remain source-local; the adapter
never guesses a remote target from a display prefix. Portfolio resolution happens
after all source snapshots are loaded, so forward references work.
Each source retains its own last-good snapshot on failure while healthy
sources advance; `/api/sources` reports individual freshness and errors. A stale
snapshot is not proof that work is still ready. No adapter writes tasks or merges
fields between trackers. Configure one authority per field and link related work
explicitly before considering synchronization.

## Local review adapter

Private config `reviews` entries contain unique `id`, local `report` and
`manifest` paths, optional `run_id` for manifests without execution metadata,
and optional `tasks` mapping project -> finding ID -> qualified investigation
ID. Existing coordinator manifest schema version 1 is adapted to
`ReviewEvidence/v1` at `/api/reviews`. The Reviews view shows source revision,
dirty snapshot marker, run ID, incomplete status, finding status and each stage's
vote separately, including Kimi. Missing run IDs stay missing. Unsupported or
missing sources are visible errors; no review is converted into an approval.
Links are explicit and read-only. No task is created or closed by importing a
report, and no private file path is returned to the browser.

## Context and reproducibility

RAG vault and namespace parameters are retrieval filters, not authorization.
Anyone able to reach the unauthenticated local server can query its indexed
vaults. Separate trust domains need separate configs, indexes and processes.
Never attach private vaults, index databases, local overlays or retrieved notes
to cloud review packets. Send only specifically selected public project sources.
Retrieved text remains untrusted data and cannot authorize tools.

Configuration refuses duplicate vault IDs and overlapping vault roots. Startup
refuses old index rows outside the configured scope, including excluded files.
Refresh/rebuild a separately located index before serving a narrower scope.
Index refresh compares chunk content as well as mtime; deleted files are pruned.
Search still serves a snapshot until the operator refreshes it; it is not a live
filesystem watcher. Content changes between indexing and retrieval remain a
freshness limitation. No schema or chunking change is made to existing indexes.

Node >=26 matches both package engines and CI. Setup uses frozen lockfiles.
The model download is a separate first-use step, not proof of offline bootstrap.
The opt-in real-model test checks an English architecture query, a fully Russian
query and invalid top bounds against shipped public templates. Stub tests prove
isolation/freshness mechanics, not multilingual ranking quality.

## Additional review on 2026-10-07

Run `20261007T163527732434Z` completed Claude research, Codex challenge,
Claude response and independent Kimi (7286 tokens) on work-items.ts and store.ts.
All final votes were `needs_test` on F1: source-local dependency qualification
was visible, but input reachability and graph consequences needed omitted code.
The follow-up tests inspect the actual parser and graph. Missing dependencies
already blocked readiness; their graph edges were omitted because no target node
existed. The adapter now marks/counts unresolved edges explicitly and resolves
cross-repository target_ref tuples. Synthetic tests cover both cases. Review
completion remains separate from verification of a broader deployment.
