import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  ACADEMY_COLLECTIONS,
  type AcademyCertificateDoc,
  type AcademyActivityDoc,
  type AcademyActivitySubmissionDoc,
  type AcademyCohortDoc,
  type AcademyCourseDoc,
  type AcademyCourseStatus,
  type AcademyLessonDoc,
  type AcademyLiveSessionDoc,
  type AcademyManualReviewDoc,
  type AcademyTopicDoc,
} from './types';
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

function serialize<T extends Record<string, any>>(doc: FirestoreDoc<T>) {
  const copy: Record<string, any> = { ...doc };
  for (const key of ['createdAt', 'updatedAt', 'publishedAt', 'availableAt', 'startDate', 'endDate', 'startsAt', 'endsAt', 'submittedAt', 'reviewedAt']) {
    if (key in copy) copy[key] = toIso(copy[key]);
  }
  return copy as T;
}

function collection(name: keyof typeof ACADEMY_COLLECTIONS) {
  return adminDb.collection(ACADEMY_COLLECTIONS[name]);
}

export async function listAcademyCourses(options: { includeArchived?: boolean; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  let query: FirebaseFirestore.Query = collection('courses').orderBy('updatedAt', 'desc').limit(limit);
  if (!options.includeArchived) {
    query = query.where('status', 'in', ['draft', 'published']);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => serialize({ courseId: doc.id, ...doc.data() } as AcademyCourseDoc));
}

export async function listPublishedAcademyCourses(options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  const snap = await collection('courses')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc) => serialize({ courseId: doc.id, ...doc.data() } as AcademyCourseDoc));
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
  const [course, topicsSnap, lessonsSnap, activitiesSnap, cohortsSnap, sessionsSnap] = await Promise.all([
    getAcademyCourse(courseId),
    collection('topics').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get(),
    collection('lessons').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get(),
    collection('activities').where('courseId', '==', courseId).orderBy('sortOrder', 'asc').get(),
    collection('cohorts').where('courseId', '==', courseId).orderBy('createdAt', 'desc').limit(100).get(),
    collection('liveSessions').where('courseId', '==', courseId).orderBy('startsAt', 'asc').limit(100).get(),
  ]);

  if (!course) return null;

  return {
    course,
    topics: topicsSnap.docs.map((doc) => serialize({ topicId: doc.id, ...doc.data() } as AcademyTopicDoc)),
    lessons: lessonsSnap.docs.map((doc) => serialize({ lessonId: doc.id, ...doc.data() } as AcademyLessonDoc)),
    activities: activitiesSnap.docs.map((doc) => serialize({ activityId: doc.id, ...doc.data() } as AcademyActivityDoc)),
    cohorts: cohortsSnap.docs.map((doc) => serialize({ cohortId: doc.id, ...doc.data() } as AcademyCohortDoc)),
    liveSessions: sessionsSnap.docs.map((doc) => serialize({ liveSessionId: doc.id, ...doc.data() } as AcademyLiveSessionDoc)),
  };
}

export async function getLearnerAcademyBundle(slug: string, userId?: string) {
  const bundle = await getAcademyCourseBundleBySlug(slug);
  if (!bundle) return null;

  const [enrollment, progressSnap] = await Promise.all([
    userId ? getAcademyEnrollment(userId, bundle.course.courseId) : Promise.resolve(null),
    userId
      ? collection('progress').where('userId', '==', userId).where('courseId', '==', bundle.course.courseId).limit(1000).get()
      : Promise.resolve(null),
  ]);

  const progress = progressSnap
    ? progressSnap.docs.map((doc) => serialize({ progressId: doc.id, ...doc.data() } as any))
    : [];

  return {
    ...bundle,
    enrollment,
    progress,
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
  const updated = await collection('activitySubmissions').doc(submissionId).get();
  return serialize({ submissionId: updated.id, ...updated.data() } as AcademyActivitySubmissionDoc);
}

export async function listAcademyLessonDiscussions(courseId: string, lessonId: string) {
  const snap = await collection('lessonDiscussions')
    .where('courseId', '==', courseId)
    .where('lessonId', '==', lessonId)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((doc) => serialize({ discussionId: doc.id, ...doc.data() } as any));
}

export async function createAcademyLessonDiscussion(input: {
  userId: string;
  courseId: string;
  topicId: string;
  lessonId: string;
  body: string;
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
    createdAt: now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return serialize(doc as any);
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
  const userRef = collection('tutorMessages').doc();
  const assistantRef = collection('tutorMessages').doc();
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
  const assistantDoc = stripUndefined({
    tutorMessageId: assistantRef.id,
    sessionId,
    userId: input.userId,
    courseId: input.courseId,
    topicId: input.topicId || null,
    lessonId: input.lessonId || null,
    role: 'assistant',
    content: 'I saved your question for the Academy AI Tutor. Full contextual AI responses will be powered by the SDC AI platform in the AI Tutor phase.',
    aiRequestId: null,
    metadata: { phase: 'academy-phase-3-placeholder-response' },
    createdAt: now(),
    updatedAt: now(),
  });
  const batch = adminDb.batch();
  batch.set(userRef, userDoc);
  batch.set(assistantRef, assistantDoc);
  await batch.commit();
  return { userMessage: serialize(userDoc as any), assistantMessage: serialize(assistantDoc as any) };
}

export async function listAcademyCertificatesForUser(userId: string) {
  const snap = await collection('certificates')
    .where('userId', '==', userId)
    .orderBy('issuedAt', 'desc')
    .limit(100)
    .get();
  return snap.docs.map((doc) => serialize({ certificateId: doc.id, ...doc.data() } as AcademyCertificateDoc));
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
  return serialize(doc as AcademyLiveSessionDoc);
}
