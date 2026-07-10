# Phase 5 Migration Notes: AI Video Studio

## What changed

- Added a dedicated video studio service at `src/ai/studio/video.ts`
- Added a protected video studio API route at `/api/ai/video-studio`
- Added video generation support to the shared AI platform layer
- Added a job record model in `aiJobs`
- Persisted video artifacts and fallback bundles to Firebase Storage
- Added video history listing with playable assets when available

## Video studio capabilities

- Text-to-video planning
- Scene generation
- Automatic scripts
- Automatic captions
- Voiceover script generation
- Render-ready MP4 handling when the provider returns binary or a media URL
- Queued bundle fallback when a media payload is not returned

## Data model notes

- Generated video records live in the canonical `generatedAssets` collection
- `type` is set to `video`
- `storagePath` stores either the MP4 asset path or the bundle fallback path
- `thumbnail` points to the playable asset or the fallback bundle URL
- `aiJobs` records the render lifecycle

## Compatibility notes

- The video studio is additive and does not change the existing mentor, content, or image flows
- History reads are still protected by subscription checks and signed URLs

## Follow-up recommendations

- Add a proper renderer worker when ffmpeg or a cloud render service is available
- Add timeline editing and scene reordering in the UI
- Add thumbnail generation for completed MP4s if poster frames become important
