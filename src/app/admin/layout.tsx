"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Auth, onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, Firestore, getDoc } from "firebase/firestore";
import {
  BarChart3,
  Boxes,
  CreditCard,
  HandCoins,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
  Bell,
  Activity,
  Bot,
  CalendarDays,
  Share2,
  BookOpen,
  Route,
  TicketPercent,
  Search,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";

const navItems = [
  { group: "Operations", label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { group: "Operations", label: "Analytics", href: "/admin/analytics", icon: Activity },
  { group: "Operations", label: "Social Ops", href: "/admin/social-ops", icon: Share2 },
  { group: "Operations", label: "Events", href: "/admin/events", icon: CalendarDays },
  { group: "Business", label: "Users", href: "/admin/users", icon: Users },
  { group: "Business", label: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard },
  { group: "Business", label: "Purchases", href: "/admin/purchases", icon: GraduationCap },
  { group: "Business", label: "Payouts", href: "/admin/payouts", icon: HandCoins },
  { group: "Business", label: "Promos", href: "/admin/promos", icon: TicketPercent },
  { group: "Products", label: "Academy", href: "/admin/academy", icon: BookOpen },
  { group: "Products", label: "Marketplace", href: "/admin/marketplace", icon: Boxes },
  { group: "Products", label: "Content", href: "/admin/content", icon: FileText },
  { group: "Platform", label: "AI Gateway", href: "/admin/ai", icon: Bot },
  { group: "Platform", label: "Onboarding", href: "/admin/onboarding", icon: Route },
  { group: "Platform", label: "Notifications", href: "/admin/system-notifications", icon: Bell },
  { group: "Platform", label: "Settings", href: "/admin/settings", icon: Settings },
];

const quickCreateItems = [
  { label: "Course", href: "/admin/academy/courses/new" },
  { label: "Event", href: "/admin/events" },
  { label: "Marketplace product", href: "/admin/marketplace" },
  { label: "Promo", href: "/admin/promos" },
  { label: "Notification", href: "/admin/system-notifications" },
];

function getInitials(user: User | null) {
  const source = user?.displayName || user?.email || "Admin";
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function hasAdminAccess(profile: Record<string, any> | undefined) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return profile?.isAdmin === true || profile?.role === "admin" || roles.includes("admin");
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [navSearch, setNavSearch] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);

  const isLoginRoute = pathname === "/admin/login";

  const pageTitle = useMemo(() => {
    const active = navItems.find((item) => pathname.startsWith(item.href));
    return active?.label || "Admin";
  }, [pathname]);

  const navGroups = useMemo(() => {
    const term = navSearch.trim().toLowerCase();
    const filtered = navItems.filter((item) => !term || item.label.toLowerCase().includes(term) || item.group.toLowerCase().includes(term));
    return filtered.reduce<Record<string, typeof navItems>>((groups, item) => {
      groups[item.group] = [...(groups[item.group] || []), item];
      return groups;
    }, {});
  }, [navSearch]);

  const breadcrumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean).slice(1);
    return ["Admin", ...parts.map((part) => part.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()))];
  }, [pathname]);

  const parentRoute = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 2) {
      return "/" + parts.slice(0, parts.length - 1).join("/");
    }
    return null;
  }, [pathname]);

  useEffect(() => {
    if (isLoginRoute) {
      setChecking(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth as Auth, async (user) => {
      if (!user) {
        setAdminUser(null);
        setChecking(false);
        router.replace("/admin/login");
        return;
      }

      try {
        const userSnap = await getDoc(doc(db as Firestore, "users", user.uid));
        const profile = userSnap.exists() ? userSnap.data() : undefined;

        if (!hasAdminAccess(profile)) {
          setAdminUser(null);
          await signOut(auth as Auth);
          router.replace("/admin/login");
          return;
        }

        setAdminUser(user);
        setChecking(false);
      } catch {
        setAdminUser(null);
        setChecking(false);
        router.replace("/admin/login");
      }
    });

    return () => unsubscribe();
  }, [isLoginRoute, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await signOut(auth as Auth);
    router.replace("/admin/login");
  };

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#050609] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
          <BarChart3 className="h-4 w-4 text-cyan-300 animate-pulse" />
          Verifying admin access
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050609] text-white">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 flex flex-col border-r border-white/10 bg-[#080a0f]/95 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <Link href="/admin/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
              <BarChart3 className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <p className="text-sm font-semibold">Soma Digital</p>
              <p className="text-[10px] uppercase tracking-widest text-white/45">Admin Console</p>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pt-4 shrink-0">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={navSearch}
              onChange={(event) => setNavSearch(event.target.value)}
              placeholder="Search admin..."
              className="h-10 w-full rounded-2xl border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-300/45"
            />
          </label>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {Object.entries(navGroups).map(([group, items]) => (
            <div key={group}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">{group}</p>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/20"
                          : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-[#050609]/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                {parentRoute && (
                  <Link href={parentRoute} className="rounded-full p-1 -ml-1 hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                )}
                <h1 className="text-base font-semibold">{pageTitle}</h1>
              </div>
              <p className="text-xs text-white/45">{breadcrumbs.join(" / ")}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setQuickOpen((current) => !current)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Quick create</span>
              </button>
              {quickOpen ? (
                <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e14] p-2 shadow-2xl shadow-black/40">
                  {quickCreateItems.map((item) => (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      onClick={() => setQuickOpen(false)}
                      className="block rounded-xl px-3 py-2 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{adminUser?.displayName || "Admin"}</p>
              <p className="text-xs text-white/45">{adminUser?.email}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold ring-1 ring-white/15">
              {adminUser?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={adminUser.photoURL}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                getInitials(adminUser)
              )}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
