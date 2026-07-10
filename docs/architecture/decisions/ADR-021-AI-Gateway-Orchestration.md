# ADR-021: AI Gateway Orchestration

## Status

Proposed and implemented in phase 1.

## Context

SDC already had multiple AI entry points:

* Genkit flows in `src/ai/flows`
* A custom Genkit model adapter in `src/ai/genkit.ts`
* A legacy Firebase callable mentor function
* Direct OpenAI-compatible client usage in the enhanced mentor flow

That shape worked for MVP delivery, but it created provider drift, duplicated routing logic, and too many places for model selection to change.

## Decision

Introduce a centralized AI platform layer under `src/ai/platform` and route all text generation through it.

The new layer:

* Normalizes model and provider selection
* Supports Vercel AI Gateway when configured
* Falls back to direct OpenAI-compatible providers when needed
* Preserves current mentor, roadmap, and content generation behavior
* Exposes a single execution path for future AI modules

## Why

This keeps the application aligned with the canonical architecture:

* PromptOS owns prompt composition
* AgentOS and the platform layer own orchestration
* Gateway owns provider selection
* Application code stays provider-agnostic

## Consequences

Positive:

* One place to add providers and model policies
* Easier migration to Vercel AI Gateway
* Less direct coupling to Moonshot/Kimi internals
* Better foundation for future image, video, and voice modules

Trade-offs:

* The legacy Firebase callable mentor function remains temporarily for backwards compatibility
* Some telemetry and state are still in-memory and need a persistence phase

## Migration Strategy

1. Keep existing feature routes intact.
2. Route Genkit through the AI platform layer.
3. Replace direct provider usage in the enhanced mentor flow.
4. Add durable telemetry, cache, and memory stores in the next phase.
5. Retire the deprecated Firebase callable after validation.

