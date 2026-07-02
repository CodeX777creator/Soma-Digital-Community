"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { CheckCircle2, Download, DollarSign, Loader2, Search } from "lucide-react";
import { authFetch } from "@/lib/clientApi";
import { db } from "@/lib/firebase";

type PayoutStatus = "all" | "pending" | "payable" | "paid";

type ResellerSale = {
  id: string;
  resellerUserId: string;
  buyerUserId: string;
  assetId: string;
  purchaseId: string;
  grossAmount: number;
  resellerEarnings: number;
  status: "pending" | "payable" | "paid";
  paystackReference: string;
  payoutReference?: string;
  payoutNotes?: string;
  createdAt?: any;
  paidAt?: any;
};

type UserSummary = {
  name: string;
  email: string;
};

type AssetSummary = {
  title: string;
};

type PayoutProfile = {
  method: string;
  accountName: string;
  accountDetails: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function dateLabel(value: any) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function normalizeSale(id: string, data: Record<string, any>): ResellerSale {
  return {
    id,
    resellerUserId: data.resellerUserId || "",
    buyerUserId: data.buyerUserId || "",
    assetId: data.assetId || "",
    purchaseId: data.purchaseId || "",
    grossAmount: typeof data.grossAmount === "number" ? data.grossAmount : 0,
    resellerEarnings: typeof data.resellerEarnings === "number" ? data.resellerEarnings : 0,
    status: data.status === "paid" ? "paid" : data.status === "pending" ? "pending" : "payable",
    paystackReference: data.paystackReference || "",
    payoutReference: data.payoutReference || "",
    payoutNotes: data.payoutNotes || "",
    createdAt: data.createdAt || null,
    paidAt: data.paidAt || null,
  };
}

export default function AdminPayoutsPage() {
  const [sales, setSales] = useState<ResellerSale[]>([]);
  const [users, setUsers] = useState<Record<string, UserSummary>>({});
  const [assets, setAssets] = useState<Record<string, AssetSummary>>({});
  const [profiles, setProfiles] = useState<Record<string, PayoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayoutStatus>("payable");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError("Database not initialized.");
      setLoading(false);
      return;
    }
    const firestore = db;

    return onSnapshot(
      query(collection(firestore, "resellerSales"), orderBy("createdAt", "desc")),
      async (snapshot) => {
        const nextSales = snapshot.docs.map((item) => normalizeSale(item.id, item.data()));
        setSales(nextSales);

        const userIds = Array.from(new Set(nextSales.flatMap((sale) => [sale.resellerUserId, sale.buyerUserId]).filter(Boolean)));
        const assetIds = Array.from(new Set(nextSales.map((sale) => sale.assetId).filter(Boolean)));

        const [userEntries, assetEntries] = await Promise.all([
          Promise.all(userIds.map(async (userId) => {
            const snap = await getDoc(doc(firestore, "users", userId));
            const data = snap.data() || {};
            return [userId, { name: data.name || data.displayName || "User", email: data.email || "" }] as const;
          })),
          Promise.all(assetIds.map(async (assetId) => {
            const snap = await getDoc(doc(firestore, "marketplaceAssets", assetId));
            const data = snap.data() || {};
            return [assetId, { title: data.title || "Marketplace course" }] as const;
          })),
        ]);
        const profileEntries = await Promise.all(userIds.map(async (userId) => {
          const snap = await getDoc(doc(firestore, "resellerPayoutProfiles", userId));
          const data = snap.data() || {};
          return [userId, {
            method: data.method || "",
            accountName: data.accountName || "",
            accountDetails: data.accountDetails || "",
          }] as const;
        }));

        setUsers(Object.fromEntries(userEntries));
        setAssets(Object.fromEntries(assetEntries));
        setProfiles(Object.fromEntries(profileEntries));
        setLoading(false);
        setError(null);
      },
      () => {
        setError("Unable to load reseller commissions.");
        setLoading(false);
      }
    );
  }, []);

  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sales.filter((sale) => {
      const reseller = users[sale.resellerUserId];
      const buyer = users[sale.buyerUserId];
      const asset = assets[sale.assetId];
      const matchesSearch =
        !term ||
        sale.paystackReference.toLowerCase().includes(term) ||
        sale.purchaseId.toLowerCase().includes(term) ||
        reseller?.name.toLowerCase().includes(term) ||
        reseller?.email.toLowerCase().includes(term) ||
        buyer?.name.toLowerCase().includes(term) ||
        buyer?.email.toLowerCase().includes(term) ||
        asset?.title.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || sale.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [assets, sales, search, statusFilter, users]);

  const totals = useMemo(() => {
    return {
      pending: sales.filter((sale) => sale.status !== "paid").reduce((sum, sale) => sum + sale.resellerEarnings, 0),
      paid: sales.filter((sale) => sale.status === "paid").reduce((sum, sale) => sum + sale.resellerEarnings, 0),
      count: sales.length,
    };
  }, [sales]);

  const markPaid = async (sale: ResellerSale) => {
    const payoutReference = window.prompt("Optional payout reference", sale.payoutReference || "");
    if (payoutReference === null) return;
    const payoutNotes = window.prompt("Optional internal payout notes", sale.payoutNotes || "");
    if (payoutNotes === null) return;

    setUpdatingId(sale.id);
    try {
      const response = await authFetch("/api/admin/reseller-payouts/mark-paid", {
        method: "POST",
        body: JSON.stringify({ saleId: sale.id, payoutReference, payoutNotes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to update payout");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update payout.");
    } finally {
      setUpdatingId(null);
    }
  };

  const exportCsv = () => {
    const rows = filteredSales.map((sale) => {
      const reseller = users[sale.resellerUserId];
      const buyer = users[sale.buyerUserId];
      const profile = profiles[sale.resellerUserId];
      return {
        reseller: reseller?.name || sale.resellerUserId,
        resellerEmail: reseller?.email || "",
        payoutMethod: profile?.method || "",
        payoutName: profile?.accountName || "",
        payoutDetails: profile?.accountDetails || "",
        buyer: buyer?.name || sale.buyerUserId,
        course: assets[sale.assetId]?.title || sale.assetId,
        commission: sale.resellerEarnings,
        status: sale.status,
        paystackReference: sale.paystackReference,
        purchaseDate: dateLabel(sale.createdAt),
      };
    });
    const headers = Object.keys(rows[0] || {
      reseller: "", resellerEmail: "", payoutMethod: "", payoutName: "", payoutDetails: "", buyer: "", course: "", commission: "", status: "", paystackReference: "", purchaseDate: "",
    });
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => `"${String((row as any)[header] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sdc-pending-reseller-payouts.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reseller Payouts</h2>
          <p className="mt-1 text-sm text-white/45">Manage MRR commissions, payout status, and sales history.</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Pending Commissions" value={money(totals.pending)} />
        <Metric label="Paid Commissions" value={money(totals.paid)} />
        <Metric label="Commission Records" value={String(totals.count)} />
      </section>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[1fr_180px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reseller, buyer, course, purchase, or Paystack reference"
            className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-cyan-400/50"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as PayoutStatus)}
          className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm capitalize outline-none focus:border-cyan-400/50"
          aria-label="Filter by payout status"
        >
          {["all", "payable", "pending", "paid"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </section>

      {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">Reseller</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Commission</th>
                <th className="px-4 py-3 font-medium">Payout Details</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Paystack Ref</th>
                <th className="px-4 py-3 font-medium">Purchase Date</th>
                <th className="px-4 py-3 font-medium">Paid Date</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-white/45">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-cyan-300" />
                    Loading payouts
                  </td>
                </tr>
              )}
              {!loading && filteredSales.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-white/45">No payout records match the current filters.</td>
                </tr>
              )}
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white/85">{users[sale.resellerUserId]?.name || "Reseller"}</p>
                    <p className="text-xs text-white/40">{users[sale.resellerUserId]?.email || sale.resellerUserId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white/75">{users[sale.buyerUserId]?.name || "Buyer"}</p>
                    <p className="text-xs text-white/40">{users[sale.buyerUserId]?.email || sale.buyerUserId}</p>
                  </td>
                  <td className="px-4 py-3 text-white/75">{assets[sale.assetId]?.title || sale.assetId}</td>
                  <td className="px-4 py-3 font-semibold text-cyan-200">{money(sale.resellerEarnings)}</td>
                  <td className="px-4 py-3 text-white/60">
                    <p>{profiles[sale.resellerUserId]?.method || "-"}</p>
                    <p className="text-xs text-white/40">{profiles[sale.resellerUserId]?.accountName || ""}</p>
                    <p className="text-xs text-white/40">{profiles[sale.resellerUserId]?.accountDetails || ""}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-white/65">{sale.status}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-black/25 px-2 py-1 text-xs text-white/55">{sale.paystackReference || "-"}</code>
                  </td>
                  <td className="px-4 py-3 text-white/55">{dateLabel(sale.createdAt)}</td>
                  <td className="px-4 py-3 text-white/55">{dateLabel(sale.paidAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {sale.status === "paid" ? (
                      <span className="inline-flex items-center gap-2 text-xs text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" />
                        Paid
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markPaid(sale)}
                        disabled={updatingId === sale.id}
                        className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-3 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
                      >
                        {updatingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}
