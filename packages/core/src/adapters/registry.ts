import type { Adapter } from "./types.js";

const adapters = new Map<string, Adapter>();

export function registerAdapter(adapter: Adapter): void {
  adapters.set(adapter.manifest.id, adapter);
}

export function getAdapter(id: string): Adapter | undefined {
  return adapters.get(id);
}

export function getAllAdapters(): Adapter[] {
  return Array.from(adapters.values());
}

export function getAdapterIds(): string[] {
  return Array.from(adapters.keys());
}
