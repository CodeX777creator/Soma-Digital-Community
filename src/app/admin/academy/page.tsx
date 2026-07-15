"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, Loader2, Plus, RefreshCw, Search, Settings2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import type { AcademyCourseDoc } from "@/academy";

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
  if (!response.ok) throw new Error(payload.error || "Academy action failed.");
  return payload;
}

function statusClass(status: AcademyCourseDoc["status"]) {
  if (status === "published") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (status === "archived") return "border-white/10 bg-white/[0.04] text-white/45";
  return "border-amber-400/20 bg-amber-400/10 text-amber-100";
}

export default function AdminAcademyPage() {
  const [courses, setCourses] = useState<AcademyCourseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await adminFetch("/api/admin/academy?limit=200");
      setCourses(Array.isArray(payload.courses) ? payload.courses : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Academy courses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  const filteredCourses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) => `${course.title} ${course.description} ${course.category}`.toLowerCase().includes(term));
  }, [courses, search]);

  const updateStatus = async (course: AcademyCourseDoc, status: AcademyCourseDoc["status"]) => {
    try {
      setSavingId(course.courseId);
      await adminFetch(`/api/admin/academy/${course.courseId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update course.");
    } finally {
      setSavingId(null);
    }
  };

  const totals = {
    courses: courses.length,
    published: courses.filter((course) => course.status === "published").length,
    drafts: courses.filter((course) => course.status === "draft").length,
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
              <BookOpen className="h-3.5 w-3.5" />
              Academy
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Course publishing command center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Build premium certification courses with topics, lessons, activities, quizzes, cohorts, live sessions, and certificates.
            </p>
          </div>
          <Link href="/admin/academy/courses/new" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/10 transition hover:brightness-110">
            <Plus className="h-4 w-4" />
            New Course
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Courses" value={totals.courses} />
        <Metric label="Published" value={totals.published} tone="green" />
        <Metric label="Drafts" value={totals.drafts} tone="amber" />
      </div>

      <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search courses, categories, descriptions..." className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none transition focus:border-cyan-400/50" />
          </label>
          <button type="button" onClick={loadCourses} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white/75 hover:bg-white/[0.08]">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {loading ? (
            <div className="col-span-full flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-12 text-sm text-white/45">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading courses
            </div>
          ) : filteredCourses.length ? (
            filteredCourses.map((course) => (
              <article key={course.courseId} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/20 hover:bg-white/[0.055]">
                <div className="flex gap-4">
                  <div className="h-24 w-32 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/20 to-violet-500/20">
                    {course.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <BookOpen className="h-7 w-7 text-white/35" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(course.status)}`}>{course.status}</span>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/50">{course.level}</span>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/50">{course.visibility}</span>
                    </div>
                    <h2 className="mt-3 truncate text-lg font-semibold text-white">{course.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/50">{course.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/admin/academy/courses/${course.courseId}/builder`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-400/15">
                        <Settings2 className="h-3.5 w-3.5" />
                        Builder
                      </Link>
                      {course.status === "published" ? (
                        <button type="button" disabled={savingId === course.courseId} onClick={() => updateStatus(course, "draft")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 text-xs text-amber-100 hover:bg-amber-400/15 disabled:opacity-50">
                          <Clock3 className="h-3.5 w-3.5" />
                          Unpublish
                        </button>
                      ) : (
                        <button type="button" disabled={savingId === course.courseId} onClick={() => updateStatus(course, "published")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Publish
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 bg-white/[0.025] p-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-white/30" />
              <h3 className="mt-4 font-semibold">No Academy courses yet</h3>
              <p className="mt-2 text-sm text-white/45">Create your first premium certification course.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "amber" }) {
  const toneClass = tone === "green" ? "text-emerald-200" : tone === "amber" ? "text-amber-200" : "text-white";
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
