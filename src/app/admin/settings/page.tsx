"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  ShieldOff,
  Tag,
  UserRound,
  XCircle,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";

type EnvStatus = { name: string; public: boolean; required: boolean; configured: boolean };
type SettingsStatus = {
  setup: { configExists: boolean; adminSetupComplete: boolean; adminUid: string | null; adminEmail: string | null; setupAt: any; updatedAt: any };
  env: EnvStatus[];
  collections: Record<string, number | null>;
  system: { projectId: string | null; nodeEnv: string | null; firebaseRulesConfigured: boolean; storageRulesConfigured: boolean };
};
type PricingConfig = { pro: number; elite: number };
type SiteConfig = { brandName: string; contactEmail: string; twitterUrl: string; instagramUrl: string; youtubeUrl: string; linkedinUrl: string };

const DEFAULT_PRICING: PricingConfig = { pro: 97, elite: 297 };
const DEFAULT_SITE: SiteConfig = { brandName: "Soma Digital Community", contactEmail: "", twitterUrl: "", instagramUrl: "", youtubeUrl: "", linkedinUrl: "" };

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
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function hasAdminAccess(profile: Record<string, any> | null) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return profile?.isAdmin === true || profile?.role === "admin" || roles.includes("admin");
}

async function loadSettingsStatus() {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch("/api/admin/settings/status", { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Unable to load settings.");
  return payload as SettingsStatus;
}

function Panel({ title, icon: Icon, children, className = "" }: { title: string; icon: typeof ShieldCheck; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-300" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 disabled:opacity-50";

export default function AdminSettingsPage() {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tier pricing
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [pricingDraft, setPricingDraft] = useState<PricingConfig>(DEFAULT_PRICING);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);

  // Site config
  const [site, setSite] = useState<SiteConfig>(DEFAULT_SITE);
  const [siteDraft, setSiteDraft] = useState<SiteConfig>(DEFAULT_SITE);
  const [savingSite, setSavingSite] = useState(false);
  const [siteSaved, setSiteSaved] = useState(false);

  // Grant/revoke admin
  const [adminTarget, setAdminTarget] = useState("");
  const [adminAction, setAdminAction] = useState<"grant" | "revoke">("grant");
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionMsg, setAdminActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [envListExpanded, setEnvListExpanded] = useState(false);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    if (!auth || !db) return;
    const firestore = db;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
      unsubProfile?.();
      if (!user) { setProfile(null); return; }
      unsubProfile = onSnapshot(doc(firestore, "users", user.uid), (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
      });
    });
    return () => { unsubProfile?.(); unsubAuth(); };
  }, []);

  // Load pricing and site config from Firestore
  useEffect(() => {
    if (!db) return;
    const firestore = db;
    const unsubPricing = onSnapshot(doc(firestore, "config", "pricing"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const loaded = { pro: data.pro ?? DEFAULT_PRICING.pro, elite: data.elite ?? DEFAULT_PRICING.elite };
        setPricing(loaded);
        setPricingDraft(loaded);
      }
    });
    const unsubSite = onSnapshot(doc(firestore, "config", "site"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const loaded: SiteConfig = {
          brandName: data.brandName ?? DEFAULT_SITE.brandName,
          contactEmail: data.contactEmail ?? "",
          twitterUrl: data.twitterUrl ?? "",
          instagramUrl: data.instagramUrl ?? "",
          youtubeUrl: data.youtubeUrl ?? "",
          linkedinUrl: data.linkedinUrl ?? "",
        };
        setSite(loaded);
        setSiteDraft(loaded);
      }
    });
    return () => { unsubPricing(); unsubSite(); };
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
  useEffect(() => { refresh(); }, []);

  const savePricing = async () => {
    if (!db) return;
    setSavingPricing(true);
    try {
      await setDoc(doc(db, "config", "pricing"), { ...pricingDraft, updatedAt: serverTimestamp() }, { merge: true });
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 3000);
    } catch {
      setError("Unable to save pricing.");
    } finally {
      setSavingPricing(false);
    }
  };

  const saveSite = async () => {
    if (!db) return;
    setSavingSite(true);
    try {
      await setDoc(doc(db, "config", "site"), { ...siteDraft, updatedAt: serverTimestamp() }, { merge: true });
      setSiteSaved(true);
      setTimeout(() => setSiteSaved(false), 3000);
    } catch {
      setError("Unable to save site config.");
    } finally {
      setSavingSite(false);
    }
  };

  const handleAdminAction = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !adminTarget.trim()) return;
    setAdminActionLoading(true);
    setAdminActionMsg(null);
    const firestore = db;
    try {
      const input = adminTarget.trim();
      let uid = input;

      // If looks like email, resolve to UID via users collection
      if (input.includes("@")) {
        const snap = await getDocs(query(collection(firestore, "users"), where("email", "==", input)));
        if (snap.empty) throw new Error(`No user found with email "${input}".`);
        uid = snap.docs[0].id;
      }

      const userRef = doc(firestore, "users", uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) throw new Error(`No user found with UID "${uid}".`);

      if (adminAction === "grant") {
        await updateDoc(userRef, { isAdmin: true, role: "admin", updatedAt: serverTimestamp() });
        setAdminActionMsg({ ok: true, text: `Admin access granted to ${userSnap.data().email || uid}.` });
      } else {
        await updateDoc(userRef, { isAdmin: false, role: "member", updatedAt: serverTimestamp() });
        setAdminActionMsg({ ok: true, text: `Admin access revoked from ${userSnap.data().email || uid}.` });
      }
      setAdminTarget("");
    } catch (err) {
      setAdminActionMsg({ ok: false, text: err instanceof Error ? err.message : "Action failed." });
    } finally {
      setAdminActionLoading(false);
    }
  };

  const envWarnings = useMemo(() => (status ? status.env.filter((item) => item.required && !item.configured) : []), [status]);
  const configuredCount = status?.env.filter((item) => item.configured).length || 0;
  const adminReady = Boolean(status?.setup.adminSetupComplete && hasAdminAccess(profile));
  const envPreviewCount = 5;
  const shouldCollapseEnv = Boolean(status && status.env.length > envPreviewCount);
  const visibleEnv = status ? (envListExpanded ? status.env : status.env.slice(0, envPreviewCount)) : [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
          <p className="mt-1 text-sm text-white/45">Manage pricing, site config, admin access, and system health.</p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh status
        </button>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
      )}

      {/* ── Tier Pricing ───────────────────────────────── */}
      <Panel title="Subscription Tier Pricing" icon={Tag}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pro Tier Price (USD/mo)">
            <input type="number" min={0} step={1} className={inputCls}
              aria-label="Pro tier price in USD per month"
              value={pricingDraft.pro}
              onChange={(e) => setPricingDraft({ ...pricingDraft, pro: Number(e.target.value) })} />
          </Field>
          <Field label="Elite Tier Price (USD/mo)">
            <input type="number" min={0} step={1} className={inputCls}
              aria-label="Elite tier price in USD per month"
              value={pricingDraft.elite}
              onChange={(e) => setPricingDraft({ ...pricingDraft, elite: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" onClick={savePricing} disabled={savingPricing}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50">
            {savingPricing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Pricing
          </button>
          {pricingSaved && <span className="flex items-center gap-1.5 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
          <span className="text-xs text-white/35 sm:ml-auto">Currently: Pro ${pricing.pro}/mo · Elite ${pricing.elite}/mo</span>
        </div>
      </Panel>

      {/* ── Site Config ────────────────────────────────── */}
      <Panel title="Site Configuration" icon={Globe}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand Name">
            <input type="text" className={inputCls} value={siteDraft.brandName}
              aria-label="Brand name"
              onChange={(e) => setSiteDraft({ ...siteDraft, brandName: e.target.value })} />
          </Field>
          <Field label="Contact Email">
            <input type="email" className={inputCls} value={siteDraft.contactEmail}
              placeholder="hello@somatoday.com"
              onChange={(e) => setSiteDraft({ ...siteDraft, contactEmail: e.target.value })} />
          </Field>
          <Field label="Twitter / X URL">
            <input type="url" className={inputCls} value={siteDraft.twitterUrl}
              placeholder="https://x.com/somadigi"
              onChange={(e) => setSiteDraft({ ...siteDraft, twitterUrl: e.target.value })} />
          </Field>
          <Field label="Instagram URL">
            <input type="url" className={inputCls} value={siteDraft.instagramUrl}
              placeholder="https://instagram.com/somadigi"
              onChange={(e) => setSiteDraft({ ...siteDraft, instagramUrl: e.target.value })} />
          </Field>
          <Field label="YouTube URL">
            <input type="url" className={inputCls} value={siteDraft.youtubeUrl}
              placeholder="https://youtube.com/@somadigi"
              onChange={(e) => setSiteDraft({ ...siteDraft, youtubeUrl: e.target.value })} />
          </Field>
          <Field label="LinkedIn URL">
            <input type="url" className={inputCls} value={siteDraft.linkedinUrl}
              placeholder="https://linkedin.com/company/somadigi"
              onChange={(e) => setSiteDraft({ ...siteDraft, linkedinUrl: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" onClick={saveSite} disabled={savingSite}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50">
            {savingSite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Config
          </button>
          {siteSaved && <span className="flex items-center gap-1.5 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
        </div>
      </Panel>

      {/* ── Grant / Revoke Admin ───────────────────────── */}
      <Panel title="Grant / Revoke Admin Access" icon={ShieldCheck}>
        <form onSubmit={handleAdminAction} className="space-y-4">
          <Field label="User UID or Email">
            <input type="text" className={inputCls} value={adminTarget}
              placeholder="user@example.com or Firestore UID"
              onChange={(e) => setAdminTarget(e.target.value)} required />
          </Field>
          <div className="flex flex-wrap gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="adminAction" checked={adminAction === "grant"}
                onChange={() => setAdminAction("grant")} className="accent-cyan-400" />
              <ShieldCheck className="h-4 w-4 text-emerald-300" /> Grant admin
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="adminAction" checked={adminAction === "revoke"}
                onChange={() => setAdminAction("revoke")} className="accent-red-400" />
              <ShieldOff className="h-4 w-4 text-red-300" /> Revoke admin
            </label>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="submit" disabled={adminActionLoading || !adminTarget.trim()}
              className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${adminAction === "grant" ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-red-500 text-white hover:bg-red-400"}`}>
              {adminActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : adminAction === "grant" ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
              {adminAction === "grant" ? "Grant Access" : "Revoke Access"}
            </button>
            {adminActionMsg && (
              <span className={`flex items-center gap-1.5 text-sm ${adminActionMsg.ok ? "text-emerald-300" : "text-red-300"}`}>
                {adminActionMsg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {adminActionMsg.text}
              </span>
            )}
          </div>
        </form>
      </Panel>

      {/* ── Status grid ────────────────────────────────── */}
      {loading ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-10 text-center text-white/45">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />Loading system status
          </span>
        </div>
      ) : status && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Admin Setup" value={adminReady ? "Ready" : "Needs Review"} tone={adminReady ? "good" : "warn"} icon={ShieldCheck} />
            <Metric label="Env Configured" value={`${configuredCount}/${status.env.length}`} tone={envWarnings.length ? "warn" : "good"} icon={KeyRound} />
            <Metric label="Project" value={status.system.projectId || "Unknown"} icon={ServerCog} />
            <Metric label="Users" value={String(status.collections.users ?? "-")} icon={Database} />
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
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
                <Detail label="Tier" value={profile?.tier || "-"} />
                <Detail label="Last login" value={dateLabel(profile?.lastLogin)} />
              </div>
            </Panel>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Panel title="Environment Warnings" icon={AlertTriangle}>
              {envWarnings.length === 0 ? (
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-100">
                  All required environment values are configured.
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
              <div className="mt-4 space-y-2 md:hidden">
                {visibleEnv.map((item) => <EnvRow key={item.name} item={item} />)}
                {shouldCollapseEnv && (
                  <button
                    type="button"
                    onClick={() => setEnvListExpanded((current) => !current)}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    {envListExpanded ? "Show fewer environment values" : `View all ${status.env.length} environment values`}
                  </button>
                )}
              </div>
              <div className="mt-4 hidden gap-2 md:grid">
                {status.env.map((item) => <EnvRow key={item.name} item={item} />)}
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

function Metric({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: string; icon: typeof ShieldCheck; tone?: "neutral" | "good" | "warn" }) {
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

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="mb-2 flex flex-col gap-1 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/15 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2">
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
