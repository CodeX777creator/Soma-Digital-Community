# Phase 11 Migration Notes - AI Memory

## What changed

- Added Firestore-backed mentor memory persistence under `users/{uid}/mentorMemory/profile`
- Persisted extracted insights, conversation summaries, preferences, and business goals
- Hydrated mentor memory before AI responses are generated
- Fixed mentor chat requests to send a stable `threadId`

## Memory model

- `mentorHistory` continues to store the full conversation transcript
- `mentorMemory/profile/insights` stores durable extracted signals
- `mentorMemory/profile/summaries` stores conversation summaries
- `mentorMemory/profile` stores preferences, business goals, and summary metadata

## Operational notes

- In-memory memory still exists for fast prompt assembly
- Firestore is now the source of truth for long-term mentor memory
- Hydration is idempotent and safe to repeat
- Existing chat behavior is preserved, but memory now survives restarts

## Validation

- Root TypeScript typecheck passes
- Firebase Functions build remains green

