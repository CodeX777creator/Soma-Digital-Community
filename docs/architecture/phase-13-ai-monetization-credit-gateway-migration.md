# Phase 13 Migration Note - AI Monetization, Credit Management, and BYOK Gateway

## What changed

- Added a centralized monetization service under `src/services/ai-platform`.
- Added encrypted BYOK provider storage with AES-GCM.
- Added immutable creator credit ledger support.
- Added user-facing credit and provider settings screens.
- Added API routes for credit dashboards and provider management.
- Extended provider routing to recognize xAI, Meta, and Mistral identifiers for BYOK readiness.

## New service surfaces

- `src/services/ai-platform/types.ts`
- `src/services/ai-platform/config.ts`
- `src/services/ai-platform/crypto.ts`
- `src/services/ai-platform/byok.ts`
- `src/services/ai-platform/credits.ts`
- `src/services/ai-platform/orchestrator.ts`
- `src/services/ai-platform/gateway.ts`
- `src/services/ai-platform/index.ts`

## AI execution flow

1. Authenticate the user.
2. Resolve plan and routing tier.
3. Decide whether BYOK is available for the chosen provider.
4. Reserve creator credits when SDC billing applies.
5. Execute the AI request through the shared gateway.
6. Finalize or refund credits.
7. Persist an immutable ledger record.

## Firestore collections

- `creatorCreditAccounts`
- `creatorCreditLedger`
- `aiProviderConnections`
- `aiUsageEvents`

## API routes

- `GET /api/creator-credits`
- `GET /api/ai/providers`
- `POST /api/ai/providers`
- `PATCH /api/ai/providers/[providerId]`
- `POST /api/ai/providers/[providerId]` with `{ action: "test" }`
- `DELETE /api/ai/providers/[providerId]`

## Notes

- Provider keys are encrypted at rest and never returned to the browser.
- Credit usage is represented as Creator Credits, not provider pricing.
- The production build currently still fails on an existing social app server/client boundary unrelated to this monetization slice.

