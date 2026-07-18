"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { AdminFormShell } from "@/components/admin/AdminFormShell";
import { AdminMediaPicker } from "@/components/admin/AdminMediaPicker";

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
    promoVideoUrl: "",
    pricingType: "free",
    priceCents: "0",
    salePriceCents: "",
    currency: "USD",
    includedPlans: "",
    mrrEnabled: false,
    mrrRequiresCertificate: true,
    mrrPriceCents: "999",
    mrrCurrency: "USD",
    mrrLicenseVersion: "sdc-academy-mrr-v1",
  });

  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

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
          priceCents: Math.max(0, Math.round(Number(form.priceCents || 0))),
          salePriceCents: form.salePriceCents.trim() ? Math.max(0, Math.round(Number(form.salePriceCents || 0))) : null,
          includedPlans: form.includedPlans.split(",").map((item) => item.trim()).filter(Boolean),
          mrrPriceCents: Math.max(0, Math.round(Number(form.mrrPriceCents || 0))),
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
      <AdminFormShell
        eyebrow="New Certification"
        title="Create an Academy course"
        description="Start with the course shell, upload the visual identity, then build topics, lessons, activities, quizzes, cohorts, and live classes in the builder."
        backHref="/admin/academy"
        backLabel="Back to Academy"
        status="Draft setup"
        dirty={Boolean(form.title || form.description || form.thumbnailUrl || form.promoVideoUrl)}
      >

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
            <AdminMediaPicker
              label="Course thumbnail"
              value={form.thumbnailUrl}
              kind="image"
              accept="image/*"
              usageContext="academy"
              linkedEntityType="academyCourse"
              helperText="Upload a polished course cover or choose one from the media library."
              aspectHint="Recommended: 16:9 or 3:2, at least 1200px wide."
              onChange={(url) => update("thumbnailUrl", url)}
            />
            <AdminMediaPicker
              label="Promo video"
              value={form.promoVideoUrl}
              kind="video"
              accept="video/*"
              usageContext="academy"
              linkedEntityType="academyCourse"
              helperText="Optional course preview or trailer. You can add this now or later in the builder."
              aspectHint="Recommended: MP4/WebM under 750MB."
              onChange={(url) => update("promoVideoUrl", url)}
            />
          </div>
          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.025] p-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/20 to-violet-500/20">
              {form.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.thumbnailUrl} alt="" className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center">
                  <BookOpen className="h-10 w-10 text-white/35" />
                </div>
              )}
              <div className="border-t border-white/10 p-4">
                <p className="text-sm font-semibold">{form.title || "Course preview"}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-white/45">{form.description || "Your course card updates as you add title, description, and media."}</p>
              </div>
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
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">Pricing</p>
              <p className="mb-3 text-xs text-white/45">Set the commercial model now, or refine it in the builder.</p>
              <div className="space-y-3">
                <Field label="Pricing type">
                  <select value={form.pricingType} onChange={(event) => update("pricingType", event.target.value)} className="academy-input">
                    <option value="free">Free</option>
                    <option value="paid">Paid course</option>
                    <option value="included_with_plan">Included with plan</option>
                    <option value="promo_only">Promo code only</option>
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Price in cents">
                    <input type="number" min={0} value={form.priceCents} onChange={(event) => update("priceCents", event.target.value)} placeholder="12100" className="academy-input" />
                  </Field>
                  <Field label="Sale cents">
                    <input type="number" min={0} value={form.salePriceCents} onChange={(event) => update("salePriceCents", event.target.value)} placeholder="Optional" className="academy-input" />
                  </Field>
                </div>
                <Field label="Included plans">
                  <input value={form.includedPlans} onChange={(event) => update("includedPlans", event.target.value)} placeholder="pro, elite" className="academy-input" />
                </Field>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">MRR / Reseller Rights</p>
              <p className="mb-3 text-xs text-white/45">The MRR price is configurable per course.</p>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={form.mrrEnabled} onChange={(event) => update("mrrEnabled", event.target.checked)} />
                  Enable MRR purchase
                </label>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={form.mrrRequiresCertificate} onChange={(event) => update("mrrRequiresCertificate", event.target.checked)} />
                  Require certificate first
                </label>
                <Field label="MRR price in cents">
                  <input type="number" min={0} value={form.mrrPriceCents} onChange={(event) => update("mrrPriceCents", event.target.value)} placeholder="999" className="academy-input" />
                </Field>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/10 transition hover:brightness-110 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create Course
          </button>
        </div>
      </form>
      </AdminFormShell>

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
