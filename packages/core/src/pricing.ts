export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

const PRICING: Record<string, ModelPrice> = {
  "claude-opus-4": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-opus-4-5": {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  "claude-sonnet-4": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-sonnet-4-5": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-3.5-sonnet": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-haiku-4-5": {
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  "claude-3.5-haiku": {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite: 1,
  },
  "claude-3-haiku": {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheWrite: 0.3,
  },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125 },
  "gpt-5.4": { input: 2.5, output: 15, cacheRead: 0.25 },
  "gpt-5-mini": { input: 0.25, output: 2, cacheRead: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cacheRead: 0.005 },
  o1: { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "codex-mini": { input: 1.5, output: 6 },
};

const MODEL_ALIASES: Array<[needle: string, priceKey: string]> = [
  ["claude-sonnet-4-5", "claude-sonnet-4"],
  ["claude-sonnet-4-5", "claude-sonnet-4-5"],
  ["claude-sonnet-4", "claude-sonnet-4"],
  ["claude-opus-4-5", "claude-opus-4-5"],
  ["claude-opus-4", "claude-opus-4"],
  ["claude-haiku-4-5", "claude-haiku-4-5"],
  ["claude-3-5-sonnet", "claude-3.5-sonnet"],
  ["claude-3.5-sonnet", "claude-3.5-sonnet"],
  ["claude-3-5-haiku", "claude-3.5-haiku"],
  ["claude-3.5-haiku", "claude-3.5-haiku"],
  ["claude-3-haiku", "claude-3-haiku"],
  ["gpt-5.4-mini", "gpt-5-mini"],
  ["gpt-5.4", "gpt-5.4"],
  ["gpt-5-mini", "gpt-5-mini"],
  ["gpt-5-nano", "gpt-5-nano"],
  ["gpt-5", "gpt-5"],
  ["gpt-4o-mini", "gpt-4o-mini"],
  ["gpt-4o", "gpt-4o"],
  ["gpt-4-turbo", "gpt-4-turbo"],
  ["o3-mini", "o3-mini"],
  ["o1-mini", "o1-mini"],
  ["o1", "o1"],
  ["codex-mini", "codex-mini"],
];

function findModelPrice(model: string | null | undefined): ModelPrice | null {
  if (!model) {
    return null;
  }

  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const exact = PRICING[normalized];
  if (exact) {
    return exact;
  }

  for (const [needle, priceKey] of MODEL_ALIASES) {
    if (normalized.includes(needle)) {
      return PRICING[priceKey] ?? null;
    }
  }

  if (normalized.startsWith("claude-opus-4-")) {
    return PRICING["claude-opus-4-5"] ?? null;
  }

  if (normalized.startsWith("claude-sonnet-4-")) {
    return PRICING["claude-sonnet-4-5"] ?? null;
  }

  if (normalized.startsWith("claude-haiku-4-")) {
    return PRICING["claude-haiku-4-5"] ?? null;
  }

  for (const [key, price] of Object.entries(PRICING)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return price;
    }
  }

  return null;
}

export function estimateCostUSD(
  model: string | null | undefined,
  tokens: TokenCounts,
): number {
  const price = findModelPrice(model);
  if (!price) {
    return 0;
  }

  const million = 1_000_000;
  let cost =
    (tokens.input / million) * price.input +
    (tokens.output / million) * price.output;

  if (tokens.cacheRead && price.cacheRead) {
    cost += (tokens.cacheRead / million) * price.cacheRead;
  }

  if (tokens.cacheWrite && price.cacheWrite) {
    cost += (tokens.cacheWrite / million) * price.cacheWrite;
  }

  return cost;
}
