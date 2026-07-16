"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, HelpCircle, Loader2, Lock, RotateCcw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { auth } from "@/lib/firebase";
import type { AcademyQuestion, AcademyQuizAttemptDoc, AcademyQuizDoc } from "@/academy";

type QuizState = {
  quiz: AcademyQuizDoc | null;
  unlocked: boolean;
  reason?: string | null;
  attempts: AcademyQuizAttemptDoc[];
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

export default function AcademyTopicQuizPage() {
  const { courseSlug, topicId } = useParams<{ courseSlug: string; topicId: string }>();
  const [state, setState] = useState<QuizState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      setState(await academyFetch(`/api/academy/${courseSlug}/quiz/${topicId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load quiz.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [courseSlug, topicId]);

  const submit = async () => {
    try {
      setSubmitting(true);
      setError("");
      const payload = await academyFetch(`/api/academy/${courseSlug}/quiz/${topicId}`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      setResult(payload);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (question: AcademyQuestion, value: string, checked?: boolean) => {
    if (question.type === "multi_select") {
      const current = Array.isArray(answers[question.questionId]) ? answers[question.questionId] as string[] : [];
      setAnswers({
        ...answers,
        [question.questionId]: checked ? [...current, value] : current.filter((item) => item !== value),
      });
      return;
    }
    setAnswers({ ...answers, [question.questionId]: value });
  };

  if (loading) {
    return <ProtectedRoute><AppLayout><div className="flex min-h-[60vh] items-center justify-center text-[#BFC6D4]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading quiz</div></AppLayout></ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto max-w-4xl space-y-6">
          <Link href={`/academy/${courseSlug}`} className="inline-flex items-center gap-2 text-sm text-[#BFC6D4] hover:text-white"><ArrowLeft className="h-4 w-4" />Back to course</Link>
          {error ? <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}
          <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-8 shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <HelpCircle className="h-3.5 w-3.5" />
              Quiz Yourself
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">{state?.quiz?.title || "Topic quiz"}</h1>
            <p className="mt-3 text-sm leading-6 text-[#BFC6D4]">{state?.quiz?.description || "Complete this quiz to unlock the next topic."}</p>

            {!state?.quiz ? <Locked reason="No published quiz is available yet." /> : null}
            {state?.quiz && !state.unlocked ? <Locked reason={state.reason || "Complete the topic requirements first."} /> : null}

            {state?.quiz && state.unlocked ? (
              <div className="mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <QuizStep icon={CheckCircle2} title={`${state.quiz.passingScore}% passing score`} />
                  <QuizStep icon={RotateCcw} title={`${state.attempts.length}${state.quiz.maxAttempts ? ` / ${state.quiz.maxAttempts}` : ""} attempts used`} />
                  <QuizStep icon={Lock} title="Pass to unlock next topic" />
                </div>
                {state.quiz.questions.map((question, index) => (
                  <div key={question.questionId} className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7E8799]">Question {index + 1}</p>
                    <h2 className="mt-2 font-semibold text-white">{question.prompt}</h2>
                    <QuestionInput question={question} answer={answers[question.questionId]} onChange={(value, checked) => setAnswer(question, value, checked)} />
                  </div>
                ))}
                <button onClick={submit} disabled={submitting || !state.quiz.questions.every((question) => answers[question.questionId])} className="inline-flex h-12 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white disabled:opacity-55">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit quiz
                </button>
              </div>
            ) : null}
          </section>

          {result ? (
            <section className={`rounded-[22px] border p-6 ${result.passed ? "border-emerald-400/20 bg-emerald-400/10" : "border-amber-400/20 bg-amber-400/10"}`}>
              <h2 className="text-xl font-semibold text-white">{result.passed ? "Quiz passed" : "Quiz submitted"}</h2>
              <p className="mt-2 text-sm text-[#D8DEEA]">Score: {result.score}%</p>
              {result.feedback?.length ? <div className="mt-4 space-y-2 text-sm text-[#BFC6D4]">{result.feedback.map((item: any) => <p key={item.questionId}>{item.correct ? "Correct" : "Review"} - {item.explanation || item.questionId}</p>)}</div> : null}
            </section>
          ) : null}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function QuestionInput({ question, answer, onChange }: { question: AcademyQuestion; answer: string | string[] | undefined; onChange: (value: string, checked?: boolean) => void }) {
  if (question.options?.length) {
    return <div className="mt-4 space-y-2">{question.options.map((option) => {
      const checked = question.type === "multi_select" ? Array.isArray(answer) && answer.includes(option.optionId) : answer === option.optionId;
      return <label key={option.optionId} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-[#D8DEEA]"><input type={question.type === "multi_select" ? "checkbox" : "radio"} checked={checked} onChange={(event) => onChange(option.optionId, event.target.checked)} />{option.label}</label>;
    })}</div>;
  }
  return <textarea value={String(answer || "")} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-4 w-full rounded-[16px] border border-white/[0.08] bg-black/20 p-4 text-sm text-white outline-none focus:border-[#5B5FFF]/60" placeholder="Write your answer..." />;
}

function Locked({ reason }: { reason: string }) {
  return <div className="mt-6 rounded-[18px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100"><Lock className="mb-3 h-5 w-5" />{reason}</div>;
}

function QuizStep({ icon: Icon, title }: { icon: typeof CheckCircle2; title: string }) {
  return <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4"><Icon className="h-5 w-5 text-[#4F9DFF]" /><p className="mt-4 text-sm font-medium text-white">{title}</p></div>;
}
