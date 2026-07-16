import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { getXPPolicy, type XPActionKey } from '@/lib/xp-policy';
import {
  ACADEMY_COLLECTIONS,
  ACADEMY_FINAL_EXAM_TOPIC_ID,
  type AcademyCertificateDoc,
  type AcademyActivityDoc,
  type AcademyActivitySubmissionDoc,
  type AcademyCohortDoc,
  type AcademyCourseDoc,
  type AcademyCourseStatus,
  type AcademyDiscussionReplyDoc,
  type AcademyDiscussionReactionDoc,
  type AcademyDripScheduleDoc,
  type AcademyEnrollmentDoc,
  type AcademyExamAttemptDoc,
  type AcademyImportDoc,
  type AcademyLessonDoc,
  type AcademyLessonDiscussionDoc,
  type AcademyLiveSessionDoc,
  type AcademyManualReviewDoc,
  type AcademyProgressDoc,
  type AcademyQuestion,
  type AcademyQuizAttemptDoc,
  type AcademyQuizDoc,
  type AcademyQuizResponseDoc,
  type AcademySessionAttendanceDoc,
  type AcademyTopicDoc,
  type AcademyTutorMessageDoc,
  type AcademyTutorSessionDoc,
} from './types';
import { executeMonetizedTextRequest } from '@/services/ai-platform';
import {
  AcademyValidationError,
  validateAcademyActivity,
  validateAcademyCourse,
  validateAcademyLesson,
  validateAcademyTopic,
  sanitizeAcademyString,
  sanitizeAcademyText,
} from './validation';
import {
  buildAcademyCourseDraft,
  buildAcademyLessonDraft,
  buildAcademyTopicDraft,
} from './defaults';

type FirestoreDoc<T> = T & { id?: string };

function now() {
  return FieldValue.serverTimestamp();
}

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return null;
}

function dateSortValue(value: any): number {
  const iso = toIso(value);
  return iso ? Date.parse(iso) || 0 : 0;
}

function serialize<T extends Record<string, any>>(doc: FirestoreDoc<T>) {
  const copy: Record<string, any> = { ...doc };
  for (const key of ['createdAt', 'updatedAt', 'publishedAt', 'availableAt', 'startDate', 'endDate', 'startsAt', 'endsAt', 'submittedAt', 'reviewedAt', 'startedAt', 'expiresAt', 'issuedAt', 'completedAt', 'moderatedAt', 'lastMessageAt', 'confirmedAt']) {
    if (key in copy) copy[key] = toIso(copy[key]);
  }
  return copy as T;
}

function collection(name: keyof typeof ACADEMY_COLLECTIONS) {
  return adminDb.collection(ACADEMY_COLLECTIONS[name]);
}

function xpEventId(action: XPActionKey, resourceId: string) {
  return `${action}_${resourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180)}`;
}

async function awardAcademyXP(input: {
  userId: string;
  action: XPActionKey;
  resourceId: string;
  metadata?: Record<string, unknown>;
}) {
  const policy = getXPPolicy(input.action);
  if (!policy?.xp || policy.xp <= 0) return { awarded: false, xp: 0 };
  const eventRef = adminDb.collection('users').doc(input.userId).collection('xpEvents').doc(xpEventId(input.action, input.resourceId));
  const userRef = adminDb.collection('users').doc(input.userId);
  const publicProfileRef = adminDb.collection('publicProfiles').doc(input.userId);
  let awarded = false;
  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return;
    const timestamp = now();
    tx.set(eventRef, {
      action: input.action,
      type: policy.eventType,
      xp: policy.xp,
      resourceId: input.resourceId,
      metadata: input.metadata || {},
      source: 'academy_service',
      dateString: new Date().toISOString().slice(0, 10),
      createdAt: timestamp,
    });
    tx.set(userRef, { xp: FieldValue.increment(policy.xp), updatedAt: timestamp }, { merge: true });
    tx.set(publicProfileRef, { xp: FieldValue.increment(policy.xp), updatedAt: timestamp }, { merge: true });
    awarded = true;
  });
  if (awarded && policy.notification) {
    await createAcademyUserNotification(input.userId, {
      type: policy.notification.type,
      title: policy.notification.title,
      body: policy.notification.body(policy.xp),
      linkUrl: policy.notification.linkUrl,
      metadata: { ...input.metadata, xp: policy.xp, resourceId: input.resourceId },
    });
  }
  return { awarded, xp: awarded ? policy.xp : 0 };
}

