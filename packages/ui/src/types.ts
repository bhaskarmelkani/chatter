/* ------------------------------------------------------------------ */
/*  Shared UI types aligned with the daemon API                       */
/* ------------------------------------------------------------------ */

export type ProviderKind = string;

export type HealthStatus = "healthy" | "degraded" | "unreachable";

export interface ProviderHealth {
  provider: ProviderKind;
  status: HealthStatus;
  version: string | null;
  binary: string | null;
  instructionFile: string | null;
  activeSessions: number;
  lastChecked: string; // ISO timestamp
}

export type TaskPhase =
  | "new"
  | "planned"
  | "reviewed"
  | "synthesized"
  | "ready"
  | "blocked";

export interface TaskSummary {
  id: string;
  title: string;
  phase: TaskPhase;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskSummary {
  brief: string | null;
  claudeSummary: string | null;
  codexSummary: string | null;
  disagreements: string | null;
  synthesis: string | null;
  nextStep: string | null;
  validationErrors: string[];
}

export interface SessionSummary {
  id: string;
  title: string;
  provider: ProviderKind;
  model: string;
  project: string;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  startedAt: string;
  duration: number; // seconds
  active: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  output: string | null;
  startedAt: string;
  durationMs: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  tokensIn?: number;
  tokensOut?: number;
  timestamp: string;
}

export interface SessionDetail extends SessionSummary {
  messages: Message[];
  tools: ToolCall[];
  tokenBreakdown: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface RateLimit {
  provider: ProviderKind;
  tier: string;
  requestsUsed: number;
  requestsLimit: number;
  tokensUsed: number;
  tokensLimit: number;
  resetsAt: string; // ISO timestamp
  pressurePercent?: number;
  windowMinutes?: number;
  planType?: string;
  serviceTier?: string;
  telemetryMode?: "native" | "observed";
  description?: string;
}

export interface SessionBucket {
  bucketStart: string; // ISO start of the trailing one-hour bucket
  label: string; // localized bucket label for chart rendering
  sessions: number;
  activeSessions: number;
  tokens: number;
  cost: number;
}

export interface ProviderBreakdown {
  provider: string;
  status: HealthStatus;
  activeSessions: number;
  sessions24h: number;
  tokens24h: number;
  cost24h: number;
}

export interface WorkspaceRank {
  project: string;
  sessions: number;
  tokens: number;
  cost: number;
}

export interface DashboardMetrics {
  tokensToday: number;
  costToday: number;
  activeSessions: number;
  cacheEfficiency: number; // 0-1
  modelMix: { model: string; tokens: number; cost: number }[];
  recentSessions: SessionSummary[];
  providers: ProviderHealth[];
  limits: RateLimit[];
  // Rolling 24-hour analytics aggregates
  sessionBuckets: SessionBucket[];
  providerBreakdown: ProviderBreakdown[];
  workspaceRanking: WorkspaceRank[];
  healthyCounts: { healthy: number; degraded: number; unreachable: number };
  highPressureCount: number;
}

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  captureModes: string[];
  eventTypes: string[];
  dataLocations: string[];
  version: string;
  health: {
    status: "ok" | "degraded" | "error";
    details: string;
  };
  detection: {
    installed: boolean;
    version?: string;
    dataPath?: string;
  };
}

export interface AgentSession {
  sessionId: string;
  pid?: number;
  cwd: string;
  startedAt: number;
  model?: string;
}

export interface AgentDetail extends AgentSummary {
  activeSessions: AgentSession[];
  limits: RateLimit[];
}
