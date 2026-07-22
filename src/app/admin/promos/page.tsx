"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Download,
  Gift,
  Loader2,
  Pause,
  Plus,
  RefreshCw,
  TicketPercent,
  Users,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PromoBenefit = {
  type: string;
  courseId?: string;
  productId?: string;
  planIds?: string[];
  credits?: number;
  discountKind?: "percent" | "fixed";
  amount?: number;
  durationMonths?: number | null;
  unlockAfterCertificate?: boolean;
  priceCents?: number;
  currency?: string;
  label?: string;
};

type PromoCampaign = {
  promoId: string;
  code: string;
  name: string;
  description?: string;
  status: string;
  maxRedemptions?: number | null;
  redemptionCount: number;
  applicableSurfaces?: string[];
  targetCourseIds?: string[];
  targetProductIds?: string[];
  targetPlanIds?: string[];
  targetCreditBundleIds?: string[];
  benefits: PromoBenefit[];
  audienceRules?: Record<string, unknown>;
};

type PromoRedemption = {
  redemptionId: string;
  code: string;
  userId: string;
  email: string;
  status: string;
  benefitsGranted: string[];
  redeemedAt?: string;
};

type PromoPayload = {
  campaigns: PromoCampaign[];
  redemptions: PromoRedemption[];
  analytics: {
    totalRedemptions: number;
    remainingSlots: number | null;
    redemptionsByBenefit: Record<string, number>;
    redemptionsBySurface?: Record<string, number>;
    failedRedemptionsByReason?: Record<string, number>;
    coursesUnlocked?: number;
    creditsGranted?: number;
    marketplaceProductsClaimed?: number;
    mrrEligibilityReserved?: number;
    subscriptionDiscountsReserved?: number;
    revenueInfluencedCents?: number;
    failedRedemptions: number;
  };
};

const benefitOptions = [
  "academy_course_free",
  "academy_course_discount",
  "subscription_discount",
  "creator_credit_bonus",
  "marketplace_product_free",
  "marketplace_product_discount",
  "mrr_license_unlock",
  "mrr_license_discount",
];

const surfaceOptions = [
  { id: "onboarding", label: "Onboarding", helper: "Signup and founder-code entry." },
  { id: "dashboard", label: "Dashboard", helper: "General account bonus cards." },
  { id: "academy_course", label: "Academy course", helper: "Course detail unlock boxes." },
  { id: "academy_checkout", label: "Academy checkout", helper: "Paid course checkout." },
  { id: "mrr_checkout", label: "MRR checkout", helper: "Master Resell Rights purchase." },
  { id: "creator_credits", label: "Creator Credits", helper: "Credit bundle purchase flow." },
  { id: "subscription_checkout", label: "Subscription checkout", helper: "Plan and billing offers." },
  { id: "marketplace_product", label: "Marketplace product", helper: "Product detail unlock boxes." },
  { id: "marketplace_checkout", label: "Marketplace checkout", helper: "Product checkout." },
];