async function createAcademyUserNotification(userId: string, input: {
  type?: string;
  title: string;
  body: string;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  await adminDb.collection('users').doc(userId).collection('notifications').add(stripUndefined({
    type: input.type || 'academy',
    title: sanitizeAcademyString(input.title, 160),
    body: sanitizeAcademyText(input.body, 1000),
    linkUrl: input.linkUrl || '/academy',
    metadata: input.metadata || {},
    readAt: null,
    createdAt: now(),
  }));
}

async function activateReservedMrrEligibility(userId: string, courseId: string, certificateId: string) {
  const eligibilityId = `${userId}_${courseId}`;
  const ref = adminDb.collection('academyMrrEligibility').doc(eligibilityId);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.set(stripUndefined({
    status: 'eligible',
    certificateId,
    certificateEarnedAt: now(),
    updatedAt: now(),
  }), { merge: true });
  await createAcademyUserNotification(userId, {
    type: 'academy_mrr',
    title: 'Master Resell Rights unlocked',
    body: 'Your certification is complete. You can now purchase eligible reseller rights for this course.',
    linkUrl: `/academy/certificates`,
    metadata: { courseId, certificateId },
  });
}

async function notifyAcademyAudience(input: {
  courseId?: string;
  title: string;
  body: string;
  linkUrl: string;
  metadata?: Record<string, unknown>;
}) {
  const recipients = new Set<string>();
  if (input.courseId) {
    const enrollmentsSnap = await collection('enrollments').where('courseId', '==', input.courseId).limit(500).get();
    for (const doc of enrollmentsSnap.docs) {
      const userId = doc.data().userId;
      if (typeof userId === 'string') recipients.add(userId);
    }
  } else {
    const usersSnap = await adminDb.collection('users').where('onboardingComplete', '==', true).limit(500).get();
    for (const doc of usersSnap.docs) recipients.add(doc.id);
  }
  await Promise.all(Array.from(recipients).map((userId) => createAcademyUserNotification(userId, {
    type: 'academy',
    title: input.title,
    body: input.body,
    linkUrl: input.linkUrl,
    metadata: input.metadata || {},
  })));
}

export async function listAcademyCourses(options: { includeArchived?: boolean; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  let query: FirebaseFirestore.Query = collection('courses');
  if (!options.includeArchived) query = query.where('status', 'in', ['draft', 'published']);
  const snap = await query.get();
  return snap.docs
    .map((doc) => serialize({ courseId: doc.id, ...doc.data() } as AcademyCourseDoc))
    .sort((a, b) => dateSortValue(b.updatedAt || b.createdAt) - dateSortValue(a.updatedAt || a.createdAt))
    .slice(0, limit);
}

export async function listPublishedAcademyCourses(options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  const snap = await collection('courses')
    .where('status', '==', 'published')
    .get();
  return snap.docs
    .map((doc) => serialize({ courseId: doc.id, ...doc.data() } as AcademyCourseDoc))
    .sort((a, b) => dateSortValue(b.publishedAt || b.updatedAt) - dateSortValue(a.publishedAt || a.updatedAt))
    .slice(0, limit);
}

export async function getAcademyCourse(courseId: string) {
  const snap = await collection('courses').doc(courseId).get();
  if (!snap.exists) return null;
  return serialize({ courseId: snap.id, ...snap.data() } as AcademyCourseDoc);
}

export async function getPublishedAcademyCourseBySlug(slug: string) {
  const snap = await collection('courses')
    .where('slug', '==', slug)
    .where('status', '==', 'published')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return serialize({ courseId: doc.id, ...doc.data() } as AcademyCourseDoc);
}

export async function getAcademyCourseBundleBySlug(slug: string) {
  const course = await getPublishedAcademyCourseBySlug(slug);
  if (!course) return null;
  return getAcademyCourseBundle(course.courseId);
}

export async function getAcademyCourseBundle(courseId: string) {
  const [course, topicsSnap, lessonsSnap, activitiesSnap, quizzesSnap, cohortsSnap, sessionsSnap, dripSnap] = await Promise.all([
    getAcademyCourse(courseId),
    collection('topics').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get(),
    collection('lessons').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get(),
    collection('activities').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get(),
    collection('quizzes').where('courseId', '==', courseId).get(),
    collection('cohorts').where('courseId', '==', courseId).orderBy('createdAt', 'desc').limit(100).get(),
    collection('liveSessions').where('courseId', '==', courseId).orderBy('startsAt', 'asc').limit(100).get(),
    collection('dripSchedules').where('courseId', '==', courseId).limit(500).get(),
  ]);

  if (!course) return null;

  return {
    course,
    topics: topicsSnap.docs.map((doc) => serialize({ topicId: doc.id, ...doc.data() } as AcademyTopicDoc)),
    lessons: lessonsSnap.docs.map((doc) => serialize({ lessonId: doc.id, ...doc.data() } as AcademyLessonDoc)),
    activities: activitiesSnap.docs.map((doc) => serialize({ activityId: doc.id, ...doc.data() } as AcademyActivityDoc)),
    quizzes: quizzesSnap.docs.map((doc) => serialize({ quizId: doc.id, ...doc.data() } as AcademyQuizDoc)),
    cohorts: cohortsSnap.docs.map((doc) => serialize({ cohortId: doc.id, ...doc.data() } as AcademyCohortDoc)),
    liveSessions: sessionsSnap.docs.map((doc) => serialize({ liveSessionId: doc.id, ...doc.data() } as AcademyLiveSessionDoc)),
    dripSchedules: dripSnap.docs.map((doc) => serialize({ dripScheduleId: doc.id, ...doc.data() } as AcademyDripScheduleDoc)),
  };
}

export async function getLearnerAcademyBundle(slug: string, userId?: string) {
  const bundle = await getAcademyCourseBundleBySlug(slug);
  if (!bundle) return null;

  const [enrollment, progressSnap, quizAttemptsSnap, examAttemptsSnap, certificatesSnap, attendanceSnap] = await Promise.all([
    userId ? getAcademyEnrollment(userId, bundle.course.courseId) : Promise.resolve(null),
    userId
      ? collection('progress').where('userId', '==', userId).where('courseId', '==', bundle.course.courseId).limit(1000).get()
      : Promise.resolve(null),
    userId
      ? collection('quizAttempts').where('userId', '==', userId).where('courseId', '==', bundle.course.courseId).limit(1000).get()
      : Promise.resolve(null),
    userId
      ? collection('examAttempts').where('userId', '==', userId).where('courseId', '==', bundle.course.courseId).limit(100).get()
      : Promise.resolve(null),
    userId
      ? collection('certificates').where('userId', '==', userId).where('courseId', '==', bundle.course.courseId).limit(10).get()
      : Promise.resolve(null),
    userId
      ? collection('sessionAttendance').where('userId', '==', userId).where('courseId', '==', bundle.course.courseId).limit(500).get()
      : Promise.resolve(null),
  ]);

  const progress = progressSnap
    ? progressSnap.docs.map((doc) => serialize({ progressId: doc.id, ...doc.data() } as any))
    : [];

  return {
    ...bundle,
    enrollment,
    progress,
    quizAttempts: quizAttemptsSnap
      ? quizAttemptsSnap.docs.map((doc) => serialize({ quizAttemptId: doc.id, ...doc.data() } as AcademyQuizAttemptDoc))
      : [],
    examAttempts: examAttemptsSnap
      ? examAttemptsSnap.docs.map((doc) => serialize({ examAttemptId: doc.id, ...doc.data() } as AcademyExamAttemptDoc))
      : [],
    certificates: certificatesSnap
      ? certificatesSnap.docs.map((doc) => serialize({ certificateId: doc.id, ...doc.data() } as AcademyCertificateDoc))
      : [],
    sessionAttendance: attendanceSnap
      ? attendanceSnap.docs.map((doc) => serialize({ attendanceId: doc.id, ...doc.data() } as AcademySessionAttendanceDoc))
      : [],
  };
}

export async function createAcademyCourse(input: Partial<AcademyCourseDoc>, adminId: string) {
  const ref = collection('courses').doc();
  const draft = buildAcademyCourseDraft({
    courseId: ref.id,
    title: input.title || '',
    description: input.description || '',
    createdBy: adminId,
    thumbnailUrl: input.thumbnailUrl || '',
    slug: input.slug,
    level: input.level,
    category: input.category,
    status: input.status,
    visibility: input.visibility,
    estimatedDuration: input.estimatedDuration,
    promoVideoUrl: input.promoVideoUrl,
    nextSteps: input.nextSteps,
    recommendedCourseIds: input.recommendedCourseIds,
  });

  const doc = stripUndefined({
    ...draft,
    certificateEnabled: input.certificateEnabled ?? draft.certificateEnabled,
    finalExamEnabled: input.finalExamEnabled ?? draft.finalExamEnabled,
    discussionEnabled: input.discussionEnabled ?? draft.discussionEnabled,
    aiTutorEnabled: input.aiTutorEnabled ?? draft.aiTutorEnabled,
    cohortEnabled: input.cohortEnabled ?? draft.cohortEnabled,
    dripEnabled: input.dripEnabled ?? draft.dripEnabled,
    manualReviewEnabled: input.manualReviewEnabled ?? draft.manualReviewEnabled,
    createdAt: now(),
    updatedAt: now(),
    publishedAt: input.status === 'published' ? now() : null,
  });

  validateAcademyCourse(doc as Partial<AcademyCourseDoc>);
  await ref.set(doc);
  return getAcademyCourse(ref.id);
}

export async function getAcademyEnrollment(userId: string, courseId: string) {
  const enrollmentId = `${userId}_${courseId}`;
  const snap = await collection('enrollments').doc(enrollmentId).get();
  if (!snap.exists) return null;
  return serialize({ enrollmentId: snap.id, ...snap.data() } as any);
}

export async function enrollInAcademyCourse(userId: string, courseId: string) {
  const course = await getAcademyCourse(courseId);
  if (!course || course.status !== 'published') throw new Error('Academy course is not available');

  const enrollmentId = `${userId}_${courseId}`;
  const ref = collection('enrollments').doc(enrollmentId);
  const existing = await ref.get();
  if (existing.exists) {
    await ref.set({ status: 'active', lastAccessedAt: now(), updatedAt: now() }, { merge: true });
    return getAcademyEnrollment(userId, courseId);
  }

  const doc = stripUndefined({
    enrollmentId,
    userId,
    courseId,
    cohortId: null,
    status: 'active',
    enrolledAt: now(),
    completedAt: null,
    lastAccessedAt: now(),
    progressPercent: 0,
    createdAt: now(),
    updatedAt: now(),
  });

  await ref.set(doc);
  await ensureInitialAcademyProgress(userId, courseId);
  await createAcademyUserNotification(userId, {
    title: 'Academy enrollment confirmed',
    body: `You are enrolled in ${course.title}. Your first lesson is ready.`,
    linkUrl: `/academy/${course.slug}`,
    metadata: { courseId },
  });
  return getAcademyEnrollment(userId, courseId);
}

async function ensureInitialAcademyProgress(userId: string, courseId: string) {
  const topics = await collection('topics').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get();
  const firstTopic = topics.docs[0];
  if (!firstTopic) return;
  const progressId = `${userId}_${courseId}_${firstTopic.id}`;
  await collection('progress').doc(progressId).set(stripUndefined({
    progressId,
    userId,
    courseId,
    topicId: firstTopic.id,
    lessonId: null,
    completed: false,
    unlocked: true,
    unlockedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  }), { merge: true });
}

export async function completeAcademyLesson(userId: string, courseId: string, lessonId: string) {
  const [enrollment, lessonSnap, lessonsSnap, requiredActivitiesSnap] = await Promise.all([
    getAcademyEnrollment(userId, courseId),
    collection('lessons').doc(lessonId).get(),
    collection('lessons').where('courseId', '==', courseId).where('status', '==', 'published').get(),
    collection('activities').where('courseId', '==', courseId).where('lessonId', '==', lessonId).where('required', '==', true).get(),
  ]);
  if (!enrollment) throw new Error('Academy enrollment required');
  if (!lessonSnap.exists) throw new Error('Academy lesson not found');
  const lesson = { lessonId: lessonSnap.id, ...lessonSnap.data() } as AcademyLessonDoc;
  if (lesson.courseId !== courseId) throw new Error('Academy lesson does not belong to course');

  if (!requiredActivitiesSnap.empty) {
    const submissionsSnap = await collection('activitySubmissions')
      .where('userId', '==', userId)
      .where('courseId', '==', courseId)
      .where('lessonId', '==', lessonId)
      .get();
    const submissionsByActivity = new Map<string, AcademyActivitySubmissionDoc[]>();
    for (const doc of submissionsSnap.docs) {
      const submission = { submissionId: doc.id, ...doc.data() } as AcademyActivitySubmissionDoc;
      submissionsByActivity.set(submission.activityId, [...(submissionsByActivity.get(submission.activityId) || []), submission]);
    }

    for (const activityDoc of requiredActivitiesSnap.docs) {
      const activity = { activityId: activityDoc.id, ...activityDoc.data() } as AcademyActivityDoc;
      const submissions = submissionsByActivity.get(activity.activityId) || [];
      const hasAcceptedSubmission = submissions.some((submission) =>
        activity.manualReviewRequired
          ? ['approved', 'reviewed'].includes(submission.status)
          : !['rejected', 'needs_revision'].includes(submission.status)
      );
      if (!hasAcceptedSubmission) {
        throw new Error(activity.manualReviewRequired
          ? 'This lesson has an activity awaiting manual review before it can be completed.'
          : 'Submit the required class activity before completing this lesson.'
        );
      }
    }
  }

  const progressId = `${userId}_${courseId}_${lessonId}`;
  await collection('progress').doc(progressId).set(stripUndefined({
    progressId,
    userId,
    courseId,
    topicId: lesson.topicId,
    lessonId,
    completed: true,
    completedAt: now(),
    unlocked: true,
    unlockedAt: now(),
    updatedAt: now(),
    createdAt: now(),
  }), { merge: true });

  const completedSnap = await collection('progress')
    .where('userId', '==', userId)
    .where('courseId', '==', courseId)
    .where('completed', '==', true)
    .get();
  const totalLessons = Math.max(lessonsSnap.size, 1);
  const progressPercent = Math.min(100, Math.round((completedSnap.size / totalLessons) * 100));
  await collection('enrollments').doc(`${userId}_${courseId}`).set({
    progressPercent,
    status: progressPercent >= 100 ? 'completed' : 'active',
    completedAt: progressPercent >= 100 ? now() : null,
    lastAccessedAt: now(),
    updatedAt: now(),
  }, { merge: true });

  await awardAcademyXP({
    userId,
    action: 'academy_lesson_completed',
    resourceId: lessonId,
    metadata: { courseId, topicId: lesson.topicId },
  });
  if (progressPercent >= 100) {
    await awardAcademyXP({
      userId,
      action: 'academy_course_completed',
      resourceId: courseId,
      metadata: { courseId },
    });
  }

  return { progressPercent };
}

export async function submitAcademyActivityResponse(input: {
  userId: string;
  courseId: string;
  topicId: string;
  lessonId: string;
  activityId: string;
  response: string | string[] | Record<string, unknown>;
  attachments?: Array<{ name: string; url: string; storagePath?: string; mimeType?: string }>;
}) {
  const enrollment = await getAcademyEnrollment(input.userId, input.courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const activitySnap = await collection('activities').doc(input.activityId).get();
  if (!activitySnap.exists) throw new Error('Academy activity not found');
  const activity = { activityId: activitySnap.id, ...activitySnap.data() } as AcademyActivityDoc;
  if (activity.courseId !== input.courseId || activity.topicId !== input.topicId || activity.lessonId !== input.lessonId) {
    throw new Error('Academy activity does not belong to this lesson');
  }

  const ref = collection('activitySubmissions').doc();
  const score = scoreActivityResponse(activity, input.response);
  const status = activity.manualReviewRequired ? 'submitted' : 'approved';
  const doc = stripUndefined({
    submissionId: ref.id,
    userId: input.userId,
    courseId: input.courseId,
    topicId: input.topicId,
    lessonId: input.lessonId,
    activityId: input.activityId,
    response: input.response,
    attachments: sanitizeSubmissionAttachments(input.attachments || []),
    score,
    feedback: null,
    reviewedBy: null,
    submittedAt: now(),
    reviewedAt: activity.manualReviewRequired ? null : now(),
    status,
    createdAt: now(),
    updatedAt: now(),
  });
  const batch = adminDb.batch();
  batch.set(ref, doc);

  if (activity.manualReviewRequired) {
    const reviewRef = collection('manualReviews').doc();
    batch.set(reviewRef, stripUndefined({
      manualReviewId: reviewRef.id,
      courseId: input.courseId,
      topicId: input.topicId,
      lessonId: input.lessonId,
      activityId: input.activityId,
      submissionId: ref.id,
      userId: input.userId,
      reviewerId: null,
      status: 'pending',
      feedback: null,
      score,
      createdAt: now(),
      updatedAt: now(),
    }));
  }

  await batch.commit();
  await awardAcademyXP({
    userId: input.userId,
    action: 'academy_activity_submitted',
    resourceId: ref.id,
    metadata: { courseId: input.courseId, topicId: input.topicId, lessonId: input.lessonId, activityId: input.activityId },
  });
  if (activity.manualReviewRequired) {
    await createAcademyUserNotification(input.userId, {
      title: 'Activity submitted for review',
      body: 'Your Academy activity was submitted. We will notify you when it has been reviewed.',
      linkUrl: '/academy',
      metadata: { courseId: input.courseId, activityId: input.activityId, submissionId: ref.id },
    });
  }
  return serialize(doc as any);
}

function sanitizeSubmissionAttachments(attachments: Array<{ name: string; url: string; storagePath?: string; mimeType?: string }>) {
  return attachments.slice(0, 10).map((attachment) => stripUndefined({
    name: sanitizeAcademyString(attachment.name, 180),
    url: sanitizeAcademyText(attachment.url, 2000),
    storagePath: attachment.storagePath ? sanitizeAcademyText(attachment.storagePath, 1000) : undefined,
    mimeType: attachment.mimeType ? sanitizeAcademyString(attachment.mimeType, 120) : undefined,
  })).filter((attachment) => attachment.name && attachment.url);
}

function scoreActivityResponse(activity: AcademyActivityDoc, response: string | string[] | Record<string, unknown>) {
  if (!Array.isArray(activity.options) || !['multiple_choice', 'checkboxes'].includes(activity.activityType)) return null;
  const correct = activity.options.filter((option) => option.isCorrect).map((option) => option.optionId).sort();
  if (!correct.length) return null;
  const selected = (Array.isArray(response) ? response : [String(response)]).filter(Boolean).sort();
  const exact = selected.length === correct.length && selected.every((optionId, index) => optionId === correct[index]);
  return exact ? 100 : 0;
}

export async function createAcademyActivity(input: Partial<AcademyActivityDoc>) {
  const lessonSnap = input.lessonId ? await collection('lessons').doc(input.lessonId).get() : null;
  if (!lessonSnap?.exists) throw new Error('Academy lesson not found');
  const lesson = { lessonId: lessonSnap.id, ...lessonSnap.data() } as AcademyLessonDoc;
  if (lesson.courseId !== input.courseId || lesson.topicId !== input.topicId) {
    throw new Error('Academy activity lesson mismatch');
  }

  const ref = collection('activities').doc();
  const doc = stripUndefined({
    activityId: ref.id,
    courseId: input.courseId || '',
    topicId: input.topicId || '',
    lessonId: input.lessonId || '',
    title: sanitizeAcademyString(input.title, 180),
    prompt: sanitizeAcademyText(input.prompt, 12000),
    activityType: input.activityType || 'reflection',
    options: sanitizeActivityOptions(input.options || []),
    required: input.required ?? true,
    manualReviewRequired: input.manualReviewRequired ?? false,
    sortOrder: input.sortOrder ?? 0,
    metadata: input.metadata || {},
    createdAt: now(),
    updatedAt: now(),
  });
  validateAcademyActivity(doc as Partial<AcademyActivityDoc>);
  await ref.set(doc);
  return serialize(doc as AcademyActivityDoc);
}

export async function updateAcademyActivity(activityId: string, input: Partial<AcademyActivityDoc>) {
  const snap = await collection('activities').doc(activityId).get();
  if (!snap.exists) throw new Error('Academy activity not found');
  const existing = { activityId: snap.id, ...snap.data() } as AcademyActivityDoc;
  const patch = stripUndefined({
    title: input.title !== undefined ? sanitizeAcademyString(input.title, 180) : undefined,
    prompt: input.prompt !== undefined ? sanitizeAcademyText(input.prompt, 12000) : undefined,
    activityType: input.activityType,
    options: input.options !== undefined ? sanitizeActivityOptions(input.options) : undefined,
    required: input.required,
    manualReviewRequired: input.manualReviewRequired,
    sortOrder: input.sortOrder,
    metadata: input.metadata,
    updatedAt: now(),
  });
  validateAcademyActivity({ ...existing, ...patch } as Partial<AcademyActivityDoc>, { partial: false });
  await collection('activities').doc(activityId).set(patch, { merge: true });
  const updated = await collection('activities').doc(activityId).get();
  return serialize({ activityId: updated.id, ...updated.data() } as AcademyActivityDoc);
}

export async function createAcademyQuiz(input: Partial<AcademyQuizDoc>) {
  const ref = collection('quizzes').doc();
  const doc = stripUndefined({
    quizId: ref.id,
    courseId: input.courseId || '',
    topicId: input.topicId || '',
    title: sanitizeAcademyString(input.title, 180),
    description: sanitizeAcademyText(input.description || '', 4000),
    passingScore: normalizePercent(input.passingScore ?? 70),
    maxAttempts: input.maxAttempts ?? null,
    instantFeedbackEnabled: input.instantFeedbackEnabled ?? true,
    questions: sanitizeAcademyQuestions(input.questions || []),
    status: input.status || 'draft',
    metadata: input.metadata || {},
    createdAt: now(),
    updatedAt: now(),
  });
  validateQuizRecord(doc as AcademyQuizDoc);
  await ref.set(doc);
  return serialize(doc as AcademyQuizDoc);
}

export async function updateAcademyQuiz(quizId: string, input: Partial<AcademyQuizDoc>) {
  const snap = await collection('quizzes').doc(quizId).get();
  if (!snap.exists) throw new Error('Academy quiz not found');
  const existing = { quizId: snap.id, ...snap.data() } as AcademyQuizDoc;
  const patch = stripUndefined({
    title: input.title !== undefined ? sanitizeAcademyString(input.title, 180) : undefined,
    description: input.description !== undefined ? sanitizeAcademyText(input.description || '', 4000) : undefined,
    passingScore: input.passingScore !== undefined ? normalizePercent(input.passingScore) : undefined,
    maxAttempts: input.maxAttempts,
    instantFeedbackEnabled: input.instantFeedbackEnabled,
    questions: input.questions !== undefined ? sanitizeAcademyQuestions(input.questions) : undefined,
    status: input.status,
    metadata: input.metadata,
    updatedAt: now(),
  });
  validateQuizRecord({ ...existing, ...patch } as AcademyQuizDoc);
  await collection('quizzes').doc(quizId).set(patch, { merge: true });
  const updated = await collection('quizzes').doc(quizId).get();
  return serialize({ quizId: updated.id, ...updated.data() } as AcademyQuizDoc);
}

function validateQuizRecord(quiz: AcademyQuizDoc) {
  if (!quiz.courseId) throw new AcademyValidationError('Quiz courseId is required.', 'ACADEMY_QUIZ_COURSE_REQUIRED');
  if (!quiz.topicId) throw new AcademyValidationError('Quiz topicId is required.', 'ACADEMY_QUIZ_TOPIC_REQUIRED');
  if (!quiz.title) throw new AcademyValidationError('Quiz title is required.', 'ACADEMY_QUIZ_TITLE_REQUIRED');
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    throw new AcademyValidationError('Quiz requires at least one question.', 'ACADEMY_QUIZ_QUESTIONS_REQUIRED');
  }
}

function normalizePercent(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 70));
}

