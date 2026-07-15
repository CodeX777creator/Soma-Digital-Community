import Link from "next/link";
import { ArrowLeft, CalendarDays, Radio, Users } from "lucide-react";

export default function AcademyCourseCohortsPage({ params }: { params: { courseId: string } }) {
  return (
    <div className="space-y-6">
      <Link href={`/admin/academy/courses/${params.courseId}/builder`} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white"><ArrowLeft className="h-4 w-4" />Back to builder</Link>
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Cohorts</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Live cohort operations</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Manage cohort dates, capacity, live classes, replay links, attendance, and cohort-based unlock schedules.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Users} label="Cohorts" value="0" />
        <Metric icon={CalendarDays} label="Upcoming Sessions" value="0" />
        <Metric icon={Radio} label="Live Now" value="0" />
      </div>
      <section className="rounded-3xl border border-dashed border-white/10 bg-[#0d1018] p-8 text-sm text-white/50">Use the course builder to create cohorts and schedule live sessions. This page will become the dense operations view for active cohorts.</section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><Icon className="h-5 w-5 text-cyan-200" /><p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>;
}
