---
name: domain-status
description: Summarize the current state of one vault domain (CloudOps, DevOps, FinOps, SecOps, Architecture) - its notes, what changed recently, and the open loops that name it. Use before a weekly review, before picking up work in a domain, or when asked "where are we on X".
---

# domain-status

The five domains each hold a different kind of note, so "what is the state of
SecOps" is a different question from "what is the state of FinOps". This skill
collects the raw material for one domain in one pass: the notes it contains,
which changed most recently, and the open loops that mention it.

## Run

```sh
./standards/skills/domain-status/domain-status.sh SecOps
```

`EOS_VAULT_PATH` selects the vault (default: `vault-template`). With no
argument the script lists the available domains.

## Then write the summary

The script gathers, it does not conclude. Read what it prints and write four
lines:

1. **What the domain covers right now** - one line, from the notes present.
2. **What moved** - the recently changed notes and what changed in them.
3. **What is open** - the loops naming this domain, with owners.
4. **What is stale** - notes untouched long enough to be suspect.

Do not invent status for a note you did not read. An empty domain is a finding,
not a gap to fill with plausible text.
