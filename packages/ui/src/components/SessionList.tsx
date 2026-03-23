import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCacheRatio, formatCost, formatTokens } from "../lib/pricing";
import type { SessionSummary } from "../types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  return `${Math.floor(hrs / 24)}d ago`;
}

function durationStr(secs: number): string {
  if (secs < 60) return `${secs}s`;

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;

  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

interface Props {
  sessions: SessionSummary[];
  compact?: boolean;
}

export default function SessionList({ sessions, compact = false }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
        No sessions recorded yet.
      </div>
    );
  }

  return (
    <Table className="min-w-[860px]">
      <TableHeader>
        <TableRow>
          <TableHead>Session</TableHead>
          <TableHead>Provider</TableHead>
          {!compact ? <TableHead className="hidden lg:table-cell">Workspace</TableHead> : null}
          <TableHead>Started</TableHead>
          <TableHead>Runtime</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          {!compact ? <TableHead className="text-right">Cache</TableHead> : null}
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const totalTokens = session.tokensIn + session.tokensOut;

          return (
            <TableRow key={session.id}>
              <TableCell className="min-w-[240px]">
                <div className="space-y-2">
                  <Link
                    to={`/sessions/${session.id}`}
                    className="block text-base font-semibold tracking-[-0.02em] text-foreground transition-colors hover:text-primary"
                  >
                    {session.title || "Untitled session"}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/80">
                      {session.model || "Unknown model"}
                    </span>
                    {session.active ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                      >
                        Live
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="capitalize rounded-full border-border/70 bg-background/80 px-3"
                >
                  {session.provider}
                </Badge>
              </TableCell>
              {!compact ? (
                <TableCell className="hidden max-w-[320px] whitespace-normal break-all lg:table-cell text-muted-foreground">
                  {session.project || "Unknown workspace"}
                </TableCell>
              ) : null}
              <TableCell className="text-muted-foreground">
                {timeAgo(session.startedAt)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {durationStr(session.duration)}
              </TableCell>
              <TableCell className="text-right font-semibold text-foreground">
                {formatTokens(totalTokens)}
              </TableCell>
              {!compact ? (
                <TableCell className="text-right text-muted-foreground">
                  {formatCacheRatio(session.tokensIn, session.cacheRead)}
                </TableCell>
              ) : null}
              <TableCell className="text-right font-semibold text-foreground">
                {formatCost(session.cost)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
