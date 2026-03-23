import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlReader } from "./jsonl.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("JsonlReader", () => {
  it("reads only newly appended lines and preserves offsets", () => {
    const dir = mkdtempSync(join(tmpdir(), "chatter-jsonl-"));
    tempDirs.push(dir);
    const file = join(dir, "events.jsonl");

    writeFileSync(file, `${JSON.stringify({ id: 1 })}\n${JSON.stringify({ id: 2 })}\n`, "utf-8");

    const reader = new JsonlReader();
    expect(reader.readNewLines<{ id: number }>(file)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(reader.readNewLines(file)).toEqual([]);

    appendFileSync(file, `${JSON.stringify({ id: 3 })}\n{"broken"\n`, "utf-8");
    expect(reader.readNewLines<{ id: number }>(file)).toEqual([{ id: 3 }]);

    const restored = new JsonlReader();
    restored.importOffsets(reader.exportOffsets());
    appendFileSync(file, `${JSON.stringify({ id: 4 })}\n`, "utf-8");
    expect(restored.readNewLines<{ id: number }>(file)).toEqual([{ id: 4 }]);
  });
});
