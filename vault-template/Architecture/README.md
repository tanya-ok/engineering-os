# Architecture

System design decisions and contracts.

- `decisions/`: Architecture Decision Records. Sequentially numbered,
  never deleted, superseded ones marked as such. Template:
  `decisions/adr-template.md`.
- `contracts/`: interface contracts between systems (API shapes, event
  schemas, data ownership boundaries).
- Capacity and disaster-recovery notes live at this level.

Every non-trivial decision gets an ADR. If you argued about it for more than
ten minutes, it deserves a record.
