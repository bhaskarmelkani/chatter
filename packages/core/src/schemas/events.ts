import { z } from "zod";

export const EventType = z.enum([
  "session_started",
  "session_ended",
  "prompt_sent",
  "response_received",
  "tool_call_started",
  "tool_call_finished",
  "error_raised",
  "usage_snapshot",
  "limit_snapshot",
]);

export type EventType = z.infer<typeof EventType>;

export const NormalizedEvent = z.object({
  id: z.string().uuid(),
  type: EventType,
  timestamp: z.number(),
  providerId: z.string(),
  sessionId: z.string(),
  turnIndex: z.number().optional(),
  data: z.record(z.unknown()),
  rawRef: z.string().optional(),
});

export type NormalizedEvent = z.infer<typeof NormalizedEvent>;

export const UsageData = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().default(0),
  cacheCreationTokens: z.number().default(0),
  model: z.string(),
  estimatedCost: z.number().optional(),
});

export type UsageData = z.infer<typeof UsageData>;

export const LimitData = z.object({
  limitId: z.string(),
  usedPercent: z.number(),
  windowMinutes: z.number(),
  resetsAt: z.number(),
  planType: z.string().optional(),
});

export type LimitData = z.infer<typeof LimitData>;

export const ToolCallData = z.object({
  toolName: z.string(),
  input: z.record(z.unknown()).optional(),
  output: z.string().optional(),
  durationMs: z.number().optional(),
  success: z.boolean().optional(),
});

export type ToolCallData = z.infer<typeof ToolCallData>;

export const PromptData = z.object({
  content: z.string(),
  pastedContents: z.record(z.unknown()).optional(),
});

export type PromptData = z.infer<typeof PromptData>;

export const ResponseData = z.object({
  model: z.string(),
  content: z.string().optional(),
  hasThinking: z.boolean().default(false),
  usage: UsageData.optional(),
});

export type ResponseData = z.infer<typeof ResponseData>;
