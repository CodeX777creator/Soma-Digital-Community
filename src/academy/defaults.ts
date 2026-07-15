import {
  type AcademyCourseDoc,
  type AcademyCourseLevel,
  type AcademyCourseStatus,
  type AcademyCourseVisibility,
  type AcademyLessonDoc,
  type AcademyLessonStatus,
  type AcademyLessonType,
  type AcademyTopicDoc,
  type AcademyUnlockRule,
} from './types';
import { createAcademySlug, sanitizeAcademyString, sanitizeAcademyText } from './validation';

export const DEFAULT_ACADEMY_COURSE_FLAGS = {
  certificateEnabled: true,
  finalExamEnabled: true,
  discussionEnabled: true,
  aiTutorEnabled: true,
  cohortEnabled: true,
  dripEnabled: false,
  manualReviewEnabled: true,
} as const;

export function buildAcademyCourseDraft(input: {
  courseId: string;
  title: string;
  description: string;
  createdBy: string;
  thumbnailUrl?: string;
  slug?: string;
  level?: AcademyCourseLevel;
  category?: string;
  status?: AcademyCourseStatus;
  visibility?: AcademyCourseVisibility;
  estimatedDuration?: number;
  promoVideoUrl?: string | null;
  nextSteps?: string[];
  recommendedCourseIds?: string[];
}): AcademyCourseDoc {
  const title = sanitizeAcademyString(input.title, 180);
  return {
    courseId: input.courseId,
    title,
    slug: input.slug ? createAcademySlug(input.slug) : createAcademySlug(title),
    description: sanitizeAcademyText(input.description, 12000),
    thumbnailUrl: input.thumbnailUrl || '',
    promoVideoUrl: input.promoVideoUrl || null,
    level: input.level || 'beginner',
    category: sanitizeAcademyString(input.category || 'General', 120),
    status: input.status || 'draft',
    visibility: input.visibility || 'public',
    estimatedDuration: input.estimatedDuration || 0,
    ...DEFAULT_ACADEMY_COURSE_FLAGS,
    nextSteps: input.nextSteps || [],
    recommendedCourseIds: input.recommendedCourseIds || [],
    createdBy: input.createdBy,
    metadata: {},
  };
}

export function buildAcademyTopicDraft(input: {
  topicId: string;
  courseId: string;
  title: string;
  description?: string;
  sortOrder: number;
  unlockRule?: AcademyUnlockRule;
  quizRequired?: boolean;
  dripDelayDays?: number | null;
}): AcademyTopicDoc {
  return {
    topicId: input.topicId,
    courseId: input.courseId,
    title: sanitizeAcademyString(input.title, 180),
    description: sanitizeAcademyText(input.description || '', 8000),
    sortOrder: input.sortOrder,
    unlockRule: input.unlockRule || 'topic_quiz_passed',
    quizRequired: input.quizRequired ?? true,
    dripDelayDays: input.dripDelayDays ?? null,
    metadata: {},
  };
}

export function buildAcademyLessonDraft(input: {
  lessonId: string;
  courseId: string;
  topicId: string;
  title: string;
  lessonType?: AcademyLessonType;
  status?: AcademyLessonStatus;
  sortOrder: number;
  videoUrl?: string | null;
  imageUrls?: string[];
  writtenContent?: string | null;
  transcript?: string | null;
  durationMinutes?: number | null;
  activityRequired?: boolean;
  discussionEnabled?: boolean;
  aiTutorEnabled?: boolean;
  keyTakeaways?: string[];
}): AcademyLessonDoc {
  return {
    lessonId: input.lessonId,
    courseId: input.courseId,
    topicId: input.topicId,
    title: sanitizeAcademyString(input.title, 180),
    lessonType: input.lessonType || 'written',
    videoUrl: input.videoUrl || null,
    imageUrls: input.imageUrls || [],
    writtenContent: input.writtenContent || null,
    transcript: input.transcript || null,
    durationMinutes: input.durationMinutes ?? null,
    sortOrder: input.sortOrder,
    activityRequired: input.activityRequired ?? false,
    discussionEnabled: input.discussionEnabled ?? true,
    aiTutorEnabled: input.aiTutorEnabled ?? true,
    keyTakeaways: input.keyTakeaways || [],
    status: input.status || 'draft',
    metadata: {},
  };
}
