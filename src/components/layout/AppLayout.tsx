"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Crown,
  Globe2,
  LayoutDashboard,
  LibraryBig,
  Menu,
  MessageSquare,
  PackageCheck,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  UserCircle,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Navbar } from "./Navbar";
import { GrowthEngine } from "../growth-engine/GrowthEngine";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserStore } from "@/store/useUserStore";
import { cn } from "@/lib/utils";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
};

const primaryNav: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Community", href: "/community", icon: Users },
  { name: "AI Studio", href: "/ai/studio", icon: Sparkles },
  { name: "AI Mentor", href: "/mentor", icon: Bot },
  { name: "Marketplace", href: "/marketplace", icon: Store },
  { name: "Resources", href: "/my-courses", icon: LibraryBig },
  { name: "Events", href: "/social/calendar", icon: CalendarDays },
];

const businessNav: NavItem[] = [
  { name: "Social Hub", href: "/social", icon: ShoppingBag },
  { name: "Products", href: "/marketplace", icon: Package },
  { name: "Analytics", href: "/tools/insights", icon: BarChart3 },
  { name: "Sales", href: "/reseller", icon: BriefcaseBusiness },
  { name: "Website Tools", href: "/tools", icon: Globe2 },
];

const accountNav: NavItem[] = [
  { name: "Profile", href: "/profile", icon: UserCircle },
  { name: "Billing", href: "/settings/billing", icon: CreditCard },
  { name: "Subscription", href: "/settings/credits", icon: PackageCheck },
  { name: "Settings", href: "/settings", icon: Settings },
];

const SIDEBAR_COLLAPSED_KEY = "sdc-sidebar-collapsed";

