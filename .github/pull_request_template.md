## Summary

What changed and why.

## Verification

- [ ] `pnpm --dir rag exec biome ci .` and `pnpm --dir dashboard exec biome ci .`
- [ ] `pnpm --dir rag run typecheck` and `pnpm --dir dashboard run typecheck`
- [ ] `pnpm --dir rag test` and `pnpm --dir dashboard test`
- [ ] `pnpm --dir rag run build` and `pnpm --dir dashboard run build`
- [ ] `bash scripts/anonymization-check.sh all`
- [ ] Docs updated if behavior changed (`zensical build --strict`)

## Notes

Security issues go through private reporting, see SECURITY.md, not this PR.
