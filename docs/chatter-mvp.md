# Chatter MVP

## Summary

- Build Chatter as a `pnpm` monorepo with four packages: `core`, `cli`, `daemon`, and `ui`.
- Keep `.chatter/` as the only persisted coordination state.
- Treat Claude Code and Codex as external agents. Chatter creates artifacts, validates them, and guides the human through the next step.
- Keep setup strictly repo-local. Update bounded sections in `CLAUDE.md` and `AGENTS.md` when needed, but never mutate `~/.claude` or `~/.codex`.
- Default to planning-only behavior unless a human explicitly asks for implementation work.

## Intended package boundaries

- `packages/core`: schemas, filesystem repo, task engine, adapters, validation, diffing, derived views, logging, shared types
- `packages/cli`: Commander commands, terminal formatting, daemon launcher and status client, push and sync handlers, task commands
- `packages/daemon`: Fastify server, watchers, SSE, health endpoints, runtime state, static UI serving
- `packages/ui`: React and Vite SPA consuming the local API

## Persistent workspace contract

`.chatter/` is the only durable coordination state.

Commit when present:

- `.chatter/config.json`
- `.chatter/adapters/*.json`
- `.chatter/shared/*`
- task folders under `.chatter/tasks/`

Ignore when present:

- `.chatter/runtime.json`
- `.chatter/logs/`
- `.chatter/cache/`

## Core domain rules

### Task phases

`new -> planned -> reviewed -> synthesized -> ready`

`blocked` may be entered from any phase when validation or adapter checks fail.

### Artifact ownership

- `brief.md`: CLI or API only
- `claude-summary.md`: Claude pushes
- `codex-summary.md`: Codex pushes
- `disagreements.md`: sync engine only
- `synthesis.md`: Claude or human pushes
- `next-step.md`: sync engine only

### Canonical summary headings

All summary artifacts should use:

- `Facts`
- `Assumptions`
- `Recommendations`
- `Risks`
- `Open questions`

### Adapter expectations

Both adapters should:

- detect the local binary
- capture the tool version
- detect the repo-local instruction file
- avoid mutating global configuration
- refresh repo-local context by updating files instead of trying to mutate live sessions

## CLI and daemon expectations

Planned MVP commands:

- `chatter init`
- `chatter doctor`
- `chatter start`
- `chatter status`
- `chatter task create`
- `chatter task list`
- `chatter task show`
- `chatter push`
- `chatter sync`
- `chatter ui`

The daemon is expected to:

- watch `.chatter/`
- validate changed tasks
- append system events
- compute derived task and shared views
- expose local API and adapter health
- serve built UI assets

## Product defaults

- Node 20+
- `pnpm`
- TypeScript
- Commander
- Zod
- Chokidar
- Fastify
- React
- Vite
- Vitest
- minimal Playwright smoke coverage

## Current repo status

This repository is intentionally only AI-ready right now.

That means:

- no package scaffolding yet
- no implementation yet
- no daemon or UI yet
- no `.chatter/` tree yet

The next implementation steps should be deliberate and requested explicitly.
