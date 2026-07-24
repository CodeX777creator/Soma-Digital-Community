# Architecture Audit

Audit the existing implementation.

Compare the codebase against the architecture.

Identify:

Missing features

Duplicate functionality

Dead code

Security issues

Performance issues

Technical debt

Architecture violations

Do not modify code.

Produce:

Current architecture

Gap analysis

Migration plan

Risk assessment

Wait for approval before implementation.

For AI, Academy, and monetization audits, also verify:

- model catalog sync and routing config visibility in the admin panel
- credit accounting and fallback behavior
- Academy gating, discussions, tutor history, and manual review flows
- Firestore indexes for all multi-filter and sorted queries
- documentation alignment across architecture, decisions, prompts, and README
