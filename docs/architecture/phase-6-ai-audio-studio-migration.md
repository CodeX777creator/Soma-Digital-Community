# Phase 6 Migration Notes: AI Audio Studio

## What changed

- Added a dedicated audio studio service at `src/ai/studio/audio.ts`
- Added a protected audio studio API route at `/api/ai/audio-studio`
- Added audio generation support to the shared AI platform layer
- Routed voice generation through ElevenLabs with configurable environment variables
- Persisted audio artifacts and fallback bundles to Firebase Storage
- Added audio history listing with playable assets when available
- Added audio generation usage tracking to the cost analytics layer

## Audio studio capabilities

- Prompt-driven narration planning
- Voice preset selection
- Voice ID overrides for ElevenLabs
- Multilingual voice generation
- Intro and outro control
- Optional background music metadata
- Audio history with playable assets
- Bundle fallback when a direct audio payload is not returned

## Data model notes

- Generated audio records live in the canonical `generatedAssets` collection
- `type` is set to `audio`
- `storagePath` stores either the MP3 asset path or the bundle fallback path
- `thumbnail` points to the playable asset or the fallback bundle URL
- `aiJobs` records the generation lifecycle
- Usage records now support the `audio_gen` operation

## Compatibility notes

- The audio studio is additive and does not change the existing mentor, content, image, or video flows
- The route is protected by subscription checks and uses the same authentication pattern as the other studios
- If ElevenLabs returns a non-binary response, the system still stores a fallback bundle so the request remains traceable

## Environment variables

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_BASE_URL`
- `ELEVENLABS_MODEL_ID`
- `ELEVENLABS_VOICE_ID`
- `AI_VOICE_ID`

## Follow-up recommendations

- Add a dedicated audio rendering worker if nontrivial post-processing is required
- Add waveform previews and transcript highlighting in the UI
- Add voice cloning and brand voice profiles once the product rules are settled
