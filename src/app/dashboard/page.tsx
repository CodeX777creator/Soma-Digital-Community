"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Crown,
  ImageIcon,
  Loader,
  MessageSquare,
  PackageOpen,
  PenLine,
  ShoppingBag,
  Sparkles,
  Target,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { User } from "firebase/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UpgradeModal } from "@/components/premium/UpgradeModal";
import { useAuth } from "@/providers/AuthProvider";
import { useSubscription } from "@/hooks/useSubscription";
import {
  useDailyMissions,
  useDashboardLeaderboard,
  useDashboardStats,
  useWeeklyPerformance,
} from "@/hooks/useDashboardData";
import { authFetch } from "@/lib/clientApi";
import { UserProfile } from "@/lib/db";
import { cn } from "@/lib/utils";

type CreditDashboard = {
  snapshot: {
    remainingCredits: number;
    monthlyCreditsGranted: number;
    monthlyCreditsUsed: number;
    monthlyCreditsReserved: number;
    byokEnabled: boolean;
    providerMode: string;
    resetAt: string;
    nextResetAt: string;
  };
  budgetSummary: {
    monthlyCap: number;
    dailyCap: number;
    concurrentJobs: number;
  };
  recentActivity: Array<{
    entryId: string;
    timestamp: string;
    feature: string;
    providerId: string;
    modelId: string;
    billingSource: string;
    creditsReserved: number;
    creditsCharged: number;
    creditsRefunded: number;
    status: string;
    durationMs: number;
  }>;
};

function getDisplayName(user: User | null, userData: UserProfile | null): string {
  const fullName = userData?.name?.trim() || user?.displayName?.trim() || "Builder";
  return fullName.split(" ")[0];
}

function getFullName(user: User | null, userData: UserProfile | null): string {
  return userData?.name?.trim() || user?.displayName?.trim() || "Digital Builder";
}

