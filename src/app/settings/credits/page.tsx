"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, onSnapshot } from "firebase/firestore";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/providers/AuthProvider";
import { PromoRedeemCard } from "@/components/promos/PromoRedeemCard";
import { CreditPurchase } from "@/components/billing/CreditPurchase";
import { app, db } from "@/lib/firebase";
import { authFetch, parseApiError } from "@/lib/clientApi";
import {
  activeCreditBundles,
  CREATOR_CREDIT_RETAIL_VALUE_USD,
  CreatorCreditBundle,
  DEFAULT_CREATOR_CREDIT_CONFIG,
  normalizeCreatorCreditConfig,
} from "@/lib/creator-credit-config";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  History,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

type CreditDashboard = {
  snapshot: {
    plan: string;
    monthlyCreditsGranted: number;
    monthlyCreditsUsed: number;
    monthlyCreditsReserved: number;
    purchasedCreditsRemaining?: number;
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
    dailySpent: number;
    monthlySpent: number;
    modelClasses: string[];
  };
  subscription?: {
    plan: string;
    status: string;
    providerMode: string;
  };
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

export default function CreditsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<CreditDashboard | null>(null);
  const [bundles, setBundles] = useState<CreatorCreditBundle[]>(activeCreditBundles(DEFAULT_CREATOR_CREDIT_CONFIG));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreditPurchase, setShowCreditPurchase] = useState(false);

  const loadDashboard = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/creator-credits");
      if (!response.ok) throw await parseApiError(response, "Unable to load Creator Credits.");
      setDashboard((await response.json()) as CreditDashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Creator Credits.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [user?.uid]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, "config", "creatorCredits"), (snap) => {
      const config = snap.exists() ? normalizeCreatorCreditConfig(snap.data()) : DEFAULT_CREATOR_CREDIT_CONFIG;
      setBundles(activeCreditBundles(config));
    });
  }, []);

  const remainingPercent = useMemo(() => {
    if (!dashboard) return 0;
    const granted = Math.max(1, dashboard.snapshot.monthlyCreditsGranted + (dashboard.snapshot.purchasedCreditsRemaining || 0));
    return Math.max(0, Math.min(100, (dashboard.snapshot.remainingCredits / granted) * 100));
  }, [dashboard]);

  const purchaseSuccess = searchParams.get("purchase") === "success" || searchParams.get("credits") === "success";
  const purchasedCredits = dashboard?.snapshot.purchasedCreditsRemaining || 0;
  const includedCredits = dashboard?.snapshot.monthlyCreditsGranted || 0;
  const reservedCredits = dashboard?.snapshot.monthlyCreditsReserved || 0;

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto flex max-w-7xl flex-col gap-8 py-8">
          <div className="flex flex-col gap-4">
            <Link href="/settings" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Creator Credits hub
                </div>
                <h1 className="text-4xl font-bold">Creator Credits</h1>
                <p className="mt-2 max-w-2xl text-muted-foreground">
                  Buy and manage the credits that power Soma AI generation across Studio, Mentor, Image, Video, Voice, and premium workflows.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setShowCreditPurchase(true)} className="bg-gradient-to-r from-blue-600 to-violet-600">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Buy Creator Credits
                </Button>
                <Button variant="outline" onClick={loadDashboard} disabled={loading}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {purchaseSuccess && (
            <GlassCard className="border-emerald-400/30 bg-emerald-400/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                <div>
                  <p className="font-semibold text-emerald-100">Creator Credits purchase received</p>
                  <p className="text-sm text-emerald-100/75">Your balance will update after payment verification completes.</p>
                </div>
              </div>
            </GlassCard>
          )}

          {loading && (
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <GlassCard key={item} className="h-36 animate-pulse p-6">
                  <div className="h-4 w-28 rounded bg-white/10" />
                  <div className="mt-6 h-8 w-20 rounded bg-white/10" />
                </GlassCard>
              ))}
            </div>
          )}

          {!loading && error && (
            <GlassCard className="border-amber-400/30 bg-amber-400/10 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-200" />
                  <div>
                    <p className="font-semibold text-amber-100">Creator Credits are temporarily unavailable</p>
                    <p className="text-sm text-amber-100/75">{error}</p>
                  </div>
                </div>
                <Button onClick={loadDashboard} variant="outline">Retry</Button>
              </div>
            </GlassCard>
          )}

          {dashboard && (
            <>
              <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
                <GlassCard className="overflow-hidden p-6">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-white/45">Available balance</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
                          <Zap className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-4xl font-bold">{dashboard.snapshot.remainingCredits.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">Creator Credits ready to use</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                      <p className="font-medium text-white">Simple value</p>
                      <p className="mt-1">1 Creator Credit = ${CREATOR_CREDIT_RETAIL_VALUE_USD.toFixed(2)} retail value before bundle savings.</p>
                    </div>
                  </div>
                  <div className="mt-6">
                    <Progress value={remainingPercent} aria-label="Remaining Creator Credits" />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <BalanceTile label="Purchased credits" value={purchasedCredits} />
                    <BalanceTile label="Included monthly" value={includedCredits} />
                    <BalanceTile label="Reserved / in progress" value={reservedCredits} />
                  </div>
                </GlassCard>

                <PromoRedeemCard
                  source="creator_credits"
                  surface="creator_credits"
                  title="Have a Creator Credits or founder code?"
                  description="Unlock eligible Creator Credit bonuses, Academy access, or founder campaign benefits."
                  onRedeemed={() => void loadDashboard()}
                />
              </section>

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric title="Used this month" value={dashboard.snapshot.monthlyCreditsUsed.toLocaleString()} icon={Sparkles} />
                <Metric title="Plan" value={(dashboard.subscription?.plan || dashboard.snapshot.plan || "explorer").replace(/_/g, " ")} icon={PackageCheck} />
                <Metric title="Provider mode" value={dashboard.snapshot.providerMode} icon={ShieldCheck} />
                <Metric title="Next reset" value={formatDate(dashboard.snapshot.nextResetAt)} icon={History} small />
              </section>

              <section className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr]">
                <GlassCard className="p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Buy bundles</h2>
                      <p className="text-sm text-muted-foreground">Top up when you want to generate more.</p>
                    </div>
                    <Badge variant="outline">Pay as you go</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {bundles.map((bundle) => (
                      <button
                        key={bundle.id}
                        type="button"
                        onClick={() => setShowCreditPurchase(true)}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-blue-400/50 hover:bg-blue-500/10"
                      >
                        <p className="font-semibold text-white">{bundle.label}</p>
                        <p className="mt-1 text-sm text-white/55">{money(bundle.priceCents)}</p>
                        <p className="mt-3 text-xs text-cyan-100/75">
                          {bundle.priceCents < bundle.credits * CREATOR_CREDIT_RETAIL_VALUE_USD * 100
                            ? "Includes bundle savings"
                            : "Retail baseline"}
                        </p>
                      </button>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <History className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-lg font-semibold">Recent ledger activity</h2>
                  </div>
                  <div className="space-y-3">
                    {dashboard.recentActivity.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-6 text-center text-sm text-muted-foreground">
                        No AI activity yet. Your Creator Credit ledger will appear here after your first generation.
                      </div>
                    )}
                    {dashboard.recentActivity.map((entry) => (
                      <div key={entry.entryId} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div>
                          <p className="font-medium capitalize">{entry.feature.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.status} · {entry.billingSource} · {entry.providerId || "gateway"}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p className="font-semibold text-white">{entry.creditsCharged} charged</p>
                          {entry.creditsRefunded > 0 && <p>{entry.creditsRefunded} returned</p>}
                          <p>{formatDate(entry.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </section>

              <GlassCard className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  <h2 className="text-lg font-semibold">Budget guardrails</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  <BalanceTile label="Daily cap" value={dashboard.budgetSummary.dailyCap} />
                  <BalanceTile label="Daily used" value={dashboard.budgetSummary.dailySpent} />
                  <BalanceTile label="Monthly cap" value={dashboard.budgetSummary.monthlyCap} />
                  <BalanceTile label="Monthly used" value={dashboard.budgetSummary.monthlySpent} />
                  <BalanceTile label="Concurrent jobs" value={dashboard.budgetSummary.concurrentJobs} />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Model access: <span className="font-medium capitalize text-white">{dashboard.budgetSummary.modelClasses.join(", ")}</span>.
                </p>
              </GlassCard>
            </>
          )}
        </div>

        <CreditPurchase
          isOpen={showCreditPurchase}
          onClose={() => setShowCreditPurchase(false)}
          onPurchase={async (bundle) => {
            const createCreditPurchase = httpsCallable<
              { bundleId: string; idempotencyKey: string },
              { authorizationUrl?: string }
            >(getFunctions(app), "createPaystackCreditPurchase");
            const result = await createCreditPurchase({
              bundleId: bundle.id,
              idempotencyKey: `credits-page:${user?.uid}:${bundle.id}:${Date.now()}`,
            });
            const authorizationUrl = result.data?.authorizationUrl;
            if (authorizationUrl) {
              window.location.href = authorizationUrl;
              return;
            }
            await loadDashboard();
          }}
        />
      </AppLayout>
    </ProtectedRoute>
  );
}

function BalanceTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function Metric({ title, value, icon: Icon, small = false }: { title: string; value: string; icon: typeof Sparkles; small?: boolean }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className={cn("mt-3 font-bold capitalize text-white", small ? "text-lg" : "text-2xl")}>{value}</p>
    </GlassCard>
  );
}
