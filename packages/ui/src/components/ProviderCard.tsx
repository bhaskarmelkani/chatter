import { Badge } from "@/components/ui/badge";
import type { ProviderHealth } from "../types";

const STATUS_META = {
  healthy: {
    label: "Healthy",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  },
  degraded: {
    label: "Degraded",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  },
  unreachable: {
    label: "Unreachable",
    className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-50",
  },
} as const;

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.round(delta / 60000);

  if (mins <= 1) return "Just updated";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  provider: ProviderHealth;
}

export default function ProviderCard({ provider }: Props) {
  const status = STATUS_META[provider.status] ?? STATUS_META.unreachable;

  return (
    <div className="rounded-[24px] border border-border/70 bg-background/75 p-4 transition-colors hover:bg-background">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="subtle-label">Provider</p>
          <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
            {PROVIDER_LABELS[provider.provider] ?? provider.provider}
          </p>
          <p className="text-sm text-muted-foreground">
            {provider.binary ? "Binary detected locally" : "Binary path unavailable"}
          </p>
        </div>
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="subtle-label">Active sessions</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {provider.activeSessions}
          </p>
        </div>
        <div>
          <p className="subtle-label">Version</p>
          <p className="mt-2 truncate text-sm font-medium text-foreground">
            {provider.version ?? "Unknown"}
          </p>
        </div>
        <div>
          <p className="subtle-label">Freshness</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {relativeTime(provider.lastChecked)}
          </p>
        </div>
      </div>
    </div>
  );
}
