# ADR-033: Centralized AI Monetization, Credits, and BYOK Gateway

## Status

Accepted

## Context

SDC needed a monetization layer that could:

- protect gross margin
- support SDC-managed usage and BYOK
- hide provider pricing from users
- centralize routing and observability
- keep the architecture extensible for future AI modules

## Decision

We introduced a shared AI monetization layer under `src/services/ai-platform` that:

- resolves plan-aware routing
- stores encrypted provider secrets
- reserves and finalizes creator credits
- records an immutable ledger
- exposes a BYOK management API

Existing AI generation paths now call into the shared gateway rather than duplicating billing logic.

## Consequences

- Credit accounting becomes auditable and reusable across all AI features.
- Provider switching can happen without changing product code.
- BYOK support can be enabled per user and per provider safely.
- The system now has a single place to enforce cost controls and future routing rules.