function NavSection({
  title,
  items,
  onNavigate,
  collapsed = false,
}: {
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className={cn("space-y-2.5", collapsed && "space-y-2")}>
      <p className={cn("px-3 text-[10px] font-medium uppercase tracking-[0.2em] text-[#7E8799]", collapsed && "sr-only")}>{title}</p>
      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.name : undefined}
              className={cn(
                "group flex h-11 items-center gap-3 rounded-[16px] px-3 text-sm text-[#BFC6D4] transition-all duration-200 hover:bg-white/[0.06] hover:text-white",
                active && "bg-gradient-to-r from-[#5B5FFF]/28 via-[#8B5CF6]/22 to-[#4F9DFF]/14 text-white shadow-[0_14px_38px_rgba(91,95,255,0.16)]",
                collapsed && "relative h-12 justify-center px-0"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-white" : "text-[#7E8799] group-hover:text-white")} />
              <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{item.name}</span>
              {item.badge ? (
                <span
                  className={cn(
                    "rounded-full bg-[#8B5CF6] px-2 py-0.5 text-[10px] font-medium text-white",
                    collapsed && "absolute right-1.5 top-1.5 min-w-4 px-1 text-[9px]"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export const AppLayout = ({ children }: React.PropsWithChildren) => {
  const pathname = usePathname();
  const { user, userData } = useAuth();
  const { level, tier } = useUserStore();
  const { unreadCount } = useNotifications(user?.uid);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const useProductShell = Boolean(user) && pathname !== "/" && !pathname.startsWith("/admin");
  const planLabel = tier ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)} Plan` : "Pro Plan";
  const accountName = userData?.name || user?.displayName || "Creator";
  const navWithMessages = React.useMemo<NavItem[]>(
    () => [
      ...primaryNav,
      { name: "Messages", href: "/notifications", icon: MessageSquare, badge: unreadCount > 0 ? unreadCount : undefined },
    ],
    [unreadCount]
  );

  React.useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  const toggleSidebarCollapsed = React.useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  if (!useProductShell) {
    return (
      <div className="min-h-screen flex flex-col relative">
        <div className="animated-bg">
          <div className="absolute inset-0 grid-bg opacity-30" />
          <div className="glow-particle w-[400px] h-[400px] bg-primary top-[-10%] left-[-5%] animate-pulse-glow" />
          <div className="glow-particle w-[500px] h-[500px] bg-accent bottom-[-20%] right-[-10%] animate-pulse-glow animation-delay-2000" />
          <div className="glow-particle w-[300px] h-[300px] bg-purple-600 top-[30%] right-[15%] animate-pulse-glow animation-delay-1000 opacity-10" />
        </div>
        <Navbar />
        <main className="flex-1 relative z-10 w-full max-w-7xl mx-auto px-4 md:px-8 py-8">
          {children}
        </main>
        <GrowthEngine />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090B13] text-white">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <aside
            className="flex h-full w-[min(22rem,86vw)] flex-col border-r border-white/[0.06] bg-[#090B13] px-5 py-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-8 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMobileNavOpen(false)}>
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6]">
                  <Zap className="h-5 w-5 fill-white text-white" />
                </div>
                <div>
                  <p className="text-2xl font-semibold leading-none tracking-tight">SDC</p>
                  <p className="mt-1 text-xs text-[#BFC6D4]">Soma Digital Community</p>
                </div>
              </Link>
              <Button variant="ghost" size="icon" className="rounded-2xl text-[#BFC6D4]" onClick={() => setMobileNavOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 space-y-7 overflow-y-auto">
              <NavSection title="Operating system" items={navWithMessages} onNavigate={() => setMobileNavOpen(false)} />
              <div className="h-px bg-white/[0.06]" />
              <NavSection title="Business" items={businessNav} onNavigate={() => setMobileNavOpen(false)} />
              <div className="h-px bg-white/[0.06]" />
              <NavSection title="Account" items={accountNav} onNavigate={() => setMobileNavOpen(false)} />
            </div>
            <div className="mt-5 rounded-[18px] border border-white/[0.08] bg-[#151A2E]/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.32)]">
              <p className="text-sm font-medium">SDC {planLabel}</p>
              <p className="mt-1 text-xs leading-5 text-[#BFC6D4]">Premium AI workflows, execution tools, and operating intelligence.</p>
              <Button className="mt-4 h-10 w-full rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] text-sm font-medium">
                Upgrade
              </Button>
            </div>
          </aside>
        </div>
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-white/[0.06] bg-[#090B13]/95 py-6 shadow-2xl backdrop-blur-2xl transition-[width,padding] duration-300 ease-out lg:flex lg:flex-col",
          sidebarCollapsed ? "w-[88px] px-4" : "w-72 px-6"
        )}
      >
        <div className={cn("mb-9 flex items-center", sidebarCollapsed ? "justify-center" : "justify-between gap-3")}>
          <Link href="/dashboard" className={cn("flex items-center gap-3", sidebarCollapsed && "justify-center")} title={sidebarCollapsed ? "SDC Dashboard" : undefined}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] shadow-[0_18px_50px_rgba(91,95,255,0.32)]">
              <Zap className="h-6 w-6 fill-white text-white" />
            </div>
            <div className={cn("min-w-0 transition-opacity duration-200", sidebarCollapsed && "sr-only")}>
              <p className="text-3xl font-semibold leading-none tracking-tight">SDC</p>
              <p className="mt-1 text-xs text-[#BFC6D4]">Soma Digital Community</p>
            </div>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden h-10 w-10 rounded-[16px] border border-white/[0.06] bg-white/[0.03] text-[#BFC6D4] hover:bg-white/[0.08] hover:text-white lg:inline-flex",
              sidebarCollapsed && "absolute -right-5 top-7 bg-[#111827] shadow-xl"
            )}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <div className={cn("flex-1 space-y-7 overflow-y-auto", sidebarCollapsed ? "pr-0" : "pr-1")}>
          <NavSection title="Operating system" items={navWithMessages} collapsed={sidebarCollapsed} />
          <div className={cn("h-px bg-white/[0.06]", sidebarCollapsed && "mx-3")} />
          <NavSection title="Business" items={businessNav} collapsed={sidebarCollapsed} />
          <div className={cn("h-px bg-white/[0.06]", sidebarCollapsed && "mx-3")} />
          <NavSection title="Account" items={accountNav} collapsed={sidebarCollapsed} />
        </div>

        <div
          className={cn(
            "mt-6 rounded-[18px] border border-white/[0.08] bg-[#151A2E]/80 shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-all duration-300",
            sidebarCollapsed ? "p-3" : "p-4"
          )}
        >
          <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#5B5FFF] to-[#8B5CF6]", sidebarCollapsed && "mx-auto mb-0")}>
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div className={cn(sidebarCollapsed && "sr-only")}>
            <p className="text-sm font-medium">SDC {planLabel}</p>
            <p className="mt-1 text-xs leading-5 text-[#BFC6D4]">Unlock premium AI creation, analytics, and execution workflows.</p>
            <Button className="mt-4 h-10 w-full rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] text-sm font-medium shadow-[0_14px_35px_rgba(91,95,255,0.26)]">
              Upgrade
            </Button>
          </div>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-300 ease-out", sidebarCollapsed ? "lg:pl-[88px]" : "lg:pl-72")}>
        <header className="sticky top-0 z-30 flex h-[76px] items-center gap-4 border-b border-white/[0.06] bg-[#090B13]/88 px-4 backdrop-blur-2xl sm:px-6 xl:px-8">
          <Button variant="ghost" size="icon" className="rounded-[16px] text-[#BFC6D4] lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>

          <Link href="/search" className="relative hidden w-full max-w-xl md:block" aria-label="Search SDC">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E8799]" />
            <input
              className="h-12 w-full rounded-[16px] border border-white/[0.08] bg-[#111827]/80 px-11 text-sm text-white outline-none transition-all placeholder:text-[#7E8799] focus:border-[#5B5FFF]/60 focus:ring-4 focus:ring-[#5B5FFF]/10"
              placeholder="Search people, posts, tools, and more..."
              readOnly
            />
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[#BFC6D4] lg:flex">
              <Zap className="mr-1.5 h-3.5 w-3.5 fill-[#4F9DFF] text-[#4F9DFF]" />
              LVL {level}
            </div>
            <Button asChild className="hidden h-11 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-medium shadow-[0_14px_35px_rgba(91,95,255,0.26)] sm:inline-flex">
              <Link href="/ai/studio">
                <Sparkles className="h-4 w-4" />
                Create
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="hidden h-11 w-11 rounded-[16px] border border-white/[0.06] bg-white/[0.03] text-[#BFC6D4] hover:bg-white/[0.08] hover:text-white sm:inline-flex">
              <Link href="/notifications" aria-label="Messages">
                <MessageSquare className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative h-11 w-11 rounded-[16px] border border-white/[0.06] bg-white/[0.03] text-[#BFC6D4] hover:bg-white/[0.08] hover:text-white">
              <Link href="/notifications" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-2 top-2 min-h-2 min-w-2 rounded-full bg-[#EF4444] ring-2 ring-[#090B13]" />
                )}
              </Link>
            </Button>
            <Link href="/profile" className="hidden items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.07] sm:flex">
              <UserAvatar src={userData?.photoURL || userData?.avatarUrl} name={userData?.name} size="sm" />
              <div className="min-w-0">
                <p className="max-w-[150px] truncate text-sm font-medium">{accountName}</p>
                <p className="text-xs text-[#BFC6D4]">{planLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-[#7E8799]" />
            </Link>
          </div>
        </header>

        <main className="relative min-h-[calc(100vh-76px)] overflow-hidden px-4 py-8 sm:px-6 sm:py-9 xl:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(79,157,255,0.16),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(139,92,246,0.16),transparent_34%)]" />
          <div className="relative mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
      <GrowthEngine />
    </div>
  );
};
