# Phase 9 Migration Notes: Auto Publishing

## What changed

- Added a Firebase Scheduled Function that processes due social posts every five minutes
- Added automatic retry handling for failed publish attempts
- Added publish lease fields so a post cannot be published twice by overlapping workers
- Added append-only publish attempt logs in `socialPublishAttempts`
- Added provider endpoint resolution for per-platform or per-account publish destinations
- Added encrypted credential decryption in the Cloud Functions runtime

## Auto publishing capabilities

- Claim due scheduled posts safely
- Resolve the connected social account for a platform
- Attempt publish delivery through a configured endpoint
- Record every attempt with success or failure metadata
- Retry failed jobs with exponential backoff
- Preserve auditability even when the publish endpoint is missing or rejects the request

## Data model notes

- `scheduledPosts` now carries publish lifecycle fields such as attempt count, next retry time, and publish lease data
- `socialPublishAttempts` is an append-only audit trail for each publish try
- `status` still resolves to `published` or `failed` on the canonical scheduled post document

## Compatibility notes

- The scheduler is additive and does not change the calendar UI contract
- Posts without a configured publish endpoint remain trackable and retryable
- The first connected account for a platform is used when no specific account is selected on the post

## Environment variables

- `SOCIAL_CREDENTIALS_MASTER_KEY`
- `SOCIAL_PUBLISH_ENDPOINT`
- `SOCIAL_PUBLISH_ENDPOINT_TIKTOK`
- `SOCIAL_PUBLISH_ENDPOINT_INSTAGRAM`
- `SOCIAL_PUBLISH_ENDPOINT_FACEBOOK`
- `SOCIAL_PUBLISH_ENDPOINT_LINKEDIN`
- `SOCIAL_PUBLISH_ENDPOINT_X`
- `SOCIAL_PUBLISH_ENDPOINT_YOUTUBE`
- `SOCIAL_PUBLISH_BATCH_SIZE`
- `SOCIAL_PUBLISH_MAX_ATTEMPTS`
- `SOCIAL_PUBLISH_RETRY_DELAY_MINUTES`
- `SOCIAL_PUBLISH_LEASE_MINUTES`

## Follow-up recommendations

- Add a publish attempt dashboard in phase 10
- Add provider-specific native integrations if and when official APIs are in scope
- Add notification hooks when publish status transitions to failed or published
