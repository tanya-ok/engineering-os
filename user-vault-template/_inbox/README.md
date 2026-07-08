# _inbox - candidate facts staging

Agents stage candidate facts about you here. This folder is excluded from the
retrieval index (underscore prefix), so unreviewed guesses never ground an
answer.

Each candidate note carries frontmatter:

```yaml
type: candidate-fact
source: <where it surfaced, e.g. a session or a file>
evidence: <verbatim quote or reference that supports it>
```

## Promotion

Review candidates periodically. For each good one, move the fact into the
right curated namespace (`communication/`, `environment/`, or `facts/`),
rewrite it cleanly, and delete the candidate. Discard the rest. Only promoted
notes become part of what the agent retrieves.
