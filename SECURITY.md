# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"). Please do not open public issues
for security problems.

## Scope notes

Both servers are single-user local tools without authentication.

### RAG server (`eos-rag serve`)

- Binds 127.0.0.1 by default. A non-loopback address is refused unless
  `--allow-remote` or `EOS_SERVER_ALLOW_REMOTE=1` is set, and then a warning
  is printed. Do not expose it without an authenticating proxy in front.
- Accepts only `Host` headers naming `127.0.0.1`, `localhost` or `[::1]` on
  the serving port, which blocks DNS rebinding.
- `POST /search` requires `Content-Type: application/json` and rejects a
  foreign `Origin` or a `Sec-Fetch-Site` other than `same-origin` or `none`.
- The index database contains the full text of your notes. Treat
  `~/.engineering-os/index.db` with the same care as the vault itself.

### Work-graph dashboard (`eos-dashboard serve`)

- Binds 127.0.0.1 by default. A non-loopback address is refused unless
  `--allow-remote` or `EOS_DASHBOARD_ALLOW_REMOTE=1` is set.
- The same loopback `Host` allowlist applies to every route, so a rebinding
  page cannot read the API.
- CSRF: POST requests require `Content-Type: application/json`, and `Origin`
  must match the loopback origin the server is bound to.
- Every response carries a Content Security Policy
  (`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`.
- Project and tracker links from the private overlay must be http or https
  URLs. Tracker data is read through read-only exports; agent plans are
  recorded, never executed.
