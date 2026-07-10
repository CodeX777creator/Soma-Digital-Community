"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Brain,
  Clock3,
  Loader2,
  Megaphone,
  ReceiptText,
  Sparkles,
  Users,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type DashboardResponse = {
  windowDays: number;
  generatedAt: string;
  ai: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageLatency: number;
    cacheHitRate: number;
    byModel: Array<{ model: string; cost: number; tokens: number; requests: number }>;
    byOperation: Array<{ operation: string; cost: number; requests: number }>;
    chart: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  };
  publishing: {
    totalAttempts: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    successRate: number;
    byPlatform: Array<{ platform: string; success: number; failed: number; total: number; successRate: number }>;
    chart: Array<{ date: string; attempts: number; success: number; failed: number }>;
    recentAttempts: Array<{ id: string; type: string; title: string; detail: string; time: string | null; tone: string }>;
  };
  users: {
    totalUsers: number;
    activeSubscriptions: number;
    paidUserCount: number;
    subRevenue: number;
    mrrTotal: number;
    signupChart: Array<{ date: string; signups: number }>;
    activity: Array<{ id: string; type: string; title: string; detail: string; time: string | null; tone: string }>;
  };
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Users;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-cyan-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-xs text-white/50">{note}</p>
    </section>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Users;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-cyan-200" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
          Live
        </span>
      </div>
      <div className="h-72">{children}</div>
    </section>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">{title}</h2>
      <p className="text-xs text-white/45">{description}</p>
    </div>
  );
}

function formatTime(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth as any, async (user) => {
      if (!user) {
        setError("Admin session expired.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const token = await user.getIdToken();
        const response = await fetch("/api/admin/analytics/dashboard?days=30", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Unable to load analytics.");
        }

        const json = (await response.json()) as DashboardResponse;
        setData(json);
        setError(null);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load analytics.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const modelRows = useMemo(() => data?.ai.byModel || [], [data]);
  const opRows = useMemo(() => data?.ai.byOperation || [], [data]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
          Loading analytics
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="AI Requests"
          value={(data?.ai.totalRequests || 0).toLocaleString()}
          note={`Window: ${data?.windowDays || 0} days`}
          icon={Brain}
        />
        <StatCard
          label="AI Tokens"
          value={(data?.ai.totalTokens || 0).toLocaleString()}
          note={`Avg latency ${(data?.ai.averageLatency || 0).toFixed(0)} ms`}
          icon={Sparkles}
        />
        <StatCard
          label="AI Cost"
          value={formatCurrency(data?.ai.totalCost || 0)}
          note={`Cache hit rate ${(data?.ai.cacheHitRate || 0).toFixed(1)}%`}
          icon={ReceiptText}
        />
        <StatCard
          label="Publish Success"
          value={`${(data?.publishing.successRate || 0).toFixed(0)}%`}
          note={`${data?.publishing.successCount || 0} successful posts`}
          icon={Megaphone}
        />
        <StatCard
          label="Total Users"
          value={(data?.users.totalUsers || 0).toLocaleString()}
          note={`${data?.users.activeSubscriptions || 0} active subscriptions`}
          icon={Users}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="AI Usage Trend" icon={Brain}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.ai.chart || []}>
              <defs>
                <linearGradient id="aiUsageFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.45)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.45)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#080a0f",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: "#fff",
                }}
              />
              <Area type="monotone" dataKey="requests" stroke="#22d3ee" fill="url(#aiUsageFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Publishing Trend" icon={Megaphone}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.publishing.chart || []}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.45)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.45)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#080a0f",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: "#fff",
                }}
              />
              <Line type="monotone" dataKey="attempts" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="success" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <SectionTitle
            title="AI Model Mix"
            description="Requests, tokens, and estimated cost by model."
          />
          <div className="mt-4 space-y-2">
            {modelRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/45">No AI usage recorded yet.</p>
            ) : (
              modelRows.map((row) => (
                <div key={row.model} className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.6fr] gap-3 border-b border-white/8 py-2 text-xs last:border-0">
                  <div className="truncate text-white/80">{row.model}</div>
                  <div className="text-white/55">{row.requests} req</div>
                  <div className="text-white/55">{row.tokens.toLocaleString()} tok</div>
                  <div className="text-right text-cyan-200">{formatCurrency(row.cost)}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <SectionTitle
            title="Publish Health"
            description="Success rate by platform and current delivery status."
          />
          <div className="mt-4 space-y-2">
            {data?.publishing.byPlatform?.length ? (
              data.publishing.byPlatform.map((row) => (
                <div key={row.platform} className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr] gap-3 border-b border-white/8 py-2 text-xs last:border-0">
                  <div className="capitalize text-white/80">{row.platform}</div>
                  <div className="text-white/55">{row.total} total</div>
                  <div className="text-white/55">{row.success} ok</div>
                  <div className="text-right text-emerald-200">{row.successRate.toFixed(0)}%</div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-white/45">No publish attempts recorded yet.</p>
            )}
          </div>
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Activity</h2>
            <Clock3 className="h-4 w-4 text-white/45" />
          </div>
          <div className="divide-y divide-white/10">
            {(data?.users.activity || []).slice(0, 8).map((item) => (
              <div key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_1fr_140px] sm:items-center">
                <div className={cn("text-xs font-medium", item.tone === "cyan" ? "text-cyan-200" : "text-white/55")}>
                  {item.type}
                </div>
                <div className="truncate text-sm text-white/80">{item.title}</div>
                <div className="text-xs text-white/40 sm:text-right">{formatTime(item.time)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent Publish Attempts</h2>
            <Activity className="h-4 w-4 text-white/45" />
          </div>
          <div className="divide-y divide-white/10">
            {(data?.publishing.recentAttempts || []).slice(0, 8).map((item) => (
              <div key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_1fr_140px] sm:items-center">
                <div
                  className={cn(
                    "text-xs font-medium",
                    item.tone === "emerald"
                      ? "text-emerald-200"
                      : item.tone === "red"
                        ? "text-red-200"
                        : "text-white/55"
                  )}
                >
                  {item.type}
                </div>
                <div className="truncate text-sm text-white/80">{item.title}</div>
                <div className="text-xs text-white/40 sm:text-right">{formatTime(item.time)}</div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <SectionTitle
            title="Operation Cost"
            description="Estimated AI spend by workflow."
          />
          <div className="mt-4 space-y-2">
            {opRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/45">No operation data yet.</p>
            ) : (
              opRows.map((row) => (
                <div key={row.operation} className="grid grid-cols-[1.5fr_0.6fr_0.6fr] gap-3 border-b border-white/8 py-2 text-xs last:border-0">
                  <div className="truncate text-white/80">{row.operation}</div>
                  <div className="text-white/55">{row.requests} req</div>
                  <div className="text-right text-cyan-200">{formatCurrency(row.cost)}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <SectionTitle
            title="Platform Summary"
            description="Publishing success across connected channels."
          />
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
              <span className="text-white/60">Total publish attempts</span>
              <span className="font-medium text-white">{data?.publishing.totalAttempts || 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
              <span className="text-white/60">Failed attempts</span>
              <span className="font-medium text-red-200">{data?.publishing.failedCount || 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
              <span className="text-white/60">Skipped attempts</span>
              <span className="font-medium text-white">{data?.publishing.skippedCount || 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
              <span className="text-white/60">Estimated subscriber revenue</span>
              <span className="font-medium text-white">{formatCurrency(data?.users.subRevenue || 0)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
              <span className="text-white/60">Estimated MRR sales</span>
              <span className="font-medium text-white">{formatCurrency(data?.users.mrrTotal || 0)}</span>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
