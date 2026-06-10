"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, Firestore, onSnapshot, orderBy, query } from "firebase/firestore";
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
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  DollarSign,
  Loader2,
  UserPlus,
  Users,
} from "lucide-react";
import { db } from "@/lib/firebase";

type FirestoreRecord = {
  id: string;
  [key: string]: any;
};

const TIER_PRICES: Record<string, number> = {
  explorer: 0,
  pro: 97,
  elite: 297,
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function isActiveSubscription(sub: FirestoreRecord) {
  const status = String(
    sub.status || sub.subscriptionStatus || sub.state || ""
  ).toLowerCase();

  return status === "active" || status === "trialing";
}

function getSubscriptionPlan(sub: FirestoreRecord) {
  return String(
    sub.planId ||
      sub.plan ||
      sub.subscriptionPlan ||
      sub.tier ||
      sub.metadata?.planId ||
      "explorer"
  ).toLowerCase();
}

function getSubscriptionPrice(sub: FirestoreRecord) {
  const raw =
    sub.monthlyPrice ??
    sub.price ??
    sub.amount ??
    sub.unitAmount ??
    sub.planAmount ??
    null;

  if (typeof raw === "number") {
    return raw > 1000 ? raw / 100 : raw;
  }

  const plan = getSubscriptionPlan(sub);
  return TIER_PRICES[plan] || 0;
}

function getSubscriptionCreatedAt(sub: FirestoreRecord) {
  return (
    toDate(sub.createdAt) ||
    toDate(sub.startedAt) ||
    toDate(sub.currentPeriodStart) ||
    toDate(sub.updatedAt)
  );
}

function getSubscriptionCancelledAt(sub: FirestoreRecord) {
  return toDate(sub.cancelledAt) || toDate(sub.canceledAt);
}

function getUserName(user: FirestoreRecord) {
  return user.name || user.displayName || user.email || "New user";
}

function buildLastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Users;
  trend?: "up" | "down";
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-cyan-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-white/50">
        {trend === "up" && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-300" />}
        {trend === "down" && <ArrowDownRight className="h-3.5 w-3.5 text-red-300" />}
        {note}
      </div>
    </section>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
          Live
        </span>
      </div>
      <div className="h-72">{children}</div>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<FirestoreRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<FirestoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const usersQuery = query(collection(db as Firestore, "users"), orderBy("createdAt", "desc"));
    const subscriptionsQuery = query(
      collection(db as Firestore, "subscriptions"),
      orderBy("createdAt", "desc")
    );

    const unsubscribeUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      () => {
        setError("Unable to load users.");
        setLoading(false);
      }
    );

    const unsubscribeSubscriptions = onSnapshot(
      subscriptionsQuery,
      (snapshot) => {
        setSubscriptions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      () => {
        setError("Unable to load subscriptions.");
        setLoading(false);
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeSubscriptions();
    };
  }, []);

  const analytics = useMemo(() => {
    const sevenDays = buildLastSevenDays();
    const sevenDaysAgo = sevenDays[0];
    const activeSubscriptions = subscriptions.filter(isActiveSubscription);
    const mrr = activeSubscriptions.reduce(
      (total, sub) => total + getSubscriptionPrice(sub),
      0
    );

    const newUsers7d = users.filter((user) => {
      const createdAt = toDate(user.createdAt);
      return createdAt ? createdAt >= sevenDaysAgo : false;
    }).length;

    const signupChart = sevenDays.map((date) => ({
      date: shortDate(date),
      signups: users.filter((user) => {
        const createdAt = toDate(user.createdAt);
        return createdAt ? sameDay(createdAt, date) : false;
      }).length,
    }));

    const subscriptionChart = sevenDays.map((date) => ({
      date: shortDate(date),
      active: subscriptions.filter((sub) => {
        const createdAt = getSubscriptionCreatedAt(sub);
        return createdAt ? createdAt <= date && isActiveSubscription(sub) : false;
      }).length,
    }));

    const tierRevenue = ["explorer", "pro", "elite"].map((tier) => ({
      tier: tier[0].toUpperCase() + tier.slice(1),
      revenue: activeSubscriptions
        .filter((sub) => getSubscriptionPlan(sub) === tier)
        .reduce((total, sub) => total + getSubscriptionPrice(sub), 0),
    }));

    const signupActivity = users.slice(0, 8).map((user) => ({
      id: `user-${user.id}`,
      type: "New signup",
      title: getUserName(user),
      time: toDate(user.createdAt),
      tone: "cyan",
    }));

    const subscriptionActivity = subscriptions.slice(0, 8).flatMap((sub) => {
      const plan = getSubscriptionPlan(sub);
      const createdAt = getSubscriptionCreatedAt(sub);
      const cancelledAt = getSubscriptionCancelledAt(sub);
      const owner = sub.email || sub.customerEmail || sub.userEmail || sub.userId || "Customer";
      const events = [
        {
          id: `sub-${sub.id}`,
          type: isActiveSubscription(sub) ? "New subscription" : "Subscription update",
          title: `${owner} - ${plan}`,
          time: createdAt,
          tone: isActiveSubscription(sub) ? "emerald" : "slate",
        },
      ];

      if (cancelledAt) {
        events.push({
          id: `cancel-${sub.id}`,
          type: "Cancellation",
          title: `${owner} - ${plan}`,
          time: cancelledAt,
          tone: "red",
        });
      }

      return events;
    });

    const activity = [...signupActivity, ...subscriptionActivity]
      .filter((item) => item.time)
      .sort((a, b) => (b.time?.getTime() || 0) - (a.time?.getTime() || 0))
      .slice(0, 10);

    return {
      totalUsers: users.length,
      activeSubscriptions: activeSubscriptions.length,
      mrr,
      newUsers7d,
      signupChart,
      subscriptionChart,
      tierRevenue,
      activity,
    };
  }, [users, subscriptions]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
          Loading realtime dashboard
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Users"
          value={analytics.totalUsers.toLocaleString()}
          note="All registered accounts"
          icon={Users}
          trend="up"
        />
        <StatCard
          label="Active Subscriptions"
          value={analytics.activeSubscriptions.toLocaleString()}
          note="Active or trialing plans"
          icon={CreditCard}
          trend="up"
        />
        <StatCard
          label="MRR"
          value={formatCurrency(analytics.mrr)}
          note="Client-side active plan sum"
          icon={DollarSign}
          trend="up"
        />
        <StatCard
          label="New Users (7d)"
          value={analytics.newUsers7d.toLocaleString()}
          note="Rolling seven-day signups"
          icon={UserPlus}
          trend="up"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Subscription Growth">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.subscriptionChart}>
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
              <Line
                type="monotone"
                dataKey="active"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Tier">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.tierRevenue}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="tier" stroke="rgba(255,255,255,0.45)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.45)" fontSize={12} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{
                  background: "#080a0f",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: "#fff",
                }}
              />
              <Bar dataKey="revenue" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="User Signups">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.signupChart}>
              <defs>
                <linearGradient id="signupFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
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
              <Area
                type="monotone"
                dataKey="signups"
                stroke="#34d399"
                fill="url(#signupFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Activity</h2>
          <Activity className="h-4 w-4 text-white/45" />
        </div>
        <div className="divide-y divide-white/10">
          {analytics.activity.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-white/45">
              No recent activity yet.
            </div>
          ) : (
            analytics.activity.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_1fr_120px] sm:items-center"
              >
                <div
                  className={`text-xs font-medium ${
                    item.tone === "red"
                      ? "text-red-200"
                      : item.tone === "emerald"
                        ? "text-emerald-200"
                        : item.tone === "cyan"
                          ? "text-cyan-200"
                          : "text-white/55"
                  }`}
                >
                  {item.type}
                </div>
                <div className="truncate text-sm text-white/80">{item.title}</div>
                <div className="text-xs text-white/40 sm:text-right">
                  {item.time ? shortDate(item.time) : "Unknown"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
