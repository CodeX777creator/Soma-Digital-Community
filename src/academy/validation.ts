import {
  ACADEMY_ACTIVITY_TYPES,
  ACADEMY_ATTEMPT_STATUSES,
  ACADEMY_CERTIFICATE_STATUSES,
  ACADEMY_COHORT_STATUSES,
  ACADEMY_COURSE_LEVELS,
  ACADEMY_COURSE_PRICING_TYPES,
  ACADEMY_COURSE_STATUSES,
  ACADEMY_COURSE_VISIBILITIES,
  ACADEMY_INCLUDED_PLAN_IDS,
  ACADEMY_ENROLLMENT_STATUSES,
  ACADEMY_IMPORT_STATUSES,
  ACADEMY_LESSON_STATUSES,
  ACADEMY_LESSON_TYPES,
  ACADEMY_LIVE_SESSION_STATUSES,
  ACADEMY_MEETING_PROVIDERS,
  ACADEMY_QUESTION_TYPES,
  ACADEMY_TOPIC_UNLOCK_RULES,
  type AcademyActivityType,
  type AcademyActivityDoc,
  type AcademyAttemptStatus,
  type AcademyCertificateStatus,
  type AcademyCohortStatus,
  type AcademyCourseDoc,
  type AcademyCourseLevel,
  type AcademyCourseStatus,
  type AcademyCourseVisibility,
  type AcademyEnrollmentStatus,
  type AcademyImportStatus,
  type AcademyLessonDoc,
  type AcademyLessonStatus,
  type AcademyLessonType,
  type AcademyLiveSessionStatus,
  type AcademyMeetingProvider,
  type AcademyQuestionType,
  type AcademyTopicDoc,
  type AcademyUnlockRule,
} from './types';

export class AcademyValidationError extends Error {
  constructor(message: string, public readonly code = 'INVALID_ACADEMY_RECORD') {
    super(message);
    this.name = 'AcademyValidationError';
  }
}

function includes<const T extends readonly string[]>(items: T, value: unknown): value is T[number] {
  return typeof value === 'string' && items.includes(value);
}

export function isAcademyCourseStatus(value: unknown): value is AcademyCourseStatus {
  return includes(ACADEMY_COURSE_STATUSES, value);
}

export function isAcademyCourseVisibility(value: unknown): value is AcademyCourseVisibility {
  return includes(ACADEMY_COURSE_VISIBILITIES, value);
}

export function isAcademyCourseLevel(value: unknown): value is AcademyCourseLevel {
  return includes(ACADEMY_COURSE_LEVELS, value);
}

export function isAcademyCoursePricingType(value: unknown) {
  return includes(ACADEMY_COURSE_PRICING_TYPES, value);
}

export function isAcademyUnlockRule(value: unknown): value is AcademyUnlockRule {
  return includes(ACADEMY_TOPIC_UNLOCK_RULES, value);
}

export function isAcademyLessonType(value: unknown): value is AcademyLessonType {
  return includes(ACADEMY_LESSON_TYPES, value);
}

export function isAcademyLessonStatus(value: unknown): value is AcademyLessonStatus {
  return includes(ACADEMY_LESSON_STATUSES, value);
}

export function isAcademyActivityType(value: unknown): value is AcademyActivityType {
  return includes(ACADEMY_ACTIVITY_TYPES, value);
}

export function isAcademyQuestionType(value: unknown): value is AcademyQuestionType {
  return includes(ACADEMY_QUESTION_TYPES, value);
}

export function isAcademyAttemptStatus(value: unknown): value is AcademyAttemptStatus {
  return includes(ACADEMY_ATTEMPT_STATUSES, value);
}

export function isAcademyEnrollmentStatus(value: unknown): value is AcademyEnrollmentStatus {
  return includes(ACADEMY_ENROLLMENT_STATUSES, value);
}

export function isAcademyCertificateStatus(value: unknown): value is AcademyCertificateStatus {
  return includes(ACADEMY_CERTIFICATE_STATUSES, value);
}

export function isAcademyCohortStatus(value: unknown): value is AcademyCohortStatus {
  return includes(ACADEMY_COHORT_STATUSES, value);
}

export function isAcademyLiveSessionStatus(value: unknown): value is AcademyLiveSessionStatus {
  return includes(ACADEMY_LIVE_SESSION_STATUSES, value);
}

export function isAcademyMeetingProvider(value: unknown): value is AcademyMeetingProvider {
  return includes(ACADEMY_MEETING_PROVIDERS, value);
}

export function isAcademyImportStatus(value: unknown): value is AcademyImportStatus {
  return includes(ACADEMY_IMPORT_STATUSES, value);
}

