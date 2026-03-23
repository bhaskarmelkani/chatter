import { z } from "zod";

export const SessionStatus = z.enum(["active", "completed", "abandoned"]);

export type SessionStatus = z.infer<typeof SessionStatus>;

export const CaptureFidelity = z.enum(["full", "partial", "shallow"]);

export type CaptureFidelity = z.infer<typeof CaptureFidelity>;

export const TokenUsage = z.object({
  input: z.number().default(0),
  output: z.number().default(0),
  cacheRead: z.number().default(0),
  cacheCreation: z.number().default(0),
});

export type TokenUsage = z.infer<typeof TokenUsage>;

export const Session = z.object({
  id: z.string(),
  providerId: z.string(),
  title: z.string(),
  model: z.string(),
  cwd: z.string(),
  gitBranch: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  tokenUsage: TokenUsage,
  estimatedCost: z.number().default(0),
  turnCount: z.number().default(0),
  toolCallCount: z.number().default(0),
  status: SessionStatus,
  captureFidelity: CaptureFidelity,
  permissionMode: z.string().optional(),
  reasoningEffort: z.string().optional(),
});

export type Session = z.infer<typeof Session>;
