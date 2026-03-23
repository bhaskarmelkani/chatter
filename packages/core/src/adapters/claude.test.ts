import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeAdapter } from "./claude.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("ClaudeAdapter.getLimits", () => {
  it("builds an observed 5h window from deduplicated assistant usage logs", async () => {
    const now = Date.UTC(2026, 2, 22, 12, 0, 0);
    const claudeDir = mkdtempSync(join(tmpdir(), "chatter-claude-"));
    tempDirs.push(claudeDir);

    const projectDir = join(claudeDir, "projects", "repo");
    mkdirSync(projectDir, { recursive: true });

    const filePath = join(projectDir, "session.jsonl");
    writeFileSync(
      filePath,
      [
        JSON.stringify({
          type: "assistant",
          timestamp: new Date(now - 60 * 60 * 1000).toISOString(),
          requestId: "req-1",
          sessionId: "session-1",
          message: {
            id: "msg-1",
            role: "assistant",
            usage: {
              input_tokens: 10,
              output_tokens: 20,
              cache_read_input_tokens: 5,
              cache_creation_input_tokens: 0,
              service_tier: "standard",
            },
          },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: new Date(now - 59 * 60 * 1000).toISOString(),
          requestId: "req-1",
          sessionId: "session-1",
          message: {
            id: "msg-1",
            role: "assistant",
            usage: {
              input_tokens: 10,
              output_tokens: 45,
              cache_read_input_tokens: 5,
              cache_creation_input_tokens: 10,
              service_tier: "standard",
            },
          },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
          requestId: "req-older",
          sessionId: "session-2",
          message: {
            id: "msg-2",
            role: "assistant",
            usage: {
              input_tokens: 999,
              output_tokens: 999,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
              service_tier: "standard",
            },
          },
        }),
      ].join("\n"),
      "utf-8",
    );

    const adapter = new ClaudeAdapter({
      claudeDir,
      now: () => now,
    });

    const limits = await adapter.getLimits();

    expect(limits).toHaveLength(1);
    expect(limits[0]).toMatchObject({
      providerId: "claude",
      limitId: "5h window",
      telemetryMode: "observed",
      serviceTier: "standard",
      requestsUsed: 1,
      tokensUsed: 70,
    });
    expect(limits[0].resetsAt).toBe(now - 59 * 60 * 1000 + 5 * 60 * 60 * 1000);
  });
});
