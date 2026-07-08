---
type: runbook
domain: cloudops
status: example
---

# Runbook: rotate TLS certificate on the public load balancer

Example note. Replace with your own runbooks; delete once you have real content.

## Preconditions

- New certificate issued and validated (check expiry and SAN list).
- Change window agreed if the platform requires one.

## Steps

1. Upload the new certificate to the certificate store.
2. Attach it to the load balancer listener alongside the old one.
3. Verify with an explicit handshake test against the listener.
4. Remove the old certificate after the verification passes.
5. Update the expiry date in the monitoring alert.

## Rollback

Reattach the previous certificate; it remains valid until its own expiry.

## Verification

- Handshake test returns the new certificate serial.
- No TLS errors in the load balancer logs for 15 minutes after the swap.
