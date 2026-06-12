"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/providers/AuthProvider";
import {
  Zap,
  TrendingUp,
  Users,
  Target,
  Trophy,
  Flame,
  Bot,
  CheckCircle2,
  Video,
  MessageSquare,
  ChevronRight,
  Layers,
  Sparkles,
  Search,
  Bell,
  Clock,
  Quote,
  Lock,
  AlertCircle,
  Loader
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer
} from "recharts";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PremiumLock } from "@/components/premium/PremiumLock";
import { UpgradeModal } from "@/components/premium/UpgradeModal";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useDashboardLeaderboard, useWeeklyPerformance, useDailyMissions, useDashboardStats,
} from "@/hooks/useDashboardData";
import { useSubscription } from "@/hooks/useSubscription";
import Link from "next/link";
import { User } from "firebase/auth";
import { UserProfile } from "@/lib/db";

// Helper to get display name from Firebase Auth or Firestore profile
function getDisplayName(user: User | null, userData: UserProfile | null): string | null {
  // First try Firestore userData.name (most reliable, set during onboarding)
  if (userData?.name?.trim()) {
    return userData.name.split(' ')[0]; // Return first name
  }
  // Fallback to Firebase Auth displayName (from Google/OAuth)
  if (user?.displayName?.trim()) {
    return user.displayName.split(' ')[0];
  }
  return null;
}

function getFullName(user: User | null, userData: UserProfile | null): string {
  return userData?.name?.trim() || user?.displayName?.trim() || "Explorer";
}

