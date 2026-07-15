"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, HelpCircle, Lock } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function AcademyTopicQuizPage() {
  const { courseSlug, topicId } = useParams<{ courseSlug: string; topicId: string }>();
  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto max-w-4xl space-y-6">
          <Link href={`/academy/${courseSlug}`} className="inline-flex items-center gap-2 text-sm text-[#BFC6D4] hover:text-white"><ArrowLeft className="h-4 w-4" />Back to course</Link>
          <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-8 shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <HelpCircle className="h-3.5 w-3.5" />
              Quiz Yourself
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Topic quiz</h1>
            <p className="mt-3 text-sm leading-6 text-[#BFC6D4]">
              This page is ready for the quiz engine. Topic `{topicId}` will load questions, scoring, retake rules, and unlock behavior in the quiz phase.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <QuizStep icon={CheckCircle2} title="Lessons complete" />
              <QuizStep icon={HelpCircle} title="Answer questions" />
              <QuizStep icon={Lock} title="Unlock next topic" />
            </div>
          </section>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function QuizStep({ icon: Icon, title }: { icon: typeof CheckCircle2; title: string }) {
  return <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4"><Icon className="h-5 w-5 text-[#4F9DFF]" /><p className="mt-4 text-sm font-medium text-white">{title}</p></div>;
}
