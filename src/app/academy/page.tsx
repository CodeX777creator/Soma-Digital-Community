"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Clock3, GraduationCap, Loader2, Search, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import type { AcademyCourseDoc } from "@/academy";

export default function AcademyPage() {
  const [courses, setCourses] = useState<AcademyCourseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/academy", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load Academy.");
        if (active) setCourses(Array.isArray(payload.courses) ? payload.courses : []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load Academy.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const visibleCourses = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) => `${course.title} ${course.description} ${course.category}`.toLowerCase().includes(term));
  }, [courses, query]);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#151A2E]/75 shadow-[0_30px_90px_rgba(0,0,0,0.36)]">
            <div className="relative p-8 lg:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(139,92,246,.34),transparent_34%),radial-gradient(circle_at_18%_0%,rgba(79,157,255,.22),transparent_38%)]" />
              <div className="relative max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                  <GraduationCap className="h-3.5 w-3.5" />
                  SDC Academy
                </div>
                <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Learn, certify, and build with structure.</h1>
                <p className="mt-4 text-base leading-7 text-[#BFC6D4]">
                  Premium certification courses published by SDC. Learn through video, images, written lessons, activities, quizzes, live sessions, and certificates.
                </p>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Available courses</h2>
              <p className="mt-1 text-sm text-[#BFC6D4]">Only official SDC-published Academy programs appear here.</p>
            </div>
            <label className="relative block md:w-[360px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E8799]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Academy..." className="h-12 w-full rounded-[16px] border border-white/[0.08] bg-[#111827]/80 pl-11 pr-4 text-sm text-white outline-none focus:border-[#5B5FFF]/60" />
            </label>
          </div>

          {error ? <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {loading ? Array.from({ length: 6 }).map((_, index) => <CourseSkeleton key={index} />) : null}
            {!loading && visibleCourses.map((course) => <CourseCard key={course.courseId} course={course} />)}
            {!loading && !visibleCourses.length ? (
              <div className="col-span-full rounded-[22px] border border-dashed border-white/[0.08] bg-[#151A2E]/60 p-10 text-center">
                <BookOpen className="mx-auto h-9 w-9 text-white/35" />
                <h3 className="mt-4 font-semibold text-white">No published courses yet</h3>
                <p className="mt-2 text-sm text-[#BFC6D4]">Academy courses will appear here after admin publishes them.</p>
              </div>
            ) : null}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function CourseCard({ course }: { course: AcademyCourseDoc }) {
  return (
    <Link href={`/academy/${course.slug}`} className="group overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 shadow-[0_18px_60px_rgba(0,0,0,0.24)] transition-all duration-200 hover:-translate-y-1 hover:border-[#8B5CF6]/35 hover:bg-[#1A2140]/85">
      <div className="aspect-[16/9] bg-gradient-to-br from-[#4F9DFF]/20 via-[#5B5FFF]/20 to-[#8B5CF6]/20">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center"><BookOpen className="h-10 w-10 text-white/35" /></div>
        )}
      </div>
      <div className="p-5">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100">{course.category}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/50">{course.level}</span>
        </div>
        <h3 className="mt-4 text-xl font-semibold text-white">{course.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#BFC6D4]">{course.description}</p>
        <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-sm text-[#BFC6D4]">
          <span className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{Math.max(1, Math.round((course.estimatedDuration || 0) / 60))}h</span>
          <span className="flex items-center gap-2 text-white">Open <ArrowRight className="h-4 w-4" /></span>
        </div>
      </div>
    </Link>
  );
}

function CourseSkeleton() {
  return <div className="h-80 animate-pulse rounded-[22px] border border-white/[0.08] bg-white/[0.035]" />;
}
