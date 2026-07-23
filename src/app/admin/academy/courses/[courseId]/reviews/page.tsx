"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ClipboardCheck, ExternalLink, Loader2, MessageSquareWarning, RotateCcw } from "lucide-react";
import { auth } from "@/lib/firebase";
import type { AcademyActivityDoc, AcademyActivitySubmissionDoc, AcademyLessonDoc } from "@/academy";

type ReviewSubmission = AcademyActivitySubmissionDoc & {
  activity?: AcademyActivityDoc | null;
  lesson?: AcademyLessonDoc | null;
};

type ReviewForm = {
  status: string;
  feedback: string;
  score: string;
};

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Academy review action failed.");
  return payload;
}

export default function AcademyCourseReviewsPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [forms, setForms] = useState<Record<string, ReviewForm>>({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const payload = await adminFetch(`/api/admin/academy/${courseId}/reviews?status=${filter}`);
      setSubmissions(payload.submissions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [courseId, filter]);

  const metrics = useMemo(() => {
    const all = submissions;
    return {
      pending: all.filter((item) => item.status === "submitted").length,
      revision: all.filter((item) => item.status === "needs_revision").length,
      approved: all.filter((item) => ["approved", "reviewed"].includes(item.status)).length,
      rejected: all.filter((item) => item.status === "rejected").length,
    };
  }, [submissions]);

  const updateForm = (submissionId: string, patch: Partial<ReviewForm>) => {
    setForms((current) => ({
      ...current,
      [submissionId]: {
        status: current[submissionId]?.status || "approved",
        feedback: current[submissionId]?.feedback || "",
        score: current[submissionId]?.score || "",
        ...patch,
      },
    }));
  };

  const submitReview = async (submission: ReviewSubmission) => {
    const form = forms[submission.submissionId] || { status: "approved", feedback: "", score: "" };
    try {
      setSaving(submission.submissionId);
      setError("");
      setMessage("");
      await adminFetch(`/api/admin/academy/reviews/${submission.submissionId}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setMessage("Review saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save review.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <Link href={`/admin/academy/courses/${courseId}/builder`} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white"><ArrowLeft className="h-4 w-4" />Back to builder</Link>
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Manual Reviews</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Activity review queue</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Review learner submissions, approve project work, request revisions, give feedback, and unlock progression where manual approval is required.</p>
      </section>

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={ClipboardCheck} label="Pending" value={String(metrics.pending)} />
        <Metric icon={RotateCcw} label="Needs Revision" value={String(metrics.revision)} />
        <Metric icon={CheckCircle2} label="Approved" value={String(metrics.approved)} />
        <Metric icon={MessageSquareWarning} label="Rejected" value={String(metrics.rejected)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.025] p-3">
        {["all", "submitted", "needs_revision", "approved", "reviewed", "rejected"].map((status) => (
          <button key={status} onClick={() => setFilter(status)} className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${filter === status ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-white/10 bg-black/20 text-white/55 hover:text-white"}`}>
            {status.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-white/50"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading submissions</div>
      ) : (
        <section className="space-y-4">
          {submissions.map((submission) => {
            const form = forms[submission.submissionId] || { status: "approved", feedback: "", score: submission.score === null || submission.score === undefined ? "" : String(submission.score) };
            return (
              <article key={submission.submissionId} className="rounded-3xl border border-white/10 bg-[#0d1018] p-5 shadow-2xl shadow-black/20">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">{submission.status}</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">{submission.activity?.title || "Activity submission"}</h2>
                    <p className="mt-1 text-sm text-white/45">{submission.lesson?.title || submission.lessonId} - Student {submission.userId}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/55">
                        Lesson ID: {submission.lessonId}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/55">
                        Submission ID: {submission.submissionId}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/50">{formatDate(submission.submittedAt)}</span>
                    <Link
                      href={`/admin/academy/courses/${courseId}/builder?lessonId=${submission.lessonId}`}
                      className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/15"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in builder
                    </Link>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Student response</p>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-white/75">{formatResponse(submission.response)}</pre>
                </div>

                {submission.attachments?.length ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Uploaded files / links</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {submission.attachments.map((attachment) => (
                        <a key={`${attachment.url}-${attachment.name}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-400/15">
                          {attachment.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 lg:grid-cols-[180px_120px_1fr_auto]">
                  <label className="space-y-2 text-sm text-white/65">
                    <span>Status</span>
                    <select className="academy-review-input" value={form.status} onChange={(event) => updateForm(submission.submissionId, { status: event.target.value })}>
                      <option value="approved">Approved</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="needs_revision">Needs revision</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-white/65">
                    <span>Score</span>
                    <input className="academy-review-input" type="number" min={0} max={100} value={form.score} onChange={(event) => updateForm(submission.submissionId, { score: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm text-white/65">
                    <span>Reviewer feedback</span>
                    <textarea className="academy-review-input min-h-[44px] resize-none" value={form.feedback} onChange={(event) => updateForm(submission.submissionId, { feedback: event.target.value })} placeholder="Give clear feedback or next steps..." />
                  </label>
                  <div className="flex items-end">
                    <button onClick={() => submitReview(submission)} disabled={saving === submission.submissionId} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
                      {saving === submission.submissionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Save
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-cyan-400/5 p-4 text-sm text-white/65">
                  <p className="font-medium text-cyan-100">Manual review context</p>
                  <p className="mt-1 leading-6">
                    When this activity is set to manual review, the learner can continue only after the submission is approved or marked as reviewed. This submission is already queued here so you can open the lesson, check the answer, and resolve it without leaving the review screen.
                  </p>
                </div>
              </article>
            );
          })}
          {!submissions.length ? <div className="rounded-3xl border border-dashed border-white/10 bg-[#0d1018] p-8 text-center text-sm text-white/50">No submissions match this review queue yet.</div> : null}
        </section>
      )}

      <style jsx global>{`
        .academy-review-input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(0,0,0,.22);
          padding: .7rem .9rem;
          color: white;
          outline: none;
        }
        .academy-review-input:focus { border-color: rgba(34,211,238,.55); }
        .academy-review-input::placeholder { color: rgba(255,255,255,.32); }
      `}</style>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof ClipboardCheck; label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><Icon className="h-5 w-5 text-cyan-200" /><p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>;
}

function formatResponse(response: unknown) {
  if (Array.isArray(response)) return response.join(", ");
  if (response && typeof response === "object") return JSON.stringify(response, null, 2);
  return String(response || "");
}

function formatDate(value: unknown) {
  if (!value) return "Not submitted";
  const date = typeof value === "string" ? new Date(value) : value instanceof Date ? value : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : String(value);
}
