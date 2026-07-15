"use client";

import { useEffect, useMemo, useState } from "react";
import { Auth, onAuthStateChanged } from "firebase/auth";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Share2,
  XCircle,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type ProviderSetup = {
  key: string;
  label: string;
  ready: boolean;
  note: string | null;
};

type ProviderRow = {
  providerId: string;
  label: string;
  accounts: number;
  connected: number;
  paused: number;
  errored: number;
  readinessIssues: number;
  failedPublishes: number;
  providerErrors: number;
  tokenRefreshFailures: number;
  analyticsSyncs: number;
  analyticsFailures: number;
  setup: ProviderSetup[];
};

type FailureItem = {
  id: string;
  providerId?: string;
  platform?: string;
  scheduledPostId?: string | null;
  socialAccountId?: string | null;
  failureCode?: string | null;
  status?: string;
  error: string;
  retryable?: boolean;
  time: string | null;
};

type SocialOpsResponse = {
  generatedAt: string;
  summary: {
    connectedAccounts: number;
    totalAccounts: number;
    failedOAuthCallbacks: number;
    failedPublishes: number;
    tokenRefreshFailures: number;
    providerApiErrors: number;
    analyticsSyncFailures: number;
    publishQueueSize: number;
    needsAttentionQueue: number;
    retryVolume: number;
    retryableFailures: number;
    reliabilityAlerts: number;
    scheduledPostCollectionCount: number | null;
  };
  connectedAccountsByProvider: Record<string, number>;
  accountStatusCounts: Record<string, number>;
  providers: ProviderRow[];
  failures: {
    oauthCallbacks: FailureItem[];
    publishes: FailureItem[];
    tokenRefresh: FailureItem[];
    providerApi: FailureItem[];
    analyticsSync: FailureItem[];
  };
  setupDocExists: boolean;
};

