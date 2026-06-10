"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";

type EnvStatus = {
  name: string;
  public: boolean;
  required: boolean;
  configured: boolean;
};

type SettingsStatus = {
  setup: {
    configExists: boolean;
    adminSetupComplete: boolean;
    adminUid: string | null;
    adminEmail: string | null;
    setupAt: any;
    updatedAt: any;
  };
  env: EnvStatus[];
  collections: Record<string, number | null>;
  system: {
    projectId: string | null;
    nodeEnv: string | null;
    firebaseRulesConfigured: boolean;
    storageRulesConfigured: boolean;
  };
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
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
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function hasAdminAccess(profile: Record<string, any> | null) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return profile?.isAdmin === true || profile?.role === "admin" || roles.includes("admin");
}

async function loadSettingsStatus() {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");

  const response = await fetch("/api/admin/settings/status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Unable to load settings.");
  return payload as SettingsStatus;
}

export default function AdminSettingsPage() {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    if (!auth || !db) return;
    const firestore = db;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
      unsubProfile?.();

      if (!user) {
        setProfile(null);
        return;
      }

      unsubProfile = onSnapshot(doc(firestore, "users", user.uid), (snapshot) => {
        setProfile(snapshot.exists() ? snapshot.data() : null);
      });
    });

    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const nextStatus = await loadSettingsStatus();
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const envWarnings = useMemo(() => {
    if (!status) return [];
    return status.env.filter((item) => item.required && !item.configured);
  }, [status]);

  const configuredCount = status?.env.filter((item) => item.configured).length || 0;
  const adminReady = Boolean(status?.setup.adminSetupComplete && hasAdminAccess(profile));

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
          <p className="mt-1 text-sm text-white/45">
            Review setup, environment, admin profile, and system configuration.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </section>

      {loading && (
        <div className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-10 text-center text-white/45">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            Loading settings
          </span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {!loading && status && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Admin Setup" value={adminReady ? "Ready" : "Needs Review"} tone={adminReady ? "good" : "warn"} icon={ShieldCheck} />
            <Metric label="Env Configured" value={`${configuredCount}/${status.env.length}`} tone={envWarnings.length ? "warn" : "good"} icon={KeyRound} />
            <Metric label="Project" value={status.system.projectId || "Unknown"} icon={ServerCog} />
            <Metric label="Users" value={String(status.collections.users ?? "-")} icon={Database} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <Panel title="Setup Status" icon={ShieldCheck}>
              <StatusRow label="System config document" ok={status.setup.configExists} detail={status.setup.configExists ? "Found" : "Missing"} />
              <StatusRow label="Admin setup complete" ok={status.setup.adminSetupComplete} detail={status.setup.adminSetupComplete ? "Complete" : "Incomplete"} />
              <StatusRow label="Current profile has admin access" ok={hasAdminAccess(profile)} detail={hasAdminAccess(profile) ? "Authorized" : "Missing admin markers"} />
              <Detail label="Initial admin" value={status.setup.adminEmail || "-"} />
              <Detail label="Setup completed" value={dateLabel(status.setup.setupAt)} />
              <Detail label="Config updated" value={dateLabel(status.setup.updatedAt)} />
            </Panel>

            <Panel title="Admin Profile" icon={UserRound}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-semibold ring-1 ring-white/15">
                  {adminUser?.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={adminUser.photoURL} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-5 w-5 text-white/55" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{adminUser?.displayName || profile?.displayName || profile?.name || "Admin"}</p>
                  <p className="truncate text-sm text-white/45">{adminUser?.email || profile?.email || "-"}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Detail label="UID" value={adminUser?.uid || "-"} />
                <Detail label="Role" value={profile?.role || "-"} />
                <Detail label="Roles" value={Array.isArray(profile?.roles) ? profile.roles.join(", ") : "-"} />
                <Detail label="Tier" value={profile?.tier || profile?.subscription?.subscriptionPlan || "-"} />
                <Detail label="Subscription status" value={profile?.subscription?.subscriptionStatus || profile?.subscription?.status || "-"} />
                <Detail label="Last login" value={dateLabel(profile?.lastLogin)} />
              </div>
            </Panel>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <Panel title="Environment Warnings" icon={AlertTriangle}>
              {envWarnings.length === 0 ? (
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-100">
                  Required environment values are configured.
                </div>
              ) : (
                <div className="space-y-2">
                  {envWarnings.map((item) => (
                    <div key={item.name} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-3 text-sm text-amber-100">
                      {item.name} is required but not configured.
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-2">
                {status.env.map((item) => (
                  <EnvRow key={item.name} item={item} />
                ))}
              </div>
            </Panel>

            <Panel title="System Config" icon={ServerCog}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Project ID" value={status.system.projectId || "-"} />
                <Detail label="Runtime" value={status.system.nodeEnv || "-"} />
                <Detail label="Subscriptions" value={String(status.collections.subscriptions ?? "-")} />
                <Detail label="Marketplace assets" value={String(status.collections.marketplaceAssets ?? "-")} />
                <Detail label="Posts" value={String(status.collections.posts ?? "-")} />
                <Detail label="Webhook events" value={String(status.collections.webhookEvents ?? "-")} />
              </div>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: typeof ShieldCheck;
  tone?: "neutral" | "good" | "warn";
}) {
  const iconClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-200" : "text-cyan-300";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </div>
      <p className="mt-3 truncate text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof ShieldCheck; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-300" />
        <h3 className="font-medium">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm">
      <span className="text-white/70">{label}</span>
      <span className={`inline-flex items-center gap-1.5 ${ok ? "text-emerald-200" : "text-amber-100"}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {detail}
      </span>
    </div>
  );
}

function EnvRow({ item }: { item: EnvStatus }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate text-white/75">{item.name}</p>
        <p className="text-xs text-white/35">{item.public ? "Public client value" : "Server value"}{item.required ? " · Required" : ""}</p>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1.5 ${item.configured ? "text-emerald-200" : "text-white/35"}`}>
        {item.configured ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {item.configured ? "Set" : "Missing"}
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <dl>
      <dt className="text-xs uppercase tracking-wider text-white/35">{label}</dt>
      <dd className="mt-1 break-all text-sm text-white/75">{value}</dd>
    </dl>
  );
}
