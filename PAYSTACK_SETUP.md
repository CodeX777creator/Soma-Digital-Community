# Paystack Setup

This document explains how to configure Paystack for the functions-based Paystack adapter in this repo.

## Overview
- The Paystack adapter is implemented in `functions/src/paystack.ts`.
- It creates a checkout transaction using Paystack's `transaction/initialize` endpoint.
- It stores audit history in `subscriptions/{subscriptionId}` and authoritative entitlement data in `users/{uid}.subscription`.
- The frontend uses `src/hooks/usePaystackSubscription.ts` and `src/components/premium/PaystackSubscribeButtons.tsx`.
- This integration is adapter-based: the app only trusts `users/{uid}.subscription` for premium access.

## 1. Paystack account setup

### Register for Paystack
1. Create a Paystack account at https://paystack.com.
2. Switch between **Test** and **Live** mode in the dashboard.
3. Copy your **Secret Key** for the correct mode.

### Plan mapping
This repo does not require Paystack subscription plan objects.
Instead, the backend maps plan IDs to charge amounts using env vars:
- `explorer` → `PAYSTACK_AMOUNT_EXPLORER`
- `pro` → `PAYSTACK_AMOUNT_PRO`
- `elite` → `PAYSTACK_AMOUNT_ELITE`

That means you do not need to create Paystack plans in the dashboard. You only need a Paystack account and API secret.

## 2. Required environment variables

### Firebase Functions
```env
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_CURRENCY=USD
PAYSTACK_AMOUNT_EXPLORER=2900
PAYSTACK_AMOUNT_PRO=9700
PAYSTACK_AMOUNT_ELITE=29700
FRONTEND_URL=https://yourapp.com
```

### Variable details
- `PAYSTACK_SECRET_KEY` — required for API calls and webhook validation.
- `PAYSTACK_CURRENCY` — optional, defaults to `USD`.
- `PAYSTACK_AMOUNT_EXPLORER` — integer in smallest currency unit (e.g. 2900 for $29.00).
- `PAYSTACK_AMOUNT_PRO` — integer in smallest currency unit.
- `PAYSTACK_AMOUNT_ELITE` — integer in smallest currency unit.
- `FRONTEND_URL` — frontend base URL used to build the Paystack callback URL.

### Example values
```bash
PAYSTACK_SECRET_KEY=sk_test_aBcDeFg12345
PAYSTACK_CURRENCY=USD
PAYSTACK_AMOUNT_EXPLORER=2900
PAYSTACK_AMOUNT_PRO=9700
PAYSTACK_AMOUNT_ELITE=29700
FRONTEND_URL=https://app.example.com
```

### Storing env vars
Use one of these approaches:
- `firebase functions:config:set` / Firebase Console runtime config
- Google Secret Manager with `functions.config()` or env var binding
- `process.env` in a deploy environment if using `firebase deploy`

## 3. Paystack function flow

### createPaystackSubscription
- Called by `src/hooks/usePaystackSubscription.ts` using Firebase Functions `httpsCallable`.
- Verifies the user is authenticated and matches `userId`.
- Reads `PAYSTACK_AMOUNT_<plan>` for the selected plan.
- Initializes a Paystack transaction with `email`, `amount`, `currency`, and `callback_url`.
- Saves an initial `subscriptions/{subscriptionId}` record with `status: approval_pending`.
- Returns `authorizationUrl` and `subscriptionId`.

### paystackWebhook
- Receives webhooks from Paystack at `/paystackWebhook`.
- Verifies `x-paystack-signature` using the secret key and raw request body.
- Deduplicates webhook events in `webhook_events/{eventId}`.
- Updates the `subscriptions/{subscriptionId}` audit record.
- Writes canonical entitlement to `users/{uid}.subscription`.

### cancelPaystackSubscription
- User-initiated cancellation via callable function.
- Confirms the subscription belongs to the current user.
- Attempts to disable the Paystack subscription via API.
- Updates local subscription state and canonical user subscription to `cancelled`.

## 4. Frontend integration

### Checkout hook
Frontend uses `src/hooks/usePaystackSubscription.ts`:
- `initializeSubscription(planId)` → returns `{ subscriptionId, authorizationUrl }`
- `cancel(subscriptionId)` → cancels the Paystack subscription
- `refreshUserToken()` → refreshes Firebase Auth token after subscription changes

### Checkout button
`src/components/premium/PaystackSubscribeButtons.tsx`:
- Calls `initializeSubscription` when user clicks Subscribe
- Redirects browser to Paystack checkout URL
- Detects `?subscription=success` in URL after return
- Refreshes user token after success

