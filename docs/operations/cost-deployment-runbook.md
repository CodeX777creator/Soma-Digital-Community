# Cost-Control Deployment Runbook

## Deployment order

1. Deploy structured scheduled-job telemetry and create the Monitoring dashboard.
2. Deploy canonical Secret Manager references and warm-instance secret caching.
3. Deploy Scheduler authentication for administrative and internal HTTP jobs.
4. Deploy worker idempotency, leases, retry limits, and bounded queries.
5. Deploy Firestore index changes before enabling the new query shapes.
6. Observe seven days of invocations, reads, writes, retries, and provider calls.
7. Disable legacy secret references only after all callers are verified.
8. Destroy obsolete secret versions only after the seven-day verification window.
9. Consider Scheduler consolidation only when telemetry shows a smaller failure boundary and lower downstream work.

## Verification after each deployment

Check:

- Function invocation count and execution duration.
- Function errors, retries, and timeout rate.
- Firestore reads, writes, and deletes.
- Secret Manager `AccessSecretVersion` operations.
- Scheduler execution success and overlap.
- Social provider calls and publish outcomes.
- Payment webhook processing and idempotency.

Compare the result with `docs/operations/cost-baseline-2026-07.md`.

## Rollback rules

- If a new query returns index errors, restore the previous query only after confirming the missing index and deploy the index separately.
- If a worker starts duplicating work, disable its Scheduler job, inspect leases and idempotency records, then re-enable after the guard is corrected.
- If publishing or payment processing regresses, keep the webhook and provider functions available while rolling back only the affected worker.
- Do not delete secret versions during a code rollback.
- Do not merge Scheduler jobs during an incident.

## Completion criteria

The optimization is complete only when:

- All scheduled workers have bounded reads and hard batch limits.
- Repeated work is protected by leases or deterministic records.
- Secrets are cached per warm instance and legacy names are no longer referenced.
- The monitoring dashboard is receiving job completion/failure events.
- The same business workflows still pass payment, publishing, notification, analytics, and mission tests.
