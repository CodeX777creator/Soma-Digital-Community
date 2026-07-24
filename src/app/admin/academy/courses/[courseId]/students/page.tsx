import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Clock3, GraduationCap, NotebookText, Users } from "lucide-react";
import { adminDb } from "@/lib/firebaseAdmin";
import { getAcademyCourse } from "@/academy";
import { ACADEMY_COLLECTIONS, type AcademyActivitySubmissionDoc, type AcademyCertificateDoc, type AcademyEnrollmentDoc, type AcademyExamAttemptDoc, type AcademyLessonDoc, type AcademyProgressDoc, type AcademyQuizAttemptDoc, type AcademyTopicDoc } from "@/academy/types";

type StudentRow = {
  userId: string;
  name: string;
  email: string;
  enrollmentStatus: AcademyEnrollmentDoc["status"];
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  currentLessonTitle: string;
  currentTopicTitle: string;
  pendingReviews: number;
  quizScore: number | null;
  examScore: number | null;
  certificateStatus: AcademyCertificateDoc["status"] | null;
  lastActivity: string;
};

export default async function AcademyCourseStudentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = await getAcademyCourse(courseId);

  if (!course) {
    return <EmptyCourseState />;
  }

  const [enrollmentsSnap, progressSnap, submissionsSnap, quizAttemptsSnap, examAttemptsSnap, certificatesSnap, lessonsSnap, topicsSnap] = await Promise.all([
    adminDb.collection(ACADEMY_COLLECTIONS.enrollments).where("courseId", "==", courseId).get(),
    adminDb.collection(ACADEMY_COLLECTIONS.progress).where("courseId", "==", courseId).get(),
    adminDb.collection(ACADEMY_COLLECTIONS.activitySubmissions).where("courseId", "==", courseId).get(),
    adminDb.collection(ACADEMY_COLLECTIONS.quizAttempts).where("courseId", "==", courseId).get(),
    adminDb.collection(ACADEMY_COLLECTIONS.examAttempts).where("courseId", "==", courseId).get(),
    adminDb.collection(ACADEMY_COLLECTIONS.certificates).where("courseId", "==", courseId).get(),
    adminDb.collection(ACADEMY_COLLECTIONS.lessons).where("courseId", "==", courseId).get(),
    adminDb.collection(ACADEMY_COLLECTIONS.topics).where("courseId", "==", courseId).get(),
  ]);

  const enrollments = enrollmentsSnap.docs.map((doc) => ({ enrollmentId: doc.id, ...doc.data() } as AcademyEnrollmentDoc));
  const progress = progressSnap.docs.map((doc) => ({ progressId: doc.id, ...doc.data() } as AcademyProgressDoc));
  const submissions = submissionsSnap.docs.map((doc) => ({ submissionId: doc.id, ...doc.data() } as AcademyActivitySubmissionDoc));
  const quizAttempts = quizAttemptsSnap.docs.map((doc) => ({ quizAttemptId: doc.id, ...doc.data() } as AcademyQuizAttemptDoc));
  const examAttempts = examAttemptsSnap.docs.map((doc) => ({ examAttemptId: doc.id, ...doc.data() } as AcademyExamAttemptDoc));
  const certificates = certificatesSnap.docs.map((doc) => ({ certificateId: doc.id, ...doc.data() } as AcademyCertificateDoc));
  const lessons = lessonsSnap.docs.map((doc) => ({ lessonId: doc.id, ...doc.data() } as AcademyLessonDoc)).filter((lesson) => lesson.status !== "archived").sort((a, b) => a.sortOrder - b.sortOrder);
  const topics = topicsSnap.docs.map((doc) => ({ topicId: doc.id, ...doc.data() } as AcademyTopicDoc)).filter((topic) => topic.courseId === courseId).sort((a, b) => a.sortOrder - b.sortOrder);

  const progressByUser = groupByUser(progress);
  const submissionsByUser = groupByUser(submissions);
  const quizAttemptsByUser = groupByUser(quizAttempts);
  const examAttemptsByUser = groupByUser(examAttempts);
  const certificatesByUser = new Map(certificates.map((item) => [item.userId, item]));
  const userDocs = await Promise.all(enrollments.map(async (enrollment) => {
    const snap = await adminDb.collection("users").doc(enrollment.userId).get();
    return { userId: enrollment.userId, ...(snap.data() || {}) };
  }));
  const userDocsById = new Map(userDocs.map((user) => [user.userId, user]));

  const studentRows = enrollments.map((enrollment) => {
    const userProgress = [...(progressByUser.get(enrollment.userId) || [])].sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    const userSubmissions = submissionsByUser.get(enrollment.userId) || [];
    const userQuizAttempts = [...(quizAttemptsByUser.get(enrollment.userId) || [])].sort((a, b) => toMillis((b as AcademyQuizAttemptDoc).submittedAt || (b as AcademyQuizAttemptDoc).startedAt) - toMillis((a as AcademyQuizAttemptDoc).submittedAt || (a as AcademyQuizAttemptDoc).startedAt));
    const userExamAttempts = [...(examAttemptsByUser.get(enrollment.userId) || [])].sort((a, b) => toMillis((b as AcademyExamAttemptDoc).submittedAt || (b as AcademyExamAttemptDoc).startedAt) - toMillis((a as AcademyExamAttemptDoc).submittedAt || (a as AcademyExamAttemptDoc).startedAt));
    const completedLessonIds = new Set(userProgress.filter((item) => item.lessonId && item.completed).map((item) => item.lessonId!));
    const currentLesson = lessons.find((lesson) => !completedLessonIds.has(lesson.lessonId)) || lessons[lessons.length - 1] || null;
    const currentTopic = currentLesson ? topics.find((topic) => topic.topicId === currentLesson.topicId) || null : null;
    const cert = certificatesByUser.get(enrollment.userId) || null;
    const quizScore = userQuizAttempts.length ? Math.round(userQuizAttempts.reduce((sum, item) => sum + item.score, 0) / userQuizAttempts.length) : null;
    const examScore = userExamAttempts.length ? userExamAttempts[0].score : null;
    const pendingReviews = userSubmissions.filter((item) => item.status === "submitted" || item.status === "needs_revision").length;
    const lastActivity = userProgress[0]?.updatedAt || enrollment.lastAccessedAt || enrollment.enrolledAt;
    const user = userDocsById.get(enrollment.userId) || {};

    return {
      userId: enrollment.userId,
      name: formatUserName(user, enrollment.userId),
      email: formatUserEmail(user),
      enrollmentStatus: enrollment.status,
      progressPercent: enrollment.progressPercent || 0,
      completedLessons: completedLessonIds.size,
      totalLessons: lessons.length,
      currentLessonTitle: currentLesson?.title || (cert ? "Completed the course" : "Waiting to start"),
      currentTopicTitle: currentTopic?.title || course.title,
      pendingReviews,
      quizScore,
      examScore,
      certificateStatus: cert?.status || null,
      lastActivity: formatDate(lastActivity),
    } satisfies StudentRow;
  });

  const metrics = {
    students: enrollments.length,
    inProgress: studentRows.filter((row) => row.enrollmentStatus === "active" && row.progressPercent > 0 && row.progressPercent < 100).length,
    pendingReview: studentRows.reduce((sum, row) => sum + row.pendingReviews, 0),
    certified: studentRows.filter((row) => row.certificateStatus === "active").length,
  };

  return (
    <div className="space-y-6">
      <Link href={`/admin/academy/courses/${courseId}/builder`} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to builder
      </Link>
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Students</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{course.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Review enrollments, current lesson, activity review status, quiz scores, final exam readiness, and certificates for each learner.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Users} label="Students" value={metrics.students} />
        <Metric icon={Clock3} label="In Progress" value={metrics.inProgress} />
        <Metric icon={ClipboardCheck} label="Pending Review" value={metrics.pendingReview} />
        <Metric icon={GraduationCap} label="Certified" value={metrics.certified} />
      </div>
      <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Learner roster</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Real student records</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/45">
            <NotebookText className="mr-2 inline-block h-3.5 w-3.5" />
            Sources: enrollments, progress, submissions, quiz attempts, exam attempts, certificates
          </div>
        </div>

        {studentRows.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[1100px] w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-white/40">
                  <th className="px-4 py-2">Learner</th>
                  <th className="px-4 py-2">Progress</th>
                  <th className="px-4 py-2">Current lesson</th>
                  <th className="px-4 py-2">Review queue</th>
                  <th className="px-4 py-2">Quiz score</th>
                  <th className="px-4 py-2">Exam</th>
                  <th className="px-4 py-2">Certificate</th>
                  <th className="px-4 py-2">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {studentRows.map((row) => (
                  <tr key={row.userId} className="rounded-2xl border border-white/10 bg-white/[0.03]">
                    <td className="rounded-l-2xl px-4 py-4 align-top">
                      <p className="font-medium text-white">{row.name}</p>
                      <p className="mt-1 text-xs text-white/45">{row.email}</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-white/40">{row.enrollmentStatus}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-lg font-semibold text-white">{row.progressPercent}%</p>
                      <p className="mt-1 text-xs text-white/45">{row.completedLessons} / {row.totalLessons} lessons complete</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm text-white">{row.currentLessonTitle}</p>
                      <p className="mt-1 text-xs text-white/45">{row.currentTopicTitle}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-lg font-semibold text-white">{row.pendingReviews}</p>
                      <p className="mt-1 text-xs text-white/45">Submissions awaiting action</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-lg font-semibold text-white">{row.quizScore === null ? "—" : `${row.quizScore}%`}</p>
                      <p className="mt-1 text-xs text-white/45">Average of quiz attempts</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-lg font-semibold text-white">{row.examScore === null ? "—" : `${row.examScore}%`}</p>
                      <p className="mt-1 text-xs text-white/45">Latest exam attempt</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${row.certificateStatus === "active" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.03] text-white/45"}`}>
                        {row.certificateStatus === "active" ? "Issued" : "Not issued"}
                      </span>
                    </td>
                    <td className="rounded-r-2xl px-4 py-4 align-top text-xs text-white/45">{row.lastActivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-[#0d1018] p-8 text-sm text-white/50">No learners have enrolled in this course yet.</div>
        )}
      </section>
    </div>
  );
}

function EmptyCourseState() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Students</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Course not found</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">We couldn’t load the course records for this student view.</p>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <Icon className="h-5 w-5 text-cyan-200" />
      <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function groupByUser<T extends { userId: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    map.set(item.userId, [...(map.get(item.userId) || []), item]);
  }
  return map;
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object") {
    const candidate = value as { toDate?: () => Date; seconds?: number };
    if (typeof candidate.toDate === "function") return candidate.toDate().getTime();
    if (typeof candidate.seconds === "number") return candidate.seconds * 1000;
  }
  return 0;
}

function formatDate(value: unknown) {
  const millis = toMillis(value);
  if (!millis) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

function formatUserName(user: Record<string, unknown>, fallback: string) {
  const displayName = [user.displayName, user.name].find((item) => typeof item === "string" && item.trim());
  if (typeof displayName === "string") return displayName;
  const email = user.email;
  if (typeof email === "string" && email.trim()) return email.split("@")[0];
  return fallback;
}

function formatUserEmail(user: Record<string, unknown>) {
  const email = user.email;
  return typeof email === "string" && email.trim() ? email : "No email on profile";
}
