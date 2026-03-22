# Chatter Agent Guide

## Current status

- This repository is in AI-readiness mode only.
- Do not assume the product scaffold exists yet.
- Prefer documentation, repo setup, interface design, and planning artifacts until a human asks for feature work.

## Repo-local only

- Keep all agent integration repo-local.
- Never modify `~/.claude`, `~/.codex`, shell profiles, editor settings, or other global machine state unless a human explicitly asks.
- If Claude or Codex integration needs updates, edit only the bounded guidance in this repository.

## Working defaults

- No autonomous commits, pushes, rebases, or branch cleanup.
- No long-running daemons or background processes unless explicitly requested.
- No hidden shell execution on behalf of the product; only user-invoked CLI flows should run commands in the future MVP.
- When unsure, favor planning and surfacing tradeoffs over implementing speculative behavior.

## Source of truth

Read `docs/chatter-mvp.md` before proposing architecture or implementation.

Important constraints from that spec:

- eventual monorepo shape is `packages/core`, `packages/cli`, `packages/daemon`, and `packages/ui`
- `.chatter/` is the only persistent coordination state
- summary headings are `Facts`, `Assumptions`, `Recommendations`, `Risks`, and `Open questions`
- task phases are `new`, `planned`, `reviewed`, `synthesized`, `ready`, with `blocked` from any phase
- artifact ownership matters and should stay explicit

## Implementation posture for future work

- Add structure only when it directly serves the requested task.
- Keep package boundaries crisp and avoid circular dependencies between `core`, `cli`, `daemon`, and `ui`.
- Put shared schemas and domain rules in `core` first.
- Treat `disagreements.md` and `next-step.md` as deterministic derived artifacts, not human-authored content.
- Preserve planning-only defaults unless the user explicitly changes that posture.

## Helpful installed skills on this machine

When relevant, the operator can use the installed universal skills for:

- monorepo management
- advanced TypeScript guidance
- Playwright workflows
- frontend design work

Those skills are optional helpers, not part of the repository contract.
