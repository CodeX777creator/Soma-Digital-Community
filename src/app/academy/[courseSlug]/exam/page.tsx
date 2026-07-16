"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, GraduationCap, Loader2, Lock, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { auth } from "@/lib/firebase";
import type { AcademyExamAttemptDoc, AcademyQuestion, AcademyQuizDoc } from "@/academy";

type ExamState = {
  unlocked: boolean;
  reason?: string | null;
  exam: AcademyQuizDoc | null;
  attempts: AcademyExamAttemptDoc[];
  certificate: any;
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

export default function AcademyExamPage() {
  const { courseSlug } = useParams<{ courseSlug: string }>();
  const [state, setState] = useState<ExamState | null>(null);
  const [exam, setExam] = useState<AcademyQuizDoc | null>(null);
  const [attempt, setAttempt] = useState<AcademyExamAttemptDoc | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [antiCheatEvents, setAntiCheatEvents] = useState<Array<{ eventType: string; metadata?: Record<string, unknown> }>>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      setState(await academyFetch(`/api/academy/${courseSlug}/exam`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load exam.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [courseSlug]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const onBlur = () => setAntiCheatEvents((current) => [...current, { eventType: "window_blur", metadata: { at: new Date().toISOString() } }]);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  const remainingMs = useMemo(() => {
    if (!attempt?.expiresAt) return 0;
    const expiry = new Date(String(attempt.expiresAt)).getTime();
    return Math.max(0, expiry - now);
  }, [attempt?.expiresAt, now]);

  const start = async () => {
    try {
      setBusy(true);
      setError("");
      const payload = await academyFetch(`/api/academy/${courseSlug}/exam`, { method: "POST", body: JSON.stringify({ action: "start" }) });
      setAttempt(payload.attempt);
      setExam(payload.exam);
      setAnswers({});
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start exam.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!attempt) return;
    try {
      setBusy(true);
      setError("");
      const payload = await academyFetch(`/api/academy/${courseSlug}/exam`, {
        method: "POST",
        body: JSON.stringify({ action: "submit", examAttemptId: attempt.examAttemptId, answers, antiCheatEvents }),
      });
      setResult(payload);
      setAttempt(null);
      setExam(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit exam.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (attempt && remainingMs === 0 && !busy) void submit();
  }, [attempt, remainingMs, busy]);

  const setAnswer = (question: AcademyQuestion, value: string, checked?: boolean) => {
    if (question.type === "multi_select") {
      const current = Array.isArray(answers[question.questionId]) ? answers[question.questionId] as string[] : [];
      setAnswers({ ...answers, [question.questionId]: checked ? [...current, value] : current.filter((item) => item !== value) });
      return;
    }
    setAnswers({ ...answers, [question.questionId]: value });
  };

  if (loading) {
    return <ProtectedRoute><AppLayout><div className="flex min-h-[60vh] items-center justify-center text-[#BFC6D4]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading exam</div></AppLayout></ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto max-w-5xl space-y-6">
          <Link href={`/academy/${courseSlug}`} className="inline-flex items-center gap-2 text-sm text-[#BFC6D4] hover:text-white"><ArrowLeft className="h-4 w-4" />Back to course</Link>
          {error ? <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}
          <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-8 shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100">
              <GraduationCap className="h-3.5 w-3.5" />
              Certification Exam
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">{exam?.title || state?.exam?.title || "Final 3-hour exam"}</h1>
            <p className="mt-3 text-sm leading-6 text-[#BFC6D4]">{exam?.description || state?.exam?.description || "Pass the final exam to earn your certificate."}</p>

            {!state?.unlocked && !attempt ? <Locked reason={state?.reason || "Pass every topic quiz before starting the exam."} /> : null}
            {state?.certificate ? <CertificateCard certificate={state.certificate} /> : null}

            {!attempt && state?.unlocked && state.exam ? (
              <div className="mt-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <ExamCard icon={Clock3} title="3 hours" description="Timer starts when you begin." />
                  <ExamCard icon={ShieldCheck} title="Server scored" description={`${state.exam.passingScore}% passing score.`} />
                  <ExamCard icon={GraduationCap} title="Certificate" description="Issued only after passing." />
                </div>
                <button onClick={start} disabled={busy} className="mt-6 inline-flex h-12 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white disabled:opacity-55">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                  Start exam
                </button>
              </div>
            ) : null}

            {attempt && exam ? (
              <div className="mt-6 space-y-5">
                <div className="sticky top-20 z-10 rounded-[18px] border border-violet-400/20 bg-[#090B13]/95 p-4 text-sm text-violet-100 backdrop-blur">
                  Time remaining: {formatRemaining(remainingMs)}
                </div>
                {exam.questions.map((question, index) => (
                  <div key={question.questionId} className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7E8799]">Question {index + 1}</p>
                    <h2 className="mt-2 font-semibold text-white">{question.prompt}</h2>
                    <QuestionInput question={question} answer={answers[question.questionId]} onChange={(value, checked) => setAnswer(question, value, checked)} />
                  </div>
                ))}
                <button onClick={submit} disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white disabled:opacity-55">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit final exam
                </button>
              </div>
            ) : null}
          </section>

          {result ? (
            <section className={`rounded-[22px] border p-6 ${result.passed ? "border-emerald-400/20 bg-emerald-400/10" : "border-amber-400/20 bg-amber-400/10"}`}>
              <h2 className="text-xl font-semibold text-white">{result.passed ? "Exam passed" : result.expired ? "Exam expired" : "Exam submitted"}</h2>
              <p className="mt-2 text-sm text-[#D8DEEA]">Score: {result.score}%</p>
              {result.certificate ? <Link href={`/certificates/verify/${result.certificate.certificateId}`} className="mt-4 inline-flex rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white/75">View certificate</Link> : null}
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

function CertificateCard({ certificate }: { certificate: any }) {
  return <div className="mt-6 rounded-[18px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">Certificate earned. Verification code: {certificate.verificationCode}</div>;
}

function Locked({ reason }: { reason: string }) {
  return <div className="mt-6 rounded-[18px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100"><Lock className="mb-3 h-5 w-5" />{reason}</div>;
}

function ExamCard({ icon: Icon, title, description }: { icon: typeof Clock3; title: string; description: string }) {
  return <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4"><Icon className="h-5 w-5 text-[#8B5CF6]" /><p className="mt-4 text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs text-[#BFC6D4]">{description}</p></div>;
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
