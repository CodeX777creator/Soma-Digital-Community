export const ACADEMY_COLLECTIONS = {
  courses: 'academyCourses',
  coursePurchases: 'academyCoursePurchases',
  courseCheckoutSessions: 'academyCourseCheckoutSessions',
  courseEntitlements: 'academyCourseEntitlements',
  mrrPurchases: 'academyMrrPurchases',
  mrrEligibility: 'academyMrrEligibility',
  topics: 'academyTopics',
  lessons: 'academyLessons',
  activities: 'academyActivities',
  activitySubmissions: 'academyActivitySubmissions',
  quizzes: 'academyQuizzes',
  quizAttempts: 'academyQuizAttempts',
  quizResponses: 'academyQuizResponses',
  examAttempts: 'academyExamAttempts',
  enrollments: 'academyEnrollments',
  progress: 'academyProgress',
  certificates: 'academyCertificates',
  recommendations: 'academyRecommendations',
  cohorts: 'academyCohorts',
  liveSessions: 'academyLiveSessions',
  sessionAttendance: 'academySessionAttendance',
  lessonDiscussions: 'academyLessonDiscussions',
  discussionReplies: 'academyDiscussionReplies',
  discussionReactions: 'academyDiscussionReactions',
  dripSchedules: 'academyDripSchedules',
  manualReviews: 'academyManualReviews',
  tutorSessions: 'academyTutorSessions',
  tutorMessages: 'academyTutorMessages',
  imports: 'academyImports',
} as const;

export const ACADEMY_FINAL_EXAM_TOPIC_ID = '__final_exam__';

export type AcademyCollectionKey = keyof typeof ACADEMY_COLLECTIONS;
export type AcademyCollectionName = (typeof ACADEMY_COLLECTIONS)[AcademyCollectionKey];

export const ACADEMY_COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export type AcademyCourseStatus = (typeof ACADEMY_COURSE_STATUSES)[number];

export const ACADEMY_COURSE_VISIBILITIES = ['public', 'enrolled_only', 'cohort_only'] as const;
export type AcademyCourseVisibility = (typeof ACADEMY_COURSE_VISIBILITIES)[number];

export const ACADEMY_COURSE_LEVELS = ['beginner', 'intermediate', 'advanced', 'all_levels'] as const;
export type AcademyCourseLevel = (typeof ACADEMY_COURSE_LEVELS)[number];

export const ACADEMY_COURSE_PRICING_TYPES = ['free', 'paid', 'included_with_plan', 'promo_only'] as const;
export type AcademyCoursePricingType = (typeof ACADEMY_COURSE_PRICING_TYPES)[number];

export const ACADEMY_INCLUDED_PLAN_IDS = ['explorer', 'pro', 'elite', 'enterprise'] as const;
export type AcademyIncludedPlanId = (typeof ACADEMY_INCLUDED_PLAN_IDS)[number];

export const ACADEMY_TOPIC_UNLOCK_RULES = [
  'immediate',
  'lesson_completion',
  'topic_quiz_passed',
  'manual_approval',
  'date_based',
  'cohort_schedule',
] as const;
export type AcademyUnlockRule = (typeof ACADEMY_TOPIC_UNLOCK_RULES)[number];

export const ACADEMY_LESSON_TYPES = ['video', 'image', 'written', 'mixed'] as const;
export type AcademyLessonType = (typeof ACADEMY_LESSON_TYPES)[number];

export const ACADEMY_LESSON_STATUSES = ['draft', 'published', 'archived'] as const;
export type AcademyLessonStatus = (typeof ACADEMY_LESSON_STATUSES)[number];

export const ACADEMY_ACTIVITY_TYPES = [
  'reflection',
  'short_text',
  'long_text',
  'q_and_a',
  'multiple_choice',
  'checkboxes',
  'file_upload',
  'link_submission',
  'project_submission',
] as const;
export type AcademyActivityType = (typeof ACADEMY_ACTIVITY_TYPES)[number];

export const ACADEMY_ACTIVITY_SUBMISSION_STATUSES = [
  'submitted',
  'reviewed',
  'needs_revision',
  'approved',
  'rejected',
] as const;
export type AcademyActivitySubmissionStatus = (typeof ACADEMY_ACTIVITY_SUBMISSION_STATUSES)[number];

export const ACADEMY_QUESTION_TYPES = [
  'multiple_choice',
  'true_false',
  'multi_select',
  'short_answer',
  'scenario_based',
] as const;
export type AcademyQuestionType = (typeof ACADEMY_QUESTION_TYPES)[number];

