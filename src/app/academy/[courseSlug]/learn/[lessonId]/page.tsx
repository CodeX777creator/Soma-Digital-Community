"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ArrowLeft, BookOpen, Bot, CheckCircle2, Image as ImageIcon, Loader2, MessageSquare, PenLine, Sparkles, Video } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { auth, storage } from "@/lib/firebase";
import type { AcademyActivityDoc, AcademyCourseDoc, AcademyDiscussionReplyDoc, AcademyEnrollmentDoc, AcademyLessonDiscussionDoc, AcademyLessonDoc, AcademyProgressDoc, AcademyTopicDoc, AcademyTutorMessageDoc } from "@/academy";

type Bundle = {
  course: AcademyCourseDoc;
  topics: AcademyTopicDoc[];
  lessons: AcademyLessonDoc[];
  activities: AcademyActivityDoc[];
  enrollment: AcademyEnrollmentDoc | null;
  progress: AcademyProgressDoc[];
};

type ActivityResponse = string | string[];
type ActivityAttachment = { name: string; url: string; storagePath?: string; mimeType?: string };
type DiscussionThread = AcademyLessonDiscussionDoc & { replies?: AcademyDiscussionReplyDoc[] };

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

export default function AcademyLessonPage() {
  const { courseSlug, lessonId } = useParams<{ courseSlug: string; lessonId: string }>();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activitySaving, setActivitySaving] = useState<string | null>(null);
  const [discussionBody, setDiscussionBody] = useState("");
  const [tutorPrompt, setTutorPrompt] = useState("");
  const [discussions, setDiscussions] = useState<DiscussionThread[]>([]);
  const [tutorMessages, setTutorMessages] = useState<AcademyTutorMessageDoc[]>([]);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activityResponses, setActivityResponses] = useState<Record<string, ActivityResponse>>({});
  const [activityAttachments, setActivityAttachments] = useState<Record<string, ActivityAttachment[]>>({});

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      setBundle(await academyFetch(`/api/academy/${courseSlug}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load lesson.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [courseSlug]);

  const loadInteractions = async () => {
    if (!auth?.currentUser) return;
    try {
      const [discussionPayload, tutorPayload] = await Promise.all([
        academyFetch(`/api/academy/${courseSlug}/lessons/${lessonId}/discussions`),
        academyFetch(`/api/academy/${courseSlug}/lessons/${lessonId}/tutor`),
      ]);
      setDiscussions(discussionPayload.discussions || []);
      setTutorMessages(tutorPayload.messages || []);
    } catch {
      // Lesson content should remain usable even if collaboration surfaces are temporarily unavailable.
    }
  };

  useEffect(() => { void loadInteractions(); }, [courseSlug, lessonId, auth?.currentUser?.uid]);

  const lesson = bundle?.lessons.find((item) => item.lessonId === lessonId) || null;
  const topic = lesson ? bundle?.topics.find((item) => item.topicId === lesson.topicId) : null;
  const topicLessons = useMemo(() => bundle?.lessons.filter((item) => item.topicId === lesson?.topicId && item.status === "published").sort((a, b) => a.sortOrder - b.sortOrder) || [], [bundle?.lessons, lesson?.topicId]);
  const activities = bundle?.activities.filter((activity) => activity.lessonId === lessonId) || [];
  const completed = Boolean(bundle?.progress.some((item) => item.lessonId === lessonId && item.completed));
  const topicIndex = bundle?.topics.findIndex((item) => item.topicId === lesson?.topicId) ?? -1;
  const completedTopics = new Set((bundle?.progress || []).filter((item) => item.topicId && !item.lessonId && item.completed).map((item) => item.topicId as string));
  const currentIndex = topicLessons.findIndex((item) => item.lessonId === lessonId);
  const previousLesson = currentIndex > 0 ? topicLessons[currentIndex - 1] : null;
  const previousLessonComplete = !previousLesson || Boolean(bundle?.progress.some((item) => item.lessonId === previousLesson.lessonId && item.completed));
  const previousTopic = topicIndex > 0 ? bundle?.topics[topicIndex - 1] || null : null;
  const previousTopicLessons = previousTopic ? (bundle?.lessons.filter((item) => item.topicId === previousTopic.topicId && item.status === "published").sort((a, b) => a.sortOrder - b.sortOrder) || []) : [];
  const previousTopicLessonsComplete = !previousTopic || previousTopicLessons.every((item) => bundle?.progress.some((progress) => progress.lessonId === item.lessonId && progress.completed));
  const previousTopicComplete = !previousTopic || completedTopics.has(previousTopic.topicId);
  const topicReady = topicIndex <= 0 || (previousTopicLessonsComplete && previousTopicComplete);
  const nextLesson = currentIndex >= 0 ? topicLessons[currentIndex + 1] : null;

  if (bundle && lesson && auth?.currentUser && ((currentIndex > 0 && !previousLessonComplete) || (topicIndex > 0 && !topicReady))) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="space-y-6">
            <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4F9DFF]">Lesson locked</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{lesson.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#BFC6D4]">
                Complete the previous lesson before opening this one. That keeps the Academy sequence consistent and preserves activity flow.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/academy/${courseSlug}/learn/${previousLesson?.lessonId || ""}`}
                  className="inline-flex h-11 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white"
                >
                  Continue previous lesson <ArrowLeft className="h-4 w-4" />
                </Link>
                <Link href={`/academy/${courseSlug}`} className="inline-flex h-11 items-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-5 text-sm text-white/75 hover:bg-white/[0.08]">
                  Back to curriculum
                </Link>
              </div>
            </section>
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  const completeLesson = async () => {
    try {
      setSaving(true);
      await academyFetch(`/api/academy/${courseSlug}/lessons/${lessonId}/complete`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete lesson.");
    } finally {
      setSaving(false);
    }
  };

  const submitActivity = async (activity: AcademyActivityDoc) => {
    const response = activityResponses[activity.activityId] || (activity.activityType === "checkboxes" || activity.activityType === "q_and_a" ? [] : "");
    const attachments = activityAttachments[activity.activityId] || [];
    try {
      setActivitySaving(activity.activityId);
      setMessage("");
      await academyFetch(`/api/academy/${courseSlug}/activities/${activity.activityId}/submit`, {
        method: "POST",
        body: JSON.stringify({ topicId: activity.topicId, lessonId: activity.lessonId, response, attachments }),
      });
      setActivityResponses((current) => ({ ...current, [activity.activityId]: activity.activityType === "checkboxes" || activity.activityType === "q_and_a" ? [] : "" }));
      setActivityAttachments((current) => ({ ...current, [activity.activityId]: [] }));
      setMessage("Activity submitted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit activity.");
    } finally {
      setActivitySaving(null);
    }
  };

  const updateActivityResponse = (activityId: string, response: ActivityResponse) => {
    setActivityResponses((current) => ({ ...current, [activityId]: response }));
  };

  const uploadActivityFile = async (activity: AcademyActivityDoc, file: File | null) => {
    if (!file) return;
    if (!storage || !auth?.currentUser) {
      setError("File uploads are not available for this session.");
      return;
    }
    try {
      setActivitySaving(activity.activityId);
      setError("");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
      const storagePath = `academy/courses/${activity.courseId}/activities/${activity.activityId}/submissions/${auth.currentUser.uid}/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: {
          courseId: activity.courseId,
          activityId: activity.activityId,
          uploadedBy: auth.currentUser.uid,
        },
      });
      const url = await getDownloadURL(fileRef);
      const attachment = { name: file.name, url, storagePath, mimeType: file.type };
      setActivityAttachments((current) => ({
        ...current,
        [activity.activityId]: [...(current[activity.activityId] || []), attachment],
      }));
      setMessage("File attached.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload file.");
    } finally {
      setActivitySaving(null);
    }
  };

  const postDiscussion = async () => {
    if (!discussionBody.trim()) return;
    try {
      setMessage("");
      await academyFetch(`/api/academy/${courseSlug}/lessons/${lessonId}/discussions`, {
        method: "POST",
        body: JSON.stringify({ topicId: lesson?.topicId, body: discussionBody }),
      });
      setDiscussionBody("");
      setMessage("Discussion posted.");
      await loadInteractions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post discussion.");
    }
  };

  const askTutor = async (prompt = tutorPrompt) => {
    if (!prompt.trim()) return;
    try {
      setMessage("");
      await academyFetch(`/api/academy/${courseSlug}/lessons/${lessonId}/tutor`, {
        method: "POST",
        body: JSON.stringify({ topicId: lesson?.topicId, content: prompt }),
      });
      setTutorPrompt("");
      setMessage("Tutor answered.");
      await loadInteractions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to ask tutor.");
    }
  };

  const postReply = async (discussionId: string) => {
    const body = replyBodies[discussionId]?.trim();
    if (!body) return;
    try {
      await academyFetch(`/api/academy/${courseSlug}/discussions/${discussionId}/replies`, {
        method: "POST",
        body: JSON.stringify({ lessonId, body }),
      });
      setReplyBodies((current) => ({ ...current, [discussionId]: "" }));
      await loadInteractions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post reply.");
    }
  };

  const reactToDiscussion = async (discussionId: string, reactionType: "helpful" | "report", replyId?: string) => {
    try {
      await academyFetch(`/api/academy/${courseSlug}/discussions/${discussionId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ lessonId, replyId: replyId || null, reactionType }),
      });
      await loadInteractions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update discussion.");
    }
  };

  if (loading) {
    return <ProtectedRoute><AppLayout><div className="flex min-h-[60vh] items-center justify-center text-[#BFC6D4]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading lesson</div></AppLayout></ProtectedRoute>;
  }

  if (!bundle || !lesson) {
    return <ProtectedRoute><AppLayout><div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-4 text-red-100">{error || "Lesson not found."}</div></AppLayout></ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid gap-6 xl:grid-cols-[280px_1fr_340px]">
          <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
            <Link href={`/academy/${courseSlug}`} className="inline-flex items-center gap-2 text-sm text-[#BFC6D4] hover:text-white"><ArrowLeft className="h-4 w-4" />Course overview</Link>
            <section className="rounded-[20px] border border-white/[0.08] bg-[#151A2E]/72 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#4F9DFF]">Curriculum</p>
              <h2 className="mt-2 font-semibold text-white">{bundle.course.title}</h2>
              <div className="mt-4 space-y-4">
                {bundle.topics.map((item) => (
                  <div key={item.topicId}>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7E8799]">{item.title}</p>
                    <div className="mt-2 space-y-1">
                      {bundle.lessons.filter((lessonItem) => lessonItem.topicId === item.topicId && lessonItem.status === "published").sort((a, b) => a.sortOrder - b.sortOrder).map((lessonItem) => {
                        const active = lessonItem.lessonId === lessonId;
                        const done = bundle.progress.some((progress) => progress.lessonId === lessonItem.lessonId && progress.completed);
                        return (
                          <Link key={lessonItem.lessonId} href={`/academy/${courseSlug}/learn/${lessonItem.lessonId}`} className={`flex items-center gap-2 rounded-[14px] px-3 py-2 text-sm transition ${active ? "bg-[#5B5FFF]/20 text-white" : "text-[#BFC6D4] hover:bg-white/[0.05]"}`}>
                            <CheckCircle2 className={`h-3.5 w-3.5 ${done ? "text-[#22C55E]" : "text-[#7E8799]"}`} />
                            <span className="line-clamp-1">{lessonItem.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <main className="space-y-6">
            {error ? <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}
            {message ? <div className="rounded-[18px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{message}</div> : null}
            <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-6 shadow-[0_24px_80px_rgba(0,0,0,.28)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">{lesson.lessonType}</span>
                {topic ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/50">{topic.title}</span> : null}
                {completed ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">Completed</span> : null}
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">{lesson.title}</h1>
              <div className="mt-6">
                <LessonContent lesson={lesson} />
              </div>
            </section>

            {lesson.keyTakeaways.length ? (
              <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-white"><Sparkles className="h-5 w-5 text-[#8B5CF6]" />Key takeaways</h2>
                <ul className="mt-4 space-y-3">
                  {lesson.keyTakeaways.map((takeaway) => <li key={takeaway} className="flex gap-3 text-sm leading-6 text-[#BFC6D4]"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#22C55E]" />{takeaway}</li>)}
                </ul>
              </section>
            ) : null}

            {activities.length ? (
              <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-white"><PenLine className="h-5 w-5 text-[#4F9DFF]" />Class activity</h2>
                {activities.map((activity) => (
                  <div key={activity.activityId} className="mt-4 rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium text-white">{activity.title}</h3>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/45">{activity.manualReviewRequired ? "Manual review" : "Completion based"}</span>
                    </div>
                    {activity.activityType === "q_and_a" ? (
                      <QuestionAndAnswerFlow
                        activity={activity}
                        value={activityResponses[activity.activityId]}
                        attachments={activityAttachments[activity.activityId] || []}
                        uploading={activitySaving === activity.activityId}
                        onChange={(value) => updateActivityResponse(activity.activityId, value)}
                        onUpload={(file) => uploadActivityFile(activity, file)}
                      />
                    ) : (
                      <>
                        <ActivityPrompt prompt={activity.prompt} />
                        <ActivityInput
                          activity={activity}
                          value={activityResponses[activity.activityId] || (activity.activityType === "checkboxes" ? [] : "")}
                          attachments={activityAttachments[activity.activityId] || []}
                          uploading={activitySaving === activity.activityId}
                          onChange={(value) => updateActivityResponse(activity.activityId, value)}
                          onUpload={(file) => uploadActivityFile(activity, file)}
                        />
                      </>
                    )}
                    <button onClick={() => submitActivity(activity)} disabled={activitySaving === activity.activityId || !canSubmitActivity(activity, activityResponses[activity.activityId], activityAttachments[activity.activityId])} className="mt-3 inline-flex rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white/75 hover:bg-white/[0.08] disabled:text-white/35">
                      {activitySaving === activity.activityId ? "Submitting..." : "Submit activity"}
                    </button>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="flex flex-col gap-3 rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-white">{completed ? "Lesson complete" : "Ready to mark this lesson complete?"}</h2>
                <p className="mt-1 text-sm text-[#BFC6D4]">Progress updates your Academy dashboard and unlock path.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!completed ? <button onClick={completeLesson} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Complete</button> : null}
                {nextLesson ? <Link href={`/academy/${courseSlug}/learn/${nextLesson.lessonId}`} className="inline-flex h-11 items-center rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-5 text-sm text-white/75 hover:bg-white/[0.08]">Next lesson</Link> : <Link href={`/academy/${courseSlug}/quiz/${lesson.topicId}`} className="inline-flex h-11 items-center rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-5 text-sm text-white/75 hover:bg-white/[0.08]">Take quiz</Link>}
              </div>
            </section>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
            <section className="rounded-[20px] border border-white/[0.08] bg-[#151A2E]/72 p-5">
              <Bot className="h-5 w-5 text-[#4F9DFF]" />
              <h3 className="mt-4 font-semibold text-white">AI Tutor</h3>
              <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">Ask for examples, summaries, explanations, or help applying the lesson.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Explain this lesson", "Give me an example", "Quiz me", "Summarize key points", "Help me complete the activity", "Give me a practical business example"].map((prompt) => (
                  <button key={prompt} onClick={() => askTutor(prompt)} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08]">{prompt}</button>
                ))}
              </div>
              {tutorMessages.length ? (
                <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                  {tutorMessages.map((item) => (
                    <div key={item.tutorMessageId} className={`rounded-[16px] border border-white/[0.08] p-3 text-sm leading-6 ${item.role === "assistant" ? "bg-cyan-400/10 text-cyan-50" : "bg-black/20 text-[#D8DEEA]"}`}>
                      <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/40">{item.role === "assistant" ? "Soma Tutor" : "You"}</p>
                      {item.content}
                    </div>
                  ))}
                </div>
              ) : null}
              <textarea value={tutorPrompt} onChange={(event) => setTutorPrompt(event.target.value)} rows={3} placeholder="Ask about this lesson..." className="mt-4 w-full rounded-[14px] border border-white/[0.08] bg-black/20 p-3 text-sm text-white outline-none focus:border-[#5B5FFF]/60" />
              <button onClick={() => askTutor()} disabled={!tutorPrompt.trim()} className="mt-3 h-10 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white/75 hover:bg-white/[0.08] disabled:text-white/35">Ask Tutor</button>
            </section>
            <section className="rounded-[20px] border border-white/[0.08] bg-[#151A2E]/72 p-5">
              <MessageSquare className="h-5 w-5 text-[#4F9DFF]" />
              <h3 className="mt-4 font-semibold text-white">Discussion</h3>
              <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">Ask questions and learn with other students.</p>
              <textarea value={discussionBody} onChange={(event) => setDiscussionBody(event.target.value)} rows={3} placeholder="Share a question or reflection..." className="mt-4 w-full rounded-[14px] border border-white/[0.08] bg-black/20 p-3 text-sm text-white outline-none focus:border-[#5B5FFF]/60" />
              <button onClick={postDiscussion} disabled={!discussionBody.trim()} className="mt-3 h-10 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white/75 hover:bg-white/[0.08] disabled:text-white/35">Post Discussion</button>
              <div className="mt-5 space-y-4">
                {discussions.length ? discussions.map((discussion) => (
                  <div key={discussion.discussionId} className="rounded-[16px] border border-white/[0.08] bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6 text-[#D8DEEA]">{discussion.body}</p>
                      {discussion.pinned ? <span className="rounded-full border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 px-2 py-1 text-[10px] text-violet-100">Pinned</span> : null}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => reactToDiscussion(discussion.discussionId, "helpful")} className="text-xs text-cyan-100 hover:text-white">Helpful {discussion.helpfulCount || 0}</button>
                      <button onClick={() => reactToDiscussion(discussion.discussionId, "report")} className="text-xs text-white/35 hover:text-amber-100">Report</button>
                    </div>
                    {discussion.replies?.length ? (
                      <div className="mt-3 space-y-2 border-l border-white/10 pl-3">
                        {discussion.replies.map((reply) => (
                          <div key={reply.replyId} className="rounded-[12px] bg-white/[0.03] p-2 text-xs leading-5 text-[#BFC6D4]">
                            {reply.pinned ? <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-violet-100">Instructor pinned</span> : null}
                            {reply.body}
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => reactToDiscussion(discussion.discussionId, "helpful", reply.replyId)} className="text-[11px] text-cyan-100 hover:text-white">Helpful {reply.helpfulCount || 0}</button>
                              <button onClick={() => reactToDiscussion(discussion.discussionId, "report", reply.replyId)} className="text-[11px] text-white/35 hover:text-amber-100">Report</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <input value={replyBodies[discussion.discussionId] || ""} onChange={(event) => setReplyBodies((current) => ({ ...current, [discussion.discussionId]: event.target.value }))} placeholder="Reply..." className="min-w-0 flex-1 rounded-[12px] border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-[#5B5FFF]/60" />
                      <button onClick={() => postReply(discussion.discussionId)} disabled={!replyBodies[discussion.discussionId]?.trim()} className="rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-white/70 disabled:text-white/30">Reply</button>
                    </div>
                  </div>
                )) : <p className="rounded-[14px] border border-dashed border-white/[0.08] p-3 text-xs text-white/45">No lesson discussion yet. Start the first thread.</p>}
              </div>
            </section>
            <ToolCard icon={GraduationIcon} title="Certification Path" description={`${bundle.enrollment?.progressPercent || 0}% complete. Finish topics, quizzes, and final exam to earn your certificate.`} action="View Progress" />
          </aside>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function LessonContent({ lesson }: { lesson: AcademyLessonDoc }) {
  const showVideo = (lesson.lessonType === "video" || lesson.lessonType === "mixed") && lesson.videoUrl;
  const showImages = (lesson.lessonType === "image" || lesson.lessonType === "mixed") && lesson.imageUrls?.length;
  const showWritten = (lesson.lessonType === "written" || lesson.lessonType === "mixed" || !showVideo && !showImages) && lesson.writtenContent;
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setVideoReady(false);
    setVideoError("");
  }, [lesson.videoUrl, lesson.lessonId]);

  return (
    <div className="space-y-6">
      {showVideo ? (
        <div className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-black">
          <div className="relative aspect-video w-full bg-black">
            {!videoReady && !videoError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/[0.03] via-white/[0.02] to-black text-sm text-white/50">
                Loading video...
              </div>
            ) : null}
            {videoError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 p-6 text-center">
                <p className="text-sm font-medium text-white">Video could not be displayed here.</p>
                <a
                  href={lesson.videoUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs text-white/75 hover:bg-white/[0.1]"
                >
                  Open video in new tab
                </a>
              </div>
            ) : null}
            <video
              ref={videoRef}
              key={lesson.videoUrl || lesson.lessonId}
              controls
              preload="metadata"
              playsInline
              controlsList="nodownload"
              className="h-full w-full bg-black object-contain"
              onLoadedData={() => setVideoReady(true)}
              onCanPlay={() => setVideoReady(true)}
              onError={() => {
                setVideoReady(false);
                const error = videoRef.current?.error;
                const code = error?.code ? ` (code ${error.code})` : "";
                setVideoError(`Video playback failed${code}.`);
              }}
            >
              <source src={lesson.videoUrl || undefined} type={inferVideoMimeType(lesson.videoUrl || "")} />
            </video>
          </div>
        </div>
      ) : null}
      {showImages ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {lesson.imageUrls?.map((url) => (
            <div key={url} className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}
      {showWritten ? (
        <article className="prose prose-invert max-w-none prose-p:leading-8 prose-p:text-[#D8DEEA] prose-headings:text-white">
          {lesson.writtenContent?.split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </article>
      ) : null}
      {lesson.transcript ? (
        <details className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/55 p-4">
          <summary className="cursor-pointer text-sm font-medium text-white">Transcript / notes</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#BFC6D4]">{lesson.transcript}</p>
        </details>
      ) : null}
      {!showVideo && !showImages && !showWritten ? (
        <div className="rounded-[18px] border border-dashed border-white/[0.08] p-8 text-center text-[#BFC6D4]">
          <ImageIcon className="mx-auto h-8 w-8 text-white/35" />
          <p className="mt-3">Lesson content is being prepared.</p>
        </div>
      ) : null}
    </div>
  );
}

function inferVideoMimeType(url: string) {
  if (/\.webm(\?|$)/i.test(url)) return "video/webm";
  if (/\.mov(\?|$)/i.test(url)) return "video/quicktime";
  return "video/mp4";
}

function ActivityPrompt({ prompt }: { prompt: string }) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const questions = normalized.split(/(?=\d+\.\s)/).map((item) => item.trim()).filter(Boolean);

  return (
    <div className="mt-3 space-y-4">
      {questions.map((question, index) => {
        const clean = question.replace(/^\d+\.\s*/, "");
        return (
          <div key={`${clean}-${index}`} className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex gap-3 text-sm leading-6 text-[#D8DEEA]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5B5FFF]/20 text-[11px] font-semibold text-[#AEB4FF]">{index + 1}</span>
              <span>{clean}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityInput({
  activity,
  value,
  attachments,
  uploading,
  onChange,
  onUpload,
}: {
  activity: AcademyActivityDoc;
  value: ActivityResponse;
  attachments: ActivityAttachment[];
  uploading: boolean;
  onChange: (value: ActivityResponse) => void;
  onUpload: (file: File | null) => void;
}) {
  const promptQuestions = extractActivityQuestions(activity.prompt);

  if (activity.activityType === "multiple_choice") {
    return (
      <div className="mt-4 space-y-2">
        {(activity.options || []).map((option) => (
          <label key={option.optionId} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-[#D8DEEA]">
            <input type="radio" name={activity.activityId} checked={value === option.optionId} onChange={() => onChange(option.optionId)} />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (activity.activityType === "checkboxes") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="mt-4 space-y-2">
        {(activity.options || []).map((option) => (
          <label key={option.optionId} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-[#D8DEEA]">
            <input
              type="checkbox"
              checked={selected.includes(option.optionId)}
              onChange={(event) => onChange(event.target.checked ? [...selected, option.optionId] : selected.filter((item) => item !== option.optionId))}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (activity.activityType === "file_upload") {
    return (
      <div className="mt-4 rounded-[16px] border border-white/[0.08] bg-black/20 p-4">
        <input type="file" disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0] || null)} className="w-full text-sm text-white/50 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-white" />
        <AttachmentList attachments={attachments} />
      </div>
    );
  }

  if (activity.activityType === "link_submission") {
    return <input type="url" value={String(value || "")} onChange={(event) => onChange(event.target.value)} placeholder="Paste your link..." className="mt-4 w-full rounded-[16px] border border-white/[0.08] bg-black/20 p-4 text-sm text-white outline-none focus:border-[#5B5FFF]/60" />;
  }

  if (promptQuestions.length > 1) {
    const answers = normalizeQuestionAnswers(value, promptQuestions.length);
    return (
      <div className="mt-4 space-y-4">
        {promptQuestions.map((question, index) => (
          <div key={`${activity.activityId}-${index}`} className="rounded-[16px] border border-white/[0.08] bg-black/20 p-4">
            <p className="text-sm leading-6 text-[#D8DEEA]">{question}</p>
            <QuestionAnswerField
              activity={activity}
              questionIndex={index}
              value={answers[index] || ""}
              onChange={(nextValue) => onChange(updateQuestionAnswer(value, index, nextValue, promptQuestions.length))}
              onUpload={onUpload}
              attachments={attachments}
              uploading={uploading}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <QuestionAnswerField
        activity={activity}
        questionIndex={0}
        value={value}
        onChange={onChange}
        onUpload={onUpload}
        attachments={attachments}
        uploading={uploading}
      />
    </div>
  );
}

function QuestionAndAnswerFlow({
  activity,
  value,
  attachments,
  uploading,
  onChange,
  onUpload,
}: {
  activity: AcademyActivityDoc;
  value: ActivityResponse | undefined;
  attachments: ActivityAttachment[];
  uploading: boolean;
  onChange: (value: ActivityResponse) => void;
  onUpload: (file: File | null) => void;
}) {
  const questions = extractActivityQuestions(activity.prompt);
  const answers = normalizeQuestionAnswers(value, questions.length);
  const questionTypes = getQuestionAnswerTypes(activity, questions.length);

  return (
    <div className="mt-4 space-y-4">
      {questions.map((question, index) => (
        <div key={`${activity.activityId}-${index}`} className="rounded-[16px] border border-white/[0.08] bg-black/20 p-4">
          <p className="text-sm font-medium leading-6 text-white">{question}</p>
          {questionTypes[index] === "yes_no" ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {["Yes", "No"].map((choice) => (
                <label
                  key={`${activity.activityId}-${index}-${choice}`}
                  className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 text-sm transition ${
                    answers[index] === choice
                      ? "border-cyan-400/50 bg-cyan-400/10 text-white"
                      : "border-white/[0.08] bg-black/20 text-[#D8DEEA] hover:border-white/[0.14]"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${activity.activityId}-${index}`}
                    checked={answers[index] === choice}
                    onChange={() => onChange(updateQuestionAnswer(value, index, choice, questions.length))}
                  />
                  <span className="font-medium">{choice}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              value={answers[index] || ""}
              onChange={(event) => onChange(updateQuestionAnswer(value, index, event.target.value, questions.length))}
              rows={questionTypes[index] === "long_text" ? 6 : 3}
              placeholder="Write your answer..."
              className="mt-3 w-full rounded-[16px] border border-white/[0.08] bg-black/20 p-4 text-sm text-white outline-none focus:border-[#5B5FFF]/60"
            />
          )}
        </div>
      ))}
      {activity.activityType === "q_and_a" && activity.manualReviewRequired ? (
        <div className="rounded-[16px] border border-white/[0.08] bg-black/20 p-4">
          <input type="file" disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0] || null)} className="w-full text-sm text-white/50 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-white" />
          <AttachmentList attachments={attachments} />
        </div>
      ) : null}
    </div>
  );
}

function QuestionAnswerField({
  activity,
  questionIndex,
  value,
  attachments,
  uploading,
  onChange,
  onUpload,
}: {
  activity: AcademyActivityDoc;
  questionIndex: number;
  value: ActivityResponse;
  attachments: ActivityAttachment[];
  uploading: boolean;
  onChange: (value: ActivityResponse) => void;
  onUpload: (file: File | null) => void;
}) {
  if (activity.activityType === "file_upload") {
    return (
      <div className="mt-4 rounded-[16px] border border-white/[0.08] bg-black/20 p-4">
        <input type="file" disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0] || null)} className="w-full text-sm text-white/50 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-white" />
        <AttachmentList attachments={attachments} />
      </div>
    );
  }

  if (activity.activityType === "multiple_choice") return null;
  if (activity.activityType === "checkboxes") return null;

  if (activity.activityType === "link_submission") {
    return <input type="url" value={String(value || "")} onChange={(event) => onChange(event.target.value)} placeholder="Paste your link..." className="mt-4 w-full rounded-[16px] border border-white/[0.08] bg-black/20 p-4 text-sm text-white outline-none focus:border-[#5B5FFF]/60" />;
  }

  const rows = activity.activityType === "short_text" ? 2 : 6;
  return (
    <div className="mt-4 space-y-3">
      <textarea
        value={String(value || "")}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={activity.activityType === "project_submission"
          ? questionIndex === 0
            ? "Write your answer..."
            : "Add any project links, notes, or context here..."
          : "Write your answer..."}
        className="w-full rounded-[16px] border border-white/[0.08] bg-black/20 p-4 text-sm text-white outline-none focus:border-[#5B5FFF]/60"
      />
      {activity.activityType === "project_submission" ? (
        <div className="rounded-[16px] border border-white/[0.08] bg-black/20 p-4">
          <input type="file" disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0] || null)} className="w-full text-sm text-white/50 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-white" />
          <AttachmentList attachments={attachments} />
        </div>
      ) : null}
    </div>
  );
}

function extractActivityQuestions(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const questions = normalized.split(/(?=\d+\.\s)/).map((item) => item.trim()).filter(Boolean);
  return questions.length ? questions.map((question) => question.replace(/^\d+\.\s*/, "")) : [normalized];
}

function getQuestionAnswerTypes(activity: AcademyActivityDoc, questionCount: number) {
  const raw = activity.metadata?.questionAnswerTypes;
  if (Array.isArray(raw) && raw.length) {
    return Array.from({ length: questionCount }, (_, index) => {
      const value = String(raw[index] || raw[raw.length - 1] || "").toLowerCase();
      return value === "yes_no" || value === "long_text" ? value : "short_text";
    });
  }
  return Array.from({ length: questionCount }, () => (activity.yesNoOption ? "yes_no" : "short_text"));
}

function normalizeQuestionAnswers(value: ActivityResponse | undefined, questionCount: number) {
  if (Array.isArray(value)) return value.map((item) => String(item || "")).slice(0, questionCount);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Array.from({ length: questionCount }, (_, index) => String(record[String(index)] || ""));
  }
  const text = String(value || "");
  if (!text.includes("\n")) return Array.from({ length: questionCount }, () => "");
  return text.split("\n").slice(0, questionCount);
}

function updateQuestionAnswer(value: ActivityResponse | undefined, index: number, nextValue: ActivityResponse, questionCount: number) {
  const existing = normalizeQuestionAnswers(value, questionCount);
  const updated = [...existing];
  updated[index] = String(nextValue || "");
  return updated;
}

function AttachmentList({ attachments }: { attachments: ActivityAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {attachments.map((attachment) => (
        <a key={`${attachment.url}-${attachment.name}`} href={attachment.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-cyan-100 hover:bg-white/[0.08]">
          {attachment.name}
        </a>
      ))}
    </div>
  );
}

function canSubmitActivity(activity: AcademyActivityDoc, response: ActivityResponse | undefined, attachments: ActivityAttachment[] = []) {
  if (activity.activityType === "file_upload") return attachments.length > 0;
  if (activity.activityType === "checkboxes") return Array.isArray(response) && response.length > 0;
  if (activity.activityType === "project_submission") return Boolean(String(response || "").trim() || attachments.length);
  if (activity.activityType === "q_and_a" && activity.prompt && /^\d+\.\s/.test(activity.prompt)) {
    const questions = extractActivityQuestions(activity.prompt);
    if (questions.length > 1) {
      const answers = normalizeQuestionAnswers(response, questions.length);
      return answers.every((answer) => String(answer || "").trim().length > 0);
    }
  }
  return Boolean(String(response || "").trim());
}

function ToolCard({ icon: Icon, title, description, action }: { icon: typeof Bot; title: string; description: string; action: string }) {
  return <section className="rounded-[20px] border border-white/[0.08] bg-[#151A2E]/72 p-5"><Icon className="h-5 w-5 text-[#4F9DFF]" /><h3 className="mt-4 font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-[#BFC6D4]">{description}</p><button disabled className="mt-4 h-10 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white/35">{action}</button></section>;
}

const GraduationIcon = BookOpen;
