process.stdout.write(
  [
    "Project context loaded.",
    "Use pnpm for all commands.",
    "Prefer existing components and patterns before creating new ones.",
    "Stay aligned with the package split: core, cli, daemon, ui.",
    "Run lint, tests, and build before considering work complete."
  ].join("\n")
);
