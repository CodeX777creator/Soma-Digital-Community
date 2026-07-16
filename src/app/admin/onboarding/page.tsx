"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { Activity, AlertTriangle, CheckCircle2, Route, Sparkles, UserPlus, type LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase";

type OnboardingEvent = {
  id: string;
  event: string;
  userId?: string;
  metadata?: Record<string, any>;
  createdAt?: Timestamp | Date | string | null;
};

type MetricCard = [string, string | number, LucideIcon];

function formatDate(value: OnboardingEvent["createdAt"]) {
  if (!value) return "-";
  const date = value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

export default function AdminOnboardingPage() {
  const [events, setEvents] = useState<OnboardingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      setLoading(true);
      try {
        if (!db) return;
        const snap = await getDocs(query(collection(db, "onboardingEvents"), orderBy("createdAt", "desc"), limit(200)));
        if (!active) return;
        setEvents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OnboardingEvent)));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadEvents();
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const count = (name: string) => events.filter((event) => event.event === name).length;
    const starts = count("onboarding_started");
    const completed = count("onboarding_completed");
    return {
      starts,
      accounts: count("onboarding_account_created"),
      roadmaps: count("onboarding_roadmap_generated"),
      completed,
      abandoned: count("onboarding_abandoned"),
      completionRate: starts > 0 ? Math.round((completed / starts) * 100) : 0,
    };
  }, [events]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Onboarding Funnel</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Welcome Flow Health</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/55">
          Track setup starts, roadmap generation, account creation, completion, and abandonment from the premium welcome flow.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {([
          ["Starts", metrics.starts, Route],
          ["Accounts", metrics.accounts, UserPlus],
          ["Roadmaps", metrics.roadmaps, Sparkles],
          ["Completed", metrics.completed, CheckCircle2],
          ["Abandoned", metrics.abandoned, AlertTriangle],
          ["Completion", `${metrics.completionRate}%`, Activity],
        ] satisfies MetricCard[]).map(([label, value, Icon]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">{String(label)}</p>
              <Icon className="h-4 w-4 text-cyan-300" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-white">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Events</h2>
          <span className="text-xs text-white/45">{loading ? "Loading..." : `${events.length} loaded`}</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-white/45">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-white/10 text-white/70">
                  <td className="px-4 py-3 font-medium text-white">{event.event}</td>
                  <td className="px-4 py-3">{event.metadata?.intendedPlan || event.metadata?.subscriptionPlan || "-"}</td>
                  <td className="px-4 py-3">{event.metadata?.source || event.metadata?.method || "-"}</td>
                  <td className="px-4 py-3">{event.userId || "-"}</td>
                  <td className="px-4 py-3">{formatDate(event.createdAt)}</td>
                </tr>
              ))}
              {!loading && events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/45">
                    No onboarding events have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
