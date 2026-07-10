# ADR-029: Scheduled Cloud Publishing Worker With Attempt Logging

Date: 2026-07-10

## Status

Accepted

## Context

SDC needs reliable background publishing for scheduled social content.

The system already stores scheduled posts and encrypted social credentials, so the remaining step is a safe worker that can claim due jobs, retry failures, and leave an audit trail for each attempt.

## Decision

We added a Firebase Scheduled Function that:

- Scans for due scheduled posts on a fixed interval
- Uses a lease field to avoid duplicate publish work
- Resolves a connected social account for the target platform
- Publishes through a configurable endpoint abstraction
- Retries failures with backoff until the configured attempt limit is reached
- Logs every attempt to an append-only `socialPublishAttempts` collection

## Consequences

Positive:

- Publishing is automated and idempotent enough for background execution
- Attempt history is preserved separately from the canonical scheduled post record
- The worker can be pointed at different provider or proxy endpoints without changing the app layer

Tradeoffs:

- Provider-specific API details still need to be configured via endpoint integration or a proxy service
- If no publish endpoint is configured, the worker will mark the attempt failed and retry according to policy rather than silently succeeding

## Follow-up

- Add operational dashboards for publish attempts and failure trends
- Add explicit provider adapters once the product has a stable integration contract for each social network
