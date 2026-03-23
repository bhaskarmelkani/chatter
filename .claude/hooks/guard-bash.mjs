const chunks = [];

for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const command = payload.tool_input?.command ?? "";
const blockedPatterns = [
  /\bauth\b/i,
  /\bbilling\b/i,
  /\banalytics\b/i,
  /firebase/i,
  /stripe/i,
  /segment/i
];

if (blockedPatterns.some((pattern) => pattern.test(command))) {
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "This repo treats auth, billing, and analytics as sensitive. Ask for explicit user approval before running commands that touch those areas."
    })
  );
}
