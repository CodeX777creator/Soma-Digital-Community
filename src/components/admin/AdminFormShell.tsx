"use client";

import Link from "next/link";
import { ReactNode, useEffect } from "react";
import { ArrowLeft, Eye, Save, Send, TriangleAlert } from "lucide-react";

interface AdminFormShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  status?: string;
  dirty?: boolean;
  saving?: boolean;
  lastSavedLabel?: string;
  validationSummary?: string[];
  onSave?: () => void;
  onPublish?: () => void;
  onPreview?: () => void;
  children: ReactNode;
}

export function AdminFormShell({
  eyebrow,
  title,
  description,
  backHref,
  backLabel = "Back",
  status,
  dirty,
  saving,
  lastSavedLabel,
  validationSummary = [],
  onSave,
  onPublish,
  onPreview,
  children,
}: AdminFormShellProps) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return (
    <div className="space-y-6 pb-20">
      {backHref ? (
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">{eyebrow}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
              {status ? (
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-white/55">
                  {status}
                </span>
              ) : null}
            </div>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{description}</p> : null}
            {lastSavedLabel ? <p className="mt-3 text-xs text-white/35">{lastSavedLabel}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {onPreview ? <ShellButton icon={Eye} label="Preview" onClick={onPreview} /> : null}
            {onSave ? <ShellButton icon={Save} label={saving ? "Saving..." : "Save draft"} onClick={onSave} disabled={saving} /> : null}
            {onPublish ? <ShellButton primary icon={Send} label="Publish" onClick={onPublish} disabled={saving} /> : null}
          </div>
        </div>
      </section>

      {validationSummary.length ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          <div className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4" />
            Before publishing
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-50/80">
            {validationSummary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {children}

      {(onSave || onPublish || dirty) ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#050609]/92 px-4 py-3 backdrop-blur-xl lg:left-72">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">{dirty ? "Unsaved changes" : "All changes saved"}</p>
              <p className="text-xs text-white/45">{dirty ? "Review and save before leaving this page." : lastSavedLabel || "Ready for the next action."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onPreview ? <ShellButton icon={Eye} label="Preview" onClick={onPreview} /> : null}
              {onSave ? <ShellButton icon={Save} label={saving ? "Saving..." : "Save draft"} onClick={onSave} disabled={saving} /> : null}
              {onPublish ? <ShellButton primary icon={Send} label="Publish" onClick={onPublish} disabled={saving} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ShellButton({ icon: Icon, label, onClick, primary, disabled }: { icon: typeof Save; label: string; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:opacity-50 ${
        primary
          ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-lg shadow-cyan-500/10 hover:brightness-110"
          : "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
