"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Search,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { AdminMediaPicker } from "@/components/admin/AdminMediaPicker";

type Tier = "explorer" | "pro" | "elite";
type StatusFilter = "all" | "active" | "banned";
type UserRecord = {
  id: string;
  uid: string;
  name: string;
  displayName?: string;
  email: string;
  photoURL?: string;
  tier: Tier;
  status?: string;
  disabled?: boolean;
  createdAt: any;
  updatedAt?: any;
  lastLogin?: any;
  subscription?: any;
  [key: string]: any;
};
type RelatedRecord = { id: string; [key: string]: any };
type ActivityRecord = RelatedRecord & {
  activityType: string;
  activityText: string;
  createdAt?: any;
};

const PAGE_SIZE = 25;
const TIERS: Tier[] = ["explorer", "pro", "elite"];

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
  if (value === "elite" || value === "pro" || value === "explorer") return value;
  return "explorer";
}

function normalizeUser(id: string, data: Record<string, any>): UserRecord {
  const subscriptionTier = data.subscription?.plan || data.subscription?.subscriptionPlan;
  return {
    id,
    uid: data.uid || id,
    name: data.name || data.displayName || data.email || "Unnamed user",
    email: data.email || "",
    photoURL: data.photoURL || data.avatarURL || data.avatarUrl || "",
    tier: normalizeTier(data.tier || data.plan || subscriptionTier),
    status: data.status || (data.disabled ? "banned" : "active"),
    disabled: data.disabled === true,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    lastLogin: data.lastLogin || null,
    ...data,
  };
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

async function authedAdminFetch(path: string, body: Record<string, unknown>) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Admin action failed.");
  }
  return payload;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<RelatedRecord[]>([]);
  const [purchases, setPurchases] = useState<RelatedRecord[]>([]);
  const [posts, setPosts] = useState<RelatedRecord[]>([]);
  const [mentorChats, setMentorChats] = useState<RelatedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [overrideTier, setOverrideTier] = useState<Tier>("explorer");
  const [overrideReason, setOverrideReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError("Database not initialized.");
      setLoading(false);
      return;
    }
    const firestore = db;
    const unsubUsers = onSnapshot(
      query(collection(firestore, "users"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setUsers(snapshot.docs.map((userDoc) => normalizeUser(userDoc.id, userDoc.data())));
        setLoading(false);
      },
      () => {
        setError("Unable to load users.");
        setLoading(false);
      }
    );

    const unsubSubscriptions = onSnapshot(collection(firestore, "subscriptions"), (snapshot) => {
      setSubscriptions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    const unsubPurchases = onSnapshot(collection(firestore, "assetPurchases"), (snapshot) => {
      setPurchases(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    const unsubPosts = onSnapshot(collection(firestore, "posts"), (snapshot) => {
      setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    const unsubMentorChats = onSnapshot(collection(firestore, "mentorChats"), (snapshot) => {
      setMentorChats(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return () => {
      unsubUsers();
      unsubSubscriptions();
      unsubPurchases();
      unsubPosts();
      unsubMentorChats();
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, tierFilter]);

  useEffect(() => {
    if (selectedUser) {
      setOverrideTier(selectedUser.tier);
      setOverrideReason("");
    }
  }, [selectedUser]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const status = user.disabled ? "banned" : "active";
      const matchesSearch =
        !term ||
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term);
      const matchesTier = tierFilter === "all" || user.tier === tierFilter;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [search, statusFilter, tierFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const visibleUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedDetails = useMemo(() => {
    if (!selectedUser) {
      return { subscriptions: [], purchases: [], activity: [] as ActivityRecord[] };
    }

    const uid = selectedUser.uid;
    const userSubscriptions = subscriptions.filter(
      (item) => item.uid === uid || item.userId === uid || item.customerId === uid
    );
    const userPurchases = purchases.filter((item) => item.uid === uid || item.userId === uid);
    const userPosts: ActivityRecord[] = posts
      .filter((item) => item.authorId === uid || item.userId === uid)
      .map((item) => ({ ...item, activityType: "Post", activityText: item.content || item.title }));
    const userChats: ActivityRecord[] = mentorChats
      .filter((item) => item.uid === uid || item.userId === uid)
      .map((item) => ({ ...item, activityType: "Mentor chat", activityText: item.title || item.message }));
    const loginActivity: ActivityRecord[] = selectedUser.lastLogin
      ? [{ id: "last-login", activityType: "Login", activityText: "Recent login", createdAt: selectedUser.lastLogin }]
      : [];

    return {
      subscriptions: userSubscriptions,
      purchases: userPurchases,
      activity: [...loginActivity, ...userPosts, ...userChats]
        .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
        .slice(0, 12),
    };
  }, [mentorChats, posts, purchases, selectedUser, subscriptions]);

  const changeTier = async (user: UserRecord, tier: Tier, reason = "Admin tier change") => {
    if (!db) {
      setError("Database not initialized.");
      return;
    }
    setActionLoading(`tier-${user.uid}`);
    setError(null);
    try {
      await authedAdminFetch("/api/admin/users/update-tier", {
        uid: user.uid,
        tier,
        reason,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change tier.");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleBan = async (user: UserRecord) => {
    if (!db) {
      setError("Database not initialized.");
      return;
    }
    const disabled = !user.disabled;
    const confirmed = window.confirm(`${disabled ? "Ban" : "Unban"} ${user.email || user.name}?`);
    if (!confirmed) return;

    setActionLoading(`ban-${user.uid}`);
    setError(null);
    try {
      await authedAdminFetch("/api/admin/users/set-disabled", {
        uid: user.uid,
        disabled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update user status.");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleAdmin = async (user: UserRecord) => {
    if (!db) { setError("Database not initialized."); return; }
    const isAdmin = user.isAdmin === true || user.role === "admin";
    const action = isAdmin ? "revoke" : "grant";
    const confirmed = window.confirm(`${action === "grant" ? "Grant" : "Revoke"} admin access for ${user.email || user.name}?`);
    if (!confirmed) return;
    setActionLoading(`admin-${user.uid}`);
    setError(null);
    try {
      await authedAdminFetch("/api/admin/settings/admin-access", {
        uid: user.uid,
        action: isAdmin ? "revoke" : "grant",
      });
      setSelectedUser((prev) => prev ? { ...prev, isAdmin: !isAdmin, role: isAdmin ? "member" : "admin" } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update admin access.");
    } finally {
      setActionLoading(null);
    }
  };

  const updateUserAvatar = async (url: string) => {
    if (!db || !selectedUser) {
      setError("Database not initialized.");
      return;
    }
    const confirmed = window.confirm("Replace this user's app profile image? OAuth provider photos will remain untouched.");
    if (!confirmed) return;
    setActionLoading(`avatar-${selectedUser.uid}`);
    setError(null);
    try {
      await authedAdminFetch("/api/admin/users/avatar", {
        uid: selectedUser.uid,
        photoURL: url,
      });
      setSelectedUser((prev) => prev ? { ...prev, photoURL: url, avatarURL: url, adminManagedAvatarUrl: url } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update profile image.");
    } finally {
      setActionLoading(null);
    }
  };

  const exportCsv = () => {
    const rows = filteredUsers.map((user) => [
      user.name,
      user.email,
      user.tier,
      user.disabled ? "banned" : "active",
      dateLabel(user.createdAt),
    ]);
    const csv = [
      ["Name", "Email", "Tier", "Status", "Joined"].map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "soma-admin-users.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Users</h2>
          <p className="mt-1 text-sm text-white/45">Manage access, tiers, and account status.</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-sm font-medium text-white/75 hover:bg-white/10"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </section>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[1fr_150px_150px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-cyan-400/50"
          />
        </label>
        <select
          value={tierFilter}
          onChange={(event) => setTierFilter(event.target.value as "all" | Tier)}
          aria-label="Filter by tier"
          className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-400/50"
        >
          <option value="all">All tiers</option>
          {TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          aria-label="Filter by status"
          className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-400/50"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">Avatar</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/45">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                      Loading users
                    </span>
                  </td>
                </tr>
              )}
              {!loading && visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/45">
                    No users match the current filters.
                  </td>
                </tr>
              )}
              {visibleUsers.map((user) => (
                <tr key={user.uid} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-semibold">
                      {user.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
                      ) : (
                        user.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-white/90">{user.name}</td>
                  <td className="px-4 py-3 text-white/60">{user.email || "-"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.tier}
                      disabled={actionLoading === `tier-${user.uid}`}
                      onChange={(event) => changeTier(user, event.target.value as Tier)}
                      aria-label={`Change tier for ${user.name}`}
                      className="h-8 rounded-md border border-white/10 bg-black/20 px-2 text-xs capitalize outline-none focus:border-cyan-400/50"
                    >
                      {TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${user.disabled ? "bg-red-500/10 text-red-200" : "bg-emerald-400/10 text-emerald-200"}`}>
                      {user.disabled ? "Banned" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/55">{dateLabel(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedUser(user)}
                        className="rounded-md border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"
                        aria-label={`View ${user.name}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleBan(user)}
                        disabled={actionLoading === `ban-${user.uid}`}
                        className="rounded-md border border-red-400/20 p-2 text-red-200/70 hover:bg-red-500/10 hover:text-red-100 disabled:opacity-50"
                        aria-label={user.disabled ? `Unban ${user.name}` : `Ban ${user.name}`}
                      >
                        {actionLoading === `ban-${user.uid}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {visibleUsers.length ? (page - 1) * PAGE_SIZE + 1 : 0}-
            {Math.min(page * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              className="rounded-md border border-white/10 p-2 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
              className="rounded-md border border-white/10 p-2 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-white/10 bg-[#080a0f] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#080a0f] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedUser.name}</h3>
                <p className="text-sm text-white/45">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-md px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <DetailCard title="Profile">
                <div className="mb-4 rounded-2xl border border-white/10 bg-black/15 p-3">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/10 text-sm font-semibold">
                      {selectedUser.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedUser.photoURL} alt="" className="h-full w-full object-cover" />
                      ) : (
                        selectedUser.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/80">Profile image</p>
                      <p className="text-xs text-white/40">Provider photo: {selectedUser.photoURL ? "available" : "not set"}</p>
                    </div>
                  </div>
                  <AdminMediaPicker
                    label="Admin-managed profile image"
                    value={selectedUser.photoURL || ""}
                    kind="image"
                    accept="image/*"
                    usageContext="users"
                    linkedEntityType="user"
                    linkedEntityId={selectedUser.uid}
                    helperText="Upload or select an app profile image. This does not change the user's Google/Firebase provider photo."
                    aspectHint="Recommended: square image, at least 400x400."
                    onChange={(url) => updateUserAvatar(url)}
                  />
                </div>
                <DetailRow label="UID" value={selectedUser.uid} />
                <DetailRow label="Name" value={selectedUser.name} />
                <DetailRow label="Email" value={selectedUser.email || "-"} />
                <DetailRow label="Tier" value={selectedUser.tier} />
                <DetailRow label="Status" value={selectedUser.disabled ? "Banned" : "Active"} />
                <DetailRow label="Joined" value={dateLabel(selectedUser.createdAt)} />
                <DetailRow label="Last login" value={dateLabel(selectedUser.lastLogin)} />
              </DetailCard>

              <DetailCard title="Manual Tier Override">
                <div className="grid gap-3">
                  <select
                    value={overrideTier}
                    onChange={(event) => setOverrideTier(event.target.value as Tier)}
                    aria-label="Select override tier"
                    className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-400/50"
                  >
                    {TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                  </select>
                  <textarea
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    placeholder="Reason for manual override"
                    className="min-h-24 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
                  />
                  <button
                    type="button"
                    onClick={() => changeTier(selectedUser, overrideTier, overrideReason || "Manual admin override")}
                    disabled={!overrideReason.trim() || actionLoading === `tier-${selectedUser.uid}`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Apply Override
                  </button>
                </div>
              </DetailCard>

              <DetailCard title="Admin Access">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm">
                    <span className="text-white/70">Admin role</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      selectedUser.isAdmin === true || selectedUser.role === "admin" ? "text-emerald-300" : "text-white/35"
                    }`}>
                      {selectedUser.isAdmin === true || selectedUser.role === "admin" ? (
                        <><ShieldCheck className="h-4 w-4" /> Granted</>
                      ) : (
                        <><ShieldOff className="h-4 w-4" /> Not admin</>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAdmin(selectedUser)}
                    disabled={actionLoading === `admin-${selectedUser.uid}`}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${
                      selectedUser.isAdmin === true || selectedUser.role === "admin"
                        ? "border border-red-400/25 text-red-200 hover:bg-red-500/10"
                        : "bg-emerald-500 text-white hover:bg-emerald-400"
                    }`}
                  >
                    {actionLoading === `admin-${selectedUser.uid}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selectedUser.isAdmin === true || selectedUser.role === "admin" ? (
                      <><ShieldOff className="h-4 w-4" /> Revoke Admin</>
                    ) : (
                      <><ShieldCheck className="h-4 w-4" /> Grant Admin</>
                    )}
                  </button>
                </div>
              </DetailCard>

              <ListCard title="Subscription History" items={selectedDetails.subscriptions} empty="No subscription records.">
                {(item) => (
                  <CompactItem
                    title={`${item.planId || item.plan || item.subscriptionPlan || "Plan"} - ${item.status || item.subscriptionStatus || "unknown"}`}
                    meta={dateLabel(item.createdAt)}
                  />
                )}
              </ListCard>

              <ListCard title="Purchased Assets" items={selectedDetails.purchases} empty="No purchased assets.">
                {(item) => (
                  <CompactItem
                    title={item.assetTitle || item.title || item.assetId || item.id}
                    meta={dateLabel(item.createdAt || item.purchasedAt)}
                  />
                )}
              </ListCard>

              <ListCard title="Activity Log" items={selectedDetails.activity} empty="No recent activity." className="lg:col-span-2">
                {(item) => (
                  <CompactItem
                    title={`${item.activityType}: ${item.activityText || item.id}`}
                    meta={dateLabel(item.createdAt)}
                  />
                )}
              </ListCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
      <span className="text-white/40">{label}</span>
      <span className="break-all text-white/80">{value}</span>
    </div>
  );
}

function ListCard({
  title,
  items,
  empty,
  children,
  className = "",
}: {
  title: string;
  items: RelatedRecord[];
  empty: string;
  children: (item: RelatedRecord) => React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-white/40">{empty}</p>
      ) : (
        <div className="space-y-2">{items.slice(0, 10).map((item) => <div key={item.id}>{children(item)}</div>)}</div>
      )}
    </section>
  );
}

function CompactItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <p className="truncate text-sm text-white/80">{title}</p>
      <p className="mt-1 text-xs text-white/40">{meta}</p>
    </div>
  );
}