function sanitizeAcademyQuestions(questions: AcademyQuestion[]) {
  return questions.slice(0, 200).map((question, index) => stripUndefined({
    questionId: sanitizeAcademyString(question.questionId || `question_${index + 1}`, 100),
    type: question.type || 'multiple_choice',
    prompt: sanitizeAcademyText(question.prompt, 8000),
    options: (question.options || []).map((option, optionIndex) => stripUndefined({
      optionId: sanitizeAcademyString(option.optionId || `option_${optionIndex + 1}`, 100),
      label: sanitizeAcademyString(option.label, 1000),
      isCorrect: option.isCorrect === true,
      feedback: option.feedback ? sanitizeAcademyText(option.feedback, 1000) : undefined,
    })).filter((option) => option.label),
    points: Number.isFinite(question.points) && question.points > 0 ? question.points : 1,
    explanation: question.explanation ? sanitizeAcademyText(question.explanation, 2000) : undefined,
    sortOrder: Number.isFinite(question.sortOrder) ? question.sortOrder : index,
  })).filter((question) => question.prompt);
}

async function getPublishedQuiz(courseId: string, topicId: string) {
  const snap = await collection('quizzes')
    .where('courseId', '==', courseId)
    .where('topicId', '==', topicId)
    .where('status', '==', 'published')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { quizId: doc.id, ...doc.data() } as AcademyQuizDoc;
}

