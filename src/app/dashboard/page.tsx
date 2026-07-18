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
  Loader,
  MessageSquare,
  Plus,
  Sparkles,
  Target,
  Users,
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
import { CreditPurchase } from "@/components/billing/CreditPurchase";
import { PromoRedeemCard } from "@/components/promos/PromoRedeemCard";
import { useAuth } from "@/providers/AuthProvider";
import { useSubscription } from "@/hooks/useSubscription";
import {
  useDailyMissions,
  useDashboardLeaderboard,
  useDashboardStats,
  useWeeklyPerformance,
} from "@/hooks/useDashboardData";
import { authFetch } from "@/lib/clientApi";
import { formatDateTimeSafe } from "@/lib/date-utils";
import { UserProfile } from "@/lib/db";
import { cn } from "@/lib/utils";
import { getPlanLabel, getUpgradeLabel, getUpgradeTarget } from "@/lib/plan-ui";
import { useUserStore } from "@/store/useUserStore";
import { app } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { CreatorCreditBundle } from "@/lib/creator-credit-config";

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

type DashboardSummary = {
  roadmap: {
    generated: boolean;
    progress: number;
    completedSteps: number;
    totalSteps: number;
    stageLabel: string;
    nextStep: {
      id: string;
      label: string;
      href: string;
      completed: boolean;
      detail?: string;
    };
    steps: Array<{
      id: string;
      label: string;
      href: string;
      completed: boolean;
      detail?: string;
    }>;
  };
  recommendations: Array<{
    title: string;
    type: string;
    href: string;
    description: string;
  }>;
  events: Array<{
    id: string;
    eventId?: string;
    title: string;
    description: string;
    eventType: string;
    status: string;
    startsAt: string;
    timezone: string;
    hostName: string | null;
    viewerRsvp?: string | null;
  }>;
  scheduledContent: Array<{
    id: string;
    title: string | null;
    caption: string;
    platform: string;
    status: string;
    scheduledTime: string;
  }>;
  automation: {
    status: "ready" | "needs_schedule" | "needs_connection";
    href: string;
    label: string;
    description: string;
  };
  academy: {
    coursesEnrolled: number;
    lessonsCompleted: number;
    topicsCompleted: number;
    activitySubmissions: number;
    certificatesEarned: number;
    cohortParticipation: number;
    liveSessionAttendance: number;
    pendingActivityReviews: number;
    currentCertificationProgress: number;
    learningStreak: number;
    continueLearning: null | {
      courseTitle: string;
      progressPercent: number;
      nextLessonTitle: string | null;
      href: string;
    };
  } | null;
  activity: {
    communityPosts: number;
    mentorThreads: number;
    scheduledPosts: number;
    connectedAccounts: number;
  };
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
  const { tier } = useUserStore();
  const { leaders, loading: leadersLoading } = useDashboardLeaderboard(4);
  const { performanceData, loading: perfLoading } = useWeeklyPerformance();
  const { missions, loading: missionsLoading, completeMission } = useDailyMissions();
  const stats = useDashboardStats();

  const [mounted, setMounted] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [initialUpgradePlan, setInitialUpgradePlan] = useState<"pro" | "elite" | null>(null);
  const [creditDashboard, setCreditDashboard] = useState<CreditDashboard | null>(null);
  const [creditLoading, setCreditLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [showCreditPurchase, setShowCreditPurchase] = useState(false);
  const upgradeTarget = getUpgradeTarget(tier);
  const planLabel = getPlanLabel(tier);
  const planActionLabel = getUpgradeLabel(tier);

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

  useEffect(() => {
    let active = true;

    const loadSummary = async () => {
      if (!user) {
        setSummaryLoading(false);
        return;
      }

      try {
        setSummaryLoading(true);
        const response = await authFetch("/api/dashboard/summary");
        if (!response.ok) throw new Error("Unable to load dashboard summary.");
        const json = await response.json();
        if (active) setSummary(json);
      } catch {
        if (active) setSummary(null);
      } finally {
        if (active) setSummaryLoading(false);
      }
    };

    void loadSummary();
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
  const roadmapProgress = summary?.roadmap.progress ?? 0;
  const roadmapStage = summary?.roadmap.stageLabel ?? "Starting Point";
  const nextRoadmapStep = summary?.roadmap.nextStep;
  const performanceMax = useMemo(() => {
    return Math.max(...performanceData.slice(-7).map((item: any) => Number(item.xp || item.value || 0)), 0);
  }, [performanceData]);

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
        <CreditPurchase
          isOpen={showCreditPurchase}
          onClose={() => setShowCreditPurchase(false)}
          onPurchase={async (bundle: CreatorCreditBundle) => {
            if (!user?.uid) throw new Error("Please sign in to buy credits.");
            const createCreditPurchase = httpsCallable<
              { bundleId: string; userId: string; idempotencyKey: string },
              { authorizationUrl: string | null; status: string; message?: string }
            >(getFunctions(app), "createPaystackCreditPurchase");
            const result = await createCreditPurchase({
              bundleId: bundle.id,
              userId: user.uid,
              idempotencyKey: `paystack-credits:${user.uid}:${bundle.id}`,
            });
            if (!result.data.authorizationUrl) {
              throw new Error(result.data.message || "Paystack did not return a checkout link.");
            }
            window.location.href = result.data.authorizationUrl;
          }}
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
                    {upgradeTarget ? (
                      <Button
                        onClick={() => {
                          setInitialUpgradePlan(upgradeTarget);
                          setShowUpgrade(true);
                        }}
                        className="h-12 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 font-medium shadow-[0_18px_45px_rgba(91,95,255,0.28)]"
                      >
                        <Crown className="h-4 w-4" />
                        {planActionLabel}
                      </Button>
                    ) : (
                      <Button asChild className="h-12 rounded-[16px] bg-white/[0.06] px-5 font-medium text-white hover:bg-white/[0.1]">
                        <Link href="/settings/billing">
                          <Crown className="h-4 w-4" />
                          Manage Plan
                        </Link>
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Link href="/roadmap" className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/60 p-5 transition hover:bg-white/[0.06]">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white">Continue your journey</p>
                        <ChevronRight className="h-4 w-4 text-[#BFC6D4]" />
                      </div>
                      <p className="mt-2 text-sm text-[#BFC6D4]">
                        {summaryLoading ? "Loading roadmap signal" : nextRoadmapStep?.label || "AI Business Roadmap"}
                      </p>
                      <Progress value={roadmapProgress} className="mt-4 h-2" />
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
                <OperatingCard
                  title="Automation"
                  description={summary?.automation.description || "Connect accounts and schedule content before automation runs."}
                  href={summary?.automation.href || "/social"}
                  icon={Zap}
                  tone="pink"
                />
              </div>
            </section>

            <PromoRedeemCard
              source="dashboard"
              title="Have a founder or launch code?"
              description="Unlock eligible Academy access, Creator Credits, product benefits, or future reseller-rights eligibility from your SDC dashboard."
              onRedeemed={() => {
                router.refresh();
              }}
            />

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
                      <p className="mt-1 text-sm text-[#BFC6D4]">Level {stats?.level || 1} - {roadmapStage}</p>
                    </div>
                    <span className="text-sm text-white">{roadmapProgress}%</span>
                  </div>
                  <Progress value={roadmapProgress} className="mt-4 h-2" />
                  <div className="mt-5 space-y-3">
                    {(summary?.roadmap.steps || []).map((item) => (
                      <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-[14px] px-2 py-1.5 text-sm transition hover:bg-white/[0.04]">
                        <span className="flex items-center gap-3 text-[#BFC6D4]">
                          <CheckCircle2 className={cn("h-4 w-4", item.completed ? "text-[#22C55E]" : "text-[#7E8799]")} />
                          {item.label}
                        </span>
                        <span className="text-[#7E8799]">{item.completed ? "Done" : item.detail || "Open"}</span>
                      </Link>
                    ))}
                    {!summary?.roadmap.steps?.length && (
                      <p className="rounded-[14px] border border-dashed border-white/[0.08] p-3 text-sm text-[#BFC6D4]">
                        Your roadmap signal will appear after your profile loads.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Academy progress</h2>
                    <p className="mt-1 text-sm text-[#BFC6D4]">Continue learning and certification work.</p>
                  </div>
                  <Button asChild variant="ghost" className="rounded-2xl text-[#BFC6D4]">
                    <Link href="/academy">Academy</Link>
                  </Button>
                </div>
                <div className="mt-5 rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-5">
                  {summary?.academy?.continueLearning ? (
                    <Link href={summary.academy.continueLearning.href} className="block rounded-[16px] border border-cyan-400/20 bg-cyan-400/10 p-4 transition hover:bg-cyan-400/15">
                      <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">Continue learning</p>
                      <h3 className="mt-2 font-semibold text-white">{summary.academy.continueLearning.courseTitle}</h3>
                      <p className="mt-1 text-sm text-[#BFC6D4]">{summary.academy.continueLearning.nextLessonTitle || "Open course"}</p>
                      <Progress value={summary.academy.continueLearning.progressPercent} className="mt-4 h-2" />
                    </Link>
                  ) : (
                    <Link href="/academy" className="block rounded-[16px] border border-dashed border-white/[0.08] p-4 text-sm text-[#BFC6D4] hover:bg-white/[0.04]">
                      Enroll in your first SDC Academy course.
                    </Link>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-[14px] bg-white/[0.035] p-3"><p className="text-[#7E8799]">Lessons</p><p className="mt-1 text-lg font-semibold text-white">{summary?.academy?.lessonsCompleted ?? 0}</p></div>
                    <div className="rounded-[14px] bg-white/[0.035] p-3"><p className="text-[#7E8799]">Certificates</p><p className="mt-1 text-lg font-semibold text-white">{summary?.academy?.certificatesEarned ?? 0}</p></div>
                    <div className="rounded-[14px] bg-white/[0.035] p-3"><p className="text-[#7E8799]">Live sessions</p><p className="mt-1 text-lg font-semibold text-white">{summary?.academy?.liveSessionAttendance ?? 0}</p></div>
                    <div className="rounded-[14px] bg-white/[0.035] p-3"><p className="text-[#7E8799]">Streak</p><p className="mt-1 text-lg font-semibold text-white">{summary?.academy?.learningStreak ?? 0}d</p></div>
                  </div>
                  {(summary?.academy?.pendingActivityReviews || 0) > 0 ? <p className="mt-3 rounded-[14px] border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{summary?.academy?.pendingActivityReviews} activity review pending.</p> : null}
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
                      const rawValue = Math.max(0, Number(item.xp || item.value || 0));
                      const value = performanceMax > 0 ? Math.max(4, Math.min(100, Math.round((rawValue / performanceMax) * 100))) : 0;
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
                {(summary?.recommendations || [
                  { title: "Create with AI Studio", type: "AI Studio", href: "/ai/studio", description: "Turn your next idea into content, media, or a campaign." },
                  { title: "Ask AI Mentor", type: "Mentor", href: "/mentor", description: "Get guidance on the next business move." },
                  { title: "Plan content", type: "Scheduler", href: "/social/calendar?mode=scheduler", description: "Schedule content so your business shows up consistently." },
                  { title: "Founder and MRR progress", type: "Reseller", href: "/reseller", description: "Track reseller rights, links, sales, and payout readiness." },
                ]).map((item) => (
                  <Link key={item.title} href={item.href} className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 transition hover:-translate-y-1 hover:bg-[#1A2140]/85">
                    <Badge className="rounded-full bg-white/[0.06] text-[#BFC6D4]">{item.type}</Badge>
                    <p className="mt-4 text-base font-medium text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[#BFC6D4]">{item.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{planLabel}</h2>
                {upgradeTarget ? (
                  <Button
                    variant="ghost"
                    className="rounded-2xl text-[#BFC6D4]"
                    onClick={() => {
                      setInitialUpgradePlan(upgradeTarget);
                      setShowUpgrade(true);
                    }}
                  >
                    {planActionLabel}
                  </Button>
                ) : (
                  <Button asChild variant="ghost" className="rounded-2xl text-[#BFC6D4]">
                    <Link href="/settings/billing">Manage</Link>
                  </Button>
                )}
              </div>
              <div className="mt-6 flex items-center gap-5">
                <div
                  className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full p-3"
                  style={{
                    background: `conic-gradient(from 180deg,#5B5FFF 0 ${creditUsage}%,rgba(255,255,255,0.08) ${creditUsage}% 100%)`,
                  }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#111827]">
                    <span className="text-2xl font-semibold">{creditLoading ? "--" : `${creditUsage}%`}</span>
                    <span className="text-xs text-[#BFC6D4]">used</span>
                  </div>
                </div>
                  <div className="grid flex-1 gap-3 text-sm">
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Available</span><span className="text-white">{creditDashboard?.snapshot.remainingCredits ?? "--"}</span></div>
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Included monthly</span><span className="text-white">{creditDashboard?.snapshot.monthlyCreditsGranted ?? "--"}</span></div>
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Used this month</span><span className="text-white">{creditDashboard?.snapshot.monthlyCreditsUsed ?? "--"}</span></div>
                  <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>In progress</span><span className="text-white">{creditDashboard?.snapshot.monthlyCreditsReserved ?? "--"}</span></div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Button
                  type="button"
                  onClick={() => setShowCreditPurchase(true)}
                  className="h-11 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Buy Creator Credits
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-[16px] border-white/[0.08] bg-white/[0.03]">
                  <Link href="/settings/credits">View History</Link>
                </Button>
              </div>
              {creditDashboard?.snapshot.monthlyCreditsGranted === 0 && (
                <p className="mt-4 rounded-[16px] border border-[#4F9DFF]/20 bg-[#4F9DFF]/10 p-3 text-sm leading-6 text-[#BFC6D4]">
                  Explorer can enter AI Studio freely. AI generation uses purchased Creator Credits or a Pro/Elite plan.
                </p>
              )}
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
                  <Link href="/events">View all</Link>
                </Button>
              </div>
              <div className="mt-5 space-y-3">
                {summary?.events.length ? (
                  summary.events.map((event) => (
                    <Link
                      key={event.id}
                      href={event.eventId ? `/events/${event.eventId}` : "/events"}
                      className="flex items-center gap-3 rounded-[16px] border border-white/[0.08] bg-[#090B13]/55 p-3 transition hover:bg-white/[0.06]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.06] text-[#4F9DFF]">
                        <CalendarDays className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">
                          {event.title || "Scheduled event"}
                        </span>
                        <span className="mt-1 block text-xs text-[#BFC6D4]">
                          {formatDateTimeSafe(event.startsAt, "Time unavailable")}
                          {event.viewerRsvp === "going" ? " · Going" : ""}
                        </span>
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-white/[0.08] p-5 text-sm leading-6 text-[#BFC6D4]">
                    No live classes are scheduled yet. Events will appear here when admin-run sessions are added.
                  </div>
                )}
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
