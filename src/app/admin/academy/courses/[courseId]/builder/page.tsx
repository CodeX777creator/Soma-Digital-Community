"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Video,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { storage } from "@/lib/firebase";
import type {
  AcademyCohortDoc,
  AcademyActivityDoc,
  AcademyActivityType,
  AcademyCourseDoc,
  AcademyLessonDoc,
  AcademyLessonType,
  AcademyLiveSessionDoc,
  AcademyTopicDoc,
} from "@/academy";

type Bundle = {
  course: AcademyCourseDoc;
  topics: AcademyTopicDoc[];
  lessons: AcademyLessonDoc[];
  activities: AcademyActivityDoc[];
  cohorts: AcademyCohortDoc[];
  liveSessions: AcademyLiveSessionDoc[];
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
  if (!response.ok) throw new Error(payload.error || "Academy action failed.");
  return payload;
}

export default function AcademyCourseBuilderPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
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
    options: "",
    required: true,
    manualReviewRequired: false,
    sortOrder: "0",
  });
  const [cohortForm, setCohortForm] = useState({ title: "", description: "", startDate: "", endDate: "", capacity: "", status: "draft" });
  const [sessionForm, setSessionForm] = useState({ title: "", description: "", cohortId: "", topicId: "", provider: "custom", meetingUrl: "", startsAt: "", endsAt: "", status: "scheduled" });

  const uploadAcademyFile = async (file: File, folder: string) => {
    if (!storage) throw new Error("Firebase Storage is not configured.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
    const path = `academy/courses/${courseId}/${folder}/${Date.now()}-${safeName}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, {
      contentType: file.type,
      customMetadata: {
        courseId,
        uploadedBy: auth?.currentUser?.uid || "admin",
      },
    });
    return getDownloadURL(fileRef);
  };

  const handleUpload = async (file: File | null, target: "thumbnail" | "promo" | "lessonVideo" | "lessonImage") => {
    if (!file) return;
    try {
      setUploading(target);
      setError(null);
      const folder = target === "thumbnail" ? "thumbnail" : target === "promo" ? "promo" : target === "lessonVideo" ? "lessons/videos" : "lessons/images";
      const url = await uploadAcademyFile(file, folder);
      if (target === "thumbnail") setCourseForm((current) => ({ ...current, thumbnailUrl: url }));
      if (target === "promo") setCourseForm((current) => ({ ...current, promoVideoUrl: url }));
      if (target === "lessonVideo") setLessonForm((current) => ({ ...current, videoUrl: url }));
      if (target === "lessonImage") setLessonForm((current) => ({ ...current, imageUrls: [current.imageUrls, url].filter(Boolean).join("\n") }));
      setMessage("Media uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload media.");
    } finally {
      setUploading(null);
    }
  };

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
      });
      const firstTopic = payload.topics?.[0]?.topicId || "";
      const firstLesson = payload.lessons?.[0]?.lessonId || "";
      setLessonForm((current) => ({ ...current, topicId: current.topicId || firstTopic }));
      setActivityForm((current) => ({ ...current, lessonId: current.lessonId || firstLesson }));
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
          sortOrder: Number(activityForm.sortOrder || 0),
        }),
      });
      setActivityForm((current) => ({ ...current, title: "", prompt: "", options: "", sortOrder: String((bundle?.activities.length || 0) + 1) }));
      setMessage("Activity added.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add activity.");
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
        body: JSON.stringify(sessionForm),
      });
      setSessionForm({ title: "", description: "", cohortId: "", topicId: "", provider: "custom", meetingUrl: "", startsAt: "", endsAt: "", status: "scheduled" });
      setMessage("Live session scheduled.");
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to schedule live session.");
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
      <Link href="/admin/academy" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to Academy
      </Link>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
              <BookOpen className="h-3.5 w-3.5" />
              Course Builder
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">{bundle.course.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Author topics, lessons, activities, quizzes, live cohorts, and certification settings in one structured workspace.</p>
          </div>
          <button onClick={loadBundle} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white/75 hover:bg-white/[0.08]">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>

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
                <Field label="Thumbnail">
                  <UploadRow
                    value={courseForm.thumbnailUrl}
                    uploading={uploading === "thumbnail"}
                    accept="image/*"
                    onChange={(value) => setCourseForm({ ...courseForm, thumbnailUrl: value })}
                    onUpload={(file) => handleUpload(file, "thumbnail")}
                  />
                </Field>
                <Field label="Promo video">
                  <UploadRow
                    value={courseForm.promoVideoUrl}
                    uploading={uploading === "promo"}
                    accept="video/*"
                    onChange={(value) => setCourseForm({ ...courseForm, promoVideoUrl: value })}
                    onUpload={(file) => handleUpload(file, "promo")}
                  />
                </Field>
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
                <div key={topic.topicId} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Topic {topic.sortOrder + 1}</p>
                      <h3 className="mt-1 text-lg font-semibold">{topic.title}</h3>
                      <p className="mt-1 text-sm text-white/45">{topic.description}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/45">{topic.unlockRule}</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {(lessonsByTopic.get(topic.topicId) || []).map((lesson) => (
                      <div key={lesson.lessonId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{lesson.title}</p>
                            <p className="mt-1 text-xs text-white/40">{lesson.lessonType} - {lesson.keyTakeaways.length} takeaways - {lesson.status}</p>
                          </div>
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100">{lesson.sortOrder}</span>
                        </div>
                        {(activitiesByLesson.get(lesson.lessonId) || []).length ? (
                          <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                            {(activitiesByLesson.get(lesson.lessonId) || []).map((activity) => (
                              <div key={activity.activityId} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium text-white/80">{activity.title}</span>
                                  <span>{activity.activityType}{activity.manualReviewRequired ? " - manual review" : " - auto-complete"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
              <Field label="Video">
                <UploadRow
                  value={lessonForm.videoUrl}
                  uploading={uploading === "lessonVideo"}
                  accept="video/*"
                  onChange={(value) => setLessonForm({ ...lessonForm, videoUrl: value })}
                  onUpload={(file) => handleUpload(file, "lessonVideo")}
                />
              </Field>
              <Field label="Upload image">
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                  <input type="file" accept="image/*" disabled={uploading === "lessonImage"} onChange={(event) => handleUpload(event.target.files?.[0] || null, "lessonImage")} className="w-full text-sm text-white/50 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-white" />
                  {uploading === "lessonImage" ? <p className="mt-2 text-xs text-cyan-200">Uploading image...</p> : null}
                </div>
              </Field>
              <Field label="Image URLs"><textarea rows={3} className="academy-input resize-none" value={lessonForm.imageUrls} onChange={(event) => setLessonForm({ ...lessonForm, imageUrls: event.target.value })} placeholder="One image URL per line" /></Field>
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
              <Field label="Prompt"><textarea required rows={4} className="academy-input resize-none" value={activityForm.prompt} onChange={(event) => setActivityForm({ ...activityForm, prompt: event.target.value })} placeholder="Tell learners exactly what to do." /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className="academy-input" value={activityForm.activityType} onChange={(event) => setActivityForm({ ...activityForm, activityType: event.target.value as AcademyActivityType })}>
                    <option value="reflection">Reflection</option>
                    <option value="short_text">Short text</option>
                    <option value="long_text">Long text</option>
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
                <Field label="Options">
                  <textarea rows={5} className="academy-input resize-none" value={activityForm.options} onChange={(event) => setActivityForm({ ...activityForm, options: event.target.value })} placeholder="One option per line. Prefix correct answers with *" />
                </Field>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Check label="Required before completion" checked={activityForm.required} onChange={(checked) => setActivityForm({ ...activityForm, required: checked })} />
                <Check label="Requires manual review" checked={activityForm.manualReviewRequired} onChange={(checked) => setActivityForm({ ...activityForm, manualReviewRequired: checked })} />
              </div>
              <SubmitButton saving={saving}>Add Activity</SubmitButton>
            </form>
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
              <Field label="Meeting URL"><input required className="academy-input" value={sessionForm.meetingUrl} onChange={(event) => setSessionForm({ ...sessionForm, meetingUrl: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts"><input type="datetime-local" className="academy-input" value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} /></Field>
                <Field label="Ends"><input type="datetime-local" className="academy-input" value={sessionForm.endsAt} onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })} /></Field>
              </div>
              <SubmitButton saving={saving}>Schedule Class</SubmitButton>
            </form>
          </Panel>
        </div>
      </div>

      <AcademyInputStyles />
    </div>
  );
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium text-white/75">{label}</span>{children}</label>;
}

function UploadRow({ value, accept, uploading, onChange, onUpload }: { value: string; accept: string; uploading: boolean; onChange: (value: string) => void; onUpload: (file: File | null) => void }) {
  return (
    <div className="space-y-2">
      <input className="academy-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Upload or paste URL" />
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <input type="file" accept={accept} disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0] || null)} className="w-full text-sm text-white/50 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-white" />
        {uploading ? <p className="mt-2 text-xs text-cyan-200">Uploading media...</p> : null}
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
