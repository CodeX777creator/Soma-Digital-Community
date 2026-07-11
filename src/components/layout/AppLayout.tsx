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
  Home,
  LayoutDashboard,
  LibraryBig,
  Menu,
  MessageSquare,
  Package,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
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

const primaryNav = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Community", href: "/community", icon: Users },
  { name: "AI Studio", href: "/ai/studio", icon: Sparkles },
  { name: "AI Mentor", href: "/mentor", icon: Bot },
  { name: "Marketplace", href: "/marketplace", icon: Store },
  { name: "Resources", href: "/my-courses", icon: LibraryBig },
  { name: "Events", href: "/social/calendar", icon: CalendarDays },
  { name: "Messages", href: "/notifications", icon: MessageSquare },
];

const businessNav = [
  { name: "Products", href: "/marketplace", icon: Package },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { name: "Sales", href: "/reseller", icon: BriefcaseBusiness },
  { name: "Social Hub", href: "/social", icon: ShoppingBag },
];

const accountNav = [
  { name: "Profile", href: "/profile", icon: Users },
  { name: "Billing", href: "/settings/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
];

function NavSection({ title, items }: { title: string; items: typeof primaryNav }) {
  const pathname = usePathname();

  return (
    <div className="space-y-2">
      <p className="px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#7E8799]">{title}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex h-11 items-center gap-3 rounded-2xl px-3 text-sm text-[#BFC6D4] transition-all duration-200 hover:bg-white/[0.06] hover:text-white",
                active && "bg-gradient-to-r from-[#5B5FFF]/30 via-[#8B5CF6]/25 to-[#4F9DFF]/15 text-white shadow-[0_12px_40px_rgba(91,95,255,0.18)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.name}</span>
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
  const useProductShell = Boolean(user) && pathname !== "/" && !pathname.startsWith("/admin");

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
            className="h-full w-[min(22rem,86vw)] border-r border-white/[0.06] bg-[#090B13] px-5 py-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-8 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMobileNavOpen(false)}>
                <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6]">
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
            <div className="space-y-7 overflow-y-auto">
              <NavSection title="Operating system" items={primaryNav} />
              <div className="h-px bg-white/[0.06]" />
              <NavSection title="Business" items={businessNav} />
              <div className="h-px bg-white/[0.06]" />
              <NavSection title="Account" items={accountNav} />
            </div>
          </aside>
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/[0.06] bg-[#090B13]/95 px-6 py-6 shadow-2xl backdrop-blur-2xl lg:flex lg:flex-col">
        <Link href="/dashboard" className="mb-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] shadow-[0_18px_50px_rgba(91,95,255,0.35)]">
            <Zap className="h-6 w-6 fill-white text-white" />
          </div>
          <div>
            <p className="text-3xl font-semibold leading-none tracking-tight">SDC</p>
            <p className="mt-1 text-xs text-[#BFC6D4]">Soma Digital Community</p>
          </div>
        </Link>

        <div className="flex-1 space-y-8 overflow-y-auto pr-1">
          <NavSection title="Operating system" items={primaryNav} />
          <div className="h-px bg-white/[0.06]" />
          <NavSection title="Business" items={businessNav} />
          <div className="h-px bg-white/[0.06]" />
          <NavSection title="Account" items={accountNav} />
        </div>

        <div className="mt-6 rounded-[18px] border border-white/[0.08] bg-[#151A2E]/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5B5FFF] to-[#8B5CF6]">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <p className="text-sm font-medium">SDC {tier || "Pro"}</p>
          <p className="mt-1 text-xs leading-5 text-[#BFC6D4]">Unlock premium AI creation, analytics, and execution workflows.</p>
          <Button className="mt-4 h-10 w-full rounded-2xl bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] text-sm font-medium shadow-[0_14px_35px_rgba(91,95,255,0.28)]">
            Upgrade
          </Button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-[74px] items-center gap-4 border-b border-white/[0.06] bg-[#090B13]/88 px-4 backdrop-blur-2xl sm:px-6 xl:px-8">
          <Button variant="ghost" size="icon" className="rounded-2xl text-[#BFC6D4] lg:hidden" onClick={() => setMobileNavOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="relative hidden w-full max-w-xl md:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E8799]" />
            <input
              className="h-12 w-full rounded-[18px] border border-white/[0.08] bg-[#111827]/80 px-11 text-sm text-white outline-none transition-all placeholder:text-[#7E8799] focus:border-[#5B5FFF]/60 focus:ring-4 focus:ring-[#5B5FFF]/10"
              placeholder="Search people, posts, tools, and more..."
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <Button className="hidden h-11 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-medium shadow-[0_14px_35px_rgba(91,95,255,0.28)] sm:inline-flex">
              <Sparkles className="h-4 w-4" />
              Create
            </Button>
            <Button variant="ghost" size="icon" className="relative h-11 w-11 rounded-2xl border border-white/[0.06] bg-white/[0.03] text-[#BFC6D4] hover:bg-white/[0.08] hover:text-white">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#EF4444]" />}
            </Button>
            <div className="hidden items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 sm:flex">
              <UserAvatar src={userData?.photoURL || userData?.avatarUrl} name={userData?.name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userData?.name || user?.displayName || "Coach Tedd"}</p>
                <p className="text-xs text-[#BFC6D4]">Level {level}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-[#7E8799]" />
            </div>
          </div>
        </header>

        <main className="relative min-h-[calc(100vh-74px)] overflow-hidden px-4 py-8 sm:px-6 xl:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(79,157,255,0.16),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(139,92,246,0.16),transparent_34%)]" />
          <div className="relative mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
      <GrowthEngine />
    </div>
  );
};