export const ACADEMY_ATTEMPT_STATUSES = [
  'in_progress',
  'submitted',
  'passed',
  'failed',
  'expired',
] as const;
export type AcademyAttemptStatus = (typeof ACADEMY_ATTEMPT_STATUSES)[number];

export const ACADEMY_ENROLLMENT_STATUSES = ['active', 'completed', 'cancelled', 'expired'] as const;
export type AcademyEnrollmentStatus = (typeof ACADEMY_ENROLLMENT_STATUSES)[number];

export const ACADEMY_CERTIFICATE_STATUSES = ['active', 'revoked'] as const;
export type AcademyCertificateStatus = (typeof ACADEMY_CERTIFICATE_STATUSES)[number];

export const ACADEMY_COHORT_STATUSES = ['draft', 'open', 'active', 'completed', 'cancelled'] as const;
export type AcademyCohortStatus = (typeof ACADEMY_COHORT_STATUSES)[number];

export const ACADEMY_LIVE_SESSION_STATUSES = ['scheduled', 'live', 'completed', 'cancelled'] as const;
export type AcademyLiveSessionStatus = (typeof ACADEMY_LIVE_SESSION_STATUSES)[number];

export const ACADEMY_MEETING_PROVIDERS = ['zoom', 'google_meet', 'custom'] as const;
export type AcademyMeetingProvider = (typeof ACADEMY_MEETING_PROVIDERS)[number];

export const ACADEMY_IMPORT_STATUSES = ['draft', 'validated', 'imported', 'failed'] as const;
export type AcademyImportStatus = (typeof ACADEMY_IMPORT_STATUSES)[number];

export type AcademyTimestamp = string | Date | { toDate?: () => Date; seconds?: number } | null;

export interface AcademyBaseDoc {
  createdAt?: AcademyTimestamp;
  updatedAt?: AcademyTimestamp;
}

