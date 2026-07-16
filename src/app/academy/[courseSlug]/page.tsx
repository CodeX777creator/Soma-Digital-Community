"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, Download, ExternalLink, GraduationCap, Loader2, Lock, PlayCircle, Sparkles, Video } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { auth } from "@/lib/firebase";
import type { AcademyCertificateDoc, AcademyCourseDoc, AcademyDripScheduleDoc, AcademyEnrollmentDoc, AcademyLessonDoc, AcademyLiveSessionDoc, AcademyProgressDoc, AcademyQuizAttemptDoc, AcademySessionAttendanceDoc, AcademyTopicDoc } from "@/academy";

type Bundle = {
  course: AcademyCourseDoc;
  topics: AcademyTopicDoc[];
  lessons: AcademyLessonDoc[];
  enrollment: AcademyEnrollmentDoc | null;
  progress?: AcademyProgressDoc[];
  dripSchedules?: AcademyDripScheduleDoc[];
  quizAttempts?: AcademyQuizAttemptDoc[];
  certificates?: AcademyCertificateDoc[];
  liveSessions?: AcademyLiveSessionDoc[];
  sessionAttendance?: AcademySessionAttendanceDoc[];
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
  const [joiningSession, setJoiningSession] = useState<string | null>(null);
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

  const markAttendance = async (session: AcademyLiveSessionDoc, action: "join" | "replay") => {
    try {
      setJoiningSession(session.liveSessionId);
      await academyFetch(`/api/academy/${courseSlug}/live-sessions/${session.liveSessionId}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load();
      if (action === "join" && session.meetingUrl) {
        window.open(session.meetingUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update live-class attendance.");
    } finally {
      setJoiningSession(null);
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
  const unlockedTopics = new Set((bundle.progress || []).filter((item) => item.unlocked && item.topicId && !item.lessonId).map((item) => item.topicId as string));
  const passedTopics = new Set((bundle.quizAttempts || []).filter((attempt) => attempt.passed).map((attempt) => attempt.topicId));
  const attendanceBySession = new Map((bundle.sessionAttendance || []).map((attendance) => [attendance.liveSessionId, attendance]));
  const liveSessions = (bundle.liveSessions || []).filter((session) => session.status !== "cancelled");
  const dripByTopic = new Map((bundle.dripSchedules || []).filter((schedule) => schedule.topicId).map((schedule) => [schedule.topicId as string, schedule]));

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

          {enrollment && liveSessions.length ? (
            <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white"><CalendarDays className="h-5 w-5 text-[#4F9DFF]" />Live classes</h2>
                  <p className="mt-1 text-sm text-[#BFC6D4]">Join upcoming sessions, watch replays, and download class resources.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/50">{liveSessions.length} scheduled</span>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {liveSessions.map((session) => {
                  const attendance = attendanceBySession.get(session.liveSessionId);
                  return (
                    <article key={session.liveSessionId} className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[#4F9DFF]">{session.provider.replace("_", " ")}</p>
                          <h3 className="mt-2 text-lg font-semibold text-white">{session.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-[#BFC6D4]">{session.description}</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/50">{attendance?.status || session.status}</span>
                      </div>
                      <p className="mt-4 text-sm text-white/65">{formatSessionTime(session.startsAt)} - {formatSessionTime(session.endsAt)}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {session.meetingUrl ? (
                          <button onClick={() => markAttendance(session, "join")} disabled={joiningSession === session.liveSessionId} className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-4 text-sm font-semibold text-white disabled:opacity-60">
                            {joiningSession === session.liveSessionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                            Join live class
                          </button>
                        ) : null}
                        <a href={buildCalendarUrl(session)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white/75 hover:bg-white/[0.08]">
                          <CalendarDays className="h-4 w-4" /> Add to calendar
                        </a>
                        {session.recordingUrl ? (
                          <button onClick={() => markAttendance(session, "replay")} disabled={joiningSession === session.liveSessionId} className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white/75 hover:bg-white/[0.08] disabled:opacity-60">
                            <PlayCircle className="h-4 w-4" /> Watch replay
                          </button>
                        ) : null}
                      </div>
                      {session.recordingUrl ? <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-cyan-100 hover:text-white">Open replay</a> : null}
                      {session.materials?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {session.materials.map((material) => (
                            <a key={`${material.title}-${material.url}`} href={material.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/65 hover:bg-white/[0.08]">
                              <Download className="h-3.5 w-3.5" /> {material.title}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-6">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Course curriculum</h2>
            <div className="mt-5 space-y-4">
              {topics.map((topic, index) => {
                const topicUnlocked = !enrollment || index === 0 || unlockedTopics.has(topic.topicId);
                const quizPassed = passedTopics.has(topic.topicId);
                const drip = dripByTopic.get(topic.topicId);
                const lockCopy = topicUnlocked ? "Available now" : drip?.unlockCondition === "date_based" && drip.availableAt ? `Locked until ${formatSessionTime(drip.availableAt)}` : drip?.unlockCondition === "manual_approval" ? "Waiting for review" : drip?.unlockCondition === "cohort_schedule" ? "Available in your cohort schedule" : "Complete the previous unlock step";
                return (
                <div key={topic.topicId} className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#4F9DFF]">Topic {index + 1}</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">{topic.title}</h3>
                      <p className="mt-1 text-sm text-[#BFC6D4]">{topic.description}</p>
                      {enrollment ? <p className={`mt-2 text-xs ${topicUnlocked ? "text-emerald-200" : "text-amber-100"}`}>{lockCopy}</p> : null}
                    </div>
                    {!topicUnlocked ? <Lock className="h-4 w-4 text-[#7E8799]" /> : quizPassed ? <CheckCircle2 className="h-4 w-4 text-[#22C55E]" /> : null}
                  </div>
                  <div className="mt-4 space-y-2">
                    {(lessonsByTopic.get(topic.topicId) || []).map((lesson) => (
                      <Link key={lesson.lessonId} href={enrollment && topicUnlocked ? `/academy/${course.slug}/learn/${lesson.lessonId}` : "#"} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-sm text-[#BFC6D4] transition hover:bg-white/[0.06]">
                        <span>{lesson.title}</span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-xs">{lesson.lessonType}</span>
                      </Link>
                    ))}
                    {enrollment ? (
                      <Link href={topicUnlocked ? `/academy/${course.slug}/quiz/${topic.topicId}` : "#"} className="flex items-center justify-between gap-3 rounded-[14px] border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 text-sm text-cyan-100 transition hover:bg-cyan-400/15">
                        <span>{quizPassed ? "Quiz passed" : "Quiz Yourself"}</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              )})}
            </div>
          </section>

          {enrollment && course.finalExamEnabled ? (
            <section className="rounded-[22px] border border-violet-400/20 bg-violet-400/10 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Certification exam</h2>
                  <p className="mt-1 text-sm text-[#D8DEEA]">{bundle.certificates?.length ? "Your certificate has been issued." : "Pass all topic quizzes, then complete the final 3-hour exam."}</p>
                </div>
                <Link href={`/academy/${course.slug}/exam`} className="inline-flex h-11 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white">
                  Open exam <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string | number }) {
  return <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/72 p-5"><Icon className="h-5 w-5 text-[#4F9DFF]" /><p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#7E8799]">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
}

function formatSessionTime(value: unknown) {
  if (!value) return "TBD";
  const date = typeof value === "string" ? new Date(value) : value instanceof Date ? value : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : String(value);
}

function buildCalendarUrl(session: AcademyLiveSessionDoc) {
  const start = toCalendarDate(session.startsAt);
  const end = toCalendarDate(session.endsAt);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: session.title,
    details: [session.description || "", session.meetingUrl ? `Join: ${session.meetingUrl}` : ""].filter(Boolean).join("\n\n"),
    dates: `${start}/${end}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toCalendarDate(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : value instanceof Date ? value : new Date();
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
