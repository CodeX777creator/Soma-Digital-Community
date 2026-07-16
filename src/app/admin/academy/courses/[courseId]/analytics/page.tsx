"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, BookOpen, CheckCircle2, GraduationCap, Loader2, MessageSquare, Users } from "lucide-react";
import { auth } from "@/lib/firebase";

type Analytics = {
  course?: { title?: string } | null;
  metrics: {
    enrollments: number;
    completionRate: number;
    topicCompletions: number;
    quizPassRate: number;
    examPassRate: number;
    averageScore: number;
    certificatesIssued: number;
    activeLearners: number;
    activityCompletion: number;
    pendingReviews: number;
    liveClassAttendance: number;
    discussionActivity: number;
    aiTutorUsage: number;
    cohortPerformance: Array<{ cohortId: string; title: string; enrollments: number; completed: number }>;
    slowestModules: Array<{ lessonId: string; title: string; completions: number }>;
  };
};

async function adminFetch(path: string) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load analytics.");
  return payload as Analytics;
}

export default function AcademyCourseAnalyticsPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    adminFetch(`/api/admin/academy/${courseId}/analytics`)
      .then((payload) => { if (active) setData(payload); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Unable to load analytics."); });
    return () => { active = false; };
  }, [courseId]);

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      <Link href={`/admin/academy/courses/${courseId}/builder`} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to builder
      </Link>
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Course Analytics</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{data?.course?.title || "Learning performance"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Enrollments, completion, assessment performance, certificates, live class participation, discussions, AI tutor usage, and cohort outcomes.</p>
      </section>
      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
      {!data ? <div className="flex justify-center py-12 text-white/50"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading analytics</div> : null}
      {metrics ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Enrollments" value={metrics.enrollments} icon={BookOpen} />
            <Metric label="Completion" value={`${metrics.completionRate}%`} icon={CheckCircle2} />
            <Metric label="Certificates" value={metrics.certificatesIssued} icon={GraduationCap} />
            <Metric label="Avg Score" value={`${metrics.averageScore}%`} icon={BarChart3} />
            <Metric label="Quiz Pass" value={`${metrics.quizPassRate}%`} icon={CheckCircle2} />
            <Metric label="Exam Pass" value={`${metrics.examPassRate}%`} icon={GraduationCap} />
            <Metric label="Pending Reviews" value={metrics.pendingReviews} icon={Users} />
            <Metric label="AI Tutor Uses" value={metrics.aiTutorUsage} icon={MessageSquare} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Drop-off lessons">
              {metrics.slowestModules.length ? metrics.slowestModules.map((item) => (
                <Row key={item.lessonId} label={item.title} value={`${item.completions} completions`} />
              )) : <p className="text-sm text-white/45">No lesson data yet.</p>}
            </Panel>
            <Panel title="Cohort performance">
              {metrics.cohortPerformance.length ? metrics.cohortPerformance.map((item) => (
                <Row key={item.cohortId} label={item.title} value={`${item.completed}/${item.enrollments} completed`} />
              )) : <p className="text-sm text-white/45">No cohorts yet.</p>}
            </Panel>
            <Panel title="Learning operations">
              <Row label="Active learners" value={String(metrics.activeLearners)} />
              <Row label="Activity submissions" value={String(metrics.activityCompletion)} />
              <Row label="Live class attendance" value={String(metrics.liveClassAttendance)} />
              <Row label="Discussion activity" value={String(metrics.discussionActivity)} />
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof BookOpen }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><Icon className="h-5 w-5 text-cyan-200" /><p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-6"><h2 className="font-semibold">{title}</h2><div className="mt-4 space-y-3">{children}</div></section>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm"><span className="text-white/70">{label}</span><span className="font-medium text-white">{value}</span></div>;
}
