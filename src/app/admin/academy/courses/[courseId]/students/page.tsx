import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Clock3, GraduationCap, Users } from "lucide-react";

export default async function AcademyCourseStudentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;

  return (
    <div className="space-y-6">
      <Link href={`/admin/academy/courses/${courseId}/builder`} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to builder
      </Link>
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Students</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Enrollment and learner progress</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Review enrollments, current lesson, activity status, quiz score, final exam readiness, and certificates for each learner.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Users} label="Students" value="0" />
        <Metric icon={Clock3} label="In Progress" value="0" />
        <Metric icon={ClipboardCheck} label="Pending Review" value="0" />
        <Metric icon={GraduationCap} label="Certified" value="0" />
      </div>
      <section className="rounded-3xl border border-dashed border-white/10 bg-[#0d1018] p-8 text-sm text-white/50">Student records will populate from `academyEnrollments`, `academyProgress`, submissions, quiz attempts, exam attempts, and certificates.</section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><Icon className="h-5 w-5 text-cyan-200" /><p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>;
}