export function sanitizeAcademyString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function sanitizeAcademyText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function createAcademySlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function validateAcademyCourse(input: Partial<AcademyCourseDoc>, options: { partial?: boolean } = {}) {
  const partial = options.partial === true;
  const title = sanitizeAcademyString(input.title, 180);
  const description = sanitizeAcademyText(input.description, 12000);
  const slug = sanitizeAcademyString(input.slug, 140);

  if ((!partial || input.title !== undefined) && !title) {
    throw new AcademyValidationError('Course title is required.', 'ACADEMY_COURSE_TITLE_REQUIRED');
  }

  if ((!partial || input.slug !== undefined) && !slug) {
    throw new AcademyValidationError('Course slug is required.', 'ACADEMY_COURSE_SLUG_REQUIRED');
  }

  if ((!partial || input.description !== undefined) && !description) {
    throw new AcademyValidationError('Course description is required.', 'ACADEMY_COURSE_DESCRIPTION_REQUIRED');
  }

  if (input.status !== undefined && !isAcademyCourseStatus(input.status)) {
    throw new AcademyValidationError('Unsupported course status.', 'ACADEMY_COURSE_STATUS_INVALID');
  }

  if (input.visibility !== undefined && !isAcademyCourseVisibility(input.visibility)) {
    throw new AcademyValidationError('Unsupported course visibility.', 'ACADEMY_COURSE_VISIBILITY_INVALID');
  }

  if (input.level !== undefined && !isAcademyCourseLevel(input.level)) {
    throw new AcademyValidationError('Unsupported course level.', 'ACADEMY_COURSE_LEVEL_INVALID');
  }

  if (input.estimatedDuration !== undefined && (!Number.isFinite(input.estimatedDuration) || input.estimatedDuration < 0)) {
    throw new AcademyValidationError('Estimated duration must be a non-negative number.', 'ACADEMY_COURSE_DURATION_INVALID');
  }
  if (input.pricingType !== undefined && !isAcademyCoursePricingType(input.pricingType)) {
    throw new AcademyValidationError('Unsupported course pricing type.', 'ACADEMY_COURSE_PRICING_TYPE_INVALID');
  }
  if (input.priceCents !== undefined && (!Number.isFinite(input.priceCents) || input.priceCents < 0)) {
    throw new AcademyValidationError('Course price must be a non-negative number.', 'ACADEMY_COURSE_PRICE_INVALID');
  }
  if (input.salePriceCents !== undefined && input.salePriceCents !== null && (!Number.isFinite(input.salePriceCents) || input.salePriceCents < 0)) {
    throw new AcademyValidationError('Course sale price must be a non-negative number.', 'ACADEMY_COURSE_SALE_PRICE_INVALID');
  }
  if (input.pricingType === 'paid' && !input.priceCents) {
    throw new AcademyValidationError('Paid courses require a price.', 'ACADEMY_COURSE_PRICE_REQUIRED');
  }
  if (input.includedPlans !== undefined && (!Array.isArray(input.includedPlans) || input.includedPlans.some((plan) => !includes(ACADEMY_INCLUDED_PLAN_IDS, plan)))) {
    throw new AcademyValidationError('Included plans contain an unsupported plan.', 'ACADEMY_COURSE_INCLUDED_PLANS_INVALID');
  }
  if (input.mrrPriceCents !== undefined && (!Number.isFinite(input.mrrPriceCents) || input.mrrPriceCents < 0)) {
    throw new AcademyValidationError('MRR price must be a non-negative number.', 'ACADEMY_COURSE_MRR_PRICE_INVALID');
  }
}

export function validateAcademyTopic(input: Partial<AcademyTopicDoc>, options: { partial?: boolean } = {}) {
  const partial = options.partial === true;
  if ((!partial || input.courseId !== undefined) && !sanitizeAcademyString(input.courseId, 200)) {
    throw new AcademyValidationError('Topic courseId is required.', 'ACADEMY_TOPIC_COURSE_REQUIRED');
  }
  if ((!partial || input.title !== undefined) && !sanitizeAcademyString(input.title, 180)) {
    throw new AcademyValidationError('Topic title is required.', 'ACADEMY_TOPIC_TITLE_REQUIRED');
  }
  if (input.unlockRule !== undefined && !isAcademyUnlockRule(input.unlockRule)) {
    throw new AcademyValidationError('Unsupported topic unlock rule.', 'ACADEMY_TOPIC_UNLOCK_RULE_INVALID');
  }
  if (input.sortOrder !== undefined && (!Number.isFinite(input.sortOrder) || input.sortOrder < 0)) {
    throw new AcademyValidationError('Topic sort order must be a non-negative number.', 'ACADEMY_TOPIC_SORT_INVALID');
  }
  if (input.dripDelayDays !== undefined && input.dripDelayDays !== null && (!Number.isFinite(input.dripDelayDays) || input.dripDelayDays < 0)) {
    throw new AcademyValidationError('Topic drip delay must be a non-negative number.', 'ACADEMY_TOPIC_DRIP_INVALID');
  }
}

