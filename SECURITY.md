# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"). Please do not open public issues
for security problems.

## Scope notes

- The RAG server binds to 127.0.0.1 by default and has no authentication.
  Do not expose it beyond localhost without putting an authenticating proxy
  in front of it.
- The index database contains the full text of your notes. Treat
  `~/.engineering-os/index.db` with the same care as the vault itself.
