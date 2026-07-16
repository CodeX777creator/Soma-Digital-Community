"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, FileUp, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { auth } from "@/lib/firebase";

type ImportPreviewLesson = { title: string; lessonType?: string; writtenContent?: string };
type ImportPreviewTopic = { title: string; description?: string; lessons?: ImportPreviewLesson[] };
type ImportPreviewCourse = { title?: string; description?: string; category?: string; level?: string; topics?: ImportPreviewTopic[] };
type AcademyImportResponse = {
  importId: string;
  preview?: ImportPreviewCourse;
  validationErrors?: string[];
  createdCourseId?: string | null;
  status?: string;
};

async function adminFetch(path: string, options: RequestInit = {}) {
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
  if (!response.ok) throw new Error(payload.error || "Academy import failed.");
  return payload;
}

export default function AdminAcademyImportPage() {
  const [source, setSource] = useState("");
  const [sourceType, setSourceType] = useState("outline");
  const [sourceName, setSourceName] = useState("");
  const [preview, setPreview] = useState<AcademyImportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const previewImport = async () => {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      const payload = await adminFetch("/api/admin/academy/import", {
        method: "POST",
        body: JSON.stringify({ source, sourceType, sourceName }),
      });
      setPreview(payload.import);
      setMessage("Import preview generated. Review before creating the draft course.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview import.");
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!preview?.importId) return;
    try {
      setConfirming(true);
      setError("");
      const payload = await adminFetch(`/api/admin/academy/import/${preview.importId}/confirm`, { method: "POST" });
      setPreview(payload.import);
      setMessage("Draft course created. It remains unpublished until you publish it manually.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm import.");
    } finally {
      setConfirming(false);
    }
  };

  const errors = preview?.validationErrors || [];
  const course = preview?.preview;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Bulk Import</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Import course structures</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Paste JSON, markdown, CSV outlines, or structured curriculum notes. Imports always create draft courses and never publish automatically.</p>
      </section>

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{message}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="rounded-3xl border border-white/10 bg-[#0d1018] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-100"><FileUp className="h-4 w-4" /></div>
            <div>
              <h2 className="font-semibold">Curriculum source</h2>
              <p className="text-sm text-white/45">Use headings for markdown, comma rows for CSV, or a full JSON course structure.</p>
            </div>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-[180px_1fr]">
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} aria-label="Import source type" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none">
              <option value="outline">Outline</option>
              <option value="markdown">Markdown</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Optional source name" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none" />
          </div>
          <textarea value={source} onChange={(event) => setSource(event.target.value)} rows={18} placeholder="# Digital Marketing Certification&#10;## Topic 1: Welcome&#10;### Lesson 1: Introduction..." className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white outline-none focus:border-cyan-400/50" />
          <button type="button" onClick={previewImport} disabled={loading || !source.trim()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Preview Import
          </button>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-[#0d1018] p-6">
          <h2 className="font-semibold">Preview</h2>
          {!preview ? <p className="mt-3 text-sm leading-6 text-white/45">Your parsed course, topics, lessons, and validation notes will appear here.</p> : null}
          {errors.length ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-100"><TriangleAlert className="h-4 w-4" />Needs attention</div>
              <ul className="mt-3 space-y-2 text-sm text-amber-50/80">
                {errors.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          {course ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/35">Course draft</p>
                <h3 className="mt-2 text-lg font-semibold">{course.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/50">{course.description}</p>
              </div>
              <div className="space-y-3">
                {(course.topics || []).map((topic, index) => (
                  <div key={`${topic.title}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="text-sm font-semibold">{index + 1}. {topic.title}</p>
                    <p className="mt-1 text-xs text-white/40">{topic.lessons?.length || 0} lessons</p>
                    <div className="mt-3 space-y-1">
                      {(topic.lessons || []).slice(0, 4).map((lesson) => <p key={lesson.title} className="text-xs text-white/55">{lesson.title}</p>)}
                    </div>
                  </div>
                ))}
              </div>
              {preview.createdCourseId ? (
                <Link href={`/admin/academy/courses/${preview.createdCourseId}/builder`} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 text-sm font-semibold text-emerald-100">
                  <CheckCircle2 className="h-4 w-4" />
                  Open Draft Builder
                </Link>
              ) : (
                <button type="button" onClick={confirmImport} disabled={confirming || errors.length > 0} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-sm font-semibold text-white disabled:text-white/35">
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Create Draft Course
                </button>
              )}
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
