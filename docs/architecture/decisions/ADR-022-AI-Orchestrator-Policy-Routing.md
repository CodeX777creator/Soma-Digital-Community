# ADR-022: AI Orchestrator Policy Routing

## Status

Proposed and implemented in phase 2.

## Context

Phase 1 centralized execution through the AI platform layer, but the platform still needed task-aware routing rules that map business intent to the best model family and provider.

SDC's roadmap requires that the platform support:

* Business coaching on GPT-class models
* Sales copy on Claude-class models
* Translation on Gemini-class models
* Image, video, and voice tasks on the appropriate multimodal providers
* Future provider additions without changing application logic

## Decision

Introduce a task-based AI orchestrator that chooses provider and model combinations from a centralized policy layer.

The orchestrator:

* Selects execution plans based on task and quality mode
* Prefers Vercel AI Gateway when configured
* Falls back to direct OpenAI-compatible providers when needed
* Keeps provider choice out of feature code
* Makes future provider onboarding a catalog update instead of a rewrite

## Consequences

Positive:

* Task routing is now explicit and auditable
* Business logic no longer needs to know which provider should handle a task
* The system can evolve toward image, video, and voice studios without new architectural patterns

Trade-offs:

* Provider-specific performance differences still need measurement in telemetry
* Some tasks will remain gateway-dependent for their best quality models

## Migration Strategy

1. Add orchestrator policy definitions.
2. Convert existing text-generation flows to use orchestrated execution.
3. Keep provider fallback behavior intact.
4. Add durable analytics for routing decisions and model performance in the next phase.

