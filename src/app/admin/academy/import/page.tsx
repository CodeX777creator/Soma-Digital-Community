"use client";

import { useState } from "react";
import { FileUp, Sparkles } from "lucide-react";

export default function AdminAcademyImportPage() {
  const [source, setSource] = useState("");
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Bulk Import</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Import course structures</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Paste JSON, markdown, CSV-style outlines, or curriculum notes to preview and create draft Academy courses in later import execution steps.</p>
      </section>
      <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-100"><FileUp className="h-4 w-4" /></div>
          <div>
            <h2 className="font-semibold">Curriculum source</h2>
            <p className="text-sm text-white/45">Imports create drafts only. Nothing should publish automatically.</p>
          </div>
        </div>
        <textarea value={source} onChange={(event) => setSource(event.target.value)} rows={16} placeholder="Paste course outline, JSON, markdown, or CSV here..." className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white outline-none focus:border-cyan-400/50" />
        <button type="button" disabled className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm text-white/35">
          <Sparkles className="h-4 w-4" />
          Preview Import
        </button>
      </section>
    </div>
  );
}
