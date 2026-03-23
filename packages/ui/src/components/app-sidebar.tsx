import {
  ActivityIcon,
  BotIcon,
  GaugeIcon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  ServerIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const NAVIGATION = [
  { to: "/", label: "Overview", icon: LayoutDashboardIcon },
  { to: "/agents", label: "Agents", icon: BotIcon },
  { to: "/sessions", label: "Sessions", icon: MessagesSquareIcon },
  { to: "/limits", label: "Limits", icon: GaugeIcon },
] as const;

function matchesPath(pathname: string, to: string) {
  if (to === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(to);
}

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border/80 px-3 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/" />}
              size="lg"
              isActive={location.pathname === "/"}
              className="h-auto items-start gap-3 rounded-2xl px-3 py-3 hover:bg-sidebar-accent"
            >
              <div className="flex size-11 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_16px_32px_rgba(8,145,178,0.24)]">
                <ServerIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="font-semibold text-sidebar-foreground">Chatter</span>
                <span className="text-xs font-normal text-sidebar-foreground/60">
                  Local telemetry
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/45">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAVIGATION.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    render={<Link to={item.to} />}
                    isActive={matchesPath(location.pathname, item.to)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/45">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="space-y-4 rounded-[22px] border border-sidebar-border bg-white p-4 text-sm shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
              <div className="flex items-center gap-2 font-medium text-sidebar-foreground">
                <ActivityIcon className="size-4 text-sidebar-primary" />
                Operator mode
              </div>
              <div className="space-y-2 text-xs text-sidebar-foreground/70">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                    Connected
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>API</span>
                  <span className="font-medium text-sidebar-foreground">127.0.0.1:4200</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Mode</span>
                  <span className="font-medium text-sidebar-foreground">Passive capture</span>
                </div>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80 px-3 py-4 text-xs text-sidebar-foreground/55">
        Chatter v0.1
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
