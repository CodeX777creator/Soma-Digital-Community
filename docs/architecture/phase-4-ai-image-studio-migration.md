# Phase 4 Migration Notes: AI Image Studio

## What changed

- Added a dedicated image studio service at `src/ai/studio/image.ts`
- Added a protected image studio API route at `/api/ai/image-studio`
- Added image generation support to the shared AI platform service
- Persisted generated assets to Firebase Storage and `generatedAssets`
- Added image history listing with signed download URLs

## Image studio capabilities

- Prompt editing
- Style presets
- Aspect ratios
- Brand templates
- Downloadable assets
- Firestore metadata
- Storage integration

## Data model notes

- Generated image records live in the canonical `generatedAssets` collection
- `type` is set to `image`
- `storagePath` stores the Firebase Storage object path
- `thumbnail` points to the generated asset preview/download URL
- `promptVersion` identifies the image studio prompt contract

## Compatibility notes

- The image studio is additive and does not change the existing mentor or content flows
- History reads use signed URLs, so storage access remains server-controlled

## Follow-up recommendations

- Add a gallery UI for browsing, filtering, and reusing generated images
- Add image regeneration controls from saved history
- Add background cleanup or lifecycle policies for stale assets if storage growth becomes material
