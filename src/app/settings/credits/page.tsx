"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/providers/AuthProvider";
import { authFetch } from "@/lib/clientApi";
import {
  ArrowLeft,
  CreditCard,
  Sparkles,
  History,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type CreditDashboard = {
  snapshot: {
    plan: string;
    monthlyCreditsGranted: number;
    monthlyCreditsUsed: number;
    monthlyCreditsReserved: number;
    remainingCredits: number;
    byokEnabled: boolean;
    providerMode: string;
    resetAt: string;
    nextResetAt: string;
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
  budgetSummary: {
    monthlyCap: number;
    dailyCap: number;
    concurrentJobs: number;
  };
  creditPolicies: Record<string, number>;
  toolPricing: Record<string, number>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CreditsPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<CreditDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await authFetch("/api/creator-credits");
      setDashboard((await response.json()) as CreditDashboard);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [user?.uid]);

  const remainingPercent = useMemo(() => {
    if (!dashboard) return 0;
    const granted = dashboard.snapshot.monthlyCreditsGranted || 1;
    return Math.max(0, Math.min(100, (dashboard.snapshot.remainingCredits / granted) * 100));
  }, [dashboard]);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto flex max-w-6xl flex-col gap-8 py-8">
          <div className="flex flex-col gap-4">
            <Link href="/settings" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold">Creator Credits</h1>
                <p className="mt-2 text-muted-foreground">
                  Track what is available this month without exposing provider pricing.
                </p>
              </div>
              <Button variant="outline" onClick={loadDashboard} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {loading && <GlassCard className="p-6 text-sm text-muted-foreground">Loading your credit summary...</GlassCard>}

          {dashboard && (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <GlassCard className="p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Remaining</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-cyan-400" />
                    <span className="text-2xl font-semibold">{dashboard.snapshot.remainingCredits}</span>
                  </div>
                </GlassCard>
                <GlassCard className="p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Used</p>
                  <p className="mt-2 text-2xl font-semibold">{dashboard.snapshot.monthlyCreditsUsed}</p>
                </GlassCard>
                <GlassCard className="p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Reserve</p>
                  <p className="mt-2 text-2xl font-semibold">{dashboard.snapshot.monthlyCreditsReserved}</p>
                </GlassCard>
                <GlassCard className="p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Mode</p>
                  <Badge className="mt-2 w-fit uppercase">{dashboard.snapshot.providerMode}</Badge>
                </GlassCard>
              </div>

              <GlassCard className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Monthly balance</h2>
                    <p className="text-sm text-muted-foreground">
                      Resets on {formatDate(dashboard.snapshot.nextResetAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className="uppercase">
                    {dashboard.snapshot.byokEnabled ? "BYOK on" : "SDC credits"}
                  </Badge>
                </div>
                <div className="mt-4">
                  <Progress value={remainingPercent} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>{dashboard.snapshot.remainingCredits} credits left</span>
                  <span>{dashboard.snapshot.monthlyCreditsGranted} credits total</span>
                </div>
              </GlassCard>

              <div className="grid gap-4 lg:grid-cols-3">
                <GlassCard className="p-6 lg:col-span-2">
                  <div className="mb-4 flex items-center gap-2">
                    <History className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-lg font-semibold">Recent activity</h2>
                  </div>
                  <div className="space-y-3">
                    {dashboard.recentActivity.length === 0 && (
                      <p className="text-sm text-muted-foreground">No AI activity yet this month.</p>
                    )}
                    {dashboard.recentActivity.map((entry) => (
                      <div key={entry.entryId} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div>
                          <p className="font-medium capitalize">{entry.feature.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.providerId} / {entry.modelId} · {entry.billingSource}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>{entry.creditsCharged} charged</p>
                          <p>{formatDate(entry.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-lg font-semibold">Budget guardrails</h2>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Daily cap</span>
                      <span>{dashboard.budgetSummary.dailyCap}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Monthly cap</span>
                      <span>{dashboard.budgetSummary.monthlyCap}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Concurrency</span>
                      <span>{dashboard.budgetSummary.concurrentJobs}</span>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-xs text-muted-foreground">
                    Usage is shown as Creator Credits, keeping provider pricing out of the product surface.
                  </div>
                </GlassCard>
              </div>
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