function DashboardContent() {
  const { user, userData, loading: authLoading } = useAuth();
  
  // Debug logging to help diagnose the issue
  useEffect(() => {
    console.log('[Dashboard Debug]', {
      authLoading,
      firebaseUserDisplayName: user?.displayName,
      firestoreUserDataName: userData?.name,
      firestoreUserData: userData ? { ...userData, uid: userData.uid } : null,
    });
  }, [user, userData, authLoading]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [initialUpgradePlan, setInitialUpgradePlan] = useState<'pro' | 'elite' | null>(null);
  const { refreshUserToken } = useSubscription();

  // Fetch real data
  const { leaders, loading: leadersLoading, error: leadersError } = useDashboardLeaderboard(3);
  const { performanceData, loading: perfLoading, error: perfError } = useWeeklyPerformance();
  const { missions, loading: missionsLoading, error: missionsError, completeMission } = useDailyMissions();
  const stats = useDashboardStats();

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

    // Refresh token and subscription status after successful payment
    if (subscriptionSuccess === "success") {
      refreshUserToken().then(() => {
        router.replace("/dashboard");
      });
    }
  }, [router, searchParams, refreshUserToken]);

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
        <div className="flex flex-col gap-8 animate-in fade-in duration-700">

          {/* Top Intelligence Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-4 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="relative">
                {authLoading ? (
                  <div className="w-12 h-12 rounded-2xl bg-muted animate-pulse" />
                ) : (
                  <UserAvatar
                    src={userData?.photoURL || user?.photoURL}
                    name={getFullName(user, userData)}
                    size="lg"
                    className="border-2 border-primary/50 p-1 blue-glow rounded-2xl"
                  />
                )}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-accent rounded-full border-2 border-background flex items-center justify-center cyan-glow">
                  <span className="text-[10px] font-bold text-black">{stats?.level || 1}</span>
                </div>
              </div>
              <div>
                {authLoading ? (
                  <div className="space-y-2">
                    <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold font-headline tracking-tight">
                      Welcome back{getDisplayName(user, userData) ? `, ${getDisplayName(user, userData)}` : ''}
                    </h1>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge className="bg-white/5 text-muted-foreground border-white/10 text-[9px] font-bold px-3 py-0.5 uppercase tracking-widest">{(stats?.tier || 'explorer').toUpperCase()} Tier</Badge>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-bold uppercase tracking-wider">
                        <Clock className="w-3 h-3" /> Streak: {stats?.streak || 0} days
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 md:gap-8">
              <Button onClick={() => setShowUpgrade(true)} className="bg-primary hover:bg-primary/90 rounded-xl h-12 px-6 font-bold blue-glow transition-all active:scale-95 text-xs">
                <Zap className="w-4 h-4 mr-2 fill-white" /> Upgrade for Pro Stats
              </Button>
              <div className="h-10 w-px bg-white/5 hidden md:block" />
              <Button asChild size="icon" variant="ghost" className="rounded-full bg-white/5 relative">
                <Link href="/notifications" aria-label="Notifications">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-background" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Primary Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left Column */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              <GlassCard className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-500" /> Leaderboard
                  </h3>
                  <Link href="/community" aria-label="Open community">
                    <ChevronRight className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-white" />
                  </Link>
                </div>
                {leadersError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-300">Failed to load leaderboard</span>
                  </div>
                )}
                {leadersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {leaders.map((leader, i) => (
                      <div key={leader.uid} className="flex items-center justify-between group cursor-pointer">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-muted-foreground w-3">{i + 1}</span>
                          <UserAvatar
                            src={leader.avatar}
                            name={leader.name}
                            size="sm"
                            className="border border-white/10"
                          />
                          <span className="text-[11px] font-bold group-hover:text-primary transition-colors">{leader.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-muted-foreground">{leader.xp.toLocaleString()} XP</span>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-5 flex flex-col gap-4">
                <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2 text-accent">
                  <Layers className="w-4 h-4" /> Power Tools
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { 
                      icon: <Target className="w-4 h-4" />, 
                      label: "Strategy", 
                      href: "/tools/strategy",
                      description: "AI-powered strategy planning",
                      locked: false,
                      comingSoon: true,
                    },
                    { 
                      icon: <Zap className="w-4 h-4" />, 
                      label: "Autopilot", 
                      href: "/tools/autopilot",
                      locked: true,
                      requiredTier: "pro",
                      description: "Automated growth systems",
                      comingSoon: true,
                    },
                    { 
                      icon: <Users className="w-4 h-4" />, 
                      label: "Network", 
                      href: "/tools/network",
                      locked: true,
                      requiredTier: "pro",
                      description: "Connect with other founders",
                      comingSoon: true,
                    },
                    { 
                      icon: <Search className="w-4 h-4" />, 
                      label: "Insight", 
                      href: "/tools/insights",
                      locked: true,
                      requiredTier: "elite",
                      description: "Advanced analytics & insights",
                      comingSoon: true,
                    }
                  ].map((tool, i) => (
                    <div key={i} className="relative group/tooltip">
                      <button
                        onClick={() => router.push(tool.href)}
                        className={`w-full flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 border border-white/5 hover:border-accent/50 hover:bg-accent/5 transition-all group relative ${tool.locked ? 'opacity-60' : ''}`}
                      >
                        <div className={`mb-1 transition-colors ${tool.locked ? 'text-muted-foreground' : 'text-muted-foreground group-hover:text-accent'}`}>
                          {tool.icon}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-tight">{tool.label}</span>
                        {tool.comingSoon && (
                          <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                          </span>
                        )}
                        {tool.locked && <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-muted-foreground" />}
                      </button>
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 z-50 w-44">
                        <p className="text-[10px] font-medium text-white text-center">
                          {tool.description}
                        </p>
                        <p className="text-[9px] text-primary text-center mt-1">
                          Preview now →
                        </p>
                        {tool.locked && (
                          <p className="text-[9px] text-muted-foreground text-center mt-1 border-t border-border pt-1">
                            Requires {tool.requiredTier} tier
                          </p>
                      )}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-popover" />
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-900/20 to-transparent border border-purple-500/20 relative overflow-hidden group">
                <Sparkles className="absolute top-2 right-2 w-12 h-12 text-purple-500/10 -rotate-12 group-hover:scale-110 transition-transform" />
                <p className="text-sm text-purple-200 leading-relaxed mb-4 relative z-10">
                  {stats?.goal
                    ? `Your current growth goal is ${stats.goal}. Use the AI Coach to keep your roadmap aligned with that focus.`
                    : "Complete your growth profile to unlock a clearer weekly focus from Soma AI."}
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-0.5 w-6 bg-purple-500/50" />
                  <span className="text-[10px] font-bold uppercase text-purple-400">Hub Logic Engine</span>
                </div>
              </div>
            </div>

            {/* Center Column */}
            <div className="lg:col-span-6 flex flex-col gap-8">
              <GlassCard className="p-0 overflow-hidden flex flex-col min-h-[400px]">
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                  <div className="flex flex-col">
                    <h3 className="text-lg font-bold font-headline flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" /> Performance Analytics
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Weekly Activity View</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="border-white/10 hover:bg-white/5 cursor-pointer text-[9px] font-bold uppercase">Activity XP</Badge>
                    <Badge onClick={() => setShowUpgrade(true)} variant="outline" className="border-accent/20 text-accent bg-accent/5 cursor-pointer text-[9px] font-bold uppercase">Unlock Reach Insights <Lock className="w-2 h-2 ml-1" /></Badge>
                  </div>
                </div>
                {perfError && (
                  <div className="p-6 flex items-center gap-2 text-red-300">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Failed to load performance data</span>
                  </div>
                )}
                {perfLoading ? (
                  <div className="p-6 h-[300px] w-full flex items-center justify-center">
                    <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="p-6 h-[300px] w-full">
                    {performanceData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={performanceData}>
                          <defs>
                            <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#1A66FF" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#1A66FF" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                          <XAxis dataKey="name" stroke="#ffffff33" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#ffffff33" fontSize={10} tickLine={false} axisLine={false} />
                          <Area type="monotone" dataKey="xp" stroke="#1A66FF" fillOpacity={1} fill="url(#colorXp)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </div>
                )}
                <div className="p-4 bg-white/5 border-t border-white/5 flex justify-around">
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">TOTAL XP</p>
                    <p className="text-sm font-bold">{stats?.currentXP?.toLocaleString() || 0}</p>
                  </div>
                  <div className="text-center opacity-40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">REACH <Lock className="inline w-2 h-2" /></p>
                    <p className="text-sm font-bold">Locked</p>
                  </div>
                  <div className="text-center opacity-40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">CONV % <Lock className="inline w-2 h-2" /></p>
                    <p className="text-sm font-bold text-green-400">Locked</p>
                  </div>
                </div>
              </GlassCard>

              <div className="rounded-[2.5rem] bg-[#020617] border border-primary/30 p-8 relative overflow-hidden group shadow-[0_0_50px_-12px_rgba(26,102,255,0.2)]">
                <div className="flex items-start gap-6 relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center blue-glow shrink-0 animate-pulse">
                    <Bot className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xl font-bold font-headline flex items-center gap-2">
                        Legacy Mentor <Badge className="bg-white/5 text-muted-foreground border-white/10 uppercase tracking-widest text-[8px]">{(stats?.tier || 'explorer').toUpperCase()}</Badge>
                      </h4>
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                    </div>
                    <p className="text-sm text-blue-100/80 leading-relaxed italic">
                      "{getDisplayName(user, userData) || 'Explorer'}, you've maintained a {stats?.streak || 0}-day streak. Your trajectory is positive. {stats?.tier === 'explorer' ? 'Upgrade to Pro for enhanced insights and high-velocity market audits.' : 'Keep leveraging these tools for maximum impact.'}"
                    </p>
                    <div className="flex gap-4 mt-2">
                      {stats?.tier === 'explorer' && (
                        <button onClick={() => setShowUpgrade(true)} className="text-[10px] font-bold text-primary flex items-center gap-1 uppercase tracking-widest hover:underline">
                          Apply Pro Logic Patch <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              <GlassCard className="p-6 flex flex-col items-center gap-4 text-center bg-gradient-to-b from-accent/5 to-transparent border-t-2 border-t-accent">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center cyan-glow border-2 border-accent/20">
                    <Flame className="w-10 h-10 text-accent animate-bounce" />
                  </div>
                  <div className="absolute -top-2 -right-2 bg-background border border-accent/30 rounded-full px-2 py-0.5 text-[10px] font-bold text-accent">
                    HOT
                  </div>
                </div>
                <div>
                  <h3 className="text-3xl font-bold font-headline uppercase">{String(stats?.streak || 0).padStart(2, '0')} DAYS</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Active Streak</p>
                </div>
                <div className="flex gap-2 w-full">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i < (stats?.streak || 0) ? 'bg-accent cyan-glow' : 'bg-white/5'}`} />
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> Daily Missions
                  </h3>
                </div>
                {missionsError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-300">Failed to load missions</span>
                  </div>
                )}
                {missionsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : missions.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-sm text-muted-foreground">
                    No daily missions are available yet. They are assigned automatically each day.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {missions.map((mission) => {
                      const isLocked = mission.lockedForTier && mission.lockedForTier !== 'explorer' && stats?.tier === 'explorer';
                      return (
                        <div
                          key={mission.id}
                          onClick={() => {
                            if (!isLocked && !mission.completed) {
                              completeMission(mission.id);
                            } else if (isLocked) {
                              setShowUpgrade(true);
                            }
                          }}
                          className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isLocked 
                              ? 'opacity-40 border-dashed border-white/10' 
                              : mission.completed
                              ? 'bg-green-500/5 border-green-500/20'
                              : 'bg-white/5 border-white/5 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              mission.completed 
                                ? 'bg-green-500 border-green-500' 
                                : 'border-white/20 hover:border-primary'
                            }`}>
                              {mission.completed && <CheckCircle2 className="w-3 h-3 text-black" />}
                            </div>
                            <span className={`text-[11px] font-bold ${mission.completed ? 'line-through text-muted-foreground' : 'text-white'}`}>{mission.title}</span>
                          </div>
                          {isLocked ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Badge variant="outline" className="text-[9px] text-accent font-bold border-white/10">{mission.xp > 0 ? `+${mission.xp}` : ''} XP</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>

              <PremiumLock feature="Elite Live Sessions" description="Unlock live sessions when they are scheduled for your membership tier.">
                <GlassCard className="p-5 flex flex-col gap-4 border-l-4 border-l-primary">
                  <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <Video className="w-4 h-4 text-primary" /> Live Sessions
                  </h3>
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-sm text-muted-foreground">
                    No live sessions are scheduled yet.
                  </div>
                </GlassCard>
              </PremiumLock>
            </div>
          </div>
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
