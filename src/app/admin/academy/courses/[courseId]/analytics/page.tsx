import Link from "next/link";
import { ArrowLeft, BarChart3, BookOpen, CheckCircle2, GraduationCap } from "lucide-react";

export default function AcademyCourseAnalyticsPage({ params }: { params: { courseId: string } }) {
  return (
    <AcademyOpsPage
      courseId={params.courseId}
      eyebrow="Course Analytics"
      title="Learning performance"
      description="Track enrollments, completion rate, drop-off lessons, quiz pass rate, final exam pass rate, certificates issued, activity completion, AI tutor usage, and cohort performance."
      cards={[
        ["Enrollments", "0", BookOpen],
        ["Completion", "0%", CheckCircle2],
        ["Certificates", "0", GraduationCap],
        ["Avg Score", "0%", BarChart3],
      ]}
    />
  );
}

function AcademyOpsPage({ courseId, eyebrow, title, description, cards }: { courseId: string; eyebrow: string; title: string; description: string; cards: Array<[string, string, typeof BookOpen]> }) {
  return (
    <div className="space-y-6">
      <Link href={`/admin/academy/courses/${courseId}/builder`} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to builder
      </Link>
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{description}</p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <Icon className="h-5 w-5 text-cyan-200" />
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <section className="rounded-3xl border border-dashed border-white/10 bg-[#0d1018] p-8 text-sm leading-6 text-white/50">
        This surface is wired into the Academy admin route map. Detailed aggregation will be connected after learner progress, quiz attempts, exam attempts, and certificate issuance are active.
      </section>
    </div>
  );
}
