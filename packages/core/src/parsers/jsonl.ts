import { readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";

/**
 * Incremental JSONL reader that tracks byte offsets to avoid re-reading.
 * Uses seek-based reading for efficiency with large files.
 */
export class JsonlReader {
  private offsets = new Map<string, number>();

  /** Get the current byte offset for a file */
  getOffset(filePath: string): number {
    return this.offsets.get(filePath) ?? 0;
  }

  /** Set the byte offset for a file (e.g., restored from cache) */
  setOffset(filePath: string, offset: number): void {
    this.offsets.set(filePath, offset);
  }

  /** Export all offsets for persistence */
  exportOffsets(): Record<string, number> {
    return Object.fromEntries(this.offsets);
  }

  /** Import offsets from persistence */
  importOffsets(offsets: Record<string, number>): void {
    for (const [path, offset] of Object.entries(offsets)) {
      this.offsets.set(path, offset);
    }
  }

  /**
   * Read new lines from a JSONL file since the last read.
   * Returns parsed JSON objects and updates the internal offset.
   */
  readNewLines<T = unknown>(filePath: string): T[] {
    const offset = this.getOffset(filePath);

    let fileSize: number;
    try {
      fileSize = statSync(filePath).size;
    } catch {
      return [];
    }

    if (fileSize <= offset) {
      return [];
    }

    const bytesToRead = fileSize - offset;
    const buffer = Buffer.alloc(bytesToRead);

    const fd = openSync(filePath, "r");
    try {
      readSync(fd, buffer, 0, bytesToRead, offset);
    } finally {
      closeSync(fd);
    }

    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const results: T[] = [];

    for (const line of lines) {
      try {
        results.push(JSON.parse(line) as T);
      } catch {
        // Skip malformed lines (can happen with partial writes)
      }
    }

    this.offsets.set(filePath, fileSize);
    return results;
  }

  /**
   * Read all lines from a JSONL file (full scan, no offset tracking).
   */
  static readAll<T = unknown>(filePath: string): T[] {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      return [];
    }

    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const results: T[] = [];

    for (const line of lines) {
      try {
        results.push(JSON.parse(line) as T);
      } catch {
        // Skip malformed lines
      }
    }

    return results;
  }
}
