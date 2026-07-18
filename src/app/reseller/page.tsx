"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Circle,
  Copy,
  DollarSign,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShoppingBag,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { authFetch, parseApiError } from "@/lib/clientApi";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type SetupStep = {
  key: string;
  label: string;
  description: string;
  complete: boolean;
  href: string;
};

type ResellerLinkItem = {
  id: string;
  itemType: "academy_course" | "marketplace_product";
  itemId: string;
  title: string;
  thumbnailUrl: string;
  slug: string;
  url: string;
  active: boolean;
  resalePriceCents: number;
  commissionType: "fixed" | "percentage" | string;
  commissionValue: number;
  clickCount: number;
  health: {
    status: "healthy" | "warning" | "paused" | string;
    label: string;
    detail: string;
  };
};

type ResellerSale = {
  id: string;
  itemType: "academy_course" | "marketplace_product";
  buyerName: string;
  buyerEmail: string;
  itemTitle: string;
  grossAmountCents: number;
  resellerEarningsCents: number;
  status: string;
  paystackReference: string;
  createdAt: string | null;
  paidAt: string | null;
};

type PayoutProfile = {
  method: string;
  accountName: string;
  accountDetails: string;
  country: string;
  currency: string;
  status: string;
};

type ResellerDashboard = {
  totals: {
    totalEarningsCents: number;
    pendingPayoutCents: number;
    paidEarningsCents: number;
    salesCount: number;
    buyersCount: number;
    activeLinksCount: number;
    linkClicksCount: number;
    conversionRate: number | null;
  };
  payoutProfile: PayoutProfile | null;
  payoutReadiness: {
    status: "missing" | "pending_review" | "ready" | "saved" | string;
    label: string;
    detail: string;
    blocking: boolean;
  };
  eligibility: {
    certificatesCount: number;
    eligibleMrrCount: number;
    activeLicenseCount: number;
    mrrPurchasesCount: number;
    setupSteps: SetupStep[];
    nextAction: SetupStep | null;
  };
  links: ResellerLinkItem[];
  sales: ResellerSale[];
};