const benefitSurfaceDefaults: Record<string, string[]> = {
  academy_course_free: ["onboarding", "dashboard", "academy_course", "academy_checkout"],
  academy_course_discount: ["academy_course", "academy_checkout"],
  subscription_discount: ["dashboard", "subscription_checkout"],
  creator_credit_bonus: ["onboarding", "dashboard", "creator_credits"],
  marketplace_product_free: ["marketplace_product", "marketplace_checkout"],
  marketplace_product_discount: ["marketplace_product", "marketplace_checkout"],
  mrr_license_unlock: ["onboarding", "dashboard", "academy_course", "academy_checkout", "mrr_checkout"],
  mrr_license_discount: ["mrr_checkout"],
};

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function statusTone(status: string) {
  if (status === "active") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (status === "paused") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (status === "archived" || status === "expired") return "border-white/10 bg-white/5 text-white/45";
  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

export default function AdminPromosPage() {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [payload, setPayload] = useState<PromoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    status: "draft",
    maxRedemptions: "100",
    benefitType: "creator_credit_bonus",
    courseId: "",
    productId: "",
    credits: "25",
    discountKind: "percent",
    amount: "10",
    applicableSurfaces: ["dashboard", "creator_credits"] as string[],
    targetCourseIds: "",
    targetProductIds: "",
    targetPlanIds: "",
    targetCreditBundleIds: "",
  });

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setAdminUser);
  }, []);

  const loadPromos = async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/promos");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load promos.");
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load promos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminUser) void loadPromos();
  }, [adminUser]);

  const stats = useMemo(() => {
    const campaigns = payload?.campaigns || [];
    const active = campaigns.filter((campaign) => campaign.status === "active").length;
    const totalLimit = campaigns.reduce((sum, campaign) => sum + (typeof campaign.maxRedemptions === "number" ? campaign.maxRedemptions : 0), 0);
    const totalRedeemed = campaigns.reduce((sum, campaign) => sum + (campaign.redemptionCount || 0), 0);
    return { active, totalLimit, totalRedeemed };
  }, [payload]);

  const buildBenefit = (): PromoBenefit => {
    const type = form.benefitType;
    if (type === "academy_course_free") return { type, courseId: form.courseId, label: "Academy course included" };
    if (type === "academy_course_discount") return { type, courseId: form.courseId, discountKind: form.discountKind as any, amount: Number(form.amount) };
    if (type === "mrr_license_unlock") return { type, courseId: form.courseId, unlockAfterCertificate: true, priceCents: 999, currency: "USD", label: "MRR eligibility reserved" };
    if (type === "mrr_license_discount") return { type, courseId: form.courseId, discountKind: form.discountKind as any, amount: Number(form.amount) };
    if (type === "marketplace_product_free") return { type, productId: form.productId, label: "Marketplace product included" };
    if (type === "marketplace_product_discount") return { type, productId: form.productId, discountKind: form.discountKind as any, amount: Number(form.amount) };
    if (type === "subscription_discount") return { type, planIds: csv(form.targetPlanIds), discountKind: form.discountKind as any, amount: Number(form.amount), durationMonths: null };
    return { type: "creator_credit_bonus", credits: Number(form.credits), label: "Creator Credits bonus" };
  };

  const recommendedSurfaces = benefitSurfaceDefaults[form.benefitType] || ["dashboard"];
  const invalidSelectedSurfaces = form.applicableSurfaces.filter((surface) => !recommendedSurfaces.includes(surface));
  const toggleSurface = (surface: string) => {
    setForm((current) => ({
      ...current,
      applicableSurfaces: current.applicableSurfaces.includes(surface)
        ? current.applicableSurfaces.filter((item) => item !== surface)
        : [...current.applicableSurfaces, surface],
    }));
  };

  const selectRecommendedSurfaces = (benefitType: string) => {
    setForm((current) => ({
      ...current,
      benefitType,
      applicableSurfaces: benefitSurfaceDefaults[benefitType] || ["dashboard"],
    }));
  };

  const startEditPromo = (campaign: any) => {
    setEditingPromoId(campaign.promoId || campaign.normalizedCode || campaign.code || null);
    setForm({
      code: campaign.code || "",
      name: campaign.name || "",
      description: campaign.description || "",
      status: campaign.status || "draft",
      maxRedemptions: campaign.maxRedemptions?.toString?.() || "",
      benefitType: campaign.benefits?.[0]?.type || "creator_credit_bonus",
      courseId: campaign.benefits?.[0]?.courseId || "",
      productId: campaign.benefits?.[0]?.productId || "",
      credits: campaign.benefits?.[0]?.credits?.toString?.() || "25",
      discountKind: campaign.benefits?.[0]?.discountKind || "percent",
      amount: campaign.benefits?.[0]?.amount?.toString?.() || "10",
      applicableSurfaces: campaign.applicableSurfaces || ["dashboard", "creator_credits"],
      targetCourseIds: (campaign.targetCourseIds || []).join(", "),
      targetProductIds: (campaign.targetProductIds || []).join(", "),
      targetPlanIds: (campaign.targetPlanIds || []).join(", "),
      targetCreditBundleIds: (campaign.targetCreditBundleIds || []).join(", "),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createPromo = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await adminFetch("/api/admin/promos", {
        method: editingPromoId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(editingPromoId ? { promoId: editingPromoId } : {}),
          code: form.code,
          name: form.name,
          description: form.description,
          status: form.status,
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
          applicableSurfaces: form.applicableSurfaces,
          targetCourseIds: csv(form.targetCourseIds || form.courseId),
          targetProductIds: csv(form.targetProductIds || form.productId),
          targetPlanIds: csv(form.targetPlanIds),
          targetCreditBundleIds: csv(form.targetCreditBundleIds),
          audienceRules: { onePerUser: true, onePerEmail: true },
          benefits: [buildBenefit()],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (editingPromoId ? "Unable to update promo." : "Unable to create promo."));
      setMessage(editingPromoId ? "Promo campaign updated." : "Promo campaign created.");
      setEditingPromoId(null);
      setForm((current) => ({ ...current, code: "", name: "", description: "" }));
      await loadPromos();
    } catch (err) {
      setError(err instanceof Error ? err.message : editingPromoId ? "Unable to update promo." : "Unable to create promo.");
    } finally {
      setSaving(false);
    }
  };

  const createFounder = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await adminFetch("/api/admin/promos/founder-template", {
        method: "POST",
        body: JSON.stringify({ status: "active" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create Founder100.");
      setMessage(data.status === "already_exists" ? "Founder100 already exists." : "Founder100 is ready.");
      await loadPromos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create Founder100.");
    } finally {
      setSaving(false);
    }
  };

  const exportRedemptions = () => {
    const rows = [
      ["code", "email", "userId", "status", "benefits"],
      ...(payload?.redemptions || []).map((redemption) => [
        redemption.code,
        redemption.email,
        redemption.userId,
        redemption.status,
        (redemption.benefitsGranted || []).join("|"),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "promo-redemptions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[24px] border border-white/[0.08] bg-[#101525] p-7 shadow-[0_24px_90px_rgba(0,0,0,.34)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#C4B5FD]">
              <TicketPercent className="h-3.5 w-3.5" />
              Promo Engine
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">Campaigns, founder bonuses, and launch incentives.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Create premium promo campaigns across Academy, subscriptions, Creator Credits, Marketplace products, and MRR eligibility.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={createFounder} disabled={saving} className="rounded-[14px] bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]">
              <Gift className="h-4 w-4" />
              Create Founder100
            </Button>
            <Button onClick={loadPromos} variant="ghost" className="rounded-[14px] border border-white/10 bg-white/[0.04]">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {message && <div className="rounded-[16px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-[16px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Active campaigns", value: stats.active, icon: CheckCircle2 },
          { label: "Redemptions", value: stats.totalRedeemed, icon: Users },
          { label: "Remaining slots", value: payload?.analytics?.remainingSlots ?? "Open", icon: BarChart3 },
          { label: "Total limits", value: stats.totalLimit || "Unlimited", icon: TicketPercent },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-[20px] border border-white/[0.08] bg-[#111827]/72 p-5">
              <Icon className="h-5 w-5 text-[#4F9DFF]" />
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-[22px] border border-white/[0.08] bg-[#111827]/80 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Promo performance</h2>
            <p className="mt-1 text-sm text-white/55">Tracked from the redemption ledger by surface, benefit, and campaign outcome.</p>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">Revenue influenced: ${((payload?.analytics?.revenueInfluencedCents || 0) / 100).toFixed(2)}</p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <MiniMetric label="Courses unlocked" value={payload?.analytics?.coursesUnlocked || 0} />
          <MiniMetric label="Credits granted" value={payload?.analytics?.creditsGranted || 0} />
          <MiniMetric label="Products claimed" value={payload?.analytics?.marketplaceProductsClaimed || 0} />
          <MiniMetric label="MRR reserved" value={payload?.analytics?.mrrEligibilityReserved || 0} />
          <MiniMetric label="Plan discounts" value={payload?.analytics?.subscriptionDiscountsReserved || 0} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Breakdown title="Redemptions by surface" data={payload?.analytics?.redemptionsBySurface || {}} />
          <Breakdown title="Failed redemptions by reason" data={payload?.analytics?.failedRedemptionsByReason || {}} empty="No failed redemptions tracked." />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={createPromo} className="rounded-[22px] border border-white/[0.08] bg-[#111827]/80 p-6">
          <h2 className="text-lg font-semibold text-white">Create campaign</h2>
          <p className="mt-1 text-sm text-white/55">Use premium campaign language. This is an entitlement system, not a coupon drawer.</p>
          <div className="mt-5 space-y-4">
            <Field label="Code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="FOUNDER100" className="promo-input" /></Field>
            <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Founder Member Bonus" className="promo-input" /></Field>
            <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this campaign unlocks..." className="promo-input min-h-24" /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="promo-input">
                  {["draft", "active", "paused", "archived"].map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Max redemptions"><input value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} className="promo-input" /></Field>
            </div>
            <Field label="Benefit">
              <select value={form.benefitType} onChange={(e) => selectRecommendedSurfaces(e.target.value)} className="promo-input">
                {benefitOptions.map((benefit) => <option key={benefit}>{benefit}</option>)}
              </select>
            </Field>

            <div className="rounded-[18px] border border-white/[0.08] bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Where this promo applies</h3>
                  <p className="mt-1 text-xs leading-5 text-white/50">Choose the surfaces where this code can be redeemed. The server enforces this during redemption.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, applicableSurfaces: recommendedSurfaces })}
                  className="rounded-full border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 px-3 py-1 text-xs font-semibold text-[#C4B5FD]"
                >
                  Use recommended
                </button>
              </div>
              <div className="mt-4 grid gap-2">
                {surfaceOptions.map((surface) => {
                  const checked = form.applicableSurfaces.includes(surface.id);
                  const recommended = recommendedSurfaces.includes(surface.id);
                  return (
                    <label key={surface.id} className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[14px] border p-3 transition",
                      checked ? "border-[#8B5CF6]/45 bg-[#8B5CF6]/12" : "border-white/[0.07] bg-white/[0.035]"
                    )}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSurface(surface.id)}
                        className="mt-1 h-4 w-4 accent-[#8B5CF6]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-white">
                          {surface.label}
                          {recommended ? <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-100">Recommended</span> : null}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-white/48">{surface.helper}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {invalidSelectedSurfaces.length ? (
                <p className="mt-3 rounded-[12px] border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                  This benefit usually does not apply to: {invalidSelectedSurfaces.join(", ")}. Saving will be blocked by the server unless the benefit supports the selected surface.
                </p>
              ) : null}
            </div>

            {form.benefitType.includes("academy") || form.benefitType.includes("mrr") ? (
              <>
                <Field label="Primary Academy course ID"><input value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} placeholder="digital-marketing-certification" className="promo-input" /></Field>
                <Field label="Target course IDs (optional, comma separated)"><input value={form.targetCourseIds} onChange={(e) => setForm({ ...form, targetCourseIds: e.target.value })} placeholder="digital-marketing-certification, ai-business-foundations" className="promo-input" /></Field>
              </>
            ) : null}
            {form.benefitType.includes("marketplace") ? (
              <>
                <Field label="Primary Marketplace product ID"><input value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="promo-input" /></Field>
                <Field label="Target product IDs (optional, comma separated)"><input value={form.targetProductIds} onChange={(e) => setForm({ ...form, targetProductIds: e.target.value })} className="promo-input" /></Field>
              </>
            ) : null}
            {form.benefitType === "creator_credit_bonus" ? (
              <>
                <Field label="Creator Credits"><input value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className="promo-input" /></Field>
                <Field label="Target credit bundle IDs (optional, comma separated)"><input value={form.targetCreditBundleIds} onChange={(e) => setForm({ ...form, targetCreditBundleIds: e.target.value })} placeholder="starter-credits, creator-100" className="promo-input" /></Field>
              </>
            ) : null}
            {form.benefitType === "subscription_discount" ? (
              <Field label="Target plan IDs (optional, comma separated)"><input value={form.targetPlanIds} onChange={(e) => setForm({ ...form, targetPlanIds: e.target.value })} placeholder="pro, elite" className="promo-input" /></Field>
            ) : null}
            {form.benefitType.includes("discount") ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Discount type"><select value={form.discountKind} onChange={(e) => setForm({ ...form, discountKind: e.target.value })} className="promo-input"><option value="percent">Percent</option><option value="fixed">Fixed</option></select></Field>
                <Field label="Amount"><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="promo-input" /></Field>
              </div>
            ) : null}
          </div>
          <Button type="submit" disabled={saving} className="mt-6 h-12 w-full rounded-[14px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editingPromoId ? "Save changes" : "Create promo"}
          </Button>
        </form>

        <div className="space-y-6">
          <section className="rounded-[22px] border border-white/[0.08] bg-[#111827]/80 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Campaigns</h2>
                <p className="mt-1 text-sm text-white/55">Pause/archive actions are handled by the status field and server APIs in the next refinement.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {loading ? <Loader2 className="h-5 w-5 animate-spin text-white/50" /> : null}
              {!loading && (payload?.campaigns || []).map((campaign) => (
                <div key={campaign.promoId} className="rounded-[18px] border border-white/[0.07] bg-white/[0.035] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white">{campaign.code}</code>
                        <span className={cn("rounded-full border px-2.5 py-1 text-xs capitalize", statusTone(campaign.status))}>{campaign.status}</span>
                      </div>
                      <h3 className="mt-3 font-semibold text-white">{campaign.name}</h3>
                      <p className="mt-1 text-sm text-white/55">{campaign.description || "No description."}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(campaign.benefits || []).map((benefit, index) => (
                          <span key={`${benefit.type}-${index}`} className="rounded-full bg-[#5B5FFF]/10 px-3 py-1 text-xs text-[#C4B5FD]">{benefit.label || benefit.type}</span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(campaign.applicableSurfaces || []).map((surface) => (
                          <span key={surface} className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/55">{surface}</span>
                        ))}
                      </div>
                      {campaign.targetCourseIds?.length || campaign.targetProductIds?.length || campaign.targetPlanIds?.length || campaign.targetCreditBundleIds?.length ? (
                        <p className="mt-3 text-xs leading-5 text-white/45">
                          Targets: {[...(campaign.targetCourseIds || []), ...(campaign.targetProductIds || []), ...(campaign.targetPlanIds || []), ...(campaign.targetCreditBundleIds || [])].join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-sm text-white/60">
                      <p className="text-xl font-semibold text-white">{campaign.redemptionCount || 0}</p>
                      <p>of {campaign.maxRedemptions || "unlimited"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEditPromo(campaign)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/80 transition hover:border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/10 hover:text-white"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
              {!loading && !(payload?.campaigns || []).length ? <p className="text-sm text-white/45">No promo campaigns yet.</p> : null}
            </div>
          </section>

          <section className="rounded-[22px] border border-white/[0.08] bg-[#111827]/80 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Redemption history</h2>
                <p className="mt-1 text-sm text-white/55">Immutable redemption ledger for reporting and support.</p>
              </div>
              <Button onClick={exportRedemptions} variant="ghost" className="rounded-[14px] border border-white/10 bg-white/[0.04]">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
            <div className="mt-5 overflow-hidden rounded-[16px] border border-white/[0.07]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-white/45">
                  <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Benefits</th></tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {(payload?.redemptions || []).slice(0, 50).map((redemption) => (
                    <tr key={redemption.redemptionId} className="text-white/70">
                      <td className="px-4 py-3"><code className="rounded bg-black/25 px-2 py-1 text-xs text-white">{redemption.code}</code></td>
                      <td className="px-4 py-3">{redemption.email || "-"}</td>
                      <td className="px-4 py-3">{redemption.status}</td>
                      <td className="px-4 py-3">{(redemption.benefitsGranted || []).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(payload?.redemptions || []).length ? <p className="p-5 text-sm text-white/45">No redemptions yet.</p> : null}
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        .promo-input {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.045);
          padding: 12px 14px;
          color: white;
          outline: none;
        }
        .promo-input:focus {
          border-color: rgba(139,92,246,.55);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">{label}</span>
      {children}
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.035] p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Breakdown({ title, data, empty = "No data yet." }: { title: string; data: Record<string, number>; empty?: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="rounded-[18px] border border-white/[0.07] bg-black/15 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 rounded-[12px] bg-white/[0.04] px-3 py-2 text-sm">
            <span className="text-white/60">{key.replace(/_/g, " ")}</span>
            <span className="font-semibold text-white">{value}</span>
          </div>
        ))}
        {!entries.length ? <p className="text-sm text-white/40">{empty}</p> : null}
      </div>
    </div>
  );
}
