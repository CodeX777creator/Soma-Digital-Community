# ADR-026: AI Audio Studio and Voice Generation Routing

Date: 2026-07-10

## Status

Accepted

## Context

SDC needs a first-class audio studio that can generate narrated business audio, preserve history, and fit the same orchestration and storage patterns used by the other AI studios.

Voice generation also needs a provider path that can be swapped or extended later without changing application logic.

## Decision

We added a dedicated AI Audio Studio module that:

- Builds a structured audio blueprint with the shared AI text stack
- Routes voice generation through the shared AI platform layer
- Uses ElevenLabs as the current provider for direct audio synthesis
- Persists generated audio to Firebase Storage and the canonical `generatedAssets` collection
- Writes job state to `aiJobs` so generation status can be tracked over time
- Falls back to a stored bundle when the provider does not return a direct audio payload

## Consequences

Positive:

- Audio requests now have a first-class domain model
- Users can browse playable audio history without losing metadata when a provider response is incomplete
- The provider selection remains centralized, so future voice providers can be added behind the same service layer

Tradeoffs:

- ElevenLabs is the first supported audio provider, so direct voice synthesis still depends on that external API
- Some requests may initially produce a queued bundle rather than an immediate MP3 if the provider response is not directly playable

## Follow-up

- Add voice profile persistence if custom voices become a product requirement
- Add asynchronous rendering or post-processing only if the product needs it; the current direct synthesis flow keeps latency lower
