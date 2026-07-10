# Phase 8 Migration Notes: Content Calendar

## What changed

- Added a dedicated content calendar page at `/social/calendar`
- Added scheduled post management APIs under `/api/social/scheduled-posts`
- Added the `scheduledPosts` service layer under `src/social`
- Added drag-and-drop rescheduling on the month grid
- Added Firestore rules coverage for `scheduledPosts`
- Added Firestore indexes for calendar queries
- Added calendar navigation links from the social hub and main navbar

## Content calendar capabilities

- Visual month view
- Create scheduled posts
- Edit existing scheduled posts
- Move posts between days with drag-and-drop
- Track draft, scheduled, published, failed, and editing states
- Show summary counts by status and platform
- Store scheduled metadata in the canonical `scheduledPosts` collection

## Data model notes

- `scheduledPosts` is the canonical calendar collection
- Each record stores platform, scheduled time, caption, assets, campaign ID, and lifecycle state
- Firestore reads are limited to the authenticated owner
- Writes are routed through server APIs rather than direct client Firestore access

## Compatibility notes

- The calendar is additive and does not alter the AI studio or social account schemas
- The drag-and-drop implementation uses native browser behavior and avoids another dependency layer
- Publishing remains deferred to phase 9, so no background publish jobs were introduced here

## Follow-up recommendations

- Add campaign grouping and filters when the campaign model is ready
- Add a week and agenda view if teams need denser operations
- Add scheduled publishing jobs in phase 9 using the same collection
