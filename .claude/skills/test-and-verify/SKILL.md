---
name: test-and-verify
description: Run the repository validation loop for UI and dashboard changes using lint, unit tests, build, and Playwright smoke tests.
---

# test-and-verify

Use this skill whenever a change affects behavior, rendering, navigation, or task interactions.

## Validation Order

1. Run `pnpm lint`.
2. Run `pnpm test`.
3. Run `pnpm build`.
4. Run `pnpm e2e` for navigation or browser-interaction changes.

## Review Checklist

- Types remain strict.
- No unused imports or dead props were introduced.
- Keyboard navigation still works for dashboard flows.
- Any new form uses `react-hook-form` and `zod`.
- The final handoff clearly states what was verified and what was not.
