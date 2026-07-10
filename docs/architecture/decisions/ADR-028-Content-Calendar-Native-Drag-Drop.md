# ADR-028: Content Calendar With Native Drag-and-Drop Scheduling

Date: 2026-07-10

## Status

Accepted

## Context

SDC needs a visual content calendar that lets users create, inspect, and move scheduled posts without introducing a separate scheduling engine before phase 9.

The app already includes `date-fns` and a strong shared UI layer, so the calendar can be delivered with lightweight native browser drag-and-drop instead of a heavy third-party scheduler.

## Decision

We added a dedicated content calendar module that:

- Stores scheduled content in the canonical `scheduledPosts` collection
- Exposes server-side CRUD APIs for calendar items
- Renders a month grid with status-aware calendar items
- Uses native drag-and-drop to reschedule posts between days
- Tracks draft, scheduled, published, failed, and editing states

## Consequences

Positive:

- The calendar remains easy to maintain and aligns with the project&apos;s current stack
- Users can reschedule without waiting for a dedicated scheduling library or complex integration
- The data model is ready for scheduled publishing later without a schema rewrite

Tradeoffs:

- Native drag-and-drop is simpler than a fully featured calendar framework
- Repeating events, multi-day series, and advanced recurrence rules are not part of this phase

## Follow-up

- Add a richer agenda or weekly planning view if the product demands it
- Introduce scheduled publishing workers in phase 9 using the same collection
