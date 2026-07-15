"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/firebase";

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
  if (!response.ok) throw new Error(payload.error || "Academy action failed.");
  return payload;
}

export default function NewAcademyCoursePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Digital Marketing",
    level: "beginner",
    visibility: "public",
    estimatedDuration: "0",
    thumbnailUrl: "",
  });

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload = await adminFetch("/api/admin/academy", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          estimatedDuration: Number(form.estimatedDuration || 0),
          status: "draft",
        }),
      });
      router.push(`/admin/academy/courses/${payload.course.courseId}/builder`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create course.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/academy" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to Academy
      </Link>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
          <Sparkles className="h-3.5 w-3.5" />
          New Certification
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Create an Academy course</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
          Start with the course shell, then build topics, lessons, activities, quizzes, cohorts, and live classes in the builder.
        </p>
      </section>

      <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-[#0d1018] p-6">
        {error ? <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
        <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
          <div className="space-y-4">
            <Field label="Course title">
              <input required value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Digital Marketing Certification" className="academy-input" />
            </Field>
            <Field label="Course description">
              <textarea required rows={7} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe what students will learn and the transformation they should expect." className="academy-input resize-none" />
            </Field>
            <Field label="Thumbnail URL">
              <input value={form.thumbnailUrl} onChange={(event) => update("thumbnailUrl", event.target.value)} placeholder="https://..." className="academy-input" />
            </Field>
          </div>
          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex h-36 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/20 to-violet-500/20">
              <BookOpen className="h-10 w-10 text-white/35" />
            </div>
            <Field label="Category">
              <input value={form.category} onChange={(event) => update("category", event.target.value)} className="academy-input" />
            </Field>
            <Field label="Level">
              <select value={form.level} onChange={(event) => update("level", event.target.value)} className="academy-input">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="all_levels">All levels</option>
              </select>
            </Field>
            <Field label="Visibility">
              <select value={form.visibility} onChange={(event) => update("visibility", event.target.value)} className="academy-input">
                <option value="public">Public</option>
                <option value="enrolled_only">Enrolled only</option>
                <option value="cohort_only">Cohort only</option>
              </select>
            </Field>
            <Field label="Estimated duration, minutes">
              <input type="number" min={0} value={form.estimatedDuration} onChange={(event) => update("estimatedDuration", event.target.value)} className="academy-input" />
            </Field>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/10 transition hover:brightness-110 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create Course
          </button>
        </div>
      </form>

      <AcademyInputStyles />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium text-white/75">{label}</span>{children}</label>;
}

function AcademyInputStyles() {
  return (
    <style jsx global>{`
      .academy-input {
        min-height: 2.75rem;
        width: 100%;
        border-radius: 1rem;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(0,0,0,.22);
        padding: .7rem .9rem;
        color: white;
        outline: none;
      }
      .academy-input:focus { border-color: rgba(34,211,238,.55); }
      .academy-input::placeholder { color: rgba(255,255,255,.32); }
    `}</style>
  );
}
