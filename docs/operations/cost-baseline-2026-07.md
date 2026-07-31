# July 2026 Infrastructure Cost Baseline

Reporting period: 2026-07-01 through 2026-07-31.

## Confirmed Usage

| Service | Usage | Reported amount | Finding |
| --- | ---: | ---: | --- |
| Secret Manager replica storage | 24.36 replica-months | $1.10 | Primary cost driver |
| Cloud Scheduler | 202 billed job units | $0.35 | Small fixed resource charge |
| Cloud Run Functions CPU | 8,709.69 seconds | $0.21 gross, offset in detailed report | No current net charge |
| Cloud Run Functions invocations | 9,668 | $0.00 | Within current allowance/credits |
| Cloud Run Functions memory | 1,594.85 seconds | $0.00 | No current charge |
| Secret access operations | 1,364 | $0.00 | Below the free allowance |
| Firestore reads | 81,073 | $0.00 | Monitor growth and read amplification |
| Firestore writes | 8,781 | $0.00 | Monitor scheduled write volume |
| Firestore deletes | 450 | $0.00 | No current charge |

The detailed export reports a final subtotal of **$1.45**. The SKU summary shows **$1.66** before the $0.21 Functions adjustment. The difference matches the CPU credit recorded in the detailed export.

## Live Resource Inventory

- 10 enabled Cloud Scheduler jobs.
- 22 Secret Manager secret names.
- 27 enabled secret versions based on the supplied inventory.
- Duplicate legacy PayPal names remain alongside the canonical underscore names.

## Review Cadence

Capture the same values weekly for the next month, then monthly. Billing Reports remain the financial source of truth. Cloud Monitoring supplies Function-level execution metrics, and Secret Manager audit logs supply actual secret callers.

## Guardrails

- Do not delete a secret until every deployed caller has been migrated and verified.
- Do not grant broad logging roles to expose audit data.
- Treat scheduled HTTP endpoints as privileged internal operations.
- Compare net subtotal and gross SKU amounts separately when credits or adjustments appear.
