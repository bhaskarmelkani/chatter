import { lazy, Suspense } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { ActivityIcon, SearchIcon } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePollingApi } from "@/hooks/useApi";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Agents = lazy(() => import("./pages/Agents"));
const AgentDetail = lazy(() => import("./pages/AgentDetail"));
const Limits = lazy(() => import("./pages/Limits"));
const SessionDetail = lazy(() => import("./pages/SessionDetail"));
const SessionExplorer = lazy(() => import("./pages/SessionExplorer"));

interface HealthResponse {
  status: string;
  sseClients: number;
}

interface RouteMeta {
  to: string;
  label: string;
  title: string;
  description: string;
  parent?: {
    to: string;
    label: string;
  };
}

const NAV_ITEMS: RouteMeta[] = [
  {
    to: "/",
    label: "Overview",
    title: "Overview",
    description: "Monitor activity, spend, and provider health.",
  },
  {
    to: "/agents",
    label: "Agents",
    title: "Agents",
    description: "Review installed adapters and inspect provider-specific detail.",
  },
  {
    to: "/sessions",
    label: "Sessions",
    title: "Sessions",
    description: "Search captured work and investigate tool usage.",
  },
  {
    to: "/limits",
    label: "Limits",
    title: "Limits",
    description: "Track quota pressure and upcoming resets.",
  },
];

function getRouteMeta(pathname: string): RouteMeta {
  if (pathname.startsWith("/agents/")) {
    return {
      to: pathname,
      label: "Agent detail",
      title: "Agent detail",
      parent: { to: "/agents", label: "Agents" },
      description: "Inspect adapter health, detection, active sessions, and limits.",
    };
  }

  if (pathname.startsWith("/sessions/")) {
    return {
      to: pathname,
      label: "Session detail",
      title: "Session detail",
      parent: { to: "/sessions", label: "Sessions" },
      description: "Inspect the full prompt, tool, and token trace.",
    };
  }

  const direct = NAV_ITEMS.find((item) =>
    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
  );

  return direct ?? NAV_ITEMS[0];
}

function AppShellFallback() {
  return (
    <div className="grid gap-6">
      <div className="surface-panel grid gap-4 p-6 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="bg-background/70">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-28" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardContent className="pt-2">
            <Skeleton className="h-[320px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-4 pt-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const routeMeta = getRouteMeta(location.pathname);
  const { data: health } = usePollingApi<HealthResponse>("/health", 10000);
  const daemonOnline = health?.status === "ok";

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-20 px-4 pb-0 pt-4 md:px-6 md:pt-6">
          <div className="glass-topbar flex min-h-[76px] flex-wrap items-center gap-4 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger variant="ghost" size="icon" className="-ml-1" />
              <Separator
                orientation="vertical"
                className="hidden h-8 md:block"
              />
              <div className="min-w-0 space-y-1">
                <Breadcrumb>
                  <BreadcrumbList>
                    {routeMeta.parent ? (
                      <>
                        <BreadcrumbItem>
                          <BreadcrumbLink
                            render={<Link to={routeMeta.parent.to} />}
                          >
                            {routeMeta.parent.label}
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                      </>
                    ) : null}
                    <BreadcrumbItem>
                      <BreadcrumbPage>{routeMeta.title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <p className="hidden text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/75 lg:block">
                  Chatter control plane
                </p>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <div className="relative hidden xl:block">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search dashboard"
                  placeholder="Search sessions, models, or providers"
                  className="h-10 w-[320px] rounded-full border-white/70 bg-background/80 pl-9"
                />
              </div>
              <Badge
                variant="outline"
                className="hidden h-10 items-center gap-2 rounded-full border-emerald-200/70 bg-emerald-50/80 px-4 text-emerald-700 md:inline-flex"
              >
                <ActivityIcon className="size-3.5" />
                {daemonOnline ? "Daemon online" : "Checking daemon"}
                {health?.sseClients ? ` • ${health.sseClients} streams` : ""}
              </Badge>
              <Link
                to="/sessions"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Open sessions
              </Link>
              <div className="flex size-10 items-center justify-center rounded-full border border-white/70 bg-background/80 text-sm font-semibold text-foreground shadow-sm">
                CH
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          <Suspense fallback={<AppShellFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/agents/:id" element={<AgentDetail />} />
              <Route path="/sessions" element={<SessionExplorer />} />
              <Route path="/sessions/:id" element={<SessionDetail />} />
              <Route path="/limits" element={<Limits />} />
            </Routes>
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
