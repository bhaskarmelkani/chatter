/* ------------------------------------------------------------------ */
/*  Model pricing table (USD per million tokens)                      */
/* ------------------------------------------------------------------ */

interface ModelPrice {
  input: number;   // $ per 1M input tokens
  output: number;  // $ per 1M output tokens
  cacheRead?: number;
  cacheWrite?: number;
}

const PRICING: Record<string, ModelPrice> = {
  // Claude models
  "claude-opus-4": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3.5-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3.5-haiku": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  "claude-3-haiku": { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 },

  // GPT models
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
  "o3-mini": { input: 1.1, output: 4.4 },

  // Codex / OpenAI agents
  "codex-mini": { input: 1.5, output: 6 },
};

/* ------------------------------------------------------------------ */
/*  Fuzzy model lookup                                                */
/* ------------------------------------------------------------------ */

function findPrice(model: string): ModelPrice | null {
  // Exact match
  if (PRICING[model]) return PRICING[model];

  // Partial match (model string often includes dates like -20250301)
  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(PRICING)) {
    if (lower.includes(key) || key.includes(lower)) return price;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Cost estimation                                                   */
/* ------------------------------------------------------------------ */

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export function estimateCost(model: string, tokens: TokenCounts): number {
  const price = findPrice(model);
  if (!price) return 0;

  const M = 1_000_000;
  let cost = (tokens.input / M) * price.input + (tokens.output / M) * price.output;

  if (tokens.cacheRead && price.cacheRead) {
    cost += (tokens.cacheRead / M) * price.cacheRead;
  }
  if (tokens.cacheWrite && price.cacheWrite) {
    cost += (tokens.cacheWrite / M) * price.cacheWrite;
  }

  return cost;
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `${(usd * 100).toFixed(2)}c`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCacheRatio(input: number, cacheRead: number): string {
  const totalInbound = input + cacheRead;
  if (totalInbound <= 0 || cacheRead <= 0) {
    return "0%";
  }

  return `${Math.round((cacheRead / totalInbound) * 100)}%`;
}