export async function getAcademyTopicQuizState(userId: string, courseId: string, topicId: string) {
  const enrollment = await getAcademyEnrollment(userId, courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const quiz = await getPublishedQuiz(courseId, topicId);
  if (!quiz) return { quiz: null, unlocked: false, reason: 'No published quiz exists for this topic.', attempts: [] };
  const unlocked = await isTopicQuizUnlocked(userId, courseId, topicId);
  const attemptsSnap = await collection('quizAttempts')
    .where('userId', '==', userId)
    .where('courseId', '==', courseId)
    .where('topicId', '==', topicId)
    .get();
  const attempts = attemptsSnap.docs.map((doc) => serialize({ quizAttemptId: doc.id, ...doc.data() } as AcademyQuizAttemptDoc));
  return { quiz: serialize(redactQuizAnswers(quiz) as AcademyQuizDoc), unlocked, reason: unlocked ? null : 'Complete topic lessons and required activities first.', attempts };
}

export async function submitAcademyTopicQuiz(input: {
  userId: string;
  courseId: string;
  topicId: string;
  answers: Record<string, string | string[]>;
}) {
  const enrollment = await getAcademyEnrollment(input.userId, input.courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const quiz = await getPublishedQuiz(input.courseId, input.topicId);
  if (!quiz) throw new Error('Published quiz not found');
  const unlocked = await isTopicQuizUnlocked(input.userId, input.courseId, input.topicId);
  if (!unlocked) throw new Error('Complete topic lessons and required activities before taking this quiz.');

  const previousAttemptsSnap = await collection('quizAttempts')
    .where('userId', '==', input.userId)
    .where('courseId', '==', input.courseId)
    .where('topicId', '==', input.topicId)
    .get();
  if (quiz.maxAttempts && previousAttemptsSnap.size >= quiz.maxAttempts) throw new Error('Maximum quiz attempts reached');

  const result = scoreQuestions(quiz.questions, input.answers);
  const passed = result.score >= quiz.passingScore;
  const attemptRef = collection('quizAttempts').doc();
  const attemptDoc = stripUndefined({
    quizAttemptId: attemptRef.id,
    quizId: quiz.quizId,
    courseId: input.courseId,
    topicId: input.topicId,
    userId: input.userId,
    attemptNumber: previousAttemptsSnap.size + 1,
    score: result.score,
    passed,
    status: passed ? 'passed' : 'failed',
    startedAt: now(),
    submittedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  });

  const batch = adminDb.batch();
  batch.set(attemptRef, attemptDoc);
  for (const response of result.responses) {
    const responseRef = collection('quizResponses').doc();
    batch.set(responseRef, {
      quizResponseId: responseRef.id,
      quizAttemptId: attemptRef.id,
      quizId: quiz.quizId,
      questionId: response.questionId,
      userId: input.userId,
      answer: response.answer,
      correct: response.correct,
      pointsAwarded: response.pointsAwarded,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  if (passed) {
    const topicProgressId = `${input.userId}_${input.courseId}_${input.topicId}`;
    batch.set(collection('progress').doc(topicProgressId), stripUndefined({
      progressId: topicProgressId,
      userId: input.userId,
      courseId: input.courseId,
      topicId: input.topicId,
      lessonId: null,
      completed: true,
      completedAt: now(),
      unlocked: true,
      unlockedAt: now(),
      metadata: { quizAttemptId: attemptRef.id },
      updatedAt: now(),
      createdAt: now(),
    }), { merge: true });
    const nextTopic = await getNextTopic(input.courseId, input.topicId);
    if (nextTopic) {
      const nextProgressId = `${input.userId}_${input.courseId}_${nextTopic.topicId}`;
      batch.set(collection('progress').doc(nextProgressId), stripUndefined({
        progressId: nextProgressId,
        userId: input.userId,
        courseId: input.courseId,
        topicId: nextTopic.topicId,
        lessonId: null,
        completed: false,
        unlocked: true,
        unlockedAt: now(),
        updatedAt: now(),
        createdAt: now(),
      }), { merge: true });
    }
  }
  await batch.commit();
  if (passed) {
    await awardAcademyXP({
      userId: input.userId,
      action: 'academy_quiz_passed',
      resourceId: attemptRef.id,
      metadata: { courseId: input.courseId, topicId: input.topicId, score: result.score },
    });
    await awardAcademyXP({
      userId: input.userId,
      action: 'academy_topic_completed',
      resourceId: input.topicId,
      metadata: { courseId: input.courseId, topicId: input.topicId },
    });
    const nextTopic = await getNextTopic(input.courseId, input.topicId);
    if (nextTopic) {
      await createAcademyUserNotification(input.userId, {
        title: 'Next Academy topic unlocked',
        body: `${nextTopic.title} is now available.`,
        linkUrl: '/academy',
        metadata: { courseId: input.courseId, topicId: nextTopic.topicId },
      });
    }
  } else {
    await createAcademyUserNotification(input.userId, {
      title: 'Academy quiz submitted',
      body: 'Review your feedback and try again when you are ready.',
      linkUrl: '/academy',
      metadata: { courseId: input.courseId, topicId: input.topicId, score: result.score },
    });
  }
  return { attempt: serialize(attemptDoc as AcademyQuizAttemptDoc), passed, score: result.score, feedback: quiz.instantFeedbackEnabled ? result.feedback : [] };
}

async function isTopicQuizUnlocked(userId: string, courseId: string, topicId: string) {
  const [lessonsSnap, activitiesSnap, progressSnap, submissionsSnap] = await Promise.all([
    collection('lessons').where('courseId', '==', courseId).where('topicId', '==', topicId).where('status', '==', 'published').get(),
    collection('activities').where('courseId', '==', courseId).where('topicId', '==', topicId).where('required', '==', true).get(),
    collection('progress').where('userId', '==', userId).where('courseId', '==', courseId).get(),
    collection('activitySubmissions').where('userId', '==', userId).where('courseId', '==', courseId).where('topicId', '==', topicId).get(),
  ]);
  const completedLessons = new Set(progressSnap.docs.map((doc) => doc.data()).filter((item) => item.completed && item.lessonId).map((item) => item.lessonId));
  for (const lessonDoc of lessonsSnap.docs) {
    if (!completedLessons.has(lessonDoc.id)) return false;
  }
  const submissions = submissionsSnap.docs.map((doc) => ({ submissionId: doc.id, ...doc.data() } as AcademyActivitySubmissionDoc));
  for (const activityDoc of activitiesSnap.docs) {
    const activity = { activityId: activityDoc.id, ...activityDoc.data() } as AcademyActivityDoc;
    const accepted = submissions.some((submission) =>
      submission.activityId === activity.activityId
      && (activity.manualReviewRequired ? ['approved', 'reviewed'].includes(submission.status) : !['rejected', 'needs_revision'].includes(submission.status))
    );
    if (!accepted) return false;
  }
  return true;
}

async function getNextTopic(courseId: string, topicId: string) {
  const topicsSnap = await collection('topics').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get();
  const topics = topicsSnap.docs.map((doc) => ({ topicId: doc.id, ...doc.data() } as AcademyTopicDoc));
  const index = topics.findIndex((topic) => topic.topicId === topicId);
  return index >= 0 ? topics[index + 1] || null : null;
}

function redactQuizAnswers(quiz: AcademyQuizDoc) {
  return {
    ...quiz,
    questions: quiz.questions.map((question) => ({
      ...question,
      options: question.options?.map((option) => ({ optionId: option.optionId, label: option.label, feedback: option.feedback })),
    })),
  };
}

function scoreQuestions(questions: AcademyQuestion[], answers: Record<string, string | string[]>) {
  const totalPoints = questions.reduce((sum, question) => sum + (question.points || 1), 0) || 1;
  let awarded = 0;
  const responses = questions.map((question) => {
    const answer = answers[question.questionId] ?? '';
    const pointsAwarded = scoreQuestion(question, answer);
    awarded += pointsAwarded;
    return {
      questionId: question.questionId,
      answer,
      correct: pointsAwarded >= (question.points || 1),
      pointsAwarded,
      explanation: question.explanation || null,
    };
  });
  return {
    score: Math.round((awarded / totalPoints) * 100),
    responses,
    feedback: responses.map((response) => ({
      questionId: response.questionId,
      correct: response.correct,
      pointsAwarded: response.pointsAwarded,
      explanation: response.explanation,
    })),
  };
}

function scoreQuestion(question: AcademyQuestion, answer: string | string[]) {
  if (question.type === 'short_answer' || question.type === 'scenario_based') {
    return String(Array.isArray(answer) ? answer.join(' ') : answer || '').trim() ? question.points || 1 : 0;
  }
  const correct = (question.options || []).filter((option) => option.isCorrect).map((option) => option.optionId).sort();
  if (!correct.length) return 0;
  const selected = (Array.isArray(answer) ? answer : [String(answer)]).filter(Boolean).sort();
  const exact = selected.length === correct.length && selected.every((value, index) => value === correct[index]);
  return exact ? question.points || 1 : 0;
}

export async function getAcademyExamState(userId: string, courseId: string) {
  const enrollment = await getAcademyEnrollment(userId, courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const [course, finalQuiz, attemptsSnap, certificatesSnap] = await Promise.all([
    getAcademyCourse(courseId),
    getPublishedQuiz(courseId, ACADEMY_FINAL_EXAM_TOPIC_ID),
    collection('examAttempts').where('userId', '==', userId).where('courseId', '==', courseId).get(),
    collection('certificates').where('userId', '==', userId).where('courseId', '==', courseId).limit(1).get(),
  ]);
  const unlocked = course?.finalExamEnabled ? await areAllTopicsPassed(userId, courseId) : false;
  return {
    unlocked,
    reason: unlocked ? null : 'Pass every topic quiz before starting the final exam.',
    exam: finalQuiz ? serialize(redactQuizAnswers(finalQuiz) as AcademyQuizDoc) : null,
    attempts: attemptsSnap.docs.map((doc) => serialize({ examAttemptId: doc.id, ...doc.data() } as AcademyExamAttemptDoc)),
    certificate: certificatesSnap.empty ? null : serialize({ certificateId: certificatesSnap.docs[0].id, ...certificatesSnap.docs[0].data() } as AcademyCertificateDoc),
  };
}

export async function startAcademyFinalExam(userId: string, courseId: string) {
  const state = await getAcademyExamState(userId, courseId);
  if (!state.unlocked) throw new Error(state.reason || 'Final exam locked');
  const exam = await getPublishedQuiz(courseId, ACADEMY_FINAL_EXAM_TOPIC_ID);
  if (!exam) throw new Error('Final exam is not published');
  if (exam.maxAttempts && state.attempts.length >= exam.maxAttempts) throw new Error('Maximum exam attempts reached');
  const attemptRef = collection('examAttempts').doc();
  const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const doc = stripUndefined({
    examAttemptId: attemptRef.id,
    userId,
    courseId,
    startedAt: now(),
    submittedAt: null,
    expiresAt,
    score: 0,
    passed: false,
    answers: {},
    status: 'in_progress',
    attemptNumber: state.attempts.length + 1,
    antiCheatEvents: [],
    createdAt: now(),
    updatedAt: now(),
  });
  await attemptRef.set(doc);
  return { attempt: serialize(doc as AcademyExamAttemptDoc), exam: serialize(redactQuizAnswers(exam) as AcademyQuizDoc) };
}

export async function submitAcademyFinalExam(input: {
  userId: string;
  courseId: string;
  examAttemptId: string;
  answers: Record<string, string | string[]>;
  antiCheatEvents?: Array<{ eventType: string; metadata?: Record<string, unknown> }>;
}) {
  const [attemptSnap, exam, course] = await Promise.all([
    collection('examAttempts').doc(input.examAttemptId).get(),
    getPublishedQuiz(input.courseId, ACADEMY_FINAL_EXAM_TOPIC_ID),
    getAcademyCourse(input.courseId),
  ]);
  if (!attemptSnap.exists) throw new Error('Exam attempt not found');
  if (!exam) throw new Error('Final exam is not published');
  const attempt = { examAttemptId: attemptSnap.id, ...attemptSnap.data() } as AcademyExamAttemptDoc;
  if (attempt.userId !== input.userId || attempt.courseId !== input.courseId) throw new Error('Exam attempt mismatch');
  if (attempt.status !== 'in_progress') throw new Error('Exam attempt already submitted');
  const expiry = attempt.expiresAt && typeof (attempt.expiresAt as any).toDate === 'function' ? (attempt.expiresAt as any).toDate() : new Date(String(attempt.expiresAt));
  const expired = expiry.getTime() < Date.now();
  const result = expired ? { score: 0 } : scoreQuestions(exam.questions, input.answers);
  const passed = !expired && result.score >= exam.passingScore;
  const antiCheatEvents = (input.antiCheatEvents || []).slice(0, 100).map((event) => ({
    eventType: sanitizeAcademyString(event.eventType, 120),
    occurredAt: new Date().toISOString(),
    metadata: event.metadata || {},
  }));

  const batch = adminDb.batch();
  batch.set(collection('examAttempts').doc(input.examAttemptId), stripUndefined({
    answers: input.answers,
    score: result.score,
    passed,
    status: expired ? 'expired' : passed ? 'passed' : 'failed',
    submittedAt: now(),
    antiCheatEvents,
    updatedAt: now(),
  }), { merge: true });

  let certificate: AcademyCertificateDoc | null = null;
  if (passed && course?.certificateEnabled) {
    certificate = await buildCertificateDoc(input.userId, course, result.score);
    batch.set(collection('certificates').doc(certificate.certificateId), certificate);
    batch.set(collection('enrollments').doc(`${input.userId}_${input.courseId}`), {
      status: 'completed',
      completedAt: now(),
      progressPercent: 100,
      updatedAt: now(),
    }, { merge: true });
  }
  await batch.commit();
  if (passed) {
    await awardAcademyXP({
      userId: input.userId,
      action: 'academy_course_completed',
      resourceId: input.courseId,
      metadata: { courseId: input.courseId, score: result.score },
    });
    if (certificate) {
      await activateReservedMrrEligibility(input.userId, input.courseId, certificate.certificateId);
      await awardAcademyXP({
        userId: input.userId,
        action: 'academy_certificate_earned',
        resourceId: certificate.certificateId,
        metadata: { courseId: input.courseId, certificateId: certificate.certificateId, score: result.score },
      });
      await createAcademyUserNotification(input.userId, {
        title: 'Certificate issued',
        body: `Your ${course?.title || 'Academy'} certificate is ready.`,
        linkUrl: `/certificates/verify/${certificate.certificateId}`,
        metadata: { courseId: input.courseId, certificateId: certificate.certificateId },
      });
    }
  } else {
    await createAcademyUserNotification(input.userId, {
      title: expired ? 'Final exam expired' : 'Final exam submitted',
      body: expired ? 'Your final exam timer expired. Check your exam page for next steps.' : 'Your final exam was submitted. Review your result and retake rules.',
      linkUrl: '/academy',
      metadata: { courseId: input.courseId, score: result.score, expired },
    });
  }
  return { score: result.score, passed, expired, certificate: certificate ? serialize(certificate) : null };
}

async function areAllTopicsPassed(userId: string, courseId: string) {
  const [topicsSnap, attemptsSnap] = await Promise.all([
    collection('topics').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get(),
    collection('quizAttempts').where('userId', '==', userId).where('courseId', '==', courseId).where('passed', '==', true).get(),
  ]);
  const passedTopics = new Set(attemptsSnap.docs.map((doc) => doc.data().topicId));
  return topicsSnap.docs.every((doc) => passedTopics.has(doc.id));
}

async function buildCertificateDoc(userId: string, course: AcademyCourseDoc, score: number): Promise<AcademyCertificateDoc> {
  const existingSnap = await collection('certificates').where('userId', '==', userId).where('courseId', '==', course.courseId).limit(1).get();
  if (!existingSnap.empty) return { certificateId: existingSnap.docs[0].id, ...existingSnap.docs[0].data() } as AcademyCertificateDoc;
  const userSnap = await adminDb.collection('users').doc(userId).get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const ref = collection('certificates').doc();
  return stripUndefined({
    certificateId: ref.id,
    userId,
    courseId: course.courseId,
    issuedAt: now(),
    studentName: user.displayName || user.name || user.email || 'SDC Learner',
    courseTitle: course.title,
    score,
    certificateUrl: null,
    verificationCode: randomBytes(8).toString('hex').toUpperCase(),
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  }) as AcademyCertificateDoc;
}

export async function issueAcademyCertificate(userId: string, courseId: string) {
  const [course, passedExamSnap] = await Promise.all([
    getAcademyCourse(courseId),
    collection('examAttempts')
      .where('userId', '==', userId)
      .where('courseId', '==', courseId)
      .where('passed', '==', true)
      .limit(1)
      .get(),
  ]);
  if (!course?.certificateEnabled) throw new Error('Certificates are not enabled for this course');
  if (passedExamSnap.empty) throw new Error('A passed final exam is required before issuing a certificate');
  const score = Number(passedExamSnap.docs[0].data().score || 0);
  const certificate = await buildCertificateDoc(userId, course, score);
  await collection('certificates').doc(certificate.certificateId).set(certificate, { merge: true });
  await activateReservedMrrEligibility(userId, courseId, certificate.certificateId);
  await awardAcademyXP({
    userId,
    action: 'academy_certificate_earned',
    resourceId: certificate.certificateId,
    metadata: { courseId, certificateId: certificate.certificateId, score },
  });
  await createAcademyUserNotification(userId, {
    title: 'Certificate issued',
    body: `Your ${course.title} certificate is ready.`,
    linkUrl: `/certificates/verify/${certificate.certificateId}`,
    metadata: { courseId, certificateId: certificate.certificateId },
  });
  return serialize(certificate);
}

function sanitizeActivityOptions(options: AcademyActivityDoc['options'] = []) {
  return options.map((option, index) => stripUndefined({
    optionId: sanitizeAcademyString(option.optionId || `option_${index + 1}`, 80),
    label: sanitizeAcademyString(option.label, 500),
    isCorrect: option.isCorrect === true,
    feedback: option.feedback ? sanitizeAcademyText(option.feedback, 1000) : undefined,
  })).filter((option) => option.label);
}

export async function listAcademyActivitySubmissionsForCourse(courseId: string, options: { status?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  let query: FirebaseFirestore.Query = collection('activitySubmissions')
    .where('courseId', '==', courseId)
    .orderBy('submittedAt', 'desc')
    .limit(limit);
  if (options.status && options.status !== 'all') {
    query = query.where('status', '==', options.status);
  }
  const [submissionsSnap, activitiesSnap, lessonsSnap] = await Promise.all([
    query.get(),
    collection('activities').where('courseId', '==', courseId).get(),
    collection('lessons').where('courseId', '==', courseId).get(),
  ]);
  const activities = new Map(activitiesSnap.docs.map((doc) => [doc.id, serialize({ activityId: doc.id, ...doc.data() } as AcademyActivityDoc)]));
  const lessons = new Map(lessonsSnap.docs.map((doc) => [doc.id, serialize({ lessonId: doc.id, ...doc.data() } as AcademyLessonDoc)]));
  return submissionsSnap.docs.map((doc) => {
    const submission = serialize({ submissionId: doc.id, ...doc.data() } as AcademyActivitySubmissionDoc);
    return {
      ...submission,
      activity: activities.get(submission.activityId) || null,
      lesson: lessons.get(submission.lessonId) || null,
    };
  });
}

export async function reviewAcademyActivitySubmission(submissionId: string, reviewerId: string, input: { status: string; feedback?: string | null; score?: number | null }) {
  const allowedStatuses = ['reviewed', 'needs_revision', 'approved', 'rejected'];
  if (!allowedStatuses.includes(input.status)) throw new Error('Unsupported review status');
  const snap = await collection('activitySubmissions').doc(submissionId).get();
  if (!snap.exists) throw new Error('Academy activity submission not found');
  const submission = { submissionId: snap.id, ...snap.data() } as AcademyActivitySubmissionDoc;
  const patch = stripUndefined({
    status: input.status,
    feedback: input.feedback === undefined ? undefined : sanitizeAcademyText(input.feedback || '', 4000),
    score: input.score === undefined ? undefined : input.score,
    reviewedBy: reviewerId,
    reviewedAt: now(),
    updatedAt: now(),
  });

  const manualStatus = input.status === 'reviewed' ? 'approved' : input.status;
  const batch = adminDb.batch();
  batch.set(collection('activitySubmissions').doc(submissionId), patch, { merge: true });
  const reviewSnap = await collection('manualReviews').where('submissionId', '==', submissionId).limit(1).get();
  if (!reviewSnap.empty) {
    batch.set(reviewSnap.docs[0].ref, stripUndefined({
      reviewerId,
      status: manualStatus,
      feedback: patch.feedback,
      score: patch.score,
      updatedAt: now(),
    }), { merge: true });
  } else {
    const reviewRef = collection('manualReviews').doc();
    batch.set(reviewRef, stripUndefined({
      manualReviewId: reviewRef.id,
      courseId: submission.courseId,
      topicId: submission.topicId,
      lessonId: submission.lessonId,
      activityId: submission.activityId,
      submissionId,
      userId: submission.userId,
      reviewerId,
      status: manualStatus,
      feedback: patch.feedback,
      score: patch.score,
      createdAt: now(),
      updatedAt: now(),
    } as Partial<AcademyManualReviewDoc>));
  }
  await batch.commit();
  if (['approved', 'reviewed'].includes(input.status)) {
    await awardAcademyXP({
      userId: submission.userId,
      action: 'academy_activity_approved',
      resourceId: submissionId,
      metadata: { courseId: submission.courseId, topicId: submission.topicId, lessonId: submission.lessonId, activityId: submission.activityId },
    });
  }
  await createAcademyUserNotification(submission.userId, {
    title: input.status === 'needs_revision' ? 'Academy activity needs revision' : input.status === 'rejected' ? 'Academy activity reviewed' : 'Academy activity approved',
    body: input.feedback || (input.status === 'needs_revision' ? 'Review the feedback and resubmit your activity.' : input.status === 'rejected' ? 'Your activity was reviewed. Check the feedback for next steps.' : 'Your activity was approved. You can continue progressing.'),
    linkUrl: '/academy',
    metadata: { courseId: submission.courseId, submissionId, status: input.status },
  });
  const updated = await collection('activitySubmissions').doc(submissionId).get();
  return serialize({ submissionId: updated.id, ...updated.data() } as AcademyActivitySubmissionDoc);
}

export async function listAcademyLessonDiscussions(courseId: string, lessonId: string) {
  const [discussionSnap, repliesSnap] = await Promise.all([
    collection('lessonDiscussions')
    .where('courseId', '==', courseId)
    .where('lessonId', '==', lessonId)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get(),
    collection('discussionReplies')
      .where('courseId', '==', courseId)
      .where('lessonId', '==', lessonId)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'asc')
      .limit(200)
      .get(),
  ]);
  const repliesByDiscussion = new Map<string, AcademyDiscussionReplyDoc[]>();
  for (const doc of repliesSnap.docs) {
    const reply = serialize({ replyId: doc.id, ...doc.data() } as AcademyDiscussionReplyDoc);
    repliesByDiscussion.set(reply.discussionId, [...(repliesByDiscussion.get(reply.discussionId) || []), reply]);
  }
  return discussionSnap.docs.map((doc) => {
    const discussion = serialize({ discussionId: doc.id, ...doc.data() } as AcademyLessonDiscussionDoc);
    return { ...discussion, replies: repliesByDiscussion.get(discussion.discussionId) || [] };
  });
}

export async function createAcademyLessonDiscussion(input: {
  userId: string;
  courseId: string;
  topicId?: string | null;
  lessonId?: string | null;
  body: string;
  discussionType?: 'lesson_comment' | 'course_discussion' | 'announcement';
}) {
  const enrollment = await getAcademyEnrollment(input.userId, input.courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const ref = collection('lessonDiscussions').doc();
  const doc = stripUndefined({
    discussionId: ref.id,
    courseId: input.courseId,
    topicId: input.topicId,
    lessonId: input.lessonId,
    userId: input.userId,
    body: sanitizeAcademyText(input.body, 4000),
    pinned: false,
    helpfulCount: 0,
    status: 'active',
    discussionType: input.discussionType || (input.lessonId ? 'lesson_comment' : 'course_discussion'),
    reportCount: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return serialize(doc as any);
}

export async function listAcademyCourseDiscussions(courseId: string) {
  const [discussionSnap, replySnap] = await Promise.all([
    collection('lessonDiscussions')
      .where('courseId', '==', courseId)
      .where('lessonId', '==', null)
      .where('status', 'in', ['active', 'reported'])
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get(),
    collection('discussionReplies')
      .where('courseId', '==', courseId)
      .where('status', 'in', ['active', 'reported'])
      .orderBy('createdAt', 'asc')
      .limit(500)
      .get(),
  ]);
  const repliesByDiscussion = new Map<string, AcademyDiscussionReplyDoc[]>();
  for (const doc of replySnap.docs) {
    const reply = serialize({ replyId: doc.id, ...doc.data() } as AcademyDiscussionReplyDoc);
    repliesByDiscussion.set(reply.discussionId, [...(repliesByDiscussion.get(reply.discussionId) || []), reply]);
  }
  return discussionSnap.docs.map((doc) => {
    const discussion = serialize({ discussionId: doc.id, ...doc.data() } as AcademyLessonDiscussionDoc);
    return { ...discussion, replies: repliesByDiscussion.get(discussion.discussionId) || [] };
  });
}

export async function createAcademyDiscussionReply(input: {
  userId: string;
  courseId: string;
  discussionId: string;
  lessonId?: string | null;
  body: string;
}) {
  const enrollment = await getAcademyEnrollment(input.userId, input.courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const discussionSnap = await collection('lessonDiscussions').doc(input.discussionId).get();
  if (!discussionSnap.exists) throw new Error('Academy discussion not found');
  const discussion = { discussionId: discussionSnap.id, ...discussionSnap.data() } as AcademyLessonDiscussionDoc;
  if (discussion.courseId !== input.courseId) throw new Error('Academy discussion mismatch');
  const ref = collection('discussionReplies').doc();
  const doc = stripUndefined({
    replyId: ref.id,
    discussionId: input.discussionId,
    courseId: input.courseId,
    lessonId: input.lessonId || discussion.lessonId || null,
    userId: input.userId,
    body: sanitizeAcademyText(input.body, 4000),
    helpfulCount: 0,
    reportCount: 0,
    pinned: false,
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return serialize(doc as AcademyDiscussionReplyDoc);
}

export async function reactToAcademyDiscussion(input: {
  userId: string;
  courseId: string;
  discussionId?: string | null;
  replyId?: string | null;
  lessonId?: string | null;
  reactionType: 'helpful' | 'report';
}) {
  const enrollment = await getAcademyEnrollment(input.userId, input.courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const targetId = input.replyId || input.discussionId;
  if (!targetId) throw new Error('Discussion target required');
  const reactionId = `${input.userId}_${targetId}_${input.reactionType}`;
  const reactionRef = collection('discussionReactions').doc(reactionId);
  const existing = await reactionRef.get();
  if (existing.exists) return serialize({ reactionId: existing.id, ...existing.data() } as AcademyDiscussionReactionDoc);

  const targetRef = input.replyId ? collection('discussionReplies').doc(targetId) : collection('lessonDiscussions').doc(targetId);
  const targetPatch: Record<string, unknown> = {
    [input.reactionType === 'helpful' ? 'helpfulCount' : 'reportCount']: FieldValue.increment(1),
    updatedAt: now(),
  };
  if (input.reactionType === 'report') targetPatch.status = 'reported';
  const batch = adminDb.batch();
  batch.set(reactionRef, stripUndefined({
    reactionId,
    discussionId: input.discussionId || null,
    replyId: input.replyId || null,
    courseId: input.courseId,
    lessonId: input.lessonId || null,
    userId: input.userId,
    reactionType: input.reactionType,
    createdAt: now(),
    updatedAt: now(),
  }));
  batch.set(targetRef, targetPatch, { merge: true });
  await batch.commit();
  const updated = await reactionRef.get();
  return serialize({ reactionId: updated.id, ...updated.data() } as AcademyDiscussionReactionDoc);
}

export async function moderateAcademyDiscussion(input: {
  moderatorId: string;
  targetType: 'discussion' | 'reply';
  targetId: string;
  status?: 'active' | 'hidden' | 'reported';
  pinned?: boolean;
}) {
  const ref = input.targetType === 'reply' ? collection('discussionReplies').doc(input.targetId) : collection('lessonDiscussions').doc(input.targetId);
  const patch = stripUndefined({
    status: input.status,
    pinned: input.pinned,
    moderatedBy: input.moderatorId,
    moderatedAt: now(),
    updatedAt: now(),
  });
  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return serialize({ [`${input.targetType}Id`]: updated.id, ...updated.data() } as any);
}

export async function createAcademyTutorTurn(input: {
  userId: string;
  courseId: string;
  topicId?: string | null;
  lessonId?: string | null;
  content: string;
}) {
  const enrollment = await getAcademyEnrollment(input.userId, input.courseId);
  if (!enrollment) throw new Error('Academy enrollment required');
  const sessionId = `${input.userId}_${input.courseId}_${input.lessonId || 'course'}`;
  const [course, topicSnap, lessonSnap, recentSnap, userSnap] = await Promise.all([
    getAcademyCourse(input.courseId),
    input.topicId ? collection('topics').doc(input.topicId).get() : Promise.resolve(null),
    input.lessonId ? collection('lessons').doc(input.lessonId).get() : Promise.resolve(null),
    collection('tutorMessages').where('sessionId', '==', sessionId).orderBy('createdAt', 'desc').limit(8).get(),
    adminDb.collection('users').doc(input.userId).get(),
  ]);
  const topic = topicSnap?.exists ? ({ topicId: topicSnap.id, ...topicSnap.data() } as AcademyTopicDoc) : null;
  const lesson = lessonSnap?.exists ? ({ lessonId: lessonSnap.id, ...lessonSnap.data() } as AcademyLessonDoc) : null;
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const recentHistory = recentSnap.docs
    .map((doc) => doc.data() as AcademyTutorMessageDoc)
    .reverse()
    .map((message) => `${message.role}: ${message.content}`)
    .slice(-8);
  const systemPrompt = [
    'You are Soma Academy AI Tutor. Help learners understand the lesson and apply it to digital entrepreneurship.',
    'Be practical, concise, and encouraging. Do not complete graded work for the learner; guide them with examples, questions, and structure.',
    `Course: ${course?.title || input.courseId}`,
    topic ? `Topic: ${topic.title}` : '',
    lesson ? `Lesson: ${lesson.title}` : '',
    lesson?.writtenContent ? `Lesson content: ${lesson.writtenContent.slice(0, 3500)}` : '',
    lesson?.keyTakeaways?.length ? `Key takeaways: ${lesson.keyTakeaways.join('; ')}` : '',
    user.businessNiche ? `Learner niche: ${user.businessNiche}` : '',
  ].filter(Boolean).join('\n');
  const userRef = collection('tutorMessages').doc();
  const assistantRef = collection('tutorMessages').doc();
  const tutorSessionRef = collection('tutorSessions').doc(sessionId);
  const userDoc = stripUndefined({
    tutorMessageId: userRef.id,
    sessionId,
    userId: input.userId,
    courseId: input.courseId,
    topicId: input.topicId || null,
    lessonId: input.lessonId || null,
    role: 'user',
    content: sanitizeAcademyText(input.content, 4000),
    aiRequestId: null,
    metadata: { phase: 'academy-phase-3-ledger' },
    createdAt: now(),
    updatedAt: now(),
  });
  let assistantText = '';
  let aiRequestId: string | null = null;
  try {
    const response = await executeMonetizedTextRequest({
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentHistory.map((content) => ({ role: 'user', content })),
        { role: 'user', content: sanitizeAcademyText(input.content, 4000) },
      ],
      task: 'mentor_chat',
      userId: input.userId,
      userTier: user.subscription?.subscriptionPlan || user.subscriptionPlan || user.tier || 'explorer',
      maxOutputTokens: 900,
      temperature: 0.4,
    }, {
      userId: input.userId,
      task: 'mentor_chat',
      feature: 'mentor_chat',
      modality: 'text',
      message: sanitizeAcademyText(input.content, 4000),
      history: recentHistory,
      userTier: user.subscription?.subscriptionPlan || user.subscriptionPlan || user.tier || 'explorer',
      allowByok: true,
      metadata: {
        academy: true,
        courseId: input.courseId,
        topicId: input.topicId || null,
        lessonId: input.lessonId || null,
        promptVersion: 'academy_tutor_v1',
      },
    });
    assistantText = response.text;
    aiRequestId = response.billing?.requestId || null;
  } catch (error) {
    assistantText = 'I could not reach the Academy AI Tutor right now. I saved your question, and you can try again in a moment.';
  }
  const assistantDoc = stripUndefined({
    tutorMessageId: assistantRef.id,
    sessionId,
    userId: input.userId,
    courseId: input.courseId,
    topicId: input.topicId || null,
    lessonId: input.lessonId || null,
    role: 'assistant',
    content: sanitizeAcademyText(assistantText, 8000),
    aiRequestId,
    metadata: { phase: 'academy-phase-10-ai-platform', promptVersion: 'academy_tutor_v1' },
    createdAt: now(),
    updatedAt: now(),
  });
  const batch = adminDb.batch();
  batch.set(tutorSessionRef, stripUndefined({
    tutorSessionId: sessionId,
    userId: input.userId,
    courseId: input.courseId,
    topicId: input.topicId || null,
    lessonId: input.lessonId || null,
    status: 'active',
    lastMessageAt: now(),
    metadata: { promptVersion: 'academy_tutor_v1' },
    createdAt: now(),
    updatedAt: now(),
  }), { merge: true });
  batch.set(userRef, userDoc);
  batch.set(assistantRef, assistantDoc);
  await batch.commit();
  return { userMessage: serialize(userDoc as any), assistantMessage: serialize(assistantDoc as any) };
}

export async function listAcademyTutorMessages(input: {
  userId: string;
  courseId: string;
  lessonId?: string | null;
}) {
  const sessionId = `${input.userId}_${input.courseId}_${input.lessonId || 'course'}`;
  const snap = await collection('tutorMessages')
    .where('sessionId', '==', sessionId)
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get();
  return snap.docs.map((doc) => serialize({ tutorMessageId: doc.id, ...doc.data() } as AcademyTutorMessageDoc));
}

export async function listAcademyCertificatesForUser(userId: string) {
  const snap = await collection('certificates')
    .where('userId', '==', userId)
    .orderBy('issuedAt', 'desc')
    .limit(100)
    .get();
  return snap.docs.map((doc) => serialize({ certificateId: doc.id, ...doc.data() } as AcademyCertificateDoc));
}

export async function getAcademyDashboardIntegration(userId: string) {
  const [enrollmentsSnap, progressSnap, submissionsSnap, certificatesSnap, attendanceSnap] = await Promise.all([
    collection('enrollments').where('userId', '==', userId).limit(20).get(),
    collection('progress').where('userId', '==', userId).limit(1000).get(),
    collection('activitySubmissions').where('userId', '==', userId).orderBy('submittedAt', 'desc').limit(20).get(),
    collection('certificates').where('userId', '==', userId).limit(20).get(),
    collection('sessionAttendance').where('userId', '==', userId).limit(100).get(),
  ]);
  const enrollments = enrollmentsSnap.docs.map((doc) => serialize({ enrollmentId: doc.id, ...doc.data() } as AcademyEnrollmentDoc));
  const courseIds = Array.from(new Set(enrollments.map((item) => item.courseId))).slice(0, 20);
  const courseSnaps = await Promise.all(courseIds.map((courseId) => collection('courses').doc(courseId).get()));
  const courses = new Map(courseSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, serialize({ courseId: snap.id, ...snap.data() } as AcademyCourseDoc)]));
  const nextEnrollment = [...enrollments].sort((a, b) => (b.lastAccessedAt ? new Date(String(b.lastAccessedAt)).getTime() : 0) - (a.lastAccessedAt ? new Date(String(a.lastAccessedAt)).getTime() : 0))[0] || null;
  const nextCourse = nextEnrollment ? courses.get(nextEnrollment.courseId) || null : null;
  let nextLesson: AcademyLessonDoc | null = null;
  if (nextEnrollment) {
    const lessonsSnap = await collection('lessons').where('courseId', '==', nextEnrollment.courseId).where('status', '==', 'published').orderBy('sortOrder', 'asc').limit(100).get();
    const completedLessons = new Set(progressSnap.docs.map((doc) => doc.data()).filter((item) => item.completed && item.lessonId).map((item) => item.lessonId));
    nextLesson = lessonsSnap.docs.map((doc) => serialize({ lessonId: doc.id, ...doc.data() } as AcademyLessonDoc)).find((lesson) => !completedLessons.has(lesson.lessonId)) || null;
  }
  const pendingReviews = submissionsSnap.docs.map((doc) => ({ submissionId: doc.id, ...doc.data() } as AcademyActivitySubmissionDoc)).filter((item) => ['submitted', 'needs_revision'].includes(item.status));
  const completedTopicCount = progressSnap.docs.map((doc) => doc.data()).filter((item) => item.completed && item.topicId && !item.lessonId).length;
  const completedLessonCount = progressSnap.docs.map((doc) => doc.data()).filter((item) => item.completed && item.lessonId).length;
  return {
    coursesEnrolled: enrollments.length,
    lessonsCompleted: completedLessonCount,
    topicsCompleted: completedTopicCount,
    activitySubmissions: submissionsSnap.size,
    certificatesEarned: certificatesSnap.size,
    cohortParticipation: enrollments.filter((item) => item.cohortId).length,
    liveSessionAttendance: attendanceSnap.size,
    pendingActivityReviews: pendingReviews.length,
    currentCertificationProgress: nextEnrollment?.progressPercent || 0,
    continueLearning: nextEnrollment && nextCourse ? {
      courseId: nextCourse.courseId,
      courseSlug: nextCourse.slug,
      courseTitle: nextCourse.title,
      progressPercent: nextEnrollment.progressPercent,
      nextLessonId: nextLesson?.lessonId || null,
      nextLessonTitle: nextLesson?.title || null,
      href: nextLesson ? `/academy/${nextCourse.slug}/learn/${nextLesson.lessonId}` : `/academy/${nextCourse.slug}`,
    } : null,
    certificates: certificatesSnap.docs.map((doc) => serialize({ certificateId: doc.id, ...doc.data() } as AcademyCertificateDoc)),
    learningStreak: await getAcademyLearningStreak(userId),
  };
}

async function getAcademyLearningStreak(userId: string) {
  const snap = await adminDb.collection('users').doc(userId).collection('xpEvents')
    .where('type', '==', 'academy')
    .orderBy('createdAt', 'desc')
    .limit(60)
    .get()
    .catch(() => null);
  if (!snap) return 0;
  const days = new Set(snap.docs.map((doc) => String(doc.data().dateString || '').slice(0, 10)).filter(Boolean));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function getAdminAcademyAnalytics(courseId: string) {
  const [
    course,
    enrollmentsSnap,
    lessonsSnap,
    progressSnap,
    submissionsSnap,
    quizAttemptsSnap,
    examAttemptsSnap,
    certificatesSnap,
    attendanceSnap,
    discussionsSnap,
    tutorMessagesSnap,
    cohortsSnap,
  ] = await Promise.all([
    getAcademyCourse(courseId),
    collection('enrollments').where('courseId', '==', courseId).limit(1000).get(),
    collection('lessons').where('courseId', '==', courseId).limit(1000).get(),
    collection('progress').where('courseId', '==', courseId).limit(3000).get(),
    collection('activitySubmissions').where('courseId', '==', courseId).limit(1000).get(),
    collection('quizAttempts').where('courseId', '==', courseId).limit(1000).get(),
    collection('examAttempts').where('courseId', '==', courseId).limit(500).get(),
    collection('certificates').where('courseId', '==', courseId).limit(500).get(),
    collection('sessionAttendance').where('courseId', '==', courseId).limit(1000).get(),
    collection('lessonDiscussions').where('courseId', '==', courseId).limit(1000).get(),
    collection('tutorMessages').where('courseId', '==', courseId).limit(1000).get(),
    collection('cohorts').where('courseId', '==', courseId).limit(200).get(),
  ]);
  const enrollments = enrollmentsSnap.docs.map((doc) => doc.data() as AcademyEnrollmentDoc);
  const quizAttempts = quizAttemptsSnap.docs.map((doc) => doc.data() as AcademyQuizAttemptDoc);
  const examAttempts = examAttemptsSnap.docs.map((doc) => doc.data() as AcademyExamAttemptDoc);
  const lessons = lessonsSnap.docs.map((doc) => ({ lessonId: doc.id, ...doc.data() } as AcademyLessonDoc));
  const progress = progressSnap.docs.map((doc) => doc.data() as AcademyProgressDoc);
  const lessonCompletion = new Map<string, number>();
  for (const item of progress.filter((entry) => entry.completed && entry.lessonId)) {
    lessonCompletion.set(item.lessonId!, (lessonCompletion.get(item.lessonId!) || 0) + 1);
  }
  const slowestModules = lessons
    .map((lesson) => ({ lessonId: lesson.lessonId, title: lesson.title, completions: lessonCompletion.get(lesson.lessonId) || 0 }))
    .sort((a, b) => a.completions - b.completions)
    .slice(0, 8);
  const completionRate = enrollments.length ? Math.round((enrollments.filter((item) => item.status === 'completed').length / enrollments.length) * 100) : 0;
  const quizPassRate = quizAttempts.length ? Math.round((quizAttempts.filter((item) => item.passed).length / quizAttempts.length) * 100) : 0;
  const examPassRate = examAttempts.length ? Math.round((examAttempts.filter((item) => item.passed).length / examAttempts.length) * 100) : 0;
  const scores = [...quizAttempts.map((item) => item.score), ...examAttempts.map((item) => item.score)].filter((value) => typeof value === 'number');
  const averageScore = scores.length ? Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length) : 0;
  return {
    course,
    metrics: {
      enrollments: enrollments.length,
      completionRate,
      dropOffLessons: slowestModules,
      topicCompletions: progress.filter((item) => item.completed && item.topicId && !item.lessonId).length,
      quizPassRate,
      examPassRate,
      averageScore,
      certificatesIssued: certificatesSnap.size,
      activeLearners: enrollments.filter((item) => item.status === 'active').length,
      activityCompletion: submissionsSnap.size,
      pendingReviews: submissionsSnap.docs.filter((doc) => doc.data().status === 'submitted').length,
      liveClassAttendance: attendanceSnap.size,
      discussionActivity: discussionsSnap.size,
      aiTutorUsage: tutorMessagesSnap.size,
      cohortPerformance: cohortsSnap.docs.map((doc) => {
        const cohort = { cohortId: doc.id, ...doc.data() } as AcademyCohortDoc;
        const cohortEnrollments = enrollments.filter((item) => item.cohortId === cohort.cohortId);
        return { cohortId: cohort.cohortId, title: cohort.title, enrollments: cohortEnrollments.length, completed: cohortEnrollments.filter((item) => item.status === 'completed').length };
      }),
      mostPopularCourses: [{ courseId, title: course?.title || courseId, enrollments: enrollments.length }],
      slowestModules,
    },
  };
}

export async function verifyAcademyCertificate(certificateId: string) {
  const snap = await collection('certificates').doc(certificateId).get();
  if (!snap.exists) return null;
  const certificate = serialize({ certificateId: snap.id, ...snap.data() } as AcademyCertificateDoc);
  if (certificate.status !== 'active') return null;
  return certificate;
}

export async function updateAcademyCourse(courseId: string, input: Partial<AcademyCourseDoc>) {
  const existing = await getAcademyCourse(courseId);
  if (!existing) throw new Error('Academy course not found');
  const status = input.status || existing.status;
  const patch = stripUndefined({
    title: input.title !== undefined ? sanitizeAcademyString(input.title, 180) : undefined,
    slug: input.slug !== undefined ? sanitizeAcademyString(input.slug, 140) : undefined,
    description: input.description !== undefined ? sanitizeAcademyText(input.description, 12000) : undefined,
    thumbnailUrl: input.thumbnailUrl,
    promoVideoUrl: input.promoVideoUrl,
    level: input.level,
    category: input.category !== undefined ? sanitizeAcademyString(input.category, 120) : undefined,
    status,
    visibility: input.visibility,
    estimatedDuration: input.estimatedDuration,
    certificateEnabled: input.certificateEnabled,
    finalExamEnabled: input.finalExamEnabled,
    discussionEnabled: input.discussionEnabled,
    aiTutorEnabled: input.aiTutorEnabled,
    cohortEnabled: input.cohortEnabled,
    dripEnabled: input.dripEnabled,
    manualReviewEnabled: input.manualReviewEnabled,
    nextSteps: input.nextSteps,
    recommendedCourseIds: input.recommendedCourseIds,
    publishedAt: status === 'published' && !existing.publishedAt ? now() : input.publishedAt,
    updatedAt: now(),
  });

  validateAcademyCourse({ ...existing, ...patch } as Partial<AcademyCourseDoc>, { partial: false });
  await collection('courses').doc(courseId).set(patch, { merge: true });
  if (existing.status !== 'published' && status === 'published') {
    await notifyAcademyAudience({
      title: 'New Academy course available',
      body: `${patch.title || existing.title} is now available in SDC Academy.`,
      linkUrl: `/academy/${patch.slug || existing.slug}`,
      metadata: { courseId, type: 'new_course_announcement' },
    });
  }
  return getAcademyCourse(courseId);
}

export async function deleteAcademyCourse(courseId: string) {
  await collection('courses').doc(courseId).set({ status: 'archived', updatedAt: now() }, { merge: true });
}

export async function setAcademyCourseStatus(courseId: string, status: AcademyCourseStatus) {
  return updateAcademyCourse(courseId, { status });
}

export async function createAcademyTopic(input: Partial<AcademyTopicDoc>) {
  const ref = collection('topics').doc();
  const doc = stripUndefined({
    ...buildAcademyTopicDraft({
      topicId: ref.id,
      courseId: input.courseId || '',
      title: input.title || '',
      description: input.description,
      sortOrder: input.sortOrder ?? 0,
      unlockRule: input.unlockRule,
      quizRequired: input.quizRequired,
      dripDelayDays: input.dripDelayDays,
    }),
    availableAt: input.availableAt || null,
    createdAt: now(),
    updatedAt: now(),
  });
  validateAcademyTopic(doc as Partial<AcademyTopicDoc>);
  await ref.set(doc);
  return serialize(doc as AcademyTopicDoc);
}

export async function updateAcademyTopic(topicId: string, input: Partial<AcademyTopicDoc>) {
  const snap = await collection('topics').doc(topicId).get();
  if (!snap.exists) throw new Error('Academy topic not found');
  const existing = { topicId: snap.id, ...snap.data() } as AcademyTopicDoc;
  const patch = stripUndefined({
    title: input.title !== undefined ? sanitizeAcademyString(input.title, 180) : undefined,
    description: input.description !== undefined ? sanitizeAcademyText(input.description, 8000) : undefined,
    sortOrder: input.sortOrder,
    unlockRule: input.unlockRule,
    quizRequired: input.quizRequired,
    dripDelayDays: input.dripDelayDays,
    availableAt: input.availableAt,
    updatedAt: now(),
  });
  validateAcademyTopic({ ...existing, ...patch } as Partial<AcademyTopicDoc>, { partial: false });
  await collection('topics').doc(topicId).set(patch, { merge: true });
  const updated = await collection('topics').doc(topicId).get();
  return serialize({ topicId: updated.id, ...updated.data() } as AcademyTopicDoc);
}

export async function createAcademyLesson(input: Partial<AcademyLessonDoc>) {
  const ref = collection('lessons').doc();
  const doc = stripUndefined({
    ...buildAcademyLessonDraft({
      lessonId: ref.id,
      courseId: input.courseId || '',
      topicId: input.topicId || '',
      title: input.title || '',
      lessonType: input.lessonType,
      status: input.status,
      sortOrder: input.sortOrder ?? 0,
      videoUrl: input.videoUrl,
      imageUrls: input.imageUrls,
      writtenContent: input.writtenContent,
      transcript: input.transcript,
      durationMinutes: input.durationMinutes,
      activityRequired: input.activityRequired,
      discussionEnabled: input.discussionEnabled,
      aiTutorEnabled: input.aiTutorEnabled,
      keyTakeaways: input.keyTakeaways,
    }),
    createdAt: now(),
    updatedAt: now(),
  });
  validateAcademyLesson(doc as Partial<AcademyLessonDoc>);
  await ref.set(doc);
  return serialize(doc as AcademyLessonDoc);
}

export async function updateAcademyLesson(lessonId: string, input: Partial<AcademyLessonDoc>) {
  const snap = await collection('lessons').doc(lessonId).get();
  if (!snap.exists) throw new Error('Academy lesson not found');
  const existing = { lessonId: snap.id, ...snap.data() } as AcademyLessonDoc;
  const patch = stripUndefined({
    title: input.title !== undefined ? sanitizeAcademyString(input.title, 180) : undefined,
    lessonType: input.lessonType,
    videoUrl: input.videoUrl,
    imageUrls: input.imageUrls,
    writtenContent: input.writtenContent,
    transcript: input.transcript,
    durationMinutes: input.durationMinutes,
    sortOrder: input.sortOrder,
    activityRequired: input.activityRequired,
    discussionEnabled: input.discussionEnabled,
    aiTutorEnabled: input.aiTutorEnabled,
    keyTakeaways: input.keyTakeaways,
    status: input.status,
    updatedAt: now(),
  });
  validateAcademyLesson({ ...existing, ...patch } as Partial<AcademyLessonDoc>, { partial: false });
  await collection('lessons').doc(lessonId).set(patch, { merge: true });
  const updated = await collection('lessons').doc(lessonId).get();
  return serialize({ lessonId: updated.id, ...updated.data() } as AcademyLessonDoc);
}

export async function createAcademyCohort(input: Partial<AcademyCohortDoc>) {
  const ref = collection('cohorts').doc();
  const doc = stripUndefined({
    cohortId: ref.id,
    courseId: input.courseId || '',
    title: sanitizeAcademyString(input.title, 180),
    description: sanitizeAcademyText(input.description || '', 4000),
    startDate: input.startDate || new Date().toISOString(),
    endDate: input.endDate || null,
    capacity: input.capacity ?? null,
    status: input.status || 'draft',
    enrolledUserIds: input.enrolledUserIds || [],
    createdAt: now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return serialize(doc as AcademyCohortDoc);
}

export async function createAcademyLiveSession(input: Partial<AcademyLiveSessionDoc>) {
  const ref = collection('liveSessions').doc();
  const doc = stripUndefined({
    liveSessionId: ref.id,
    courseId: input.courseId || '',
    cohortId: input.cohortId || null,
    topicId: input.topicId || null,
    title: sanitizeAcademyString(input.title, 180),
    description: sanitizeAcademyText(input.description || '', 4000),
    provider: input.provider || 'custom',
    meetingUrl: input.meetingUrl || '',
    startsAt: input.startsAt || new Date().toISOString(),
    endsAt: input.endsAt || input.startsAt || new Date().toISOString(),
    recordingUrl: input.recordingUrl || null,
    materials: input.materials || [],
    status: input.status || 'scheduled',
    createdAt: now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  await notifyAcademyAudience({
    courseId: input.courseId || '',
    title: 'Upcoming Academy live class',
    body: `${doc.title} has been scheduled. Add it to your calendar so you do not miss it.`,
    linkUrl: '/academy',
    metadata: { courseId: input.courseId || '', liveSessionId: ref.id, type: 'live_class_reminder' },
  });
  return serialize(doc as AcademyLiveSessionDoc);
}

export async function markAcademyLiveSessionAttendance(input: {
  userId: string;
  courseId: string;
  liveSessionId: string;
  action: 'join' | 'replay';
}) {
  const [enrollment, sessionSnap] = await Promise.all([
    getAcademyEnrollment(input.userId, input.courseId),
    collection('liveSessions').doc(input.liveSessionId).get(),
  ]);
  if (!enrollment) throw new Error('Academy enrollment required');
  if (!sessionSnap.exists) throw new Error('Academy live session not found');
  const session = { liveSessionId: sessionSnap.id, ...sessionSnap.data() } as AcademyLiveSessionDoc;
  if (session.courseId !== input.courseId) throw new Error('Academy live session mismatch');

  const attendanceId = `${input.userId}_${input.liveSessionId}`;
  const patch = input.action === 'replay'
    ? {
        replayWatchedAt: now(),
        lastSeenAt: now(),
        status: 'attended',
      }
    : {
        joinedAt: now(),
        lastSeenAt: now(),
        status: 'joined',
      };

  await collection('sessionAttendance').doc(attendanceId).set(stripUndefined({
    attendanceId,
    courseId: input.courseId,
    liveSessionId: input.liveSessionId,
    userId: input.userId,
    cohortId: session.cohortId || null,
    ...patch,
    metadata: {
      provider: session.provider,
    },
    createdAt: now(),
    updatedAt: now(),
  }), { merge: true });

  await awardAcademyXP({
    userId: input.userId,
    action: 'academy_live_session_attended',
    resourceId: input.liveSessionId,
    metadata: { courseId: input.courseId, liveSessionId: input.liveSessionId, action: input.action },
  });

  const updated = await collection('sessionAttendance').doc(attendanceId).get();
  return serialize({ attendanceId: updated.id, ...updated.data() } as AcademySessionAttendanceDoc);
}

export async function createAcademyDripSchedule(input: Partial<AcademyDripScheduleDoc>) {
  const ref = collection('dripSchedules').doc();
  const doc = stripUndefined({
    dripScheduleId: ref.id,
    courseId: input.courseId || '',
    topicId: input.topicId || null,
    lessonId: input.lessonId || null,
    cohortId: input.cohortId || null,
    availableAt: input.availableAt || null,
    delayDays: input.delayDays ?? null,
    unlockCondition: input.unlockCondition || 'immediate',
    createdAt: now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return serialize(doc as AcademyDripScheduleDoc);
}

export async function listAcademyDripSchedules(courseId: string) {
  const snap = await collection('dripSchedules').where('courseId', '==', courseId).limit(500).get();
  return snap.docs.map((doc) => serialize({ dripScheduleId: doc.id, ...doc.data() } as AcademyDripScheduleDoc));
}

type ImportPreviewLesson = { title: string; lessonType?: 'written' | 'video' | 'image' | 'mixed'; writtenContent?: string };
type ImportPreviewTopic = { title: string; description?: string; lessons: ImportPreviewLesson[] };
type ImportPreviewCourse = { title: string; description: string; category?: string; level?: string; topics: ImportPreviewTopic[] };

export async function previewAcademyImport(input: {
  adminId: string;
  sourceType: AcademyImportDoc['sourceType'];
  sourceName?: string;
  source: string;
}) {
  const preview = parseAcademyImportSource(input.source, input.sourceType);
  const validationErrors = validateImportPreview(preview);
  const ref = collection('imports').doc();
  const doc = stripUndefined({
    importId: ref.id,
    createdBy: input.adminId,
    status: validationErrors.length ? 'validated' : 'draft',
    sourceType: input.sourceType,
    sourceName: input.sourceName || null,
    preview,
    createdCourseId: null,
    error: null,
    validationErrors,
    createdAt: now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return serialize(doc as AcademyImportDoc);
}

export async function confirmAcademyImport(importId: string, adminId: string) {
  const snap = await collection('imports').doc(importId).get();
  if (!snap.exists) throw new Error('Academy import not found');
  const importDoc = { importId: snap.id, ...snap.data() } as AcademyImportDoc;
  if (importDoc.createdBy !== adminId) throw new Error('Academy import owner mismatch');
  if (importDoc.createdCourseId) return serialize(importDoc);
  const preview = importDoc.preview as ImportPreviewCourse | undefined;
  const validationErrors = validateImportPreview(preview);
  if (validationErrors.length) throw new Error(validationErrors[0]);
  const course = await createAcademyCourse({
    title: preview!.title,
    description: preview!.description,
    category: preview!.category || 'Imported',
    level: (preview!.level as any) || 'beginner',
    status: 'draft',
    visibility: 'enrolled_only',
    thumbnailUrl: '',
    estimatedDuration: 0,
  }, adminId);
  if (!course) throw new Error('Unable to create imported course');
  for (const [topicIndex, topic] of preview!.topics.entries()) {
    const createdTopic = await createAcademyTopic({
      courseId: course.courseId,
      title: topic.title,
      description: topic.description || '',
      sortOrder: topicIndex,
      unlockRule: 'topic_quiz_passed',
      quizRequired: true,
    });
    for (const [lessonIndex, lesson] of topic.lessons.entries()) {
      await createAcademyLesson({
        courseId: course.courseId,
        topicId: createdTopic.topicId,
        title: lesson.title,
        lessonType: lesson.lessonType || 'written',
        writtenContent: lesson.writtenContent || 'Draft lesson content. Replace this with the full written, video, image, or mixed lesson.',
        sortOrder: lessonIndex,
        status: 'draft',
        activityRequired: false,
        discussionEnabled: true,
        aiTutorEnabled: true,
        keyTakeaways: [],
      });
    }
  }
  await collection('imports').doc(importId).set({
    status: 'imported',
    createdCourseId: course.courseId,
    confirmedAt: now(),
    updatedAt: now(),
  }, { merge: true });
  const updated = await collection('imports').doc(importId).get();
  return serialize({ importId: updated.id, ...updated.data() } as AcademyImportDoc);
}

function parseAcademyImportSource(source: string, sourceType: AcademyImportDoc['sourceType']): ImportPreviewCourse {
  const trimmed = sanitizeAcademyText(source, 250_000);
  if (!trimmed) return { title: '', description: '', topics: [] };
  if (sourceType === 'json') {
    const parsed = JSON.parse(trimmed);
    return normalizeImportPreview(parsed);
  }
  if (sourceType === 'csv') return parseCsvImport(trimmed);
  return parseOutlineImport(trimmed);
}

function normalizeImportPreview(input: any): ImportPreviewCourse {
  const course = input.course || input;
  return {
    title: sanitizeAcademyString(course.title || course.name, 180),
    description: sanitizeAcademyText(course.description || 'Imported draft course.', 12000),
    category: sanitizeAcademyString(course.category || 'Imported', 120),
    level: sanitizeAcademyString(course.level || 'beginner', 40),
    topics: (course.topics || course.modules || []).map((topic: any) => ({
      title: sanitizeAcademyString(topic.title || topic.name, 180),
      description: sanitizeAcademyText(topic.description || '', 4000),
      lessons: (topic.lessons || []).map((lesson: any) => ({
        title: sanitizeAcademyString(lesson.title || lesson.name, 180),
        lessonType: lesson.lessonType || lesson.type || 'written',
        writtenContent: sanitizeAcademyText(lesson.writtenContent || lesson.content || '', 50000),
      })),
    })),
  };
}

function parseCsvImport(source: string): ImportPreviewCourse {
  const topics = new Map<string, ImportPreviewLesson[]>();
  for (const line of source.split('\n').map((item) => item.trim()).filter(Boolean)) {
    const [topicTitle, lessonTitle, lessonType] = line.split(',').map((item) => item.trim());
    if (!topicTitle || !lessonTitle || topicTitle.toLowerCase() === 'topic') continue;
    topics.set(topicTitle, [...(topics.get(topicTitle) || []), { title: lessonTitle, lessonType: (lessonType as any) || 'written' }]);
  }
  return {
    title: 'Imported Academy Course',
    description: 'Imported draft course.',
    category: 'Imported',
    level: 'beginner',
    topics: Array.from(topics.entries()).map(([title, lessons]) => ({ title, lessons })),
  };
}

function parseOutlineImport(source: string): ImportPreviewCourse {
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
  let title = lines.find((line) => line.startsWith('# '))?.replace(/^#\s*/, '') || 'Imported Academy Course';
  const topics: ImportPreviewTopic[] = [];
  let currentTopic: ImportPreviewTopic | null = null;
  let currentLesson: ImportPreviewLesson | null = null;
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.replace(/^#\s*/, '');
    } else if (line.startsWith('## ')) {
      currentTopic = { title: line.replace(/^##\s*/, ''), lessons: [] };
      topics.push(currentTopic);
      currentLesson = null;
    } else if (line.startsWith('### ') || /^lesson\s+\d+/i.test(line)) {
      if (!currentTopic) {
        currentTopic = { title: 'Imported Topic', lessons: [] };
        topics.push(currentTopic);
      }
      currentLesson = { title: line.replace(/^###\s*/, '').replace(/^lesson\s+\d+[:.)-]?\s*/i, ''), lessonType: 'written', writtenContent: '' };
      currentTopic.lessons.push(currentLesson);
    } else if (currentLesson) {
      currentLesson.writtenContent = [currentLesson.writtenContent, line].filter(Boolean).join('\n\n');
    }
  }
  return { title, description: 'Imported draft course.', category: 'Imported', level: 'beginner', topics };
}

function validateImportPreview(preview?: ImportPreviewCourse) {
  const errors: string[] = [];
  if (!preview?.title) errors.push('Course title is required.');
  if (!preview?.description) errors.push('Course description is required.');
  if (!preview?.topics?.length) errors.push('At least one topic is required.');
  for (const [index, topic] of (preview?.topics || []).entries()) {
    if (!topic.title) errors.push(`Topic ${index + 1} needs a title.`);
    if (!topic.lessons?.length) errors.push(`Topic ${index + 1} needs at least one lesson.`);
  }
  return errors;
}
