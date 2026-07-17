"use client";

import { ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

export function AdminLoadingState({ label = "Loading admin data" }: { label?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center text-white/55">
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-200" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}

export function AdminEmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
      <p className="text-base font-semibold text-white">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminErrorState({
  title = "Something needs attention",
  description,
  requestId,
  retryLabel = "Retry",
  onRetry,
  permission,
}: {
  title?: string;
  description?: string;
  requestId?: string;
  retryLabel?: string;
  onRetry?: () => void;
  permission?: boolean;
}) {
  const Icon = permission ? ShieldAlert : AlertTriangle;
  return (
    <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5 text-red-50">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-red-200" />
          <div>
            <p className="font-semibold">{title}</p>
            {description ? <p className="mt-1 text-sm leading-6 text-red-50/75">{description}</p> : null}
            {requestId ? <p className="mt-2 text-xs text-red-50/50">Request ID: {requestId}</p> : null}
          </div>
        </div>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl border border-red-200/20 px-3 text-sm font-semibold text-red-50 hover:bg-red-100/10">
            <RefreshCw className="h-4 w-4" />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
