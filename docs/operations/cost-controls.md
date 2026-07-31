# Infrastructure Cost Controls

## Canonical Secret Names

Payment code must use these names:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_PLAN_PRO`
- `PAYPAL_PLAN_ELITE`
- `PAYPAL_WEBHOOK_ID`
- `PAYSTACK_SECRET_KEY`

The legacy names `PAYPAL_CLIENTID`, `PAYPAL_CLIENTSECRET`, `PAYPAL_PLANELITE`, `PAYPAL_PLANPRO`, and `PAYPAL_WEBHOOKID` must not be referenced by new code. They may be disabled only after deployed Functions, Next.js server routes, Vercel configuration, and webhook flows have been verified.

## Scheduled Job Review

| Job | Schedule | Review focus |
| --- | --- | --- |
| Social publishing | Every 5 minutes | Claim locks, due-only queries, retry limits |
| Publish reconciliation | Every 10 minutes | Stop polling completed posts |
| Event lifecycle | Every 15 minutes | Due-window queries and reminder deduplication |
| Social analytics | Every 6 hours | Changed accounts, bounded batches, batched writes |
| Token refresh queue | Every 6 hours | No duplicate queued jobs |
| Reliability alerts | Every 6 hours | One alert per account/day/type |
| Subscription sync | Every 6 hours | Changed subscriptions and provider rate limits |
| Daily missions | Daily | Avoid unbounded global scans |
| Stale asset cleanup | Weekly | Bounded deletion batches |
| Idempotency cleanup | Monthly | Bounded deletion batches |

Cloud Scheduler job count is not a substitute for workload telemetry. Review Function execution, Firestore operations, external API requests, and retries before consolidating schedules.

## Internal HTTP Access

Manual notification and mission endpoints require an authenticated administrator. Social analytics adapter endpoints require a signed internal service token derived from the shared application secret; the raw secret must never be sent over the network.