export interface AcademyCourseDoc extends AcademyBaseDoc {
  courseId: string;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string;
  promoVideoUrl?: string | null;
  level: AcademyCourseLevel;
  category: string;
  status: AcademyCourseStatus;
  visibility: AcademyCourseVisibility;
  estimatedDuration: number;
  pricingType: AcademyCoursePricingType;
  priceCents: number;
  salePriceCents?: number | null;
  currency: string;
  includedPlans?: AcademyIncludedPlanId[];
  mrrEnabled: boolean;
  mrrRequiresCertificate: boolean;
  mrrPriceCents: number;
  mrrCurrency: string;
  mrrLicenseVersion: string;
  certificateEnabled: boolean;
  finalExamEnabled: boolean;
  discussionEnabled: boolean;
  aiTutorEnabled: boolean;
  cohortEnabled: boolean;
  dripEnabled: boolean;
  manualReviewEnabled: boolean;
  nextSteps: string[];
  recommendedCourseIds: string[];
  createdBy: string;
  publishedAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyCoursePurchaseDoc extends AcademyBaseDoc {
  purchaseId: string;
  userId: string;
  courseId: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  provider: 'paystack' | 'paypal' | 'manual';
  priceCents: number;
  currency: string;
  paystackReference?: string | null;
  checkoutSessionId?: string | null;
  paidAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyCourseCheckoutSessionDoc extends AcademyBaseDoc {
  checkoutSessionId: string;
  purchaseId: string;
  userId: string;
  email?: string | null;
  courseId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
  provider: 'paystack' | 'paypal';
  priceCents: number;
  currency: string;
  paystackReference?: string | null;
  authorizationUrl?: string | null;
  verifiedAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyCourseEntitlementDoc extends AcademyBaseDoc {
  entitlementId: string;
  userId: string;
  courseId: string;
  entitlementType: 'free_course' | 'paid_course' | 'course_discount' | 'manual_access';
  source: string;
  status: 'active' | 'expired' | 'revoked' | 'used';
  pricePaidCents?: number;
  discountKind?: 'percent' | 'fixed';
  amount?: number;
  grantedAt?: AcademyTimestamp;
  expiresAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyMrrEligibilityDoc extends AcademyBaseDoc {
  eligibilityId: string;
  userId: string;
  courseId: string;
  certificateId?: string | null;
  source: string;
  status: 'reserved' | 'eligible' | 'purchased' | 'revoked';
  unlockAfterCertificate?: boolean;
  priceCents?: number;
  currency?: string;
  licenseVersion?: string;
  purchasedAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyMrrPurchaseDoc extends AcademyBaseDoc {
  purchaseId: string;
  userId: string;
  courseId: string;
  certificateId?: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  provider: 'paystack' | 'paypal' | 'manual';
  priceCents: number;
  currency: string;
  licenseVersion: string;
  paystackReference?: string | null;
  authorizationUrl?: string | null;
  paidAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyTopicDoc extends AcademyBaseDoc {
  topicId: string;
  courseId: string;
  title: string;
  description: string;
  sortOrder: number;
  unlockRule: AcademyUnlockRule;
  quizRequired: boolean;
  dripDelayDays?: number | null;
  availableAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyLessonDoc extends AcademyBaseDoc {
  lessonId: string;
  courseId: string;
  topicId: string;
  title: string;
  lessonType: AcademyLessonType;
  videoUrl?: string | null;
  imageUrls?: string[];
  writtenContent?: string | null;
  transcript?: string | null;
  durationMinutes?: number | null;
  sortOrder: number;
  activityRequired: boolean;
  discussionEnabled: boolean;
  aiTutorEnabled: boolean;
  keyTakeaways: string[];
  status: AcademyLessonStatus;
  metadata?: Record<string, unknown>;
}

export interface AcademyActivityOption {
  optionId: string;
  label: string;
  isCorrect?: boolean;
  feedback?: string;
}

export interface AcademyActivityDoc extends AcademyBaseDoc {
  activityId: string;
  courseId: string;
  topicId: string;
  lessonId: string;
  title: string;
  prompt: string;
  activityType: AcademyActivityType;
  options?: AcademyActivityOption[];
  required: boolean;
  manualReviewRequired: boolean;
  sortOrder: number;
  metadata?: Record<string, unknown>;
}

export interface AcademyActivitySubmissionDoc extends AcademyBaseDoc {
  submissionId: string;
  userId: string;
  courseId: string;
  topicId: string;
  lessonId: string;
  activityId: string;
  response: string | string[] | Record<string, unknown>;
  attachments?: Array<{ name: string; url: string; storagePath?: string; mimeType?: string }>;
  score?: number | null;
  feedback?: string | null;
  reviewedBy?: string | null;
  submittedAt: AcademyTimestamp;
  reviewedAt?: AcademyTimestamp;
  status: AcademyActivitySubmissionStatus;
}

export interface AcademyQuestionOption {
  optionId: string;
  label: string;
  isCorrect?: boolean;
  feedback?: string;
}

export interface AcademyQuestion {
  questionId: string;
  type: AcademyQuestionType;
  prompt: string;
  options?: AcademyQuestionOption[];
  points: number;
  explanation?: string;
  sortOrder: number;
}

export interface AcademyQuizDoc extends AcademyBaseDoc {
  quizId: string;
  courseId: string;
  topicId: string;
  title: string;
  description?: string;
  passingScore: number;
  maxAttempts?: number | null;
  instantFeedbackEnabled: boolean;
  questions: AcademyQuestion[];
  status: AcademyLessonStatus;
  metadata?: Record<string, unknown>;
}

export interface AcademyQuizAttemptDoc extends AcademyBaseDoc {
  quizAttemptId: string;
  quizId: string;
  courseId: string;
  topicId: string;
  userId: string;
  attemptNumber: number;
  score: number;
  passed: boolean;
  status: AcademyAttemptStatus;
  startedAt: AcademyTimestamp;
  submittedAt?: AcademyTimestamp;
}

export interface AcademyQuizResponseDoc extends AcademyBaseDoc {
  quizResponseId: string;
  quizAttemptId: string;
  quizId: string;
  questionId: string;
  userId: string;
  answer: string | string[];
  correct?: boolean;
  pointsAwarded?: number;
}

export interface AcademyExamAttemptDoc extends AcademyBaseDoc {
  examAttemptId: string;
  userId: string;
  courseId: string;
  startedAt: AcademyTimestamp;
  submittedAt?: AcademyTimestamp;
  expiresAt: AcademyTimestamp;
  score: number;
  passed: boolean;
  answers: Record<string, string | string[]>;
  status: AcademyAttemptStatus;
  attemptNumber: number;
  antiCheatEvents?: Array<{ eventType: string; occurredAt: AcademyTimestamp; metadata?: Record<string, unknown> }>;
}

export interface AcademyEnrollmentDoc extends AcademyBaseDoc {
  enrollmentId: string;
  userId: string;
  courseId: string;
  cohortId?: string | null;
  status: AcademyEnrollmentStatus;
  enrolledAt: AcademyTimestamp;
  completedAt?: AcademyTimestamp;
  lastAccessedAt?: AcademyTimestamp;
  progressPercent: number;
}

export interface AcademyProgressDoc extends AcademyBaseDoc {
  progressId: string;
  userId: string;
  courseId: string;
  topicId?: string | null;
  lessonId?: string | null;
  completed: boolean;
  completedAt?: AcademyTimestamp;
  unlocked: boolean;
  unlockedAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyCertificateDoc extends AcademyBaseDoc {
  certificateId: string;
  userId: string;
  courseId: string;
  issuedAt: AcademyTimestamp;
  studentName: string;
  courseTitle: string;
  score: number;
  certificateUrl?: string | null;
  verificationCode: string;
  status: AcademyCertificateStatus;
}

export interface AcademyRecommendationDoc extends AcademyBaseDoc {
  recommendationId: string;
  userId?: string | null;
  courseId: string;
  recommendedCourseId: string;
  reason?: string;
  sortOrder: number;
  active: boolean;
}

export interface AcademyCohortDoc extends AcademyBaseDoc {
  cohortId: string;
  courseId: string;
  title: string;
  description?: string;
  startDate: AcademyTimestamp;
  endDate?: AcademyTimestamp;
  capacity?: number | null;
  status: AcademyCohortStatus;
  enrolledUserIds?: string[];
}

export interface AcademyLiveSessionDoc extends AcademyBaseDoc {
  liveSessionId: string;
  courseId: string;
  cohortId?: string | null;
  topicId?: string | null;
  title: string;
  description?: string;
  provider: AcademyMeetingProvider;
  meetingUrl: string;
  startsAt: AcademyTimestamp;
  endsAt: AcademyTimestamp;
  recordingUrl?: string | null;
  materials?: Array<{ title: string; url: string }>;
  status: AcademyLiveSessionStatus;
}

export interface AcademySessionAttendanceDoc extends AcademyBaseDoc {
  attendanceId: string;
  courseId: string;
  liveSessionId: string;
  userId: string;
  cohortId?: string | null;
  status: 'registered' | 'joined' | 'attended' | 'missed';
  joinedAt?: AcademyTimestamp;
  lastSeenAt?: AcademyTimestamp;
  replayWatchedAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyLessonDiscussionDoc extends AcademyBaseDoc {
  discussionId: string;
  courseId: string;
  topicId: string;
  lessonId?: string | null;
  userId: string;
  body: string;
  pinned: boolean;
  helpfulCount: number;
  reportCount?: number;
  status: 'active' | 'hidden' | 'reported';
  discussionType?: 'lesson_comment' | 'course_discussion' | 'announcement';
  moderatedBy?: string | null;
  moderatedAt?: AcademyTimestamp;
}

export interface AcademyDiscussionReplyDoc extends AcademyBaseDoc {
  replyId: string;
  discussionId: string;
  courseId: string;
  lessonId?: string | null;
  userId: string;
  body: string;
  helpfulCount: number;
  reportCount?: number;
  pinned?: boolean;
  status: 'active' | 'hidden' | 'reported';
  moderatedBy?: string | null;
  moderatedAt?: AcademyTimestamp;
}

export interface AcademyDiscussionReactionDoc extends AcademyBaseDoc {
  reactionId: string;
  discussionId?: string | null;
  replyId?: string | null;
  courseId: string;
  lessonId?: string | null;
  userId: string;
  reactionType: 'helpful' | 'report';
}

export interface AcademyDripScheduleDoc extends AcademyBaseDoc {
  dripScheduleId: string;
  courseId: string;
  topicId?: string | null;
  lessonId?: string | null;
  cohortId?: string | null;
  availableAt?: AcademyTimestamp;
  delayDays?: number | null;
  unlockCondition: AcademyUnlockRule;
}

export interface AcademyManualReviewDoc extends AcademyBaseDoc {
  manualReviewId: string;
  courseId: string;
  topicId?: string | null;
  lessonId?: string | null;
  activityId?: string | null;
  submissionId?: string | null;
  userId: string;
  reviewerId?: string | null;
  status: 'pending' | 'approved' | 'needs_revision' | 'rejected';
  feedback?: string | null;
  score?: number | null;
}

export interface AcademyTutorMessageDoc extends AcademyBaseDoc {
  tutorMessageId: string;
  sessionId: string;
  userId: string;
  courseId: string;
  topicId?: string | null;
  lessonId?: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  aiRequestId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AcademyTutorSessionDoc extends AcademyBaseDoc {
  tutorSessionId: string;
  userId: string;
  courseId: string;
  topicId?: string | null;
  lessonId?: string | null;
  status: 'active' | 'archived';
  lastMessageAt?: AcademyTimestamp;
  metadata?: Record<string, unknown>;
}

export interface AcademyImportDoc extends AcademyBaseDoc {
  importId: string;
  createdBy: string;
  status: AcademyImportStatus;
  sourceType: 'json' | 'csv' | 'markdown' | 'outline';
  sourceName?: string;
  preview?: Record<string, unknown>;
  createdCourseId?: string | null;
  error?: string | null;
  validationErrors?: string[];
  confirmedAt?: AcademyTimestamp;
}
