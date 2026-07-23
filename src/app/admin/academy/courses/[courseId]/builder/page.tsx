"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { AdminFormShell } from "@/components/admin/AdminFormShell";
import { AdminMediaPicker } from "@/components/admin/AdminMediaPicker";
import { ACADEMY_FINAL_EXAM_TOPIC_ID } from "@/academy/types";
import type {
  AcademyCohortDoc,
  AcademyActivityDoc,
  AcademyActivityType,
  AcademyCourseDoc,
  AcademyDripScheduleDoc,
  AcademyLessonDoc,
  AcademyLessonType,
  AcademyLiveSessionDoc,
  AcademyQuestionType,
  AcademyQuizDoc,
  AcademyTopicDoc,
} from "@/academy";

type Bundle = {
  course: AcademyCourseDoc;
  topics: AcademyTopicDoc[];
  lessons: AcademyLessonDoc[];
  activities: AcademyActivityDoc[];
  quizzes: AcademyQuizDoc[];
  cohorts: AcademyCohortDoc[];
  liveSessions: AcademyLiveSessionDoc[];
  dripSchedules: AcademyDripScheduleDoc[];
};

type ActivityQuestionMode = "yes_no" | "short_text" | "long_text";

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

export default function AcademyCourseBuilderPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
    thumbnailUrl: "",
    promoVideoUrl: "",
    category: "",
    level: "beginner",
    visibility: "public",
    estimatedDuration: "0",
    certificateEnabled: true,
    finalExamEnabled: true,
    discussionEnabled: true,
    aiTutorEnabled: true,
    cohortEnabled: true,
    dripEnabled: false,
    manualReviewEnabled: true,
    nextSteps: "",
    recommendedCourseIds: "",
    status: "draft",
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
  const [topicForm, setTopicForm] = useState({ title: "", description: "", sortOrder: "0", unlockRule: "topic_quiz_passed", quizRequired: true, dripDelayDays: "" });
  const [lessonForm, setLessonForm] = useState({
    topicId: "",
    title: "",
    lessonType: "written" as AcademyLessonType,
    status: "draft",
    videoUrl: "",
    imageUrls: "",
    writtenContent: "",
    transcript: "",
    durationMinutes: "",
    sortOrder: "0",
    activityRequired: false,
    discussionEnabled: true,
    aiTutorEnabled: true,
    keyTakeaways: "",
  });
  const [activityForm, setActivityForm] = useState({
    lessonId: "",
    title: "",
    prompt: "",
    activityType: "reflection" as AcademyActivityType,
    qAndAEnabled: false,
    options: "",
    required: true,
    manualReviewRequired: false,
    yesNoOption: false,
    questionTypes: [] as ActivityQuestionMode[],
    sortOrder: "0",
  });
  const [quizForm, setQuizForm] = useState({
    topicId: "",
    title: "",
    description: "",
    passingScore: "70",
    maxAttempts: "3",
    instantFeedbackEnabled: true,
    status: "draft",
    questions: "",
  });
  const [cohortForm, setCohortForm] = useState({ title: "", description: "", startDate: "", endDate: "", capacity: "", status: "draft" });
  const [sessionForm, setSessionForm] = useState({
    title: "",
    description: "",
    cohortId: "",
    topicId: "",
    provider: "custom",
    meetingUrl: "",
    startsAt: "",
    endsAt: "",
    recordingUrl: "",
    materials: "",
    status: "scheduled",
  });
  const [dripForm, setDripForm] = useState({
    topicId: "",
    lessonId: "",
    cohortId: "",
    unlockCondition: "immediate",
    availableAt: "",
    delayDays: "",
  });
  const activityQuestions = activityForm.activityType === "q_and_a" ? extractActivityQuestions(activityForm.prompt) : [];
  const activityQuestionModes = activityForm.activityType === "q_and_a"
    ? buildQuestionAnswerTypes(activityForm.prompt, activityForm.questionTypes, activityForm.yesNoOption)
    : [];
  const activityOptionRows = ["multiple_choice", "checkboxes"].includes(activityForm.activityType)
    ? parseActivityOptionRows(activityForm.options)
    : [];

  const loadBundle = async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await adminFetch(`/api/admin/academy/${courseId}`);
      setBundle(payload);
      const course = payload.course as AcademyCourseDoc;
      setCourseForm({
        title: course.title || "",
        description: course.description || "",
        thumbnailUrl: course.thumbnailUrl || "",
        promoVideoUrl: course.promoVideoUrl || "",
        category: course.category || "",
        level: course.level || "beginner",
        visibility: course.visibility || "public",
        estimatedDuration: String(course.estimatedDuration || 0),
        certificateEnabled: course.certificateEnabled,
        finalExamEnabled: course.finalExamEnabled,
        discussionEnabled: course.discussionEnabled,
        aiTutorEnabled: course.aiTutorEnabled,
        cohortEnabled: course.cohortEnabled,
        dripEnabled: course.dripEnabled,
        manualReviewEnabled: course.manualReviewEnabled,
        nextSteps: (course.nextSteps || []).join("\n"),
        recommendedCourseIds: (course.recommendedCourseIds || []).join(", "),
        status: course.status,
        pricingType: course.pricingType || "free",
        priceCents: String(course.priceCents || 0),
        salePriceCents: course.salePriceCents == null ? "" : String(course.salePriceCents),
        currency: course.currency || "USD",
        includedPlans: (course.includedPlans || []).join(", "),
        mrrEnabled: course.mrrEnabled === true,
        mrrRequiresCertificate: course.mrrRequiresCertificate !== false,
        mrrPriceCents: String(course.mrrPriceCents ?? 999),
        mrrCurrency: course.mrrCurrency || "USD",
        mrrLicenseVersion: course.mrrLicenseVersion || "sdc-academy-mrr-v1",
      });
      const firstTopic = payload.topics?.[0]?.topicId || "";
      const firstLesson = payload.lessons?.[0]?.lessonId || "";
      setLessonForm((current) => ({ ...current, topicId: current.topicId || firstTopic }));
      setActivityForm((current) => ({ ...current, lessonId: current.lessonId || firstLesson }));
      setQuizForm((current) => ({ ...current, topicId: current.topicId || firstTopic }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Academy course.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBundle();
  }, [courseId]);

  const lessonsByTopic = useMemo(() => {
    const map = new Map<string, AcademyLessonDoc[]>();
    for (const lesson of bundle?.lessons || []) {
      map.set(lesson.topicId, [...(map.get(lesson.topicId) || []), lesson]);
    }
    return map;
  }, [bundle?.lessons]);

  const activitiesByLesson = useMemo(() => {
    const map = new Map<string, AcademyActivityDoc[]>();
    for (const activity of bundle?.activities || []) {
      map.set(activity.lessonId, [...(map.get(activity.lessonId) || []), activity]);
    }
    return map;
  }, [bundle?.activities]);

  const saveCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      await adminFetch(`/api/admin/academy/${courseId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...courseForm,
          estimatedDuration: Number(courseForm.estimatedDuration || 0),
          priceCents: Math.max(0, Math.round(Number(courseForm.priceCents || 0))),
          salePriceCents: courseForm.salePriceCents.trim() ? Math.max(0, Math.round(Number(courseForm.salePriceCents || 0))) : null,
          includedPlans: courseForm.includedPlans.split(",").map((item) => item.trim()).filter(Boolean),
          mrrPriceCents: Math.max(0, Math.round(Number(courseForm.mrrPriceCents || 0))),
          nextSteps: courseForm.nextSteps.split("\n").map((item) => item.trim()).filter(Boolean),
          recommendedCourseIds: courseForm.recommendedCourseIds.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setMessage("Course settings saved.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save course.");
    } finally {
      setSaving(false);
    }
  };

  const createTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await adminFetch(`/api/admin/academy/${courseId}/topics`, {
        method: "POST",
        body: JSON.stringify({
          ...topicForm,
          sortOrder: Number(topicForm.sortOrder || 0),
          dripDelayDays: topicForm.dripDelayDays ? Number(topicForm.dripDelayDays) : null,
        }),
      });
      setTopicForm({ title: "", description: "", sortOrder: String((bundle?.topics.length || 0) + 1), unlockRule: "topic_quiz_passed", quizRequired: true, dripDelayDays: "" });
      setMessage("Topic added.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add topic.");
    } finally {
      setSaving(false);
    }
  };

  const createLesson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await adminFetch(`/api/admin/academy/${courseId}/lessons`, {
        method: "POST",
        body: JSON.stringify({
          ...lessonForm,
          sortOrder: Number(lessonForm.sortOrder || 0),
          durationMinutes: lessonForm.durationMinutes ? Number(lessonForm.durationMinutes) : null,
          imageUrls: lessonForm.imageUrls.split("\n").map((item) => item.trim()).filter(Boolean),
          keyTakeaways: lessonForm.keyTakeaways.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setLessonForm((current) => ({ ...current, title: "", videoUrl: "", imageUrls: "", writtenContent: "", transcript: "", keyTakeaways: "", durationMinutes: "", sortOrder: String((bundle?.lessons.length || 0) + 1) }));
      setMessage("Lesson added.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add lesson.");
    } finally {
      setSaving(false);
    }
  };

  const createActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lesson = bundle?.lessons.find((item) => item.lessonId === activityForm.lessonId);
    if (!lesson) {
      setError("Select a lesson before adding an activity.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await adminFetch(`/api/admin/academy/${courseId}/activities`, {
        method: "POST",
        body: JSON.stringify({
          lessonId: lesson.lessonId,
          topicId: lesson.topicId,
          title: activityForm.title,
          prompt: activityForm.prompt,
          activityType: activityForm.activityType,
          options: parseActivityOptions(activityForm.options),
          required: activityForm.required,
          manualReviewRequired: activityForm.manualReviewRequired,
          yesNoOption: activityForm.yesNoOption,
          metadata: activityForm.activityType === "q_and_a"
            ? {
                questionAnswerTypes: buildQuestionAnswerTypes(
                  activityForm.prompt,
                  activityForm.questionTypes,
                  activityForm.yesNoOption,
                ),
              }
            : {},
          sortOrder: Number(activityForm.sortOrder || 0),
        }),
      });
      setActivityForm((current) => ({
        ...current,
        title: "",
        prompt: "",
        options: "",
        qAndAEnabled: false,
        yesNoOption: false,
        questionTypes: [],
        sortOrder: String((bundle?.activities.length || 0) + 1),
      }));
      setMessage("Activity added.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add activity.");
    } finally {
      setSaving(false);
    }
  };

  const createQuiz = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await adminFetch(`/api/admin/academy/${courseId}/quizzes`, {
        method: "POST",
        body: JSON.stringify({
          topicId: quizForm.topicId,
          title: quizForm.title,
          description: quizForm.description,
          passingScore: Number(quizForm.passingScore || 70),
          maxAttempts: quizForm.maxAttempts ? Number(quizForm.maxAttempts) : null,
          instantFeedbackEnabled: quizForm.instantFeedbackEnabled,
          status: quizForm.status,
          questions: parseQuizQuestions(quizForm.questions),
        }),
      });
      setQuizForm((current) => ({ ...current, title: "", description: "", questions: "" }));
      setMessage("Quiz saved.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create quiz.");
    } finally {
      setSaving(false);
    }
  };

  const createCohort = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      await adminFetch(`/api/admin/academy/${courseId}/cohorts`, {
        method: "POST",
        body: JSON.stringify({ ...cohortForm, capacity: cohortForm.capacity ? Number(cohortForm.capacity) : null }),
      });
      setCohortForm({ title: "", description: "", startDate: "", endDate: "", capacity: "", status: "draft" });
      setMessage("Cohort created.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create cohort.");
    } finally {
      setSaving(false);
    }
  };

  const createLiveSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      await adminFetch(`/api/admin/academy/${courseId}/live-sessions`, {
        method: "POST",
        body: JSON.stringify({
          ...sessionForm,
          cohortId: sessionForm.cohortId || null,
          topicId: sessionForm.topicId || null,
          recordingUrl: sessionForm.recordingUrl || null,
          materials: parseMaterials(sessionForm.materials),
        }),
      });
      setSessionForm({ title: "", description: "", cohortId: "", topicId: "", provider: "custom", meetingUrl: "", startsAt: "", endsAt: "", recordingUrl: "", materials: "", status: "scheduled" });
      setMessage("Live session scheduled.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to schedule live session.");
    } finally {
      setSaving(false);
    }
  };

  const createDripSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await adminFetch(`/api/admin/academy/${courseId}/drip-schedules`, {
        method: "POST",
        body: JSON.stringify({
          topicId: dripForm.topicId || null,
          lessonId: dripForm.lessonId || null,
          cohortId: dripForm.cohortId || null,
          unlockCondition: dripForm.unlockCondition,
          availableAt: dripForm.availableAt || null,
          delayDays: dripForm.delayDays ? Number(dripForm.delayDays) : null,
        }),
      });
      setDripForm({ topicId: "", lessonId: "", cohortId: "", unlockCondition: "immediate", availableAt: "", delayDays: "" });
      setMessage("Drip schedule saved.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save drip schedule.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-white/50"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Academy builder</div>;
  }

  if (!bundle) {
    return <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error || "Course not found."}</div>;
  }

  return (
    <div className="space-y-6">
      <AdminFormShell
        eyebrow="Course Builder"
        title={bundle.course.title}
        description="Author topics, lessons, activities, quizzes, live cohorts, and certification settings in one structured workspace."
        backHref="/admin/academy"
        backLabel="Back to Academy"
        status={courseForm.status}
        saving={saving}
        lastSavedLabel="Refresh pulls the latest saved course structure."
        onSave={loadBundle}
      >

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</div> : null}

      <div className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-white/[0.025] p-3">
        {[
          ["Analytics", `/admin/academy/courses/${courseId}/analytics`],
          ["Students", `/admin/academy/courses/${courseId}/students`],
          ["Cohorts", `/admin/academy/courses/${courseId}/cohorts`],
          ["Reviews", `/admin/academy/courses/${courseId}/reviews`],
          ["Certificates", "/admin/academy/certificates"],
          ["Import", "/admin/academy/import"],
        ].map(([label, href]) => (
          <Link key={href} href={href} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white">
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.78fr]">
        <div className="space-y-6">
          <Panel title="Course Settings" icon={Sparkles}>
            <form onSubmit={saveCourse} className="space-y-4">
              <Field label="Title"><input className="academy-input" value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></Field>
              <Field label="Description"><textarea rows={5} className="academy-input resize-none" value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} /></Field>
              <div className="grid gap-3 md:grid-cols-2">
              <AdminMediaPicker
                label="Course thumbnail"
                value={courseForm.thumbnailUrl}
                kind="image"
                accept="image/*"
                usageContext="academy"
                linkedEntityType="academyCourse"
                linkedEntityId={courseId}
                helperText="Upload, choose from library, or paste a course cover URL."
                aspectHint="Recommended: 16:9 or 3:2."
                onChange={(url) => setCourseForm({ ...courseForm, thumbnailUrl: url })}
              />
              <AdminMediaPicker
                label="Promo video"
                value={courseForm.promoVideoUrl}
                kind="video"
                accept="video/*"
                usageContext="academy"
                linkedEntityType="academyCourse"
                linkedEntityId={courseId}
                helperText="Use a trailer, intro, or sales preview video."
                aspectHint="Recommended: MP4/WebM."
                onChange={(url) => setCourseForm({ ...courseForm, promoVideoUrl: url })}
              />
                <Field label="Category"><input className="academy-input" value={courseForm.category} onChange={(event) => setCourseForm({ ...courseForm, category: event.target.value })} /></Field>
                <Field label="Duration minutes"><input type="number" min={0} className="academy-input" value={courseForm.estimatedDuration} onChange={(event) => setCourseForm({ ...courseForm, estimatedDuration: event.target.value })} /></Field>
                <Field label="Level"><select className="academy-input" value={courseForm.level} onChange={(event) => setCourseForm({ ...courseForm, level: event.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="all_levels">All levels</option></select></Field>
                <Field label="Visibility"><select className="academy-input" value={courseForm.visibility} onChange={(event) => setCourseForm({ ...courseForm, visibility: event.target.value })}><option value="public">Public</option><option value="enrolled_only">Enrolled only</option><option value="cohort_only">Cohort only</option></select></Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["certificateEnabled", "Certificates"],
                  ["finalExamEnabled", "Final exam"],
                  ["discussionEnabled", "Discussions"],
                  ["aiTutorEnabled", "AI tutor"],
                  ["cohortEnabled", "Cohorts"],
                  ["dripEnabled", "Drip release"],
                  ["manualReviewEnabled", "Manual review"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
                    <input type="checkbox" checked={Boolean(courseForm[key as keyof typeof courseForm])} onChange={(event) => setCourseForm({ ...courseForm, [key]: event.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              <Field label="Certification next steps"><textarea rows={4} className="academy-input resize-none" value={courseForm.nextSteps} onChange={(event) => setCourseForm({ ...courseForm, nextSteps: event.target.value })} placeholder="One step per line" /></Field>
              <Field label="Recommended course IDs"><input className="academy-input" value={courseForm.recommendedCourseIds} onChange={(event) => setCourseForm({ ...courseForm, recommendedCourseIds: event.target.value })} placeholder="courseId1, courseId2" /></Field>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-white">Pricing and access</h3>
                  <p className="text-xs text-white/50">Courses live in Academy. Marketplace products stay separate.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Pricing type">
                    <select className="academy-input" value={courseForm.pricingType} onChange={(event) => setCourseForm({ ...courseForm, pricingType: event.target.value })}>
                      <option value="free">Free</option>
                      <option value="paid">Paid course</option>
                      <option value="included_with_plan">Included with plan</option>
                      <option value="promo_only">Promo code only</option>
                    </select>
                  </Field>
                  <Field label="Currency"><input className="academy-input" value={courseForm.currency} onChange={(event) => setCourseForm({ ...courseForm, currency: event.target.value.toUpperCase() })} /></Field>
                  <Field label="Price in cents"><input type="number" min={0} className="academy-input" value={courseForm.priceCents} onChange={(event) => setCourseForm({ ...courseForm, priceCents: event.target.value })} placeholder="12100 = $121.00" /></Field>
                  <Field label="Sale price in cents"><input type="number" min={0} className="academy-input" value={courseForm.salePriceCents} onChange={(event) => setCourseForm({ ...courseForm, salePriceCents: event.target.value })} placeholder="Optional" /></Field>
                  <Field label="Included plan IDs"><input className="academy-input" value={courseForm.includedPlans} onChange={(event) => setCourseForm({ ...courseForm, includedPlans: event.target.value })} placeholder="pro, elite" /></Field>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-white">MRR / Reseller Rights</h3>
                  <p className="text-xs text-white/50">Set availability, certificate gating, price, and license version per course.</p>
                </div>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
                    <input type="checkbox" checked={courseForm.mrrEnabled} onChange={(event) => setCourseForm({ ...courseForm, mrrEnabled: event.target.checked })} />
                    MRR available
                  </label>
                  <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
                    <input type="checkbox" checked={courseForm.mrrRequiresCertificate} onChange={(event) => setCourseForm({ ...courseForm, mrrRequiresCertificate: event.target.checked })} />
                    Require certificate first
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="MRR price in cents"><input type="number" min={0} className="academy-input" value={courseForm.mrrPriceCents} onChange={(event) => setCourseForm({ ...courseForm, mrrPriceCents: event.target.value })} placeholder="999 = $9.99" /></Field>
                  <Field label="MRR currency"><input className="academy-input" value={courseForm.mrrCurrency} onChange={(event) => setCourseForm({ ...courseForm, mrrCurrency: event.target.value.toUpperCase() })} /></Field>
                  <Field label="License version"><input className="academy-input" value={courseForm.mrrLicenseVersion} onChange={(event) => setCourseForm({ ...courseForm, mrrLicenseVersion: event.target.value })} /></Field>
                </div>
              </div>
              <div className="flex justify-end">
                <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save Settings
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Course Structure" icon={Layers3}>
            <div className="space-y-4">
              {bundle.topics.map((topic) => (
                <EditableTopic
                  key={topic.topicId}
                  topic={topic}
                  lessons={lessonsByTopic.get(topic.topicId) || []}
                  activitiesByLesson={activitiesByLesson}
                  quizzes={bundle.quizzes.filter((q) => q.topicId === topic.topicId)}
                  courseId={courseId}
                  onRefresh={loadBundle}
                />
              ))}
              {bundle.quizzes.some((quiz) => quiz.topicId === ACADEMY_FINAL_EXAM_TOPIC_ID) ? (
                <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  ✅ Final certification exam configured.
                </div>
              ) : null}
              {!bundle.topics.length ? <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/45">No topics yet. Add your first module from the right panel.</p> : null}
            </div>
          </Panel>

          <Panel title="Cohorts & Live Sessions" icon={CalendarDays}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-white">Cohorts</h3>
                <div className="mt-3 space-y-2">
                  {bundle.cohorts.map((cohort) => <Compact key={cohort.cohortId} title={cohort.title} meta={`${cohort.status} · ${cohort.capacity || "Unlimited"} seats`} />)}
                  {!bundle.cohorts.length ? <p className="text-sm text-white/40">No cohorts created yet.</p> : null}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Live classes</h3>
                <div className="mt-3 space-y-2">
                  {bundle.liveSessions.map((session) => <Compact key={session.liveSessionId} title={session.title} meta={`${session.provider} · ${session.status}`} />)}
                  {!bundle.liveSessions.length ? <p className="text-sm text-white/40">No live sessions scheduled yet.</p> : null}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Add Topic" icon={Plus}>
            <form onSubmit={createTopic} className="space-y-3">
              <Field label="Topic title"><input required className="academy-input" value={topicForm.title} onChange={(event) => setTopicForm({ ...topicForm, title: event.target.value })} /></Field>
              <Field label="Description"><textarea rows={3} className="academy-input resize-none" value={topicForm.description} onChange={(event) => setTopicForm({ ...topicForm, description: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sort"><input type="number" min={0} className="academy-input" value={topicForm.sortOrder} onChange={(event) => setTopicForm({ ...topicForm, sortOrder: event.target.value })} /></Field>
                <Field label="Drip days"><input type="number" min={0} className="academy-input" value={topicForm.dripDelayDays} onChange={(event) => setTopicForm({ ...topicForm, dripDelayDays: event.target.value })} /></Field>
              </div>
              <Field label="Unlock rule"><select className="academy-input" value={topicForm.unlockRule} onChange={(event) => setTopicForm({ ...topicForm, unlockRule: event.target.value })}><option value="immediate">Immediate</option><option value="lesson_completion">Lesson completion</option><option value="topic_quiz_passed">Topic quiz passed</option><option value="manual_approval">Manual approval</option><option value="date_based">Date based</option><option value="cohort_schedule">Cohort schedule</option></select></Field>
              <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={topicForm.quizRequired} onChange={(event) => setTopicForm({ ...topicForm, quizRequired: event.target.checked })} /> Quiz required</label>
              <SubmitButton saving={saving}>Add Topic</SubmitButton>
            </form>
          </Panel>

          <Panel title="Add Lesson" icon={Video}>
            <form onSubmit={createLesson} className="space-y-3">
              <Field label="Topic"><select required className="academy-input" value={lessonForm.topicId} onChange={(event) => setLessonForm({ ...lessonForm, topicId: event.target.value })}>{bundle.topics.map((topic) => <option key={topic.topicId} value={topic.topicId}>{topic.title}</option>)}</select></Field>
              <Field label="Lesson title"><input required className="academy-input" value={lessonForm.title} onChange={(event) => setLessonForm({ ...lessonForm, title: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Format"><select className="academy-input" value={lessonForm.lessonType} onChange={(event) => setLessonForm({ ...lessonForm, lessonType: event.target.value as AcademyLessonType })}><option value="written">Written</option><option value="video">Video</option><option value="image">Image</option><option value="mixed">Mixed</option></select></Field>
                <Field label="Sort"><input type="number" min={0} className="academy-input" value={lessonForm.sortOrder} onChange={(event) => setLessonForm({ ...lessonForm, sortOrder: event.target.value })} /></Field>
              </div>
              <AdminMediaPicker
                label="Lesson video"
                value={lessonForm.videoUrl}
                kind="video"
                accept="video/*"
                usageContext="academy"
                linkedEntityType="academyLesson"
                linkedEntityId={lessonForm.topicId || courseId}
                helperText="Upload the lesson video or paste an externally hosted lesson URL."
                onChange={(url) => setLessonForm({ ...lessonForm, videoUrl: url })}
              />
              <AdminMediaPicker
                label="Lesson image gallery"
                value={lessonForm.imageUrls.split("\n").filter(Boolean)[0] || ""}
                kind="image"
                accept="image/*"
                usageContext="academy"
                linkedEntityType="academyLesson"
                linkedEntityId={lessonForm.topicId || courseId}
                helperText="Add images one at a time. Their order below becomes the gallery/carousel order."
                aspectHint="Recommended: consistent ratios per lesson."
                onChange={(url) => setLessonForm((current) => ({ ...current, imageUrls: [...current.imageUrls.split("\n").filter(Boolean), url].join("\n") }))}
              />
              <MediaListEditor
                label="Selected lesson images"
                value={lessonForm.imageUrls}
                onChange={(value) => setLessonForm({ ...lessonForm, imageUrls: value })}
              />
              <Field label="Written lesson content"><textarea rows={6} className="academy-input resize-none" value={lessonForm.writtenContent} onChange={(event) => setLessonForm({ ...lessonForm, writtenContent: event.target.value })} /></Field>
              <Field label="Transcript"><textarea rows={3} className="academy-input resize-none" value={lessonForm.transcript} onChange={(event) => setLessonForm({ ...lessonForm, transcript: event.target.value })} /></Field>
              <Field label="Key takeaways"><textarea rows={4} className="academy-input resize-none" value={lessonForm.keyTakeaways} onChange={(event) => setLessonForm({ ...lessonForm, keyTakeaways: event.target.value })} placeholder="One takeaway per line" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duration"><input type="number" min={0} className="academy-input" value={lessonForm.durationMinutes} onChange={(event) => setLessonForm({ ...lessonForm, durationMinutes: event.target.value })} /></Field>
                <Field label="Status"><select className="academy-input" value={lessonForm.status} onChange={(event) => setLessonForm({ ...lessonForm, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Check label="Activity" checked={lessonForm.activityRequired} onChange={(checked) => setLessonForm({ ...lessonForm, activityRequired: checked })} />
                <Check label="Discussion" checked={lessonForm.discussionEnabled} onChange={(checked) => setLessonForm({ ...lessonForm, discussionEnabled: checked })} />
                <Check label="AI Tutor" checked={lessonForm.aiTutorEnabled} onChange={(checked) => setLessonForm({ ...lessonForm, aiTutorEnabled: checked })} />
              </div>
              <SubmitButton saving={saving}>Add Lesson</SubmitButton>
            </form>
          </Panel>

          <Panel title="Add Activity" icon={BookOpen}>
            <form onSubmit={createActivity} className="space-y-3">
              <Field label="Lesson">
                <select required className="academy-input" value={activityForm.lessonId} onChange={(event) => setActivityForm({ ...activityForm, lessonId: event.target.value })}>
                  <option value="">Select lesson</option>
                  {bundle.lessons.map((lesson) => <option key={lesson.lessonId} value={lesson.lessonId}>{lesson.title}</option>)}
                </select>
              </Field>
              <Field label="Activity title"><input required className="academy-input" value={activityForm.title} onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })} /></Field>
              {activityForm.activityType === "q_and_a" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Questions</p>
                        <p className="text-xs text-white/45">Build the activity one question at a time. Each line can be Yes / No, Short text, or Long text.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivityForm((current) => {
                          const currentQuestions = extractActivityQuestions(current.prompt);
                          const nextQuestions = [...currentQuestions, ""];
                          const nextTypes: ActivityQuestionMode[] = [...buildQuestionAnswerTypes(current.prompt, current.questionTypes, current.yesNoOption), current.yesNoOption ? "yes_no" : "short_text"];
                          return {
                            ...current,
                            prompt: serializeQuestionPrompt(nextQuestions),
                            questionTypes: nextTypes,
                          };
                        })}
                        className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                      >
                        Add question
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {activityQuestions.length ? activityQuestions.map((question, index) => (
                        <div key={`${index}-${question}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1 space-y-2">
                              <label className="block text-xs uppercase tracking-[0.18em] text-white/45">Question {index + 1}</label>
                              <input
                                className="academy-input"
                                value={question}
                              onChange={(event) => setActivityForm((current) => {
                                  const currentQuestions = extractActivityQuestions(current.prompt);
                                  const nextQuestions = [...currentQuestions];
                                  nextQuestions[index] = event.target.value;
                                  return {
                                    ...current,
                                    prompt: serializeQuestionPrompt(nextQuestions),
                                  };
                                })}
                                placeholder="Ask something clear and specific..."
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setActivityForm((current) => {
                                const currentQuestions = extractActivityQuestions(current.prompt);
                                const nextQuestions = currentQuestions.filter((_, questionIndex) => questionIndex !== index);
                                const nextTypes = current.questionTypes.filter((_, questionIndex) => questionIndex !== index);
                                return {
                                  ...current,
                                  prompt: serializeQuestionPrompt(nextQuestions),
                                  questionTypes: nextTypes,
                                };
                              })}
                              className="mt-7 rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/45 hover:text-white"
                              aria-label={`Remove question ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-white/45">Answer type</label>
                          <select
                            className="academy-input mt-2"
                            value={activityQuestionModes[index] || (activityForm.yesNoOption ? "yes_no" : "short_text")}
                            onChange={(event) => setActivityForm((current) => {
                              const nextTypes: ActivityQuestionMode[] = buildQuestionAnswerTypes(current.prompt, current.questionTypes, current.yesNoOption);
                              nextTypes[index] = event.target.value as ActivityQuestionMode;
                              return { ...current, questionTypes: nextTypes };
                            })}
                          >
                            <option value="yes_no">Yes / No</option>
                            <option value="short_text">Short text</option>
                            <option value="long_text">Long text</option>
                          </select>
                        </div>
                      )) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/45">
                          Add your first question to build the activity.
                        </div>
                      )}
                    </div>
                  </div>
                  <Field label="Prompt preview">
                    <textarea readOnly rows={Math.max(3, activityQuestions.length + 1)} className="academy-input resize-none opacity-80" value={serializeQuestionPrompt(activityQuestions)} placeholder="Your numbered prompt will appear here." />
                  </Field>
                </div>
              ) : (
                <Field label="Prompt"><textarea required rows={4} className="academy-input resize-none" value={activityForm.prompt} onChange={(event) => setActivityForm({ ...activityForm, prompt: event.target.value })} placeholder="Tell learners exactly what to do." /></Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className="academy-input" value={activityForm.activityType} onChange={(event) => {
                    const activityType = event.target.value as AcademyActivityType;
                    setActivityForm({
                      ...activityForm,
                      activityType,
                      qAndAEnabled: activityType === "q_and_a",
                    });
                  }}>
                      <option value="reflection">Reflection</option>
                      <option value="short_text">Short text</option>
                      <option value="long_text">Long text</option>
                      <option value="q_and_a">Q&A</option>
                      <option value="multiple_choice">Multiple choice</option>
                      <option value="checkboxes">Checkboxes</option>
                      <option value="file_upload">File upload</option>
                      <option value="link_submission">Link submission</option>
                      <option value="project_submission">Project submission</option>
                  </select>
                </Field>
                <Field label="Sort"><input type="number" min={0} className="academy-input" value={activityForm.sortOrder} onChange={(event) => setActivityForm({ ...activityForm, sortOrder: event.target.value })} /></Field>
              </div>
              {["multiple_choice", "checkboxes"].includes(activityForm.activityType) ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Options</p>
                      <p className="text-xs text-white/45">Add options as rows and mark the correct answer(s).</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivityForm((current) => ({
                        ...current,
                        options: serializeActivityOptionRows(parseActivityOptionRows(current.options).concat({ label: "", isCorrect: false })),
                      }))}
                      className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                    >
                      Add option
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {activityOptionRows.length ? activityOptionRows.map((option, index) => (
                      <div key={`${index}-${option.label}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-start gap-3">
                          <label className="flex-1 space-y-2">
                            <span className="text-xs uppercase tracking-[0.18em] text-white/45">Option {index + 1}</span>
                            <input
                              className="academy-input"
                              value={option.label}
                              onChange={(event) => setActivityForm((current) => {
                                const rows = parseActivityOptionRows(current.options);
                                rows[index] = { ...rows[index], label: event.target.value };
                                return { ...current, options: serializeActivityOptionRows(rows) };
                              })}
                              placeholder="Enter option text..."
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setActivityForm((current) => ({
                              ...current,
                              options: serializeActivityOptionRows(parseActivityOptionRows(current.options).filter((_, rowIndex) => rowIndex !== index)),
                            }))}
                            className="mt-8 rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/45 hover:text-white"
                            aria-label={`Remove option ${index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-white/65">
                          <input
                            type="checkbox"
                            checked={option.isCorrect}
                            onChange={(event) => setActivityForm((current) => {
                              const rows = parseActivityOptionRows(current.options);
                              if (current.activityType === "multiple_choice" && event.target.checked) {
                                rows.forEach((row, rowIndex) => {
                                  rows[rowIndex] = { ...row, isCorrect: rowIndex === index };
                                });
                              } else {
                                rows[index] = { ...rows[index], isCorrect: event.target.checked };
                              }
                              return { ...current, options: serializeActivityOptionRows(rows, current.activityType === "multiple_choice") };
                            })}
                          />
                          Mark as correct
                        </label>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/45">
                        Add at least two options to make this activity useful.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              <Check
                label="Use Q&A flow"
                checked={activityForm.qAndAEnabled}
                onChange={(checked) => setActivityForm({
                  ...activityForm,
                  qAndAEnabled: checked,
                  activityType: checked ? "q_and_a" : activityForm.activityType === "q_and_a" ? "reflection" : activityForm.activityType,
                })}
              />
              <Check
                label="Yes / No per question"
                checked={activityForm.yesNoOption}
                onChange={(checked) => setActivityForm((current) => ({
                  ...current,
                  yesNoOption: checked,
                  questionTypes: checked ? buildQuestionAnswerTypes(current.prompt, current.questionTypes, true) : current.questionTypes,
                }))}
              />
              {activityForm.activityType === "q_and_a" ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">Question answer types</p>
                    <p className="text-xs text-white/45">Set each question to Yes / No or open text.</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {extractActivityQuestions(activityForm.prompt).map((question, index) => {
                      const mode = activityForm.questionTypes[index] || (activityForm.yesNoOption ? "yes_no" : "short_text");
                      return (
                        <div key={`${index}-${question}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                          <p className="text-sm text-white">{question}</p>
                          <select
                            className="academy-input mt-3"
                            value={mode}
                            onChange={(event) => {
                              const next = [...activityForm.questionTypes];
                              next[index] = event.target.value as ActivityQuestionMode;
                              setActivityForm({ ...activityForm, questionTypes: next });
                            }}
                          >
                            <option value="yes_no">Yes / No</option>
                            <option value="short_text">Short text</option>
                            <option value="long_text">Long text</option>
                          </select>
                        </div>
                      );
                    })}
                    {!extractActivityQuestions(activityForm.prompt).length ? (
                      <p className="text-sm text-white/45">Add a numbered prompt first and the question types will appear here.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Check label="Required before completion" checked={activityForm.required} onChange={(checked) => setActivityForm({ ...activityForm, required: checked })} />
                <Check label="Requires manual review" checked={activityForm.manualReviewRequired} onChange={(checked) => setActivityForm({ ...activityForm, manualReviewRequired: checked })} />
              </div>
              <SubmitButton saving={saving}>Add Activity</SubmitButton>
            </form>
          </Panel>

          <Panel title="Add Quiz or Final Exam" icon={CheckCircle2}>
            <form onSubmit={createQuiz} className="space-y-3">
              <Field label="Assessment">
                <select required className="academy-input" value={quizForm.topicId} onChange={(event) => setQuizForm({ ...quizForm, topicId: event.target.value })}>
                  <option value="">Select topic</option>
                  {bundle.topics.map((topic) => <option key={topic.topicId} value={topic.topicId}>Quiz: {topic.title}</option>)}
                  <option value={ACADEMY_FINAL_EXAM_TOPIC_ID}>Final 3-hour certification exam</option>
                </select>
              </Field>
              <Field label="Title"><input required className="academy-input" value={quizForm.title} onChange={(event) => setQuizForm({ ...quizForm, title: event.target.value })} /></Field>
              <Field label="Description"><textarea rows={3} className="academy-input resize-none" value={quizForm.description} onChange={(event) => setQuizForm({ ...quizForm, description: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Passing score"><input type="number" min={0} max={100} className="academy-input" value={quizForm.passingScore} onChange={(event) => setQuizForm({ ...quizForm, passingScore: event.target.value })} /></Field>
                <Field label="Max attempts"><input type="number" min={1} className="academy-input" value={quizForm.maxAttempts} onChange={(event) => setQuizForm({ ...quizForm, maxAttempts: event.target.value })} /></Field>
              </div>
              <Field label="Status"><select className="academy-input" value={quizForm.status} onChange={(event) => setQuizForm({ ...quizForm, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
              <Field label="Questions">
                <textarea rows={8} className="academy-input resize-none" value={quizForm.questions} onChange={(event) => setQuizForm({ ...quizForm, questions: event.target.value })} placeholder={"Format per block:\nQuestion text\nA) Option one\nB) *Correct option\nC) Option three\nExplanation: Why this is correct"} />
              </Field>
              <Check label="Instant feedback" checked={quizForm.instantFeedbackEnabled} onChange={(checked) => setQuizForm({ ...quizForm, instantFeedbackEnabled: checked })} />
              <SubmitButton saving={saving}>Save Assessment</SubmitButton>
            </form>
          </Panel>

          <Panel title="Drip & Unlock Rules" icon={Layers3}>
            <form onSubmit={createDripSchedule} className="space-y-3">
              <Field label="Topic">
                <select className="academy-input" value={dripForm.topicId} onChange={(event) => setDripForm({ ...dripForm, topicId: event.target.value, lessonId: "" })}>
                  <option value="">Course-wide</option>
                  {bundle.topics.map((topic) => <option key={topic.topicId} value={topic.topicId}>{topic.title}</option>)}
                </select>
              </Field>
              <Field label="Lesson">
                <select className="academy-input" value={dripForm.lessonId} onChange={(event) => setDripForm({ ...dripForm, lessonId: event.target.value })}>
                  <option value="">Whole topic or course</option>
                  {bundle.lessons.filter((lesson) => !dripForm.topicId || lesson.topicId === dripForm.topicId).map((lesson) => <option key={lesson.lessonId} value={lesson.lessonId}>{lesson.title}</option>)}
                </select>
              </Field>
              <Field label="Cohort">
                <select className="academy-input" value={dripForm.cohortId} onChange={(event) => setDripForm({ ...dripForm, cohortId: event.target.value })}>
                  <option value="">All learners</option>
                  {bundle.cohorts.map((cohort) => <option key={cohort.cohortId} value={cohort.cohortId}>{cohort.title}</option>)}
                </select>
              </Field>
              <Field label="Unlock condition">
                <select className="academy-input" value={dripForm.unlockCondition} onChange={(event) => setDripForm({ ...dripForm, unlockCondition: event.target.value })}>
                  <option value="immediate">Available immediately</option>
                  <option value="lesson_completion">Complete previous lesson</option>
                  <option value="topic_quiz_passed">Pass previous topic quiz</option>
                  <option value="manual_approval">Wait for manual approval</option>
                  <option value="date_based">Specific date</option>
                  <option value="cohort_schedule">Cohort schedule</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Available at"><input type="datetime-local" className="academy-input" value={dripForm.availableAt} onChange={(event) => setDripForm({ ...dripForm, availableAt: event.target.value })} /></Field>
                <Field label="Delay days"><input type="number" min={0} className="academy-input" value={dripForm.delayDays} onChange={(event) => setDripForm({ ...dripForm, delayDays: event.target.value })} /></Field>
              </div>
              <SubmitButton saving={saving}>Save Unlock Rule</SubmitButton>
            </form>
            <div className="mt-5 space-y-2">
              {(bundle.dripSchedules || []).slice(0, 8).map((schedule) => (
                <Compact key={schedule.dripScheduleId} title={schedule.unlockCondition.replace(/_/g, " ")} meta={`${schedule.topicId ? "Topic rule" : "Course rule"}${schedule.cohortId ? " - cohort" : ""}`} />
              ))}
              {!(bundle.dripSchedules || []).length ? <p className="text-sm text-white/40">No drip rules yet. Immediate access applies unless topic rules say otherwise.</p> : null}
            </div>
          </Panel>

          <Panel title="Create Cohort" icon={CalendarDays}>
            <form onSubmit={createCohort} className="space-y-3">
              <Field label="Cohort title"><input required className="academy-input" value={cohortForm.title} onChange={(event) => setCohortForm({ ...cohortForm, title: event.target.value })} /></Field>
              <Field label="Description"><textarea rows={3} className="academy-input resize-none" value={cohortForm.description} onChange={(event) => setCohortForm({ ...cohortForm, description: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date"><input type="datetime-local" className="academy-input" value={cohortForm.startDate} onChange={(event) => setCohortForm({ ...cohortForm, startDate: event.target.value })} /></Field>
                <Field label="End date"><input type="datetime-local" className="academy-input" value={cohortForm.endDate} onChange={(event) => setCohortForm({ ...cohortForm, endDate: event.target.value })} /></Field>
              </div>
              <Field label="Capacity"><input type="number" min={1} className="academy-input" value={cohortForm.capacity} onChange={(event) => setCohortForm({ ...cohortForm, capacity: event.target.value })} /></Field>
              <SubmitButton saving={saving}>Create Cohort</SubmitButton>
            </form>
          </Panel>

          <Panel title="Schedule Live Class" icon={CalendarDays}>
            <form onSubmit={createLiveSession} className="space-y-3">
              <Field label="Session title"><input required className="academy-input" value={sessionForm.title} onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })} /></Field>
              <Field label="Description"><textarea rows={3} className="academy-input resize-none" value={sessionForm.description} onChange={(event) => setSessionForm({ ...sessionForm, description: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider"><select className="academy-input" value={sessionForm.provider} onChange={(event) => setSessionForm({ ...sessionForm, provider: event.target.value })}><option value="zoom">Zoom</option><option value="google_meet">Google Meet</option><option value="custom">Custom</option></select></Field>
                <Field label="Status"><select className="academy-input" value={sessionForm.status} onChange={(event) => setSessionForm({ ...sessionForm, status: event.target.value })}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Topic"><select className="academy-input" value={sessionForm.topicId} onChange={(event) => setSessionForm({ ...sessionForm, topicId: event.target.value })}><option value="">Course-wide</option>{bundle.topics.map((topic) => <option key={topic.topicId} value={topic.topicId}>{topic.title}</option>)}</select></Field>
                <Field label="Cohort"><select className="academy-input" value={sessionForm.cohortId} onChange={(event) => setSessionForm({ ...sessionForm, cohortId: event.target.value })}><option value="">All enrolled learners</option>{bundle.cohorts.map((cohort) => <option key={cohort.cohortId} value={cohort.cohortId}>{cohort.title}</option>)}</select></Field>
              </div>
              <Field label="Meeting URL"><input required className="academy-input" value={sessionForm.meetingUrl} onChange={(event) => setSessionForm({ ...sessionForm, meetingUrl: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts"><input type="datetime-local" className="academy-input" value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} /></Field>
                <Field label="Ends"><input type="datetime-local" className="academy-input" value={sessionForm.endsAt} onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })} /></Field>
              </div>
              <AdminMediaPicker
                label="Replay video"
                value={sessionForm.recordingUrl}
                kind="video"
                accept="video/*"
                usageContext="academy"
                linkedEntityType="academyLiveSession"
                linkedEntityId={courseId}
                helperText="Upload the replay after class or paste a Zoom, Meet, Vimeo, or YouTube replay link."
                onChange={(url) => setSessionForm({ ...sessionForm, recordingUrl: url })}
              />
              <Field label="Materials">
                <AdminMediaPicker
                  label="Add class material"
                  value=""
                  kind="document"
                  usageContext="academy"
                  linkedEntityType="academyLiveSession"
                  linkedEntityId={courseId}
                  helperText="Upload PDFs, worksheets, slides, or paste a resource URL."
                  onChange={(url, asset) => setSessionForm((current) => ({ ...current, materials: [current.materials, `${asset?.fileName || "Resource"}|${url}`].filter(Boolean).join("\n") }))}
                />
                <MaterialsListEditor value={sessionForm.materials} onChange={(value) => setSessionForm({ ...sessionForm, materials: value })} />
              </Field>
              <SubmitButton saving={saving}>Schedule Class</SubmitButton>
            </form>
          </Panel>
        </div>
      </div>

      <AcademyInputStyles />
      </AdminFormShell>
    </div>
  );
}

// ─── Inline Editing Components ───────────────────────────────────────────────

function useAdminFetch() {
  const save = async (path: string, body: unknown): Promise<void> => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error("Admin session expired.");
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Save failed.");
  };
  const destroy = async (path: string): Promise<void> => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error("Admin session expired.");
    const res = await fetch(path, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || "Delete failed.");
    }
  };
  return { save, destroy };
}

function ConfirmDelete({ onConfirm, onCancel, busy }: { onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-red-400/30 bg-red-400/10 px-3 py-2">
      <span className="text-xs text-red-200">Delete permanently?</span>
      <button type="button" onClick={onConfirm} disabled={busy} className="rounded-xl bg-red-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, delete"}
      </button>
      <button type="button" onClick={onCancel} className="rounded-xl border border-white/10 px-2.5 py-1 text-xs text-white/60">Cancel</button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colour =
    status === "published" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" :
    status === "draft"     ? "border-white/10 bg-white/[0.04] text-white/50" :
                             "border-white/10 bg-white/[0.03] text-white/35";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${colour}`}>{status}</span>;
}

// ── EditableActivity ──────────────────────────────────────────────────────────
function EditableActivity({
  activity,
  onRefresh,
}: {
  activity: AcademyActivityDoc;
  onRefresh: () => void;
}) {
  const { save, destroy } = useAdminFetch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    title: activity.title,
    prompt: activity.prompt,
    activityType: activity.activityType,
    options: (activity.options || []).map((o) => `${o.isCorrect ? "*" : ""}${o.label}`).join("\n"),
    required: activity.required,
    manualReviewRequired: activity.manualReviewRequired,
    sortOrder: String(activity.sortOrder),
  });

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true); setErr("");
      await save(`/api/admin/academy/activities/${activity.activityId}`, {
        ...form,
        sortOrder: Number(form.sortOrder),
        options: parseActivityOptions(form.options),
      });
      onRefresh();
      setOpen(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed."); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    try {
      setBusy(true); setErr("");
      await destroy(`/api/admin/academy/activities/${activity.activityId}`);
      onRefresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Delete failed."); setConfirmDelete(false); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-white/80">{form.title}</span>
          <span className="ml-2 text-white/35">{form.activityType}{form.manualReviewRequired ? " · manual review" : " · auto"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {confirmDelete
            ? <ConfirmDelete onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} busy={busy} />
            : <>
                <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-xl border border-white/10 px-2 py-1 text-white/50 hover:text-white">
                  {open ? <ChevronUp className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-400/20 px-2 py-1 text-red-300/60 hover:text-red-200">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
          }
        </div>
      </div>
      {err ? <p className="mt-2 text-xs text-red-300">{err}</p> : null}
      {open && (
        <form onSubmit={handleSave} className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <Field label="Title"><input className="academy-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Prompt"><textarea rows={3} className="academy-input resize-none" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <select className="academy-input" value={form.activityType} onChange={(e) => {
                const activityType = e.target.value as AcademyActivityType;
                setForm({
                  ...form,
                  activityType,
                });
              }}>
                {["reflection","short_text","long_text","q_and_a","multiple_choice","checkboxes","file_upload","link_submission","project_submission"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Sort"><input type="number" className="academy-input" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          </div>
          {["multiple_choice", "checkboxes"].includes(form.activityType) && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Options</p>
                  <p className="text-xs text-white/45">Edit the answer choices directly and mark the correct option(s).</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, options: serializeActivityOptionRows(parseActivityOptionRows(form.options).concat({ label: "", isCorrect: false })) })}
                  className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                >
                  Add option
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {parseActivityOptionRows(form.options).length ? parseActivityOptionRows(form.options).map((option, index) => (
                  <div key={`${index}-${option.label}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-start gap-3">
                      <label className="flex-1 space-y-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-white/45">Option {index + 1}</span>
                        <input
                          className="academy-input"
                          value={option.label}
                          onChange={(event) => {
                            const rows = parseActivityOptionRows(form.options);
                            rows[index] = { ...rows[index], label: event.target.value };
                            setForm({ ...form, options: serializeActivityOptionRows(rows) });
                          }}
                          placeholder="Enter option text..."
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, options: serializeActivityOptionRows(parseActivityOptionRows(form.options).filter((_, rowIndex) => rowIndex !== index)) })}
                        className="mt-8 rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/45 hover:text-white"
                        aria-label={`Remove option ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm text-white/65">
                      <input
                        type="checkbox"
                        checked={option.isCorrect}
                        onChange={(event) => {
                          const rows = parseActivityOptionRows(form.options);
                          if (form.activityType === "multiple_choice" && event.target.checked) {
                            rows.forEach((row, rowIndex) => {
                              rows[rowIndex] = { ...row, isCorrect: rowIndex === index };
                            });
                          } else {
                            rows[index] = { ...rows[index], isCorrect: event.target.checked };
                          }
                          setForm({ ...form, options: serializeActivityOptionRows(rows, form.activityType === "multiple_choice") });
                        }}
                      />
                      Mark as correct
                    </label>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/45">
                    Add at least two options to make this activity useful.
                  </div>
                )}
              </div>
            </div>
          )}
          <Check
            label="Use Q&A flow"
            checked={form.activityType === "q_and_a"}
            onChange={(checked) => setForm({ ...form, activityType: checked ? "q_and_a" : "reflection" as AcademyActivityType })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Check label="Required" checked={form.required} onChange={(v) => setForm({ ...form, required: v })} />
            <Check label="Manual review" checked={form.manualReviewRequired} onChange={(v) => setForm({ ...form, manualReviewRequired: v })} />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-3 text-xs font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}Save Activity
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── EditableLesson ────────────────────────────────────────────────────────────
function EditableLesson({
  lesson,
  activities,
  courseId,
  onRefresh,
}: {
  lesson: AcademyLessonDoc;
  activities: AcademyActivityDoc[];
  courseId: string;
  onRefresh: () => void;
}) {
  const { save, destroy } = useAdminFetch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    title: lesson.title,
    lessonType: lesson.lessonType,
    videoUrl: lesson.videoUrl || "",
    imageUrls: (lesson.imageUrls || []).join("\n"),
    writtenContent: lesson.writtenContent || "",
    transcript: lesson.transcript || "",
    keyTakeaways: (lesson.keyTakeaways || []).join("\n"),
    durationMinutes: lesson.durationMinutes ? String(lesson.durationMinutes) : "",
    sortOrder: String(lesson.sortOrder),
    status: lesson.status,
    activityRequired: lesson.activityRequired,
    discussionEnabled: lesson.discussionEnabled,
    aiTutorEnabled: lesson.aiTutorEnabled,
  });

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true); setErr("");
      await save(`/api/admin/academy/lessons/${lesson.lessonId}`, {
        ...form,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        sortOrder: Number(form.sortOrder),
        imageUrls: form.imageUrls.split("\n").map((u) => u.trim()).filter(Boolean),
        keyTakeaways: form.keyTakeaways.split("\n").map((u) => u.trim()).filter(Boolean),
      });
      onRefresh();
      setOpen(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed."); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    try {
      setBusy(true); setErr("");
      await destroy(`/api/admin/academy/lessons/${lesson.lessonId}`);
      onRefresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Delete failed."); setConfirmDelete(false); }
    finally { setBusy(false); }
  };

  const quickToggleStatus = async () => {
    const next = form.status === "published" ? "draft" : "published";
    try {
      setBusy(true);
      await save(`/api/admin/academy/lessons/${lesson.lessonId}`, { status: next });
      setForm((f) => ({ ...f, status: next }));
      onRefresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-white">{form.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/40">{form.lessonType}</span>
            <StatusPill status={form.status} />
            <span className="text-xs text-white/30">sort: {form.sortOrder}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-white/40" /> : null}
          {!confirmDelete && (
            <button type="button" onClick={quickToggleStatus} title={form.status === "published" ? "Set to Draft" : "Publish"} className="rounded-xl border border-white/10 px-2 py-1 text-white/50 hover:text-white">
              {form.status === "published" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          {confirmDelete
            ? <ConfirmDelete onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} busy={busy} />
            : <>
                <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-xl border border-white/10 px-2 py-1 text-white/50 hover:text-white">
                  {open ? <ChevronUp className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-400/20 px-2 py-1 text-red-300/60 hover:text-red-200">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
          }
        </div>
      </div>
      {err ? <p className="mt-2 text-xs text-red-300">{err}</p> : null}
      {open && (
        <form onSubmit={handleSave} className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <Field label="Lesson title"><input className="academy-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <select className="academy-input" value={form.lessonType} onChange={(e) => setForm({ ...form, lessonType: e.target.value as AcademyLessonType })}>
                {["written","video","image","mixed"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="academy-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as import("@/academy").AcademyLessonStatus })}>
                {["draft","published","archived"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <AdminMediaPicker label="Lesson video" value={form.videoUrl} kind="video" accept="video/*" usageContext="academy" linkedEntityType="academyLesson" linkedEntityId={lesson.lessonId} helperText="Upload or paste a video URL." onChange={(url) => setForm({ ...form, videoUrl: url })} />
          <Field label="Written content"><textarea rows={5} className="academy-input resize-none" value={form.writtenContent} onChange={(e) => setForm({ ...form, writtenContent: e.target.value })} /></Field>
          <Field label="Transcript"><textarea rows={3} className="academy-input resize-none" value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })} /></Field>
          <Field label="Key takeaways (one per line)"><textarea rows={4} className="academy-input resize-none" value={form.keyTakeaways} onChange={(e) => setForm({ ...form, keyTakeaways: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (mins)"><input type="number" className="academy-input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></Field>
            <Field label="Sort"><input type="number" className="academy-input" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Check label="Activity required" checked={form.activityRequired} onChange={(v) => setForm({ ...form, activityRequired: v })} />
            <Check label="Discussions" checked={form.discussionEnabled} onChange={(v) => setForm({ ...form, discussionEnabled: v })} />
            <Check label="AI Tutor" checked={form.aiTutorEnabled} onChange={(v) => setForm({ ...form, aiTutorEnabled: v })} />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save Lesson
            </button>
          </div>
        </form>
      )}
      {/* Activities under this lesson */}
      {activities.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-[11px] uppercase tracking-widest text-white/30">Activities</p>
          {activities.map((activity) => (
            <EditableActivity key={activity.activityId} activity={activity} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── EditableTopic ─────────────────────────────────────────────────────────────
function EditableTopic({
  topic,
  lessons,
  activitiesByLesson,
  quizzes,
  courseId,
  onRefresh,
}: {
  topic: AcademyTopicDoc;
  lessons: AcademyLessonDoc[];
  activitiesByLesson: Map<string, AcademyActivityDoc[]>;
  quizzes: AcademyQuizDoc[];
  courseId: string;
  onRefresh: () => void;
}) {
  const { save, destroy } = useAdminFetch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    title: topic.title,
    description: topic.description,
    sortOrder: String(topic.sortOrder),
    unlockRule: topic.unlockRule,
    quizRequired: topic.quizRequired,
    dripDelayDays: topic.dripDelayDays != null ? String(topic.dripDelayDays) : "",
  });

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true); setErr("");
      await save(`/api/admin/academy/topics/${topic.topicId}`, {
        ...form,
        sortOrder: Number(form.sortOrder),
        dripDelayDays: form.dripDelayDays ? Number(form.dripDelayDays) : null,
      });
      onRefresh();
      setOpen(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed."); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    try {
      setBusy(true); setErr("");
      await destroy(`/api/admin/academy/topics/${topic.topicId}`);
      onRefresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Delete failed."); setConfirmDelete(false); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      {/* Topic header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Topic {topic.sortOrder + 1}</p>
          <h3 className="mt-1 text-lg font-semibold">{form.title}</h3>
          {form.description && <p className="mt-1 text-sm text-white/45">{form.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-white/40" /> : null}
          {confirmDelete
            ? <ConfirmDelete onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} busy={busy} />
            : <>
                <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-xl border border-white/10 px-2.5 py-1.5 text-xs text-white/50 hover:text-white flex items-center gap-1">
                  {open ? <><ChevronUp className="h-3.5 w-3.5" /> Close</> : <><Pencil className="h-3.5 w-3.5" /> Edit</>}
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-400/20 px-2 py-1.5 text-red-300/60 hover:text-red-200">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
          }
        </div>
      </div>
      {err ? <p className="mt-2 text-sm text-red-300">{err}</p> : null}

      {/* Topic edit form */}
      {open && (
        <form onSubmit={handleSave} className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Edit Topic</p>
          <Field label="Title"><input required className="academy-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description"><textarea rows={3} className="academy-input resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort"><input type="number" min={0} className="academy-input" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
            <Field label="Drip days"><input type="number" min={0} className="academy-input" value={form.dripDelayDays} onChange={(e) => setForm({ ...form, dripDelayDays: e.target.value })} /></Field>
          </div>
          <Field label="Unlock rule">
            <select className="academy-input" value={form.unlockRule} onChange={(e) => setForm({ ...form, unlockRule: e.target.value as import("@/academy").AcademyUnlockRule })}>
              {["immediate","lesson_completion","topic_quiz_passed","manual_approval","date_based","cohort_schedule"].map((r) => <option key={r} value={r}>{r.replace(/_/g," ")}</option>)}
            </select>
          </Field>
          <Check label="Quiz required" checked={form.quizRequired} onChange={(v) => setForm({ ...form, quizRequired: v })} />
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save Topic
            </button>
          </div>
        </form>
      )}

      {/* Lessons under this topic */}
      <div className="mt-4 space-y-2">
        {lessons.map((lesson) => (
          <EditableLesson
            key={lesson.lessonId}
            lesson={lesson}
            activities={activitiesByLesson.get(lesson.lessonId) || []}
            courseId={courseId}
            onRefresh={onRefresh}
          />
        ))}
        {!lessons.length && <p className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-white/35">No lessons yet. Add one from the right panel.</p>}
        {quizzes.map((quiz) => (
          <div key={quiz.quizId} className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3 text-sm text-violet-100 flex items-center justify-between">
            <span>📝 {quiz.title} — passing score: {quiz.passingScore}%</span>
            <StatusPill status={quiz.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── end Inline Editing Components ───────────────────────────────────────────

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-100"><Icon className="h-4 w-4" /></div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function parseActivityOptions(value: string) {
  return value
    .split("\n")
    .map((line, index) => {
      const trimmed = line.trim();
      const isCorrect = trimmed.startsWith("*");
      const label = (isCorrect ? trimmed.slice(1) : trimmed).trim();
      return label ? { optionId: `option_${index + 1}`, label, isCorrect } : null;
    })
    .filter(Boolean);
}

type ActivityOptionRow = { label: string; isCorrect: boolean };

function parseActivityOptionRows(value: string): ActivityOptionRow[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const isCorrect = line.startsWith("*");
      const label = (isCorrect ? line.slice(1) : line).trim();
      return { label, isCorrect };
    });
}

function serializeActivityOptionRows(rows: ActivityOptionRow[], singleCorrect = false) {
  const normalized = rows
    .map((row) => ({ label: row.label.trim(), isCorrect: Boolean(row.isCorrect) }))
    .filter((row) => row.label);
  if (singleCorrect) {
    let seenCorrect = false;
    return normalized
      .map((row) => {
        const isCorrect = row.isCorrect && !seenCorrect;
        if (isCorrect) seenCorrect = true;
        return `${isCorrect ? "*" : ""}${row.label}`;
      })
      .join("\n");
  }
  return normalized.map((row) => `${row.isCorrect ? "*" : ""}${row.label}`).join("\n");
}

function extractActivityQuestions(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const questions = normalized.split(/(?=\d+\.\s)/).map((item) => item.trim()).filter(Boolean);
  return questions.length ? questions.map((question) => question.replace(/^\d+\.\s*/, "")) : normalized ? [normalized] : [];
}

function serializeQuestionPrompt(questions: string[]) {
  return questions
    .map((question, index) => question.trim() ? `${index + 1}. ${question.trim()}` : "")
    .filter(Boolean)
    .join("\n");
}

function buildQuestionAnswerTypes(prompt: string, questionTypes: ActivityQuestionMode[], defaultYesNo: boolean): ActivityQuestionMode[] {
  const questions = extractActivityQuestions(prompt);
  return questions.map((_, index) => (questionTypes[index] || (defaultYesNo ? "yes_no" : "short_text")) as ActivityQuestionMode);
}

function parseQuizQuestions(value: string) {
  return value
    .split(/\n\s*\n/g)
    .map((block, index) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const prompt = lines[0] || "";
      const explanationLine = lines.find((line) => line.toLowerCase().startsWith("explanation:"));
      const optionLines = lines.slice(1).filter((line) => !line.toLowerCase().startsWith("explanation:"));
      const options = optionLines.map((line, optionIndex) => {
        const withoutPrefix = line.replace(/^[A-Z]\)\s*/i, "");
        const isCorrect = withoutPrefix.startsWith("*");
        const label = (isCorrect ? withoutPrefix.slice(1) : withoutPrefix).trim();
        return { optionId: `option_${optionIndex + 1}`, label, isCorrect };
      }).filter((option) => option.label);
      const questionType: AcademyQuestionType = options.length ? (options.filter((option) => option.isCorrect).length > 1 ? "multi_select" : "multiple_choice") : "short_answer";
      return {
        questionId: `question_${index + 1}`,
        type: questionType,
        prompt,
        options,
        points: 1,
        explanation: explanationLine ? explanationLine.replace(/^explanation:\s*/i, "") : "",
        sortOrder: index,
      };
    })
    .filter((question) => question.prompt);
}

function parseMaterials(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...urlParts] = line.split("|");
      const url = urlParts.join("|").trim();
      return {
        title: (title || url).trim(),
        url: url || title.trim(),
      };
    })
    .filter((item) => item.title && item.url);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium text-white/75">{label}</span>{children}</label>;
}

function MediaListEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const items = value.split("\n").map((item) => item.trim()).filter(Boolean);
  const updateItems = (next: string[]) => onChange(next.filter(Boolean).join("\n"));
  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateItems(next);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-sm font-semibold text-white/75">{label}</p>
      <p className="mt-1 text-xs text-white/40">Drag-style ordering is represented with move controls for reliability across desktop and mobile.</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item, index) => (
          <div key={`${item}-${index}`} className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 sm:grid-cols-[72px_1fr_auto] sm:items-center">
            <div className="h-14 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item} alt="" className="h-full w-full object-cover" />
            </div>
            <input value={item} onChange={(event) => updateItems(items.map((current, currentIndex) => currentIndex === index ? event.target.value : current))} className="academy-input min-h-10" />
            <div className="flex gap-1">
              <button type="button" onClick={() => move(index, -1)} className="rounded-xl border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white">Up</button>
              <button type="button" onClick={() => move(index, 1)} className="rounded-xl border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white">Down</button>
              <button type="button" onClick={() => updateItems(items.filter((_, currentIndex) => currentIndex !== index))} className="rounded-xl border border-red-300/20 px-2 py-1 text-xs text-red-100 hover:bg-red-400/10">Remove</button>
            </div>
          </div>
        )) : <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/40">No lesson images selected yet.</p>}
      </div>
    </div>
  );
}

function MaterialsListEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rows = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const updateRows = (next: string[]) => onChange(next.filter(Boolean).join("\n"));

  return (
    <div className="mt-3 rounded-3xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-sm font-semibold text-white/75">Selected materials</p>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row, index) => {
          const [title, ...urlParts] = row.split("|");
          const url = urlParts.join("|");
          return (
            <div key={`${row}-${index}`} className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 md:grid-cols-[0.7fr_1fr_auto]">
              <input value={title || ""} onChange={(event) => updateRows(rows.map((current, currentIndex) => currentIndex === index ? `${event.target.value}|${url}` : current))} placeholder="Resource title" className="academy-input min-h-10" />
              <input value={url || ""} onChange={(event) => updateRows(rows.map((current, currentIndex) => currentIndex === index ? `${title}|${event.target.value}` : current))} placeholder="Resource URL" className="academy-input min-h-10" />
              <button type="button" onClick={() => updateRows(rows.filter((_, currentIndex) => currentIndex !== index))} className="rounded-xl border border-red-300/20 px-3 py-2 text-xs text-red-100 hover:bg-red-400/10">Remove</button>
            </div>
          );
        }) : <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/40">No class materials selected yet.</p>}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function SubmitButton({ saving, children }: { saving: boolean; children: React.ReactNode }) {
  return <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{children}</button>;
}

function Compact({ title, meta }: { title: string; meta: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><p className="font-medium text-white">{title}</p><p className="mt-1 text-xs text-white/40">{meta}</p></div>;
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
