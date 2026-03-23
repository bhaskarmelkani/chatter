process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext:
        "Before ending the task, confirm whether lint, tests, and build were run. If any were skipped or failed, explain that clearly."
    }
  })
);
