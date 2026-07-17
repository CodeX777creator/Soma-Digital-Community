"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Eye,
  Loader2,
  RotateCcw,
  Search,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { AdminErrorState, AdminEmptyState, AdminLoadingState } from "@/components/admin/AdminState";
import { toAppError, AppError } from "@/lib/errors";

type Tier = "explorer" | "pro" | "elite";
type SubscriptionStatus = "active" | "cancelled" | "past_due" | "expired" | "approval_pending" | "created" | "all";
type Provider = "paypal" | "paystack" | "admin" | "other";

type SubscriptionRecord = {
  id: string;
  userId: string;
  provider: Provider;
  subscriptionPlan: Tier;
  subscriptionStatus: Exclude<SubscriptionStatus, "all">;
  subscriptionId: string;
  paypalSubscriptionId?: string;
  paystackReference?: string;
  currentPeriodEnd?: any;
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  subscription?: any;
  [key: string]: any;
};

const TIERS: Array<"all" | Tier> = ["all", "explorer", "pro", "elite"];
const STATUSES: SubscriptionStatus[] = ["all", "active", "cancelled", "past_due", "expired", "approval_pending", "created"];
const PROVIDERS: Array<"all" | Provider> = ["all", "paypal", "paystack", "admin", "other"];

async function adminSubscriptionFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Subscription action failed.");
  return payload;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value: any) {
  const date = toDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function normalizeTier(value: any): Tier {
  if (value === "enterprise") return "elite";
  if (value === "elite" || value === "pro" || value === "explorer") return value;
  return "explorer";
}

function normalizeProvider(value: any): Provider {
  if (value === "paypal" || value === "paystack" || value === "admin") return value;
  return "other";
}

function normalizeStatus(data: Record<string, any>): SubscriptionRecord["subscriptionStatus"] {
  const status = data.subscriptionStatus || data.status || "expired";
  if (
    status === "active" ||
    status === "cancelled" ||
    status === "past_due" ||
    status === "expired" ||
    status === "approval_pending" ||
    status === "created"
  ) {
    return status;
  }
  if (status === "user_cancelled") return "cancelled";
  return "expired";
}

function normalizeSubscription(id: string, data: Record<string, any>): SubscriptionRecord {
  return {
    id,
    ...data,
    userId: data.userId || data.uid || data.customerId || "",
    provider: normalizeProvider(data.provider),
    subscriptionPlan: normalizeTier(data.subscriptionPlan || data.planId || data.plan),
    subscriptionStatus: normalizeStatus(data),
    subscriptionId: data.subscriptionId || id,
    paypalSubscriptionId: data.paypalSubscriptionId,
    paystackReference: data.paystackReference,
    currentPeriodEnd: data.currentPeriodEnd || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function normalizeUser(id: string, data: Record<string, any>): UserRecord {
  return {
    id,
    name: data.name || data.displayName || data.email || "Unnamed user",
    email: data.email || "",
    photoURL: data.photoURL || data.avatarURL || data.avatarUrl || "",
    ...data,
  };
}

function statusClass(status: SubscriptionRecord["subscriptionStatus"]) {
  if (status === "active") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (status === "cancelled" || status === "expired") return "border-red-400/25 bg-red-400/10 text-red-100";
  if (status === "past_due") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-white/10 bg-white/[0.06] text-white/70";
}

function supportLinks(subscription: SubscriptionRecord) {
  if (subscription.provider === "paypal") {
    const id = subscription.paypalSubscriptionId || subscription.subscriptionId;
    return [
      { label: "Open PayPal", href: `https://www.paypal.com/billing/subscriptions/${id}` },
      { label: "Cancel in PayPal", href: `https://www.paypal.com/billing/subscriptions/${id}` },
    ];
  }

  if (subscription.provider === "paystack") {
    const reference = subscription.paystackReference || subscription.subscriptionId;
    return [
      { label: "Open Paystack", href: `https://dashboard.paystack.com/#/transactions?query=${encodeURIComponent(reference)}` },
      { label: "Refund in Paystack", href: `https://dashboard.paystack.com/#/transactions?query=${encodeURIComponent(reference)}` },
    ];
  }

  return [];
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [users, setUsers] = useState<Record<string, UserRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<AppError | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus>("all");
  const [providerFilter, setProviderFilter] = useState<"all" | Provider>("all");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [selected, setSelected] = useState<SubscriptionRecord | null>(null);
  const [cancelLoading, setCancelLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError("Database not initialized.");
      setLoading(false);
      return;
    }
    const firestore = db;
    const unsubSubscriptions = onSnapshot(
      query(collection(firestore, "subscriptions"), orderBy("updatedAt", "desc")),
      (snapshot) => {
        setSubscriptions(snapshot.docs.map((item) => normalizeSubscription(item.id, item.data())));
        setLoading(false);
        setError(null);
      },
      () => {
        setError("Unable to load subscriptions.");
        setLoading(false);
      }
    );

    const unsubUsers = onSnapshot(collection(firestore, "users"), (snapshot) => {
      setUsers(
        Object.fromEntries(snapshot.docs.map((userDoc) => [userDoc.id, normalizeUser(userDoc.id, userDoc.data())]))
      );
    });

    return () => {
      unsubSubscriptions();
      unsubUsers();
    };
  }, []);

  const filteredSubscriptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return subscriptions.filter((subscription) => {
      const user = users[subscription.userId];
      const matchesSearch =
        !term ||
        subscription.subscriptionId.toLowerCase().includes(term) ||
        subscription.userId.toLowerCase().includes(term) ||
        user?.name.toLowerCase().includes(term) ||
        user?.email.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || subscription.subscriptionStatus === statusFilter;
      const matchesProvider = providerFilter === "all" || subscription.provider === providerFilter;
      const matchesTier = tierFilter === "all" || subscription.subscriptionPlan === tierFilter;
      return matchesSearch && matchesStatus && matchesProvider && matchesTier;
    });
  }, [providerFilter, search, statusFilter, subscriptions, tierFilter, users]);

  const totals = useMemo(() => {
    return {
      all: subscriptions.length,
      active: subscriptions.filter((item) => item.subscriptionStatus === "active").length,
      cancelled: subscriptions.filter((item) => item.subscriptionStatus === "cancelled").length,
      expired: subscriptions.filter((item) => item.subscriptionStatus === "expired").length,
    };
  }, [subscriptions]);

  const handleCancel = async (subscription: SubscriptionRecord) => {
    if (!db) return;
    const user = users[subscription.userId];
    const confirmed = window.confirm(
      `Cancel subscription for ${user?.email || subscription.userId}? This will mark it as cancelled in Firestore but will NOT cancel it with the payment provider. Cancel in ${subscription.provider === "paystack" ? "Paystack" : "PayPal"} dashboard separately.`
    );
    if (!confirmed) return;
    setCancelLoading(subscription.id);
    setError(null);
    setActiveError(null);
    try {
      await adminSubscriptionFetch(`/api/admin/subscriptions/${subscription.id}/cancel`, { method: "POST" });
      setSelected(null);
    } catch (err) {
      setActiveError(toAppError(err, { userMessage: "Unable to cancel subscription." }));
    } finally {
      setCancelLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Subscriptions</h2>
          <p className="mt-1 text-sm text-white/45">
            Inspect canonical subscription records and customer access status.
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total" value={totals.all} icon={CreditCard} />
        <Metric label="Active" value={totals.active} icon={CalendarClock} />
        <Metric label="Cancelled" value={totals.cancelled} icon={X} />
        <Metric label="Expired" value={totals.expired} icon={RotateCcw} />
      </section>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 lg:grid-cols-[1fr_160px_160px_160px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, uid, or subscription ID"
            className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-cyan-400/50"
          />
        </label>



        <FilterSelect value={statusFilter} onChange={(value) => setStatusFilter(value as SubscriptionStatus)} options={STATUSES} label="Filter by status" />
        <FilterSelect value={providerFilter} onChange={(value) => setProviderFilter(value as "all" | Provider)} options={PROVIDERS} label="Filter by provider" />
        <FilterSelect value={tierFilter} onChange={(value) => setTierFilter(value as "all" | Tier)} options={TIERS} label="Filter by tier" />
      </section>

      {activeError && (
        <AdminErrorState
          title="Subscriptions Action Error"
          description={activeError.userMessage}
          requestId={activeError.requestId}
          onRetry={activeError.retryable ? () => { } : undefined}
        />
      )}

      {error && (
        <AdminErrorState
          title="Subscriptions Error"
          description={error}
        />
      )}

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Current Period End</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Subscription ID</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-white/45">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                      Loading subscriptions
                    </span>
                  </td>
                </tr>
              )}
              {!loading && filteredSubscriptions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-white/45">
                    No subscriptions match the current filters.
                  </td>
                </tr>
              )}
              {!loading && filteredSubscriptions.map((subscription) => {
                const user = users[subscription.userId];
                const links = supportLinks(subscription);

                return (
                  <tr key={subscription.id} className="hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar user={user} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white/90">{user?.name || "Unknown customer"}</p>
                          <p className="truncate text-xs text-white/40">{user?.email || subscription.userId || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-white/70">{subscription.provider}</td>
                    <td className="px-4 py-3 capitalize text-white/70">{subscription.subscriptionPlan}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs capitalize ${statusClass(subscription.subscriptionStatus)}`}>
                        {subscription.subscriptionStatus.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60">{dateLabel(subscription.currentPeriodEnd)}</td>
                    <td className="px-4 py-3 text-white/60">{dateLabel(subscription.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-black/25 px-2 py-1 text-xs text-white/55">{subscription.subscriptionId}</code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(subscription)}
                          className="rounded-md border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"
                          aria-label="View subscription"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {links.slice(0, 1).map((link) => (
                          <a
                            key={link.label}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"
                            aria-label={link.label}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <SubscriptionModal
          subscription={selected}
          user={users[selected.userId]}
          onClose={() => setSelected(null)}
          onCancel={handleCancel}
          cancelLoading={cancelLoading}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof CreditCard }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label || "Filter options"}
      className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm capitalize outline-none focus:border-cyan-400/50"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}

function Avatar({ user }: { user?: UserRecord }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-semibold text-white/65 ring-1 ring-white/15">
      {user?.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound className="h-4 w-4" />
      )}
    </div>
  );
}

function SubscriptionModal({
  subscription,
  user,
  onClose,
  onCancel,
  cancelLoading,
}: {
  subscription: SubscriptionRecord;
  user?: UserRecord;
  onClose: () => void;
  onCancel: (sub: SubscriptionRecord) => void;
  cancelLoading: string | null;
}) {
  const links = supportLinks(subscription);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-white/10 bg-[#080a0f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold">Subscription Details</h3>
            <p className="text-sm text-white/45">{subscription.subscriptionId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[240px_1fr]">
          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <Avatar user={user} />
              <div className="min-w-0">
                <p className="truncate font-medium">{user?.name || "Unknown customer"}</p>
                <p className="truncate text-xs text-white/45">{user?.email || subscription.userId}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <Detail label="User ID" value={subscription.userId || "-"} />
              <Detail label="Tier" value={subscription.subscriptionPlan} />
              <Detail label="Status" value={subscription.subscriptionStatus.replace("_", " ")} />
            </dl>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Provider" value={subscription.provider} />
              <Detail label="Subscription ID" value={subscription.subscriptionId} />
              <Detail label="Current Period End" value={dateLabel(subscription.currentPeriodEnd)} />
              <Detail label="Created" value={dateLabel(subscription.createdAt)} />
              <Detail label="Updated" value={dateLabel(subscription.updatedAt)} />
              <Detail label="Paystack Reference" value={subscription.paystackReference || "-"} />
              <Detail label="PayPal ID" value={subscription.paypalSubscriptionId || "-"} />
            </dl>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              {links.length > 0 ? links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  {link.label}
                </a>
              )) : (
                <p className="text-sm text-white/45">No provider action links are available for this subscription.</p>
              )}
              {(subscription.subscriptionStatus === "active" || subscription.subscriptionStatus === "past_due") && (
                <button
                  type="button"
                  onClick={() => onCancel(subscription)}
                  disabled={cancelLoading === subscription.id}
                  className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-red-400/25 px-3 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {cancelLoading === subscription.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Cancel Subscription
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <dl>
      <dt className="text-xs uppercase tracking-wider text-white/35">{label}</dt>
      <dd className="mt-1 break-all text-white/75">{value}</dd>
    </dl>
  );
}
