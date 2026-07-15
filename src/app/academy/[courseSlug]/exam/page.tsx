"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock3, GraduationCap, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function AcademyExamPage() {
  const { courseSlug } = useParams<{ courseSlug: string }>();
  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto max-w-4xl space-y-6">
          <Link href={`/academy/${courseSlug}`} className="inline-flex items-center gap-2 text-sm text-[#BFC6D4] hover:text-white"><ArrowLeft className="h-4 w-4" />Back to course</Link>
          <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-8 shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100">
              <GraduationCap className="h-3.5 w-3.5" />
              Certification Exam
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Final 3-hour exam</h1>
            <p className="mt-3 text-sm leading-6 text-[#BFC6D4]">
              The exam route is ready for timed attempts, question banks, autosave, anti-cheat event logging, scoring, and certificate issuance.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <ExamCard icon={Clock3} title="3 hours" description="Timed certification attempt." />
              <ExamCard icon={ShieldCheck} title="Server scored" description="Certificate issued only after validation." />
              <ExamCard icon={GraduationCap} title="Certificate" description="Earned after passing." />
            </div>
          </section>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function ExamCard({ icon: Icon, title, description }: { icon: typeof Clock3; title: string; description: string }) {
  return <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4"><Icon className="h-5 w-5 text-[#8B5CF6]" /><p className="mt-4 text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs text-[#BFC6D4]">{description}</p></div>;
}
