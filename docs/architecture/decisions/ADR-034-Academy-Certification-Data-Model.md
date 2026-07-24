# ADR-034: Academy Certification Data Model

## Status
Accepted

## Context
SDC Academy is the structured learning and certification pillar of Soma Digital Community. It must support admin-published courses, topic/module progression, video/photo/written lessons, class activities, topic quizzes, timed exams, certificates, live cohorts, discussions, drip scheduling, manual review, AI tutor sessions, and bulk imports.

Written lesson content is a first-class alternative to video/photo lessons. A lesson may be written-only, media-only, or mixed.

## Decision
Introduce a dedicated `src/academy` domain module as the canonical Phase 1 data model boundary.

The module defines:

- Firestore collection constants for every Academy collection.
- Strict TypeScript document interfaces for courses, topics, lessons, activities, submissions, quizzes, exams, enrollments, progress, certificates, recommendations, cohorts, live sessions, discussions, drip schedules, manual reviews, tutor messages, and imports.
- Enum-style constants and type guards for supported statuses and content types.
- Validation helpers for the first core authoring entities: course, topic, and lesson.
- Draft builders for course, topic, and lesson creation flows.

Primary Firestore collections:

```txt
academyCourses
academyTopics
academyLessons
academyActivities
academyActivitySubmissions
academyQuizzes
academyQuizAttempts
academyQuizResponses
academyExamAttempts
academyEnrollments
academyProgress
academyCertificates
academyRecommendations
academyCohorts
academyLiveSessions
academyLessonDiscussions
academyDiscussionReplies
academyDripSchedules
academyManualReviews
academyTutorMessages
academyImports
```

## Consequences
- Future Academy admin and learner routes should import from `src/academy` instead of duplicating schema strings or status unions.
- Firestore rules and API routes can use these collection names as the source of truth.
- Course builder, learner progression, final exam, certificates, live cohorts, and AI tutor phases can be implemented incrementally without changing the underlying schema contract.
- Certificate issuance and exam validation must remain server-side in later phases; client-side models are descriptive only.

## Follow-Ups
- Add Firestore and Storage rules for Academy writes, reads, submissions, certificates, and media.
- Add server-side service functions for course authoring and learner progression.
- Add admin builder UI and learner Academy routes.
- Add certificate issuing service and public verification route.
- Keep lesson progression, discussion feeds, tutor history, and manual review queues backed by indexed Firestore queries so the learner and admin views stay stable at scale.
