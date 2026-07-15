"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, Loader2, Lock, Sparkles, Video } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { auth } from "@/lib/firebase";
import type { AcademyCourseDoc, AcademyEnrollmentDoc, AcademyLessonDoc, AcademyTopicDoc } from "@/academy";

type Bundle = {
  course: AcademyCourseDoc;
  topics: AcademyTopicDoc[];
  lessons: AcademyLessonDoc[];
  enrollment: AcademyEnrollmentDoc | null;
};

async function academyFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Academy request failed.");
  return payload;
}

export default function AcademyCoursePage() {
  const { courseSlug } = useParams<{ courseSlug: string }>();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      setBundle(await academyFetch(`/api/academy/${courseSlug}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load course.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [courseSlug]);

  const lessonsByTopic = useMemo(() => {
    const map = new Map<string, AcademyLessonDoc[]>();
    for (const lesson of bundle?.lessons || []) {
      if (lesson.status !== "published") continue;
      map.set(lesson.topicId, [...(map.get(lesson.topicId) || []), lesson]);
    }
    return map;
  }, [bundle?.lessons]);

  const enroll = async () => {
    try {
      setEnrolling(true);
      await academyFetch(`/api/academy/${courseSlug}/enroll`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to enroll.");
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return <ProtectedRoute><AppLayout><div className="flex min-h-[60vh] items-center justify-center text-[#BFC6D4]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading course</div></AppLayout></ProtectedRoute>;
  }

  if (!bundle) {
    return <ProtectedRoute><AppLayout><div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-4 text-red-100">{error || "Course not found."}</div></AppLayout></ProtectedRoute>;
  }

  const { course, topics, enrollment } = bundle;
  const firstLesson = bundle.lessons.find((lesson) => lesson.status === "published");

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8">
          {error ? <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}
          <section className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#151A2E]/75 shadow-[0_30px_90px_rgba(0,0,0,0.36)]">
            <div className="grid lg:grid-cols-[1fr_420px]">
              <div className="relative p-8 lg:p-10">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_18%,rgba(139,92,246,.3),transparent_34%),radial-gradient(circle_at_12%_0%,rgba(79,157,255,.2),transparent_38%)]" />
                <div className="relative">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">{course.category}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/50">{course.level}</span>
                    {course.certificateEnabled ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">Certificate</span> : null}
                  </div>
                  <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">{course.title}</h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-[#BFC6D4]">{course.description}</p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    {enrollment ? (
                      <Link href={`/academy/${course.slug}/learn${firstLesson ? `/${firstLesson.lessonId}` : ""}`} className="inline-flex h-12 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(91,95,255,.28)]">
                        Continue Learning <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <button onClick={enroll} disabled={enrolling} className="inline-flex h-12 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(91,95,255,.28)] disabled:opacity-60">
                        {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Enroll
                      </button>
                    )}
                    <Link href="/academy" className="inline-flex h-12 items-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-5 text-sm text-white/75 hover:bg-white/[0.08]">Browse Academy</Link>
                  </div>
                </div>
              </div>
              <div className="min-h-80 border-t border-white/[0.08] bg-gradient-to-br from-[#4F9DFF]/16 to-[#8B5CF6]/14 lg:border-l lg:border-t-0">
                {course.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : <div className="flex h-full items-center justify-center"><GraduationCap className="h-16 w-16 text-white/30" /></div>}
              </div>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-4">
            <Metric icon={BookOpen} label="Topics" value={topics.length} />
            <Metric icon={Video} label="Lessons" value={bundle.lessons.filter((lesson) => lesson.status === "published").length} />
            <Metric icon={Clock3} label="Duration" value={`${Math.max(1, Math.round((course.estimatedDuration || 0) / 60))}h`} />
            <Metric icon={CheckCircle2} label="Progress" value={`${enrollment?.progressPercent || 0}%`} />
          </div>

          <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-6">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Course curriculum</h2>
            <div className="mt-5 space-y-4">
              {topics.map((topic, index) => (
                <div key={topic.topicId} className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#4F9DFF]">Topic {index + 1}</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">{topic.title}</h3>
                      <p className="mt-1 text-sm text-[#BFC6D4]">{topic.description}</p>
                    </div>
                    {index > 0 && !enrollment ? <Lock className="h-4 w-4 text-[#7E8799]" /> : null}
                  </div>
                  <div className="mt-4 space-y-2">
                    {(lessonsByTopic.get(topic.topicId) || []).map((lesson) => (
                      <Link key={lesson.lessonId} href={enrollment ? `/academy/${course.slug}/learn/${lesson.lessonId}` : "#"} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-sm text-[#BFC6D4] transition hover:bg-white/[0.06]">
                        <span>{lesson.title}</span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-xs">{lesson.lessonType}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string | number }) {
  return <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5"><Icon className="h-5 w-5 text-[#4F9DFF]" /><p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#7E8799]">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
}
