# ADR-024: AI Image Studio and Storage Persistence

Date: 2026-07-10

## Status

Accepted

## Context

SDC needs a first-class image generation workflow with prompt editing, style presets, aspect ratios, brand templates, downloadable assets, and persistent history.

The platform already has shared Firebase Storage and Firestore primitives, plus a canonical `generatedAssets` collection in the architecture docs.

## Decision

We added a dedicated AI Image Studio module that:

- Routes image generation through the shared AI platform orchestration layer
- Persists generated image bytes to Firebase Storage via the Admin SDK
- Writes image metadata to the canonical `generatedAssets` collection
- Returns signed download URLs for direct user access
- Reuses the same auth and subscription enforcement used by the rest of the AI platform

## Consequences

Positive:

- Image history becomes queryable and auditable
- Download handling is centralized and secure
- Brand templates and prompt editing can evolve without changing the storage model

Tradeoffs:

- Signed URLs are generated on demand, which adds a little latency to history reads
- Image generation remains dependent on the configured provider response format
