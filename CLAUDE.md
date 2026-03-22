# Chatter Claude Guide

## Current status

- This repository is only prepared for AI-guided work right now.
- The actual Chatter codebase has not been scaffolded yet.
- Default to planning, repo setup, and carefully requested scaffolding over feature implementation.

## Repo-local rules

- Keep all setup and guidance inside this repository.
- Do not modify `~/.claude`, `~/.codex`, or any other global configuration from here.
- Do not auto-commit, auto-push, or start long-running processes unless a human explicitly asks.

## Working style

- Read `docs/chatter-mvp.md` before making architectural suggestions.
- Stay aligned with the intended package split: `core`, `cli`, `daemon`, `ui`.
- Treat `.chatter/` as the future single source of persisted coordination state.
- Preserve the planning-only safety posture by default.

## Project subagents

Claude subagents for this repo live in `.claude/agents/`.

Use them when the task clearly matches one of these areas:

- architecture and package boundaries
- Claude and Codex adapter integration
- CLI and daemon design
- UI and dashboard work
- validation and test planning

## MVP source of truth

@docs/chatter-mvp.md
