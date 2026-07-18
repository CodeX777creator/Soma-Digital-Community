"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { Copy, DollarSign, Loader2, ShoppingBag, Users } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/providers/AuthProvider";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/clientApi";

type ResellerLink = {
  id: string;
  assetId: string;
  courseId?: string;
  itemType?: string;
  slug: string;
  url: string;
  active: boolean;
  resalePrice: number;
};

type ResellerSale = {
  id: string;
  resellerUserId: string;
  buyerUserId: string;
  assetId: string;
  purchaseId: string;
  grossAmount: number;
  resellerEarnings: number;
  status: "pending" | "payable" | "paid";
  paystackReference?: string;
  createdAt?: any;
  paidAt?: any;
};

type AssetSummary = {
  title: string;
  thumbnailUrl: string;
};

type BuyerSummary = {
  name: string;
  email: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function dateLabel(value: any) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function ResellerDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [links, setLinks] = useState<ResellerLink[]>([]);
  const [sales, setSales] = useState<ResellerSale[]>([]);
  const [assets, setAssets] = useState<Record<string, AssetSummary>>({});
  const [buyers, setBuyers] = useState<Record<string, BuyerSummary>>({});
  const [loading, setLoading] = useState(true);
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutName, setPayoutName] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!user?.uid || !db) return;
      const firestore = db;
      setLoading(true);
      try {
        const [linksSnap, salesSnap] = await Promise.all([
          getDocs(query(collection(firestore, "resellerLinks"), where("userId", "==", user.uid))),
          getDocs(query(collection(firestore, "resellerSales"), where("resellerUserId", "==", user.uid))),
        ]);

        const profileResponse = await authFetch("/api/reseller/payout-profile");
        const profilePayload = await profileResponse.json();
        const profile = profilePayload.profile || {};

        const nextLinks = linksSnap.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            assetId: data.assetId || "",
            courseId: data.courseId || "",
            itemType: data.itemType || "marketplace_asset",
            slug: data.slug || "",
            url: data.url || "",
            active: data.active !== false,
            resalePrice: typeof data.resalePrice === "number" ? data.resalePrice : 0,
          };
        });

        const nextSales = salesSnap.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            resellerUserId: data.resellerUserId || "",
            buyerUserId: data.buyerUserId || "",
            assetId: data.assetId || "",
            purchaseId: data.purchaseId || "",
            grossAmount: typeof data.grossAmount === "number" ? data.grossAmount : 0,
            resellerEarnings: typeof data.resellerEarnings === "number" ? data.resellerEarnings : 0,
            status: data.status === "paid" ? "paid" : data.status === "pending" ? "pending" : "payable",
            paystackReference: data.paystackReference || "",
            createdAt: data.createdAt || null,
            paidAt: data.paidAt || null,
          } as ResellerSale;
        });

        const assetIds = Array.from(new Set([...nextLinks.filter((item) => item.itemType !== "academy_course").map((item) => item.assetId), ...nextSales.map((item) => item.assetId)].filter(Boolean)));
        const courseIds = Array.from(new Set(nextLinks.filter((item) => item.itemType === "academy_course").map((item) => item.courseId || item.assetId).filter(Boolean)));
        const buyerIds = Array.from(new Set(nextSales.map((item) => item.buyerUserId).filter(Boolean)));

        const [assetEntries, courseEntries, buyerEntries] = await Promise.all([
          Promise.all(assetIds.map(async (assetId) => {
            const snap = await getDoc(doc(firestore, "marketplaceAssets", assetId));
            const data = snap.data() || {};
            return [assetId, { title: data.title || "Marketplace product", thumbnailUrl: data.thumbnailUrl || "" }] as const;
          })),
          Promise.all(courseIds.map(async (courseId) => {
            const snap = await getDoc(doc(firestore, "academyCourses", courseId));
            const data = snap.data() || {};
            return [courseId, { title: data.title || "Academy course", thumbnailUrl: data.thumbnailUrl || "" }] as const;
          })),
          Promise.all(buyerIds.map(async (buyerId) => {
            const snap = await getDoc(doc(firestore, "users", buyerId));
            const data = snap.data() || {};
            return [buyerId, { name: data.name || data.displayName || "Buyer", email: data.email || "" }] as const;
          })),
        ]);

        if (!cancelled) {
          setLinks(nextLinks);
          setSales(nextSales.sort((a, b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0)));
          setAssets(Object.fromEntries([...assetEntries, ...courseEntries]));
          setBuyers(Object.fromEntries(buyerEntries));
          setPayoutMethod(profile.method || "");
          setPayoutName(profile.accountName || "");
          setPayoutDetails(profile.accountDetails || "");
        }
      } catch (error) {
        console.error("Unable to load reseller dashboard:", error);
        toast({ title: "Unable to load reseller dashboard", description: "Please refresh and try again." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [toast, user?.uid]);

  const totals = useMemo(() => {
    const pending = sales.filter((sale) => sale.status !== "paid").reduce((sum, sale) => sum + sale.resellerEarnings, 0);
    const paid = sales.filter((sale) => sale.status === "paid").reduce((sum, sale) => sum + sale.resellerEarnings, 0);
    return {
      totalSales: sales.length,
      pending,
      paid,
      total: pending + paid,
      buyers: new Set(sales.map((sale) => sale.buyerUserId)).size,
    };
  }, [sales]);

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
  };

  const savePayoutProfile = async () => {
    setSavingPayout(true);
    try {
      const response = await authFetch("/api/reseller/payout-profile", {
        method: "POST",
        body: JSON.stringify({
          method: payoutMethod,
          accountName: payoutName,
          accountDetails: payoutDetails,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to save payout details");
      toast({ title: "Payout details saved" });
    } catch (error) {
      toast({ title: "Unable to save payout details", description: error instanceof Error ? error.message : "Please try again." });
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
              <h1 className="font-headline text-4xl font-bold tracking-tight">Reseller Dashboard</h1>
              <p className="mt-2 text-muted-foreground">Track your MRR links, sales, buyers, and commissions.</p>
            </div>
            <Button asChild variant="ghost" className="border border-white/10 bg-white/5">
              <Link href="/my-courses">My Courses</Link>
            </Button>
          </div>

          {loading && (
            <GlassCard className="p-8 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
              Loading reseller data
            </GlassCard>
          )}

          {!loading && (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Metric label="Total Sales" value={String(totals.totalSales)} icon={ShoppingBag} />
                <Metric label="Pending" value={money(totals.pending)} icon={DollarSign} />
                <Metric label="Paid" value={money(totals.paid)} icon={DollarSign} />
                <Metric label="Total Earnings" value={money(totals.total)} icon={DollarSign} />
                <Metric label="Buyers" value={String(totals.buyers)} icon={Users} />
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                {links.length === 0 ? (
                  <GlassCard className="p-8 text-center text-muted-foreground lg:col-span-2">
                    MRR reseller links appear here after you buy an MRR course.
                  </GlassCard>
                ) : links.map((link) => (
                  <GlassCard key={link.id} className="p-5">
                    <div className="flex gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-white/5">
                        {assets[link.courseId || link.assetId]?.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={assets[link.courseId || link.assetId].thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{assets[link.courseId || link.assetId]?.title || "MRR item"}</p>
                        <p className="mt-1 text-xs uppercase tracking-wider text-cyan-200/70">{link.itemType === "academy_course" ? "Academy course MRR" : "Marketplace product MRR"}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{link.url}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button onClick={() => copyLink(link.url)} size="sm">
                            <Copy className="h-4 w-4" />
                            Copy Link
                          </Button>
                          <span className="rounded-full bg-white/10 px-3 py-2 text-xs text-white/65">
                            Resale price {money(link.resalePrice)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </section>

              <GlassCard className="p-5">
                <h2 className="text-lg font-bold">Payout Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Admins use this information when paying your commissions.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <input
                    value={payoutMethod}
                    onChange={(event) => setPayoutMethod(event.target.value)}
                    placeholder="Paystack, M-Pesa, Bank"
                    className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-primary/60"
                  />
                  <input
                    value={payoutName}
                    onChange={(event) => setPayoutName(event.target.value)}
                    placeholder="Account name"
                    className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-primary/60"
                  />
                  <input
                    value={payoutDetails}
                    onChange={(event) => setPayoutDetails(event.target.value)}
                    placeholder="Account number, phone, or payout notes"
                    className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-primary/60"
                  />
                </div>
                <Button onClick={savePayoutProfile} disabled={savingPayout} className="mt-4">
                  {savingPayout ? "Saving..." : "Save Payout Details"}
                </Button>
              </GlassCard>

              <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
                <div className="border-b border-white/10 px-4 py-3">
                  <h2 className="font-semibold">Sales History</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/45">
                      <tr>
                        <th className="px-4 py-3 font-medium">Course</th>
                        <th className="px-4 py-3 font-medium">Buyer</th>
                        <th className="px-4 py-3 font-medium">Gross</th>
                        <th className="px-4 py-3 font-medium">Commission</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {sales.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-white/45">No reseller sales yet.</td>
                        </tr>
                      )}
                      {sales.map((sale) => (
                        <tr key={sale.id}>
                          <td className="px-4 py-3 text-white/80">{assets[sale.assetId]?.title || sale.assetId}</td>
                          <td className="px-4 py-3">
                            <p className="text-white/80">{buyers[sale.buyerUserId]?.name || "Buyer"}</p>
                            <p className="text-xs text-white/40">{buyers[sale.buyerUserId]?.email || sale.buyerUserId}</p>
                          </td>
                          <td className="px-4 py-3 text-white/65">{money(sale.grossAmount)}</td>
                          <td className="px-4 py-3 font-semibold text-cyan-200">{money(sale.resellerEarnings)}</td>
                          <td className="px-4 py-3 capitalize text-white/65">{sale.status}</td>
                          <td className="px-4 py-3 text-white/55">{dateLabel(sale.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof DollarSign }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </GlassCard>
  );
}
