# ADR-032 Module Facades and Composition Root

## Status

Accepted

## Context

The codebase had already evolved into domain-specific folders, but service orchestration was still spread across route handlers and feature files. That made cross-domain behavior harder to test and harder to reason about as the system grew.

## Decision

- Introduce thin server-side service facades in `src/modules`
- Keep domain implementations in their existing homes to avoid destabilizing working code
- Route higher-level orchestration through a composition root rather than ad hoc imports where practical
- Keep the facades narrow and testable

## Consequences

- Module boundaries are now explicit
- Tests can mock a smaller set of service facades instead of many direct helpers
- Existing features stay backwards compatible because the facades delegate to the current domain functions
- Future refactors can move more logic behind the module layer without changing the surface area exposed to routes

