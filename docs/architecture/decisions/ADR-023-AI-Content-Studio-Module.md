# ADR-023: AI Content Studio Module

Date: 2026-07-10

## Status

Accepted

## Context

SDC needs a modular content generation layer that can support scripts, captions, blog drafts, carousel copy, ads, emails, funnel plans, marketing plans, thumbnails, and reusable prompt packs without duplicating AI logic across routes.

Prior to this change, content generation was routed through a narrow mentor flow with a small output surface and no dedicated prompt library.

## Decision

We introduced a dedicated AI Content Studio module under `src/ai/studio` that:

- Reuses the centralized AI platform service and orchestrator
- Centralizes prompt templates for each content type
- Normalizes legacy content types to new studio content types
- Exposes a single studio generation service for both new and legacy routes
- Returns structured JSON output suitable for future UI and persistence layers

We also added a protected API route at `/api/ai/studio` that serves both generation and prompt library discovery.

## Consequences

Positive:

- Content generation is now a modular capability rather than a route-specific implementation
- The prompt library is centralized and reusable
- Backwards compatibility is preserved for the existing mentor content route
- Future image, video, and audio studios can follow the same pattern

Tradeoffs:

- The studio output schema is intentionally generalized to cover multiple content types, so some downstream consumers will need light mapping if they want highly specialized shapes
- The current implementation still uses the shared text generation path; media generation remains a later phase
