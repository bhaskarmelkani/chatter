# Chatter

This repository is currently set up for agent-guided planning and implementation prep.

The product itself is not scaffolded yet. The repo-local AI setup lives in:

- `AGENTS.md` for Codex
- `CLAUDE.md` for Claude Code
- `.claude/agents/` for shared Claude subagents
- `docs/chatter-mvp.md` for the current MVP source of truth

## Current working agreement

- Keep setup and guidance repo-local.
- Do not modify `~/.claude`, `~/.codex`, or other global config from this repo.
- Default to planning, docs, interfaces, and safe scaffolding unless a human explicitly asks for implementation.
- Do not auto-commit, auto-push, or run long-lived processes unless explicitly requested.