function OperatingCard({
  title,
  description,
  href,
  icon: Icon,
  tone = "blue",
}: {
  title: string;
  description: string;
  href: string;
  icon: typeof Sparkles;
  tone?: "blue" | "purple" | "green" | "pink";
}) {
  const toneClass = {
    blue: "from-[#4F9DFF] to-[#5B5FFF]",
    purple: "from-[#5B5FFF] to-[#8B5CF6]",
    green: "from-[#22C55E] to-[#4F9DFF]",
    pink: "from-[#EF4444] to-[#8B5CF6]",
  }[tone];

  return (
    <Link
      href={href}
      className="group rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition-all duration-200 hover:-translate-y-1 hover:border-[#8B5CF6]/35 hover:bg-[#1A2140]/85 hover:shadow-[0_24px_80px_rgba(91,95,255,0.16)]"
    >
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br shadow-[0_14px_35px_rgba(91,95,255,0.24)]", toneClass)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <p className="mt-5 text-base font-medium text-white">{title}</p>
      <p className="mt-2 min-h-10 text-sm leading-6 text-[#BFC6D4]">{description}</p>
      <div className="mt-4 flex items-center gap-2 text-sm text-[#BFC6D4] transition-colors group-hover:text-white">
        Open
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, userData } = useAuth();
  const { refreshUserToken } = useSubscription();
  const { leaders, loading: leadersLoading } = useDashboardLeaderboard(4);
  const { performanceData, loading: perfLoading } = useWeeklyPerformance();
  const { missions, loading: missionsLoading, completeMission } = useDailyMissions();
  const stats = useDashboardStats();

  const [mounted, setMounted] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [initialUpgradePlan, setInitialUpgradePlan] = useState<"pro" | "elite" | null>(null);
  const [creditDashboard, setCreditDashboard] = useState<CreditDashboard | null>(null);
  const [creditLoading, setCreditLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const upgradePlan = searchParams.get("upgrade");
    const subscriptionSuccess = searchParams.get("subscription");

    if (upgradePlan === "pro" || upgradePlan === "elite") {
      setInitialUpgradePlan(upgradePlan);
      setShowUpgrade(true);
      router.replace("/dashboard");
    }

    if (subscriptionSuccess === "success") {
      refreshUserToken().then(() => router.replace("/dashboard"));
    }
  }, [router, searchParams, refreshUserToken]);

  useEffect(() => {
    let active = true;

    const loadCredits = async () => {
      if (!user) {
        setCreditLoading(false);
        return;
      }

      try {
        setCreditLoading(true);
        const response = await authFetch("/api/creator-credits");
        if (!response.ok) throw new Error("Unable to load credits.");
        const json = await response.json();
        if (active) setCreditDashboard(json);
      } catch {
        if (active) setCreditDashboard(null);
      } finally {
        if (active) setCreditLoading(false);
      }
    };

    void loadCredits();
    return () => {
      active = false;
    };
  }, [user]);

  const creditUsage = useMemo(() => {
    if (!creditDashboard?.snapshot.monthlyCreditsGranted) return 0;
    return Math.min(
      100,
      Math.round((creditDashboard.snapshot.monthlyCreditsUsed / creditDashboard.snapshot.monthlyCreditsGranted) * 100)
    );
  }, [creditDashboard]);

  const missionProgress = missions.length
    ? Math.round((missions.filter((mission) => mission.completed).length / missions.length) * 100)
    : 0;

  if (!mounted) return null;

  return (
    <ProtectedRoute>
      <AppLayout>
        <UpgradeModal
          open={showUpgrade}
          onOpenChange={(open) => {
            setShowUpgrade(open);
            if (!open) setInitialUpgradePlan(null);
          }}
          initialPlan={initialUpgradePlan}
        />

        <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
          <section className="space-y-8">
            <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 shadow-[0_30px_90px_rgba(0,0,0,0.36)] backdrop-blur-2xl">
              <div className="relative p-6 sm:p-8 lg:p-10">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_16%,rgba(139,92,246,0.36),transparent_34%),radial-gradient(circle_at_14%_8%,rgba(79,157,255,0.22),transparent_36%)]" />
                <div className="relative space-y-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm text-[#BFC6D4]">Welcome back</p>
                      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        {getDisplayName(user, userData)}, ready to grow?
                      </h1>
                      <p className="mt-4 max-w-2xl text-base leading-7 text-[#BFC6D4]">
                        Your business operating system is ready. Create, learn, connect, sell, and measure from one calm command center.
                      </p>
                    </div>
                    <Button
                      onClick={() => setShowUpgrade(true)}
                      className="h-12 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 font-medium shadow-[0_18px_45px_rgba(91,95,255,0.28)]"
                    >
                      <Crown className="h-4 w-4" />
                      Upgrade plan
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Link href="/roadmap" className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/60 p-5 transition hover:bg-white/[0.06]">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white">Continue your journey</p>
                        <ChevronRight className="h-4 w-4 text-[#BFC6D4]" />
                      </div>
                      <p className="mt-2 text-sm text-[#BFC6D4]">AI Business Roadmap</p>
                      <Progress value={60} className="mt-4 h-2" />
                    </Link>
                    <Link href="/ai/studio" className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/60 p-5 transition hover:bg-white/[0.06]">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white">Your next step</p>
                        <Sparkles className="h-4 w-4 text-[#8B5CF6]" />
                      </div>
                      <p className="mt-2 text-sm text-[#BFC6D4]">Create content with AI</p>
                    </Link>
                    <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/60 p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white">Daily goal</p>
                        <Target className="h-4 w-4 text-[#4F9DFF]" />
                      </div>
                      <p className="mt-2 text-sm text-[#BFC6D4]">{missionProgress}% completed</p>
                      <Progress value={missionProgress} className="mt-4 h-2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-white">Quick actions</h2>
                <p className="mt-1 text-sm text-[#BFC6D4]">Move faster across the SDC ecosystem.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <OperatingCard title="Ask AI Mentor" description="Get guidance on the next business move." href="/mentor" icon={Bot} tone="purple" />
                <OperatingCard title="Go to AI Studio" description="Create images, video, voice, and copy." href="/ai/studio" icon={Sparkles} tone="blue" />
                <OperatingCard title="Post in Community" description="Share progress and get feedback." href="/community" icon={Users} tone="green" />
                <OperatingCard title="Explore Marketplace" description="Find products, templates, and offers." href="/marketplace" icon={ShoppingBag} tone="pink" />
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Business progress</h2>
                    <p className="mt-1 text-sm text-[#BFC6D4]">Your roadmap and activity signal.</p>
                  </div>
                  <Button asChild variant="ghost" className="rounded-2xl text-[#BFC6D4]">
                    <Link href="/roadmap">View roadmap</Link>
                  </Button>
                </div>
                <div className="mt-5 rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">AI Business Roadmap</p>
                      <p className="mt-1 text-sm text-[#BFC6D4]">Level {stats?.level || 1} - Foundation Builder</p>
                    </div>
                    <span className="text-sm text-white">60%</span>
                  </div>
                  <Progress value={60} className="mt-4 h-2" />
                  <div className="mt-5 space-y-3">
                    {["Complete profile", "Join the community", "Ask AI Mentor 3 times", "Create your first post"].map((item, index) => (
                      <div key={item} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-3 text-[#BFC6D4]">
                          <CheckCircle2 className={cn("h-4 w-4", index < 2 ? "text-[#22C55E]" : "text-[#7E8799]")} />
                          {item}
                        </span>
                        <span className="text-[#7E8799]">{index < 2 ? "Done" : "Open"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Weekly performance</h2>
                    <p className="mt-1 text-sm text-[#BFC6D4]">Activity across your operating system.</p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-[#4F9DFF]" />
                </div>
                <div className="mt-6 flex h-52 items-end gap-3">
                  {perfLoading ? (
                    <div className="flex w-full items-center justify-center">
                      <Loader className="h-5 w-5 animate-spin text-[#7E8799]" />
                    </div>
                  ) : performanceData.length ? (
                    performanceData.slice(-7).map((item: any, index: number) => {
                      const value = Math.max(12, Math.min(100, Number(item.xp || item.value || 0)));
                      return (
                        <div key={`${item.name}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                          <div className="flex h-40 w-full items-end rounded-full bg-white/[0.04]">
                            <div
                              className="w-full rounded-full bg-gradient-to-t from-[#5B5FFF] to-[#4F9DFF] shadow-[0_8px_30px_rgba(79,157,255,0.28)]"
                              style={{ height: `${value}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-[#7E8799]">{item.name}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex w-full items-center justify-center text-sm text-[#BFC6D4]">No activity yet.</div>
                  )}
                </div>
              </div>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-white">Recommended for you</h2>
                  <p className="mt-1 text-sm text-[#BFC6D4]">Content and tools aligned with your current stage.</p>
                </div>
                <Button asChild variant="ghost" className="rounded-2xl text-[#BFC6D4]">
                  <Link href="/marketplace">View all</Link>
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { title: "Content That Converts", type: "Course", href: "/marketplace" },
                  { title: "AI Writer Pro", type: "Tool", href: "/ai/studio" },
                  { title: "Start Your Online Business", type: "Guide", href: "/my-courses" },
                ].map((item) => (
                  <Link key={item.title} href={item.href} className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 transition hover:-translate-y-1 hover:bg-[#1A2140]/85">
                    <Badge className="rounded-full bg-white/[0.06] text-[#BFC6D4]">{item.type}</Badge>
                    <p className="mt-4 text-base font-medium text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[#BFC6D4]">Open inside your SDC operating system.</p>
                  </Link>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Your plan</h2>
                <Button variant="ghost" className="rounded-2xl text-[#BFC6D4]" onClick={() => setShowUpgrade(true)}>
                  Manage
                </Button>
              </div>
              <div className="mt-6 flex items-center gap-5">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_180deg,#5B5FFF_0_68%,rgba(255,255,255,0.08)_68%_100%)] p-3">
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#111827]">
                    <span className="text-2xl font-semibold">{creditLoading ? "--" : `${creditUsage}%`}</span>
                    <span className="text-xs text-[#BFC6D4]">used</span>
                  </div>
                </div>
                <div className="grid flex-1 gap-3 text-sm">
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Credits</span><span className="text-white">{creditDashboard?.snapshot.remainingCredits ?? "--"}</span></div>
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Reserved</span><span className="text-white">{creditDashboard?.snapshot.monthlyCreditsReserved ?? "--"}</span></div>
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>BYOK</span><span className="text-white">{creditDashboard?.snapshot.byokEnabled ? "On" : "Off"}</span></div>
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Mode</span><span className="text-white capitalize">{creditDashboard?.snapshot.providerMode || "hybrid"}</span></div>
                </div>
              </div>
              <p className="mt-5 border-t border-white/[0.06] pt-4 text-sm text-[#7E8799]">
                {creditDashboard?.snapshot.nextResetAt
                  ? `Resets ${new Date(creditDashboard.snapshot.nextResetAt).toLocaleDateString()}`
                  : "Credit usage updates automatically."}
              </p>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Daily goals</h2>
                <Target className="h-5 w-5 text-[#4F9DFF]" />
              </div>
              <div className="mt-5 space-y-3">
                {missionsLoading ? (
                  <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin text-[#7E8799]" /></div>
                ) : missions.length ? (
                  missions.slice(0, 4).map((mission) => (
                    <button
                      key={mission.id}
                      type="button"
                      onClick={() => !mission.completed && completeMission(mission.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-white/[0.08] bg-[#090B13]/55 px-4 py-3 text-left transition hover:bg-white/[0.06]"
                    >
                      <span className="flex items-center gap-3 text-sm text-[#BFC6D4]">
                        <CheckCircle2 className={cn("h-4 w-4", mission.completed ? "text-[#22C55E]" : "text-[#7E8799]")} />
                        {mission.title}
                      </span>
                      <span className="text-xs text-[#7E8799]">+{mission.xp} XP</span>
                    </button>
                  ))
                ) : (
                  <p className="rounded-[16px] border border-dashed border-white/[0.08] p-4 text-sm text-[#BFC6D4]">No goals assigned yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Upcoming events</h2>
                <Button asChild variant="ghost" className="rounded-2xl text-[#BFC6D4]">
                  <Link href="/social/calendar">View all</Link>
                </Button>
              </div>
              <div className="mt-5 space-y-4">
                {[
                  ["May 24", "Live Coaching Call", "7:00 PM EAT"],
                  ["May 27", "Content That Converts", "8:00 PM EAT"],
                  ["May 31", "AI Masterclass", "7:00 PM EAT"],
                ].map(([date, title, time]) => (
                  <div key={title} className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] border border-white/[0.08] bg-[#090B13]/55 text-xs text-white">
                      <span className="text-[10px] uppercase text-[#F59E0B]">{date.split(" ")[0]}</span>
                      <span className="font-semibold">{date.split(" ")[1]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{title}</p>
                      <p className="text-xs text-[#BFC6D4]">{time}</p>
                    </div>
                    <Button size="sm" variant="outline" className="rounded-2xl border-white/[0.08] bg-white/[0.04]">Join</Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center gap-3">
                <Bot className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#4F9DFF] to-[#8B5CF6] p-2 text-white" />
                <div>
                  <h2 className="text-lg font-semibold text-white">Ask AI Mentor</h2>
                  <p className="text-sm text-[#BFC6D4]">Your business coach, available 24/7.</p>
                </div>
              </div>
              <Button asChild className="mt-5 h-12 w-full rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] font-medium">
                <Link href="/mentor">
                  Chat with AI Mentor
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Community activity</h2>
                <MessageSquare className="h-5 w-5 text-[#8B5CF6]" />
              </div>
              <div className="mt-5 space-y-4">
                {leadersLoading ? (
                  <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin text-[#7E8799]" /></div>
                ) : leaders.length ? (
                  leaders.map((leader) => (
                    <div key={leader.uid} className="flex items-center gap-3">
                      <UserAvatar src={leader.avatar} name={leader.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{leader.name}</p>
                        <p className="text-xs text-[#BFC6D4]">{leader.xp.toLocaleString()} XP this season</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#BFC6D4]">Community signals will appear here.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
