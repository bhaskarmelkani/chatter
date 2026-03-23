import { z } from "zod";
import { EventType } from "./events.js";

export const CaptureMode = z.enum(["passive", "import"]);

export type CaptureMode = z.infer<typeof CaptureMode>;

export const AdapterManifest = z.object({
  id: z.string(),
  name: z.string(),
  captureModes: z.array(CaptureMode),
  eventTypes: z.array(EventType),
  dataLocations: z.array(z.string()),
  version: z.string(),
});

export type AdapterManifest = z.infer<typeof AdapterManifest>;

export const HealthStatus = z.enum(["ok", "degraded", "error"]);

export type HealthStatus = z.infer<typeof HealthStatus>;

export const DetectionResult = z.object({
  installed: z.boolean(),
  version: z.string().optional(),
  dataPath: z.string().optional(),
});

export type DetectionResult = z.infer<typeof DetectionResult>;

export const HealthResult = z.object({
  status: HealthStatus,
  details: z.string(),
});

export type HealthResult = z.infer<typeof HealthResult>;

export const ActiveSession = z.object({
  sessionId: z.string(),
  pid: z.number().optional(),
  cwd: z.string(),
  startedAt: z.number(),
  model: z.string().optional(),
});

export type ActiveSession = z.infer<typeof ActiveSession>;

export const LimitSnapshot = z.object({
  providerId: z.string(),
  limitId: z.string(),
  usedPercent: z.number().optional(),
  windowMinutes: z.number(),
  resetsAt: z.number(),
  planType: z.string().optional(),
  serviceTier: z.string().optional(),
  requestsUsed: z.number().optional(),
  requestsLimit: z.number().optional(),
  tokensUsed: z.number().optional(),
  tokensLimit: z.number().optional(),
  telemetryMode: z.enum(["native", "observed"]).optional(),
  description: z.string().optional(),
  capturedAt: z.number(),
});

export type LimitSnapshot = z.infer<typeof LimitSnapshot>;
