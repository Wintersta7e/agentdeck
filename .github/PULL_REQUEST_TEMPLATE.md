<!--
Keep PR descriptions short. Summary in 1–3 bullets; skip a "Test plan"
section (the checklist below covers it). No AI attribution.
-->

## Summary

-

## Checklist

- [ ] `npm test` passes locally
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] No new ESLint disables without an inline `-- reason`
- [ ] No production code paths touched by a test-only refactor
- [ ] If this changes a user-visible flow: tested in `npm run dev` (Electron)
- [ ] No real third-party names, local filesystem paths, or AI co-authors in the diff or commit messages
