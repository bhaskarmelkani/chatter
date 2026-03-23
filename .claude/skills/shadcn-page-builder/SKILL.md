---
name: shadcn-page-builder
description: Build or refactor pages using Chatter's dashboard layout, typography, navigation, and shadcn-friendly composition rules.
---

# shadcn-page-builder

Use this skill when building a new page, dashboard section, task detail view, or major content layout.

## Goals

- fit the existing Chatter visual system
- reuse current navigation and content patterns
- prefer shadcn-compatible composition over bespoke UI
- keep the page responsive and accessible

## Workflow

1. Inspect existing layout components in `packages/ui/src/` before changing layout patterns.
2. Prefer existing wrappers and section patterns before creating new layout primitives.
3. If a new reusable component is needed, place it in the shared components directory.
4. For interactive content, compose from existing patterns instead of embedding large one-off logic blocks.
5. Verify responsive behavior, keyboard access, and visual hierarchy.
