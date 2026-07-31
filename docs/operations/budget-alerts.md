# SDC Budget Alerts

This document turns the July 2026 billing baseline into a repeatable Google Cloud alert setup.

## Baseline

The supplied July Firebase billing exports show:

| Signal | July baseline |
| --- | ---: |
| Final Firebase report subtotal | `$1.45` |
| Functions invocations | `9,668` |
| Firestore reads | `81,073` |
| Firestore writes | `8,781` |
| Secret Manager access operations | `1,364` |
| Active Secret Manager versions | `27` |
| Cloud Scheduler jobs | `10` |

The summary export showed `$1.66` before a `$0.21` Functions adjustment. Use the final detailed report as the financial baseline and keep both figures in the monthly reconciliation note.

## Billing budget

Create a Cloud Billing budget for the project and set the initial monthly amount to `$3.00` while the workload is being observed. This is intentionally above the `$1.45` baseline and leaves room for normal growth without hiding a spike.

Configure alerts at:

- 50% of budget: email notification only.
- 75% of budget: email plus operations notification.
- 100% of budget: email plus incident notification.
- Forecasted 100%: email immediately; investigate before the month closes.

After two full weeks of normal production data, replace the fixed amount with the approved monthly operating budget. Billing alerts notify; they do not automatically stop Functions or Scheduler jobs.

## Monitoring policies

Create log-based metrics from `[ScheduledJob] completed` and `[ScheduledJob] failed` entries:

- `sdc/scheduled_job_completed_count`, grouped by `jobName`.
- `sdc/scheduled_job_failed_count`, grouped by `jobName`.
- `sdc/scheduled_job_duration_ms`, grouped by `jobName`.

Alert when:

- Any five-minute publisher job has more than 3 failures in 30 minutes.
- A job's 24-hour invocation count is more than 2x its trailing seven-day average.
- Any worker has 3 consecutive failures.
- A worker duration exceeds 80% of its configured timeout for 3 runs.

Use Cloud Monitoring dashboards for Function invocations, execution time, errors, retries, Firestore operations, Scheduler executions, Secret Manager access operations, Storage growth, and external provider failures.

## Secret Manager audit logging

Enable only Secret Manager `DATA_READ` audit logs for `AccessSecretVersion` while investigating access volume. Do not grant `roles/logging.logWriter` to `allAuthenticatedUsers`. The application does not need a new IAM grant for audit logging.

Review access logs for seven days, then reduce the logging scope if the investigation is complete.

## Weekly review

Compare the current week with the baseline for:

- Function invocations and GB-seconds.
- Firestore reads/writes/deletes.
- Secret Manager active versions and access operations.
- Scheduler job count and execution counts.
- Social/API retries and failed publish attempts.
- AI generation volume and storage growth.

Record the comparison in the monthly baseline report before changing schedules or deleting secrets.