function formatTime(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function StatCard({
  label,
  value,
  note,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon: typeof Share2;
}) {
  const toneClass = {
    neutral: "text-cyan-200 bg-cyan-400/10 border-cyan-400/20",
    good: "text-emerald-200 bg-emerald-400/10 border-emerald-400/20",
    warn: "text-amber-200 bg-amber-400/10 border-amber-400/20",
    bad: "text-red-200 bg-red-400/10 border-red-400/20",
  }[tone];

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={cn("rounded-md border p-2", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-xs text-white/50">{note}</p>
    </section>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-xs text-white/45">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function FailureList({ items, empty }: { items: FailureItem[]; empty: string }) {
  if (items.length === 0) {
    return <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-white/45">{empty}</div>;
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((item) => (
        <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {item.providerId || item.platform || "provider"} {item.failureCode ? `· ${item.failureCode}` : ""}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-white/50">{item.error}</p>
            </div>
            <span className={cn(
              "shrink-0 rounded-full px-2 py-1 text-[10px] uppercase tracking-wider",
              item.retryable ? "bg-amber-400/10 text-amber-200" : "bg-red-400/10 text-red-200"
            )}>
              {item.retryable ? "Retryable" : item.status || "Failed"}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-white/35">{formatTime(item.time)}</p>
        </div>
      ))}
    </div>
  );
}

export default function AdminSocialOpsPage() {
  const [data, setData] = useState<SocialOpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const token = await (auth as Auth | undefined)?.currentUser?.getIdToken();
      if (!token) throw new Error("Admin session expired.");
      const response = await fetch("/api/admin/social-ops", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to load social ops.");
      setData(payload as SocialOpsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load social ops.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      setError("Firebase auth is not configured.");
      return;
    }

    const unsub = onAuthStateChanged(auth as Auth, (user) => {
      if (user) void load();
    });
    return () => unsub();
  }, []);

  const setupItems = useMemo(() => data?.providers.flatMap((provider) => (
    provider.setup.map((item) => ({ ...item, provider: provider.label, providerId: provider.providerId }))
  )) || [], [data]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
          Loading social operations
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Social Operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Provider readiness and publishing health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
            Monitor OAuth, app review, publishing failures, analytics sync, queue volume, and reliability controls across connected social providers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm text-white/70 hover:bg-white/[0.08] disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connected accounts" value={`${data.summary.connectedAccounts}/${data.summary.totalAccounts}`} note="Active social destinations" icon={Share2} tone="good" />
        <StatCard label="Publish queue" value={data.summary.publishQueueSize} note={`${data.summary.needsAttentionQueue} need attention`} icon={Clock3} tone={data.summary.needsAttentionQueue > 0 ? "warn" : "neutral"} />
        <StatCard label="Failed publishes" value={data.summary.failedPublishes} note={`${data.summary.retryableFailures} retryable failures`} icon={ShieldAlert} tone={data.summary.failedPublishes > 0 ? "bad" : "good"} />
        <StatCard label="Provider errors" value={data.summary.providerApiErrors} note={`${data.summary.reliabilityAlerts} reliability alerts`} icon={AlertTriangle} tone={data.summary.providerApiErrors > 0 ? "warn" : "good"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Provider setup status" description="Admin-managed app review and permission readiness. Store overrides in config/socialProviderSetup.">
          <div className="space-y-2">
            {setupItems.map((item) => (
              <div key={`${item.providerId}-${item.key}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <div>
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="mt-1 text-xs text-white/45">{item.provider}{item.note ? ` · ${item.note}` : ""}</p>
                </div>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wider",
                  item.ready ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"
                )}>
                  {item.ready ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {item.ready ? "Ready" : "Review"}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Ops health" description="Current operational failure signals across OAuth, publishing, tokens, and analytics.">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Failed OAuth", data.summary.failedOAuthCallbacks],
              ["Token refresh", data.summary.tokenRefreshFailures],
              ["Analytics failures", data.summary.analyticsSyncFailures],
              ["Retry volume", data.summary.retryVolume],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-xs text-white/45">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/45">
            Last generated: {formatTime(data.generatedAt)}
          </div>
        </Panel>
      </div>

      <Panel title="Provider health matrix" description="Connected accounts, readiness issues, publishing failures, and analytics health by provider.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-white/40">
              <tr className="border-b border-white/10">
                <th className="py-3 pr-4">Provider</th>
                <th className="py-3 pr-4">Connected</th>
                <th className="py-3 pr-4">Readiness</th>
                <th className="py-3 pr-4">Failed publishes</th>
                <th className="py-3 pr-4">Provider errors</th>
                <th className="py-3 pr-4">Token failures</th>
                <th className="py-3 pr-4">Analytics</th>
              </tr>
            </thead>
            <tbody>
              {data.providers.map((provider) => (
                <tr key={provider.providerId} className="border-b border-white/5">
                  <td className="py-3 pr-4 font-medium text-white">{provider.label}</td>
                  <td className="py-3 pr-4 text-white/70">{provider.connected}/{provider.accounts}</td>
                  <td className="py-3 pr-4">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs", provider.readinessIssues > 0 ? "bg-amber-400/10 text-amber-200" : "bg-emerald-400/10 text-emerald-200")}>
                      {provider.readinessIssues > 0 ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                      {provider.readinessIssues}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-white/70">{provider.failedPublishes}</td>
                  <td className="py-3 pr-4 text-white/70">{provider.providerErrors}</td>
                  <td className="py-3 pr-4 text-white/70">{provider.tokenRefreshFailures}</td>
                  <td className="py-3 pr-4 text-white/70">{provider.analyticsFailures}/{provider.analyticsSyncs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Failed OAuth callbacks">
          <FailureList items={data.failures.oauthCallbacks} empty="No failed OAuth callbacks in the current sample." />
        </Panel>
        <Panel title="Failed publishes">
          <FailureList items={data.failures.publishes} empty="No failed publish attempts in the current sample." />
        </Panel>
        <Panel title="Provider API errors">
          <FailureList items={data.failures.providerApi} empty="No provider API errors in the current sample." />
        </Panel>
        <Panel title="Token and analytics sync">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/45">
                <KeyRound className="h-3.5 w-3.5" />
                Token refresh failures
              </div>
              <FailureList items={data.failures.tokenRefresh} empty="No token refresh failures." />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/45">
                <BarChart3 className="h-3.5 w-3.5" />
                Analytics sync failures
              </div>
              <FailureList items={data.failures.analyticsSync} empty="No analytics sync failures." />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
