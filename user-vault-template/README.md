# User vault

A durable model of you: how you communicate, what your local environment looks
like, and the stable facts an agent should know to work well with you. This is
the counterpart to the AI vault. The AI vault is what the agent knows about
itself; this is what it knows about you.

Reading is unified: this vault is indexed with the others. Writing is
deliberately restricted. The curated namespaces below are edited by you (or by
a dedicated curation session). Agents do not write into them directly; they
stage candidates in `_inbox/`, which stays out of retrieval until you promote
a note.

## Structure

| Folder | What lives there | Indexed | Who writes |
|---|---|---|---|
| `communication/` | How you write and want to be addressed: tone, length, language, what to avoid | yes | you |
| `environment/` | Your machine, shell, package managers, local utilities, conventions | yes | you |
| `facts/` | Stable facts about you: role, expertise, stances, constraints | yes | you |
| `_inbox/` | Candidate facts an agent noticed, staged for your review | no | agent |

## Why staging matters

An agent will notice things about you mid-work ("prefers pnpm", "works in
fish", "dislikes gamified UI"). Letting it write those straight into the
curated model would fill it with noise and half-right guesses. Instead it
drops a candidate note in `_inbox/` with evidence; you promote the good ones.
The underscore prefix keeps `_inbox/` out of the retrieval index, so unreviewed
guesses never ground an answer.