### Provider selection
`src/components/premium/UpgradeModal.tsx` now supports both PayPal and Paystack.

## 5. Firestore schema

### `users/{uid}.subscription`
This is the source of truth for entitlement. Example shape:
```json
{
  "provider": "paystack",
  "subscriptionPlan": "pro",
  "subscriptionStatus": "active",
  "subscriptionId": "PSK-12345",
  "currentPeriodEnd": "2026-06-30T00:00:00.000Z"
}
```

### `subscriptions/{subscriptionId}`
Audit/history document example:
```json
{
  "userId": "uid_123",
  "planId": "pro",
  "paystackReference": "PSK-12345",
  "provider": "paystack",
  "status": "active",
  "currentPeriodEnd": "2026-06-30T00:00:00.000Z",
  "createdAt": "2026-05-30T12:00:00.000Z",
  "cancelledAt": null,
  "updatedAt": "2026-05-30T12:00:00.000Z"
}
```

### `webhook_events/{eventId}`
Webhook deduplication document example:
```json
{
  "eventId": "123456",
  "eventType": "charge.success",
  "subscriptionId": "PSK-12345",
  "processedAt": "2026-05-30T12:00:00.000Z"
}
```

## 6. Webhook configuration

### Paystack dashboard
1. Go to **Settings → Webhooks**.
2. Add your deployed webhook URL:
   - `https://REGION-PROJECT.cloudfunctions.net/paystackWebhook`
3. Use the same key as `PAYSTACK_SECRET_KEY`.
4. Test with the Paystack webhook simulator if available.

### Events handled by the adapter
The current implementation updates canonical state for:
- `charge.success` → active
- `subscription.disable` / `subscription.deactivate` → cancelled
- `charge.dispute` / `charge.refund` → expired

### Signature validation
The function uses:
- header: `x-paystack-signature`
- algorithm: `HMAC-SHA512`
- payload: raw request body
- secret: `PAYSTACK_SECRET_KEY`

## 7. Testing locally

### Run functions locally
Use Firebase Emulator or your local HTTP server for functions.

### Expose your local webhook endpoint
Use `ngrok` or similar to create a public URL:
```bash
ngrok http 5001
```
Then configure Paystack to send webhooks to that public URL.

### Example webhook test script
```js
// test-send-webhook.js
const fetch = require('node-fetch');
const crypto = require('crypto');

const SECRET = process.env.PAYSTACK_SECRET_KEY;
const url = 'https://<your-public-url>/paystackWebhook';

const payload = {
  event: 'charge.success',
  data: {
    reference: 'TEST-REF-123',
    metadata: { userId: 'UID_EXAMPLE', planId: 'pro' },
    next_payment_date: '2026-06-30T00:00:00.000Z'
  }
};

const body = JSON.stringify(payload);
const signature = crypto.createHmac('sha512', SECRET).update(body).digest('hex');

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-paystack-signature': signature,
  },
  body,
})
  .then((r) => r.json())
  .then(console.log)
  .catch(console.error);
```

### Notes
- `next_payment_date` is used to set `currentPeriodEnd`.
- The adapter also falls back to a 30-day period if Paystack does not supply `next_payment_date`.

## 8. Deployment

### Build and deploy functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### Confirm deployed URLs
- `createPaystackSubscription` (callable)
- `cancelPaystackSubscription` (callable)
- `paystackWebhook` (HTTP endpoint)

## 9. Troubleshooting

### No checkout URL returned
- Confirm `PAYSTACK_AMOUNT_<plan>` values are set and non-zero.
- Confirm `FRONTEND_URL` is configured.
- Check the function logs for `Failed to create Paystack subscription`.

### Webhook signature errors
- Confirm Paystack is using the same secret as `PAYSTACK_SECRET_KEY`.
- Ensure your webhook payload is raw JSON; the function validates the raw body.
- If using an emulator, verify request body parsing preserves raw bytes.

### User not upgraded after payment
- Confirm webhook events are reaching the function.
- Confirm `users/{uid}.subscription` is updated.
- Confirm frontend refreshes the token after `?subscription=success`.

### Invalid plan IDs
- Paystack metadata stores `planId` and the adapter normalizes it to `explorer|pro|elite`.
- If the plan is invalid, the adapter falls back to `explorer`.

## 10. Optional add-ons

### Add this link to the repo README
```md
- [Paystack Setup](PAYSTACK_SETUP.md)
```

### Add a simple test script in the repo
Create `functions/scripts/test-paystack-webhook.js` and run it with:
```bash
PAYSTACK_SECRET_KEY=sk_test_xxx node functions/scripts/test-paystack-webhook.js
```

If you want, I can also generate that webhook test script in the repo and add a README section for it.