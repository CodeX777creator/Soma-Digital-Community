"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Bell,
  CheckCircle2,
  Loader2,
  Megaphone,
  Send,
  Users,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";

type Tier = "all" | "explorer" | "pro" | "elite";
type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  linkUrl?: string;
  targetTier: Tier;
  sentAt: any;
  sentBy: string;
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateLabel(value: any) {
  const d = toDate(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);
}

const TIERS: Tier[] = ["all", "explorer", "pro", "elite"];

async function adminNotificationFetch(path: string, options: RequestInit = {}) {
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
  if (!response.ok) throw new Error(payload?.error || "Notification action failed.");
  return payload;
}

export default function AdminSystemNotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [targetTier, setTargetTier] = useState<Tier>("all");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!db) { setLoadingHistory(false); return; }
    return onSnapshot(
      query(collection(db, "systemNotifications"), orderBy("sentAt", "desc")),
      (snap) => {
        setHistory(
          snap.docs.map((d) => ({
            id: d.id,
            title: d.data().title || "",
            body: d.data().body || "",
            linkUrl: d.data().linkUrl || "",
            targetTier: d.data().targetTier || "all",
            sentAt: d.data().sentAt || null,
            sentBy: d.data().sentBy || "",
          }))
        );
        setLoadingHistory(false);
      },
      () => setLoadingHistory(false)
    );
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !title.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await adminNotificationFetch("/api/admin/system-notifications", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim(),
          targetTier,
        }),
      });
      setTitle("");
      setBody("");
      setLinkUrl("");
      setTargetTier("all");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send notification.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">System Notifications</h2>
          <p className="mt-1 text-sm text-white/45">
            Broadcast platform-wide alerts — ToS updates, maintenance windows, announcements.
          </p>
        </div>
      </section>

      {/* Compose */}
      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-cyan-300" />
          <h3 className="font-semibold text-sm">Compose Broadcast</h3>
        </div>
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
        )}
        <form onSubmit={handleSend} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">Title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Terms of Service Update"
                className="h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">
                Target Audience
              </label>
              <select
                value={targetTier}
                onChange={(e) => setTargetTier(e.target.value as Tier)}
                aria-label="Target audience tier"
                className="h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white capitalize outline-none focus:border-cyan-400/50"
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>{t === "all" ? "All Members" : `${t.charAt(0).toUpperCase()}${t.slice(1)} tier`}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">Message</label>
            <textarea
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your broadcast message here..."
              className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50 resize-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">
              Action Link (optional)
            </label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://… or /community/announcement"
              className="h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={sending || !title.trim() || !body.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-400 px-5 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Broadcast
            </button>
            {success && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Broadcast sent!
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-xs text-white/35">
              <Users className="h-3.5 w-3.5" />
              {targetTier === "all" ? "All members" : `${targetTier} tier only`}
            </span>
          </div>
        </form>
      </section>

      {/* History */}
      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
          <Bell className="h-4 w-4 text-cyan-300" />
          <h3 className="font-semibold text-sm">Broadcast History</h3>
          <span className="ml-auto text-xs text-white/35">{history.length} total</span>
        </div>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-12 text-white/45">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-300" />
            Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center text-sm text-white/35">No broadcasts sent yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {history.map((item) => (
              <div key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white/90">{item.title}</p>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] capitalize text-white/55">
                    {item.targetTier === "all" ? "All members" : item.targetTier}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-white/60 leading-relaxed">{item.body}</p>
                {item.linkUrl && (
                  <a href={item.linkUrl} target="_blank" rel="noreferrer"
                    className="mt-1 inline-block text-xs text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
                    {item.linkUrl}
                  </a>
                )}
                <p className="mt-2 text-xs text-white/35">
                  {dateLabel(item.sentAt)} · by {item.sentBy || "admin"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
