"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2, Search } from "lucide-react";
import { authFetch } from "@/lib/clientApi";
import { db } from "@/lib/firebase";

type ProvisioningStatus = "not_required" | "access_pending" | "access_sent" | "registration_completed";

type Purchase = {
  id: string;
  userId: string;
  assetId: string;
  assetTitle: string;
  status: string;
  licenseType: string;
  paystackReference: string;
  externalPlatform: string;
  provisioningStatus: ProvisioningStatus;
  provisioningNotes: string;
  createdAt?: any;
  paidAt?: any;
};

type UserSummary = { name: string; email: string };

const STATUSES: ProvisioningStatus[] = ["not_required", "access_pending", "access_sent", "registration_completed"];

function dateLabel(value: any) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function AdminPurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [users, setUsers] = useState<Record<string, UserSummary>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      setError("Database not initialized.");
      return;
    }
    const firestore = db;
    return onSnapshot(
      query(collection(firestore, "assetPurchases"), orderBy("updatedAt", "desc")),
      async (snapshot) => {
        const nextPurchases = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            userId: data.userId || data.uid || "",
            assetId: data.assetId || "",
            assetTitle: data.assetTitle || "Marketplace course",
            status: data.status || "pending",
            licenseType: data.licenseType || "standard",
            paystackReference: data.paystackReference || "",
            externalPlatform: data.externalPlatform || "",
            provisioningStatus: data.provisioningStatus || "not_required",
            provisioningNotes: data.provisioningNotes || "",
            createdAt: data.createdAt || null,
            paidAt: data.paidAt || null,
          } as Purchase;
        });
        const userIds = Array.from(new Set(nextPurchases.map((purchase) => purchase.userId).filter(Boolean)));
        const userEntries = await Promise.all(userIds.map(async (userId) => {
          const snap = await getDoc(doc(firestore, "users", userId));
          const data = snap.data() || {};
          return [userId, { name: data.name || data.displayName || "User", email: data.email || "" }] as const;
        }));
        setPurchases(nextPurchases);
        setUsers(Object.fromEntries(userEntries));
        setLoading(false);
      },
      () => {
        setError("Unable to load purchases.");
        setLoading(false);
      }
    );
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return purchases.filter((purchase) => {
      const user = users[purchase.userId];
      return !term ||
        purchase.assetTitle.toLowerCase().includes(term) ||
        purchase.paystackReference.toLowerCase().includes(term) ||
        purchase.status.toLowerCase().includes(term) ||
        purchase.provisioningStatus.toLowerCase().includes(term) ||
        user?.name.toLowerCase().includes(term) ||
        user?.email.toLowerCase().includes(term);
    });
  }, [purchases, search, users]);

  const updateProvisioning = async (purchase: Purchase, provisioningStatus: ProvisioningStatus) => {
    const provisioningNotes = window.prompt("Optional provisioning notes", purchase.provisioningNotes || "");
    if (provisioningNotes === null) return;
    setUpdatingId(purchase.id);
    try {
      const response = await authFetch("/api/admin/asset-purchases/update-provisioning", {
        method: "POST",
        body: JSON.stringify({ purchaseId: purchase.id, provisioningStatus, provisioningNotes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to update provisioning");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update provisioning.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Course Purchases</h2>
          <p className="mt-1 text-sm text-white/45">Track SDC ownership, Kajabi provisioning, and purchase fulfilment.</p>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, course, Paystack reference, or provisioning status"
            className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-cyan-400/50"
          />
        </label>
      </section>

      {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Purchase Status</th>
                <th className="px-4 py-3 font-medium">License</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Provisioning</th>
                <th className="px-4 py-3 font-medium">Paystack Ref</th>
                <th className="px-4 py-3 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-white/45">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-cyan-300" />
                    Loading purchases
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-white/45">No purchases match the current search.</td></tr>
              )}
              {filtered.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white/85">{users[purchase.userId]?.name || "Buyer"}</p>
                    <p className="text-xs text-white/40">{users[purchase.userId]?.email || purchase.userId}</p>
                  </td>
                  <td className="px-4 py-3 text-white/75">{purchase.assetTitle}</td>
                  <td className="px-4 py-3 capitalize text-white/65">{purchase.status}</td>
                  <td className="px-4 py-3 uppercase text-white/65">{purchase.licenseType}</td>
                  <td className="px-4 py-3 text-white/65">{purchase.externalPlatform || "-"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={purchase.provisioningStatus}
                      onChange={(event) => updateProvisioning(purchase, event.target.value as ProvisioningStatus)}
                      disabled={updatingId === purchase.id}
                      className="h-9 rounded-md border border-white/10 bg-black/20 px-2 text-xs outline-none focus:border-cyan-400/50"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>{status.replace("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3"><code className="rounded bg-black/25 px-2 py-1 text-xs text-white/55">{purchase.paystackReference || "-"}</code></td>
                  <td className="px-4 py-3 text-white/55">{dateLabel(purchase.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
