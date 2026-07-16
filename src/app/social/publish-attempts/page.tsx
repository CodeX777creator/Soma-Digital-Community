"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Loader2, RefreshCw, Send } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/providers/AuthProvider";
import { parseApiError } from "@/lib/clientApi";
import { toAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { SocialPublishAttemptRecord, SocialPublishAttemptStatus } from "@/social/types";

type AttemptsResponse = {
  attempts: SocialPublishAttemptRecord[];
};

const STATUS_STYLES: Record<SocialPublishAttemptStatus, string> = {
  processing: "border-blue-400/30 bg-blue-500/10 text-blue-100",
  pending_confirmation: "border-violet-400/30 bg-violet-500/10 text-violet-100",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  failed: "border-red-400/30 bg-red-500/10 text-red-100",
  skipped: "border-amber-400/30 bg-amber-500/10 text-amber-100",
};

const STATUS_ICONS: Record<SocialPublishAttemptStatus, typeof Clock3> = {
  processing: Clock3,
  pending_confirmation: Loader2,
  success: CheckCircle2,
  failed: AlertTriangle,
  skipped: AlertTriangle,
};

function formatDate(value?: string | null): string {
  if (!value) return "Not recorded";
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return format(parsed, "MMM d, yyyy HH:mm");
}

function formatDuration(durationMs?: number | null): string {
  if (typeof durationMs !== "number") return "Pending";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} sec`;
}

export default function SocialPublishAttemptsPage() {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<SocialPublishAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SocialPublishAttemptStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);

  const filteredAttempts = useMemo(() => {
    if (statusFilter === "all") return attempts;
    return attempts.filter((attempt) => attempt.status === statusFilter);
  }, [attempts, statusFilter]);

  const summary = useMemo(() => {
    return attempts.reduce<Record<SocialPublishAttemptStatus, number>>((acc, attempt) => {
      acc[attempt.status] += 1;
      return acc;
    }, { processing: 0, pending_confirmation: 0, success: 0, failed: 0, skipped: 0 });
  }, [attempts]);

  const loadAttempts = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const token = await user.getIdToken();
      const response = await fetch("/api/social/publish-attempts?limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw await parseApiError(response, "Could not load publish attempts.");
      }
      const data = (await response.json()) as AttemptsResponse;
      setAttempts(data.attempts || []);
    } catch (loadError) {
      setError(toAppError(loadError, { userMessage: "Could not load publish attempts." }).userMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Button asChild variant="ghost" size="sm" className="w-fit rounded-[14px] text-muted-foreground">
                <Link href="/social/calendar?mode=scheduler">
                  <ArrowLeft className="h-4 w-4" />
                  Scheduler
                </Link>
              </Button>
              <div className="flex items-center gap-2 text-primary">
                <Activity className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-[0.24em]">Publishing</span>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">Publish attempts</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Track scheduled posts as the publishing worker sends them to connected social accounts.
                </p>
              </div>
            </div>
            <Button type="button" onClick={loadAttempts} disabled={loading} className="h-11 rounded-[16px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {(Object.keys(summary) as SocialPublishAttemptStatus[]).map((status) => {
              const Icon = STATUS_ICONS[status];
              return (
                <GlassCard key={status} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{status}</div>
                      <div className="mt-2 text-2xl font-semibold text-white">{summary[status]}</div>
                    </div>
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-[14px] border", STATUS_STYLES[status])}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>

          <GlassCard className="p-5">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Attempt history</h2>
                <p className="mt-1 text-sm text-muted-foreground">Worker status, provider response, retry state, and post IDs.</p>
              </div>
              <select
                aria-label="Filter publish attempts by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as SocialPublishAttemptStatus | "all")}
                className="h-11 rounded-[14px] border border-white/10 bg-background px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="processing">Processing</option>
                <option value="pending_confirmation">Pending confirmation</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>

            {error ? (
              <div className="mt-4 rounded-[16px] border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
            ) : null}

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading publish attempts
              </div>
            ) : filteredAttempts.length > 0 ? (
              <div className="mt-4 space-y-3">
                {filteredAttempts.map((attempt) => {
                  const Icon = STATUS_ICONS[attempt.status];
                  return (
                    <div key={attempt.publishAttemptId} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("border", STATUS_STYLES[attempt.status])}>
                              <Icon className="mr-1 h-3.5 w-3.5" />
                              {attempt.status}
                            </Badge>
                            <span className="text-sm font-medium text-white">{attempt.platform}</span>
                            <span className="text-xs text-muted-foreground">Attempt {attempt.attemptNumber}</span>
                            {attempt.contentType ? <span className="text-xs text-muted-foreground">{attempt.contentType}</span> : null}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Scheduled post: <span className="text-white/80">{attempt.scheduledPostId}</span>
                          </div>
                          {attempt.publicationGroupId ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Group: <span className="text-white/80">{attempt.publicationGroupId}</span>
                            </div>
                          ) : null}
                        </div>
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:min-w-[360px]">
                          <div>
                            <span className="block uppercase tracking-[0.16em]">Started</span>
                            <span className="text-white/80">{formatDate(attempt.startedAt || attempt.triggeredAt)}</span>
                          </div>
                          <div>
                            <span className="block uppercase tracking-[0.16em]">Duration</span>
                            <span className="text-white/80">{formatDuration(attempt.durationMs)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Provider post</div>
                          <div className="mt-1 truncate text-sm text-white">{attempt.providerPostId || attempt.externalPostId || "Not available"}</div>
                        </div>
                        <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Retryable</div>
                          <div className="mt-1 text-sm text-white">{attempt.retryable ? "Yes" : "No"}</div>
                        </div>
                        <div className="rounded-[14px] border border-white/10 bg-black/20 p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Payload</div>
                          <div className="mt-1 text-sm text-white">{attempt.payloadVersion || "social-publish-v1"}</div>
                        </div>
                      </div>

                      {attempt.errorMessage ? (
                        <div className="mt-3 rounded-[14px] border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-100">
                          {attempt.failureCode ? <span className="font-medium">{attempt.failureCode}: </span> : null}
                          {attempt.errorMessage}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <Send className="mx-auto h-8 w-8 text-muted-foreground" />
                <h3 className="mt-4 text-base font-semibold text-white">No publish attempts yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Attempts appear after scheduled posts become due and the publishing worker processes them.
                </p>
                <Button asChild className="mt-5 rounded-[16px]">
                  <Link href="/social/calendar?mode=scheduler">Open Scheduler</Link>
                </Button>
              </div>
            )}
          </GlassCard>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
