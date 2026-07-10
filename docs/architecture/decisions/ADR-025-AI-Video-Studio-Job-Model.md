# ADR-025: AI Video Studio and Job-Based Render Model

Date: 2026-07-10

## Status

Accepted

## Context

SDC needs a video studio that can produce render-ready business videos with scripts, scenes, captions, voiceover copy, and persistent history.

The current workspace does not include a local MP4 renderer, so the implementation must support both direct provider video outputs and a queued bundle fallback without breaking the user flow.

## Decision

We added a dedicated AI Video Studio module that:

- Builds a structured video blueprint with the shared AI text stack
- Attempts provider video generation through the shared AI platform layer
- Persists generated assets to Firebase Storage and the canonical `generatedAssets` collection
- Writes job state to `aiJobs` so rendering can be tracked over time
- Falls back to a stored video bundle when the provider does not return a playable MP4

## Consequences

Positive:

- Video requests now have a first-class domain model
- Users can see completed videos or queued bundles in history
- The architecture is ready for a future dedicated renderer without changing the API contract

Tradeoffs:

- Some requests may initially produce a queued bundle rather than an MP4 if the provider does not return a direct media payload
- A future dedicated renderer can replace the fallback path without redesigning the studio surface
