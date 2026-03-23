const chunks = [];

for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const filePath =
  payload.tool_response?.filePath ??
  payload.tool_input?.file_path ??
  payload.tool_input?.path ??
  "unknown file";

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `Edited ${filePath}. Before finishing, run the relevant validation commands for this change.`
    }
  })
);