export function validateAcademyLesson(input: Partial<AcademyLessonDoc>, options: { partial?: boolean } = {}) {
  const partial = options.partial === true;
  if ((!partial || input.courseId !== undefined) && !sanitizeAcademyString(input.courseId, 200)) {
    throw new AcademyValidationError('Lesson courseId is required.', 'ACADEMY_LESSON_COURSE_REQUIRED');
  }
  if ((!partial || input.topicId !== undefined) && !sanitizeAcademyString(input.topicId, 200)) {
    throw new AcademyValidationError('Lesson topicId is required.', 'ACADEMY_LESSON_TOPIC_REQUIRED');
  }
  if ((!partial || input.title !== undefined) && !sanitizeAcademyString(input.title, 180)) {
    throw new AcademyValidationError('Lesson title is required.', 'ACADEMY_LESSON_TITLE_REQUIRED');
  }
  if (input.lessonType !== undefined && !isAcademyLessonType(input.lessonType)) {
    throw new AcademyValidationError('Unsupported lesson type.', 'ACADEMY_LESSON_TYPE_INVALID');
  }
  if (input.status !== undefined && !isAcademyLessonStatus(input.status)) {
    throw new AcademyValidationError('Unsupported lesson status.', 'ACADEMY_LESSON_STATUS_INVALID');
  }
  if (input.sortOrder !== undefined && (!Number.isFinite(input.sortOrder) || input.sortOrder < 0)) {
    throw new AcademyValidationError('Lesson sort order must be a non-negative number.', 'ACADEMY_LESSON_SORT_INVALID');
  }
  if (input.durationMinutes !== undefined && input.durationMinutes !== null && (!Number.isFinite(input.durationMinutes) || input.durationMinutes < 0)) {
    throw new AcademyValidationError('Lesson duration must be a non-negative number.', 'ACADEMY_LESSON_DURATION_INVALID');
  }

  const lessonType = input.lessonType;
  if (!partial && lessonType) {
    const hasVideo = Boolean(input.videoUrl);
    const hasImages = Array.isArray(input.imageUrls) && input.imageUrls.length > 0;
    const hasWritten = Boolean(sanitizeAcademyText(input.writtenContent, 1_000_000));

    if (lessonType === 'video' && !hasVideo) {
      throw new AcademyValidationError('Video lessons require a videoUrl.', 'ACADEMY_LESSON_VIDEO_REQUIRED');
    }
    if (lessonType === 'image' && !hasImages) {
      throw new AcademyValidationError('Image lessons require at least one imageUrl.', 'ACADEMY_LESSON_IMAGE_REQUIRED');
    }
    if (lessonType === 'written' && !hasWritten) {
      throw new AcademyValidationError('Written lessons require writtenContent.', 'ACADEMY_LESSON_WRITTEN_REQUIRED');
    }
    if (lessonType === 'mixed' && [hasVideo, hasImages, hasWritten].filter(Boolean).length < 2) {
      throw new AcademyValidationError('Mixed lessons require at least two content formats.', 'ACADEMY_LESSON_MIXED_REQUIRED');
    }
  }
}

export function validateAcademyActivity(input: Partial<AcademyActivityDoc>, options: { partial?: boolean } = {}) {
  const partial = options.partial === true;

  if ((!partial || input.courseId !== undefined) && !sanitizeAcademyString(input.courseId, 200)) {
    throw new AcademyValidationError('Activity courseId is required.', 'ACADEMY_ACTIVITY_COURSE_REQUIRED');
  }
  if ((!partial || input.topicId !== undefined) && !sanitizeAcademyString(input.topicId, 200)) {
    throw new AcademyValidationError('Activity topicId is required.', 'ACADEMY_ACTIVITY_TOPIC_REQUIRED');
  }
  if ((!partial || input.lessonId !== undefined) && !sanitizeAcademyString(input.lessonId, 200)) {
    throw new AcademyValidationError('Activity lessonId is required.', 'ACADEMY_ACTIVITY_LESSON_REQUIRED');
  }
  if ((!partial || input.title !== undefined) && !sanitizeAcademyString(input.title, 180)) {
    throw new AcademyValidationError('Activity title is required.', 'ACADEMY_ACTIVITY_TITLE_REQUIRED');
  }
  if ((!partial || input.prompt !== undefined) && !sanitizeAcademyText(input.prompt, 12000)) {
    throw new AcademyValidationError('Activity prompt is required.', 'ACADEMY_ACTIVITY_PROMPT_REQUIRED');
  }
  if (input.activityType !== undefined && !isAcademyActivityType(input.activityType)) {
    throw new AcademyValidationError('Unsupported activity type.', 'ACADEMY_ACTIVITY_TYPE_INVALID');
  }
  if (input.sortOrder !== undefined && (!Number.isFinite(input.sortOrder) || input.sortOrder < 0)) {
    throw new AcademyValidationError('Activity sort order must be a non-negative number.', 'ACADEMY_ACTIVITY_SORT_INVALID');
  }

  const activityType = input.activityType;
  if (
    activityType
    && ['multiple_choice', 'checkboxes'].includes(activityType)
    && (!Array.isArray(input.options) || input.options.length < 2)
  ) {
    throw new AcademyValidationError('Choice activities require at least two options.', 'ACADEMY_ACTIVITY_OPTIONS_REQUIRED');
  }
}