const payoutMethods = [
  { value: "bank", label: "Bank transfer" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "paypal", label: "PayPal" },
  { value: "paystack", label: "Paystack transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "other", label: "Other" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function qrUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(value)}`;
}

export default function ResellerDashboardPage() {
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<ResellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);
  const [selectedQr, setSelectedQr] = useState<ResellerLinkItem | null>(null);
  const [salesSearch, setSalesSearch] = useState("");
  const [salesStatusFilter, setSalesStatusFilter] = useState<"all" | "pending" | "payable" | "paid">("all");
  const [salesTypeFilter, setSalesTypeFilter] = useState<"all" | "academy_course" | "marketplace_product">("all");
  const [payoutForm, setPayoutForm] = useState<PayoutProfile>({
    method: "",
    accountName: "",
    accountDetails: "",
    country: "",
    currency: "USD",
    status: "draft",
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/reseller/dashboard");
      if (!response.ok) throw await parseApiError(response, "Unable to load reseller dashboard.");
      const payload = (await response.json()) as ResellerDashboard;
      setDashboard(payload);
      setPayoutForm({
        method: payload.payoutProfile?.method || "",
        accountName: payload.payoutProfile?.accountName || "",
        accountDetails: payload.payoutProfile?.accountDetails || "",
        country: payload.payoutProfile?.country || "",
        currency: payload.payoutProfile?.currency || "USD",
        status: payload.payoutProfile?.status || "draft",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reseller dashboard.");
      toast({
        title: "Unable to load reseller dashboard",
        description: err instanceof Error ? err.message : "Please retry in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const setupProgress = useMemo(() => {
    const steps = dashboard?.eligibility.setupSteps || [];
    if (steps.length === 0) return 0;
    return Math.round((steps.filter((step) => step.complete).length / steps.length) * 100);
  }, [dashboard]);

  const filteredSales = useMemo(() => {
    const term = salesSearch.trim().toLowerCase();
    return (dashboard?.sales || []).filter((sale) => {
      const statusOk = salesStatusFilter === "all" || sale.status === salesStatusFilter;
      const typeOk = salesTypeFilter === "all" || sale.itemType === salesTypeFilter;
      const textOk = !term || [
        sale.buyerName,
        sale.buyerEmail,
        sale.itemTitle,
        sale.paystackReference,
        sale.status,
      ].some((value) => value.toLowerCase().includes(term));
      return statusOk && typeOk && textOk;
    });
  }, [dashboard?.sales, salesSearch, salesStatusFilter, salesTypeFilter]);

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "Reseller link copied", description: url });
  };

  const shareLink = (url: string, platform: "whatsapp" | "facebook" | "x" | "linkedin" | "email") => {
    const encodedUrl = encodeURIComponent(url);
    const text = encodeURIComponent("I thought you might like this SDC resource.");
    const href = {
      whatsapp: `https://wa.me/?text=${text}%20${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      x: `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      email: `mailto:?subject=SDC resource&body=${text}%0A%0A${encodedUrl}`,
    }[platform];
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const savePayoutProfile = async () => {
    if (!payoutForm.method || !payoutForm.accountName.trim() || !payoutForm.accountDetails.trim()) {
      toast({
        title: "Payout details incomplete",
        description: "Choose a payout method, account name, and account details.",
        variant: "destructive",
      });
      return;
    }

    setSavingPayout(true);
    try {
      const response = await authFetch("/api/reseller/payout-profile", {
        method: "POST",
        body: JSON.stringify(payoutForm),
      });
      if (!response.ok) throw await parseApiError(response, "Unable to save payout details.");
      toast({ title: "Payout details saved", description: "Your payout profile is ready for admin review." });
      await loadDashboard();
    } catch (err) {
      toast({
        title: "Unable to save payout details",
        description: err instanceof Error ? err.message : "Please check the form and try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPayout(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-100">
                <Award className="h-3.5 w-3.5" />
                Reseller command center
              </div>
              <h1 className="font-headline text-4xl font-bold tracking-tight">Reseller Dashboard</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Manage Academy and Marketplace reseller links, track commissions, and prepare your payout profile.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={loadDashboard} variant="outline" disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button asChild className="bg-gradient-to-r from-blue-600 to-violet-600">
                <Link href="/my-courses">Create reseller link</Link>
              </Button>
            </div>
          </div>

          {loading && <DashboardSkeleton />}

          {!loading && error && (
            <GlassCard className="border-amber-400/30 bg-amber-400/10 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-200" />
                  <div>
                    <p className="font-semibold text-amber-100">Reseller dashboard unavailable</p>
                    <p className="text-sm text-amber-100/75">{error}</p>
                  </div>
                </div>
                <Button onClick={loadDashboard} variant="outline">Retry</Button>
              </div>
            </GlassCard>
          )}

          {dashboard && (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-8">
                <Metric label="Total earnings" value={money(dashboard.totals.totalEarningsCents)} icon={DollarSign} className="xl:col-span-2" />
                <Metric label="Pending payout" value={money(dashboard.totals.pendingPayoutCents)} icon={WalletCards} />
                <Metric label="Paid earnings" value={money(dashboard.totals.paidEarningsCents)} icon={CheckCircle2} />
                <Metric label="Sales" value={dashboard.totals.salesCount.toLocaleString()} icon={ShoppingBag} />
                <Metric label="Buyers" value={dashboard.totals.buyersCount.toLocaleString()} icon={Users} />
                <Metric label="Active links" value={dashboard.totals.activeLinksCount.toLocaleString()} icon={Share2} />
                <Metric label="Conversion" value={dashboard.totals.conversionRate == null ? "-" : `${dashboard.totals.conversionRate}%`} icon={TrendingUp} />
                <Metric label="Clicks" value={dashboard.totals.linkClicksCount.toLocaleString()} icon={TrendingUp} />
              </section>

              <PayoutReadinessBanner readiness={dashboard.payoutReadiness} />

              <section className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold">Setup checklist</h2>
                      <p className="text-sm text-muted-foreground">Follow the steps from certification to first sale.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{setupProgress}%</p>
                      <p className="text-xs text-white/45">complete</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {dashboard.eligibility.setupSteps.map((step) => (
                      <Link
                        key={step.key}
                        href={step.href}
                        className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-violet-400/40 hover:bg-violet-500/10"
                      >
                        {step.complete ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                        ) : (
                          <Circle className="mt-0.5 h-5 w-5 shrink-0 text-white/35" />
                        )}
                        <div>
                          <p className="font-semibold text-white">{step.label}</p>
                          <p className="mt-1 text-sm text-white/55">{step.description}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-bold">Recommended next action</h2>
                      <p className="text-sm text-muted-foreground">
                        SDC will point you to the next useful step.
                      </p>
                    </div>
                    <Badge variant="outline">{dashboard.eligibility.activeLicenseCount} active licenses</Badge>
                  </div>
                  <div className="mt-6 rounded-3xl border border-blue-400/20 bg-gradient-to-br from-blue-500/15 to-violet-500/10 p-6">
                    {dashboard.eligibility.nextAction ? (
                      <>
                        <p className="text-sm uppercase tracking-[0.25em] text-blue-100/60">Next step</p>
                        <h3 className="mt-3 text-2xl font-bold text-white">{dashboard.eligibility.nextAction.label}</h3>
                        <p className="mt-2 text-white/65">{dashboard.eligibility.nextAction.description}</p>
                        <Button asChild className="mt-5">
                          <Link href={dashboard.eligibility.nextAction.href}>Continue</Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm uppercase tracking-[0.25em] text-emerald-100/60">Ready</p>
                        <h3 className="mt-3 text-2xl font-bold text-white">Your reseller setup is complete.</h3>
                        <p className="mt-2 text-white/65">Keep sharing your best links and watch the sales history below.</p>
                      </>
                    )}
                  </div>
                </GlassCard>
              </section>

              <section id="links" className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">Active reseller links</h2>
                    <p className="text-sm text-muted-foreground">Share links for Academy courses and Marketplace products with tracked attribution.</p>
                  </div>
                </div>
                {dashboard.links.length === 0 ? (
                  <EmptyState
                    title="No reseller links yet"
                    description="After you buy eligible Master Resell Rights, create your tracked links from My Courses."
                    href="/my-courses"
                    cta="Open My Courses"
                  />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {dashboard.links.map((link) => (
                      <ResellerLinkCard
                        key={link.id}
                        item={link}
                        onCopy={() => copyLink(link.url)}
                        onQr={() => setSelectedQr(link)}
                        onShare={(platform) => shareLink(link.url, platform)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section id="payout" className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <GlassCard className="p-6">
                  <h2 className="text-lg font-bold">Payout status</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Admins use your saved payout details when commissions are paid.</p>
                  <div className="mt-5 space-y-3 text-sm">
                    <Detail label="Status" value={dashboard.payoutReadiness.label} />
                    <Detail label="Pending payout" value={money(dashboard.totals.pendingPayoutCents)} />
                    <Detail label="Currency" value={payoutForm.currency || "USD"} />
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h2 className="text-lg font-bold">Payout profile</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Add payout details once, then keep selling.</p>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field label="Payout method">
                      <select
                        value={payoutForm.method}
                        onChange={(event) => setPayoutForm((form) => ({ ...form, method: event.target.value }))}
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-primary/60"
                      >
                        <option value="">Choose method</option>
                        {payoutMethods.map((method) => (
                          <option key={method.value} value={method.value}>{method.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Account name">
                      <input
                        value={payoutForm.accountName}
                        onChange={(event) => setPayoutForm((form) => ({ ...form, accountName: event.target.value }))}
                        placeholder="Name on payout account"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-primary/60"
                      />
                    </Field>
                    <Field label="Country">
                      <input
                        value={payoutForm.country}
                        onChange={(event) => setPayoutForm((form) => ({ ...form, country: event.target.value }))}
                        placeholder="Kenya, United States, ..."
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-primary/60"
                      />
                    </Field>
                    <Field label="Currency">
                      <input
                        value={payoutForm.currency}
                        onChange={(event) => setPayoutForm((form) => ({ ...form, currency: event.target.value.toUpperCase() }))}
                        placeholder="USD"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm uppercase outline-none focus:border-primary/60"
                      />
                    </Field>
                    <Field label="Account details" className="md:col-span-2">
                      <textarea
                        value={payoutForm.accountDetails}
                        onChange={(event) => setPayoutForm((form) => ({ ...form, accountDetails: event.target.value }))}
                        placeholder="Account number, phone number, PayPal email, bank name, or payout instructions."
                        className="min-h-28 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm outline-none focus:border-primary/60"
                      />
                    </Field>
                  </div>
                  <Button onClick={savePayoutProfile} disabled={savingPayout} className="mt-5">
                    {savingPayout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WalletCards className="mr-2 h-4 w-4" />}
                    Save payout details
                  </Button>
                </GlassCard>
              </section>

              <section id="sales" className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <div className="border-b border-white/10 px-5 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <h2 className="font-semibold">Sales history</h2>
                      <p className="text-sm text-muted-foreground">Search by buyer, item, status, or Paystack reference.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          value={salesSearch}
                          onChange={(event) => setSalesSearch(event.target.value)}
                          placeholder="Search sales"
                          className="h-10 w-full rounded-xl border border-white/10 bg-black/25 pl-9 pr-3 text-sm outline-none focus:border-primary/60"
                        />
                      </label>
                      <select
                        value={salesStatusFilter}
                        onChange={(event) => setSalesStatusFilter(event.target.value as typeof salesStatusFilter)}
                        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-primary/60"
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="payable">Payable</option>
                        <option value="paid">Paid</option>
                      </select>
                      <select
                        value={salesTypeFilter}
                        onChange={(event) => setSalesTypeFilter(event.target.value as typeof salesTypeFilter)}
                        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-primary/60"
                      >
                        <option value="all">Academy + Marketplace</option>
                        <option value="academy_course">Academy</option>
                        <option value="marketplace_product">Marketplace</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1120px] w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/45">
                      <tr>
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Buyer</th>
                        <th className="px-4 py-3 font-medium">Gross</th>
                        <th className="px-4 py-3 font-medium">Commission</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Purchase date</th>
                        <th className="px-4 py-3 font-medium">Payout date</th>
                        <th className="px-4 py-3 font-medium">Paystack ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredSales.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-white/45">
                            {dashboard.sales.length === 0 ? "No reseller sales yet. Share your first reseller link to begin." : "No sales match these filters."}
                          </td>
                        </tr>
                      )}
                      {filteredSales.map((sale) => (
                        <tr key={sale.id}>
                          <td className="px-4 py-3 text-white/80">{sale.itemTitle}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{sale.itemType === "academy_course" ? "Academy" : "Marketplace"}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white/80">{sale.buyerName}</p>
                            <p className="text-xs text-white/40">{sale.buyerEmail || "Email hidden"}</p>
                          </td>
                          <td className="px-4 py-3 text-white/65">{money(sale.grossAmountCents)}</td>
                          <td className="px-4 py-3 font-semibold text-cyan-200">{money(sale.resellerEarningsCents)}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="capitalize">{sale.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-white/55">{dateLabel(sale.createdAt)}</td>
                          <td className="px-4 py-3 text-white/55">{dateLabel(sale.paidAt)}</td>
                          <td className="px-4 py-3 text-white/55">{sale.paystackReference || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        {selectedQr && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setSelectedQr(null)}>
            <GlassCard className="max-w-sm p-6 text-center" onClick={(event) => event.stopPropagation()}>
              <h2 className="text-lg font-bold">QR code</h2>
              <p className="mt-1 text-sm text-muted-foreground">Scan or save this code to share your reseller link.</p>
              <div className="mx-auto mt-5 flex h-64 w-64 items-center justify-center rounded-2xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl(selectedQr.url)} alt={`QR code for ${selectedQr.title}`} className="h-full w-full" />
              </div>
              <Button onClick={() => setSelectedQr(null)} className="mt-5 w-full" variant="outline">Close</Button>
            </GlassCard>
          </div>
        )}
      </AppLayout>
    </ProtectedRoute>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <GlassCard key={item} className="h-28 animate-pulse p-5">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="mt-5 h-7 w-20 rounded bg-white/10" />
          </GlassCard>
        ))}
      </div>
      <GlassCard className="h-64 animate-pulse p-6" />
    </div>
  );
}

function Metric({ label, value, icon: Icon, className }: { label: string; value: string; icon: typeof DollarSign; className?: string }) {
  return (
    <GlassCard className={cn("p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
    </GlassCard>
  );
}

function PayoutReadinessBanner({ readiness }: { readiness: ResellerDashboard["payoutReadiness"] }) {
  const isMissing = readiness.status === "missing";
  const isPending = readiness.status === "pending_review";
  return (
    <GlassCard className={cn(
      "p-5",
      isMissing && "border-amber-400/30 bg-amber-400/10",
      isPending && "border-blue-400/30 bg-blue-400/10",
      !isMissing && !isPending && "border-emerald-400/30 bg-emerald-400/10"
    )}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          {isMissing ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-200" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-200" />}
          <div>
            <p className="font-semibold text-white">{readiness.label}</p>
            <p className="text-sm text-white/65">{readiness.detail}</p>
          </div>
        </div>
        <Button asChild variant="outline">
          <a href="#payout">{isMissing ? "Add payout details" : "Review payout profile"}</a>
        </Button>
      </div>
    </GlassCard>
  );
}

function ResellerLinkCard({
  item,
  onCopy,
  onQr,
  onShare,
}: {
  item: ResellerLinkItem;
  onCopy: () => void;
  onQr: () => void;
  onShare: (platform: "whatsapp" | "facebook" | "x" | "linkedin" | "email") => void;
}) {
  const healthy = item.health.status === "healthy";
  return (
    <GlassCard className="p-5">
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/25">
              <ShoppingBag className="h-7 w-7" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.itemType === "academy_course" ? "Academy Course" : "Marketplace Product"}</Badge>
            <Badge variant="outline" className={healthy ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200"}>
              {item.health.label}
            </Badge>
          </div>
          <h3 className="mt-3 truncate text-lg font-bold text-white">{item.title}</h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">{item.url}</p>
          <p className="mt-2 text-xs text-white/45">{item.health.detail}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-4">
        <Detail label="Resale price" value={money(item.resalePriceCents)} />
        <Detail label="Commission" value={item.commissionType === "percentage" ? `${item.commissionValue}%` : money(item.commissionValue * 100)} />
        <Detail label="Status" value={item.active ? "Active" : "Paused"} />
        <Detail label="Clicks" value={item.clickCount.toLocaleString()} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onCopy} size="sm">
          <Copy className="h-4 w-4" />
          Copy
        </Button>
        <Button onClick={onQr} size="sm" variant="outline">
          <QrCode className="h-4 w-4" />
          QR
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={item.url || "#"} target="_blank">
            <ExternalLink className="h-4 w-4" />
            View public page
          </Link>
        </Button>
        <Button onClick={() => onShare("whatsapp")} size="sm" variant="ghost"><Send className="h-4 w-4" />WhatsApp</Button>
        <Button onClick={() => onShare("facebook")} size="sm" variant="ghost">Facebook</Button>
        <Button onClick={() => onShare("x")} size="sm" variant="ghost">X</Button>
        <Button onClick={() => onShare("linkedin")} size="sm" variant="ghost">LinkedIn</Button>
        <Button onClick={() => onShare("email")} size="sm" variant="ghost">Email</Button>
      </div>
    </GlassCard>
  );
}

function EmptyState({ title, description, href, cta }: { title: string; description: string; href: string; cta: string }) {
  return (
    <GlassCard className="p-8 text-center">
      <TrendingUp className="mx-auto h-8 w-8 text-white/35" />
      <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-5">
        <Link href={href}>{cta}</Link>
      </Button>
    </GlassCard>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-1 font-semibold text-white">{value || "-"}</p>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block text-sm font-medium text-white/75">{label}</span>
      {children}
    </label>
  );
}
