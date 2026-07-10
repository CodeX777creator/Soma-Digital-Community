# Phase 10 Migration Notes - Analytics

## What changed

- Added a secure admin analytics endpoint at `GET /api/admin/analytics/dashboard`
- Added a dedicated admin analytics page at `/admin/analytics`
- Persisted AI usage events to `aiUsageEvents`
- Reused `socialPublishAttempts` as the canonical publish telemetry source
- Extended the admin navigation with an Analytics entry

## Data flow

- AI requests continue to flow through the existing AI orchestration layer
- `recordUsage()` now appends each AI event to Firestore for durable reporting
- The admin analytics route aggregates AI, publishing, and user activity data on demand
- The UI reads the secure route with a Firebase ID token

## Operational notes

- `aiUsageEvents` is append-only
- `socialPublishAttempts` remains append-only
- The dashboard currently loads rolling 30-day views and can be widened later
- Larger deployments should introduce scheduled rollups into `analyticsDaily` or a warehouse layer

## Validation

- Root TypeScript typecheck passes
- Firebase Functions build remains green

