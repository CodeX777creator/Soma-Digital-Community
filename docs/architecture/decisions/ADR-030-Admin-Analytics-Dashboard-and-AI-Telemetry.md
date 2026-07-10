# ADR-030 Admin Analytics Dashboard and AI Telemetry

## Status

Accepted

## Context

SDC needed a durable analytics layer for AI usage, model mix, token consumption, publishing success, cost estimation, and user activity.

The existing AI cost tracker kept usage in memory, which was useful for local feedback but not suitable for production reporting or historical analysis.

## Decision

- Persist AI usage events into Firestore under `aiUsageEvents`
- Expose a secure admin analytics route at `GET /api/admin/analytics/dashboard`
- Present the metrics in a dedicated `/admin/analytics` page
- Reuse `socialPublishAttempts` as the canonical source of publishing telemetry
- Keep the analytics route server-side and admin-protected

## Consequences

- Analytics survive restarts and can be used for dashboards, reporting, and future billing analysis
- The app keeps a single telemetry path because all AI calls already pass through `recordUsage()`
- Firestore write volume increases slightly for AI requests, but the implementation stays simple and operationally visible
- Future rollups can move the historical workload into scheduled summaries or BigQuery without changing the UI contract

