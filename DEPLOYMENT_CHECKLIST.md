# Deployment Checklist

This checklist covers production deployment for the Soma Digital app with Vercel frontend and Firebase Functions backend, including PayPal and Paystack.

## 1. Firebase Functions

### Build and deploy
1. `cd functions`
2. `npm install`
3. `npm run build`
4. `firebase deploy --only functions`

### Verify deployed functions
- `createPayPalSubscription` (callable)
- `cancelPayPalSubscription` (callable)
- `createPaystackSubscription` (callable)
- `cancelPaystackSubscription` (callable)
- `paypalWebhook` (HTTP endpoint)
- `paystackWebhook` (HTTP endpoint)

### Set production function environment variables
Use the Firebase Console or `firebase functions:config:set`.

#### PayPal
```bash
firebase functions:config:set paypal.env="production"
firebase functions:config:set paypal.client_id="<LIVE_PAYPAL_CLIENT_ID>"
firebase functions:config:set paypal.client_secret="<LIVE_PAYPAL_CLIENT_SECRET>"
firebase functions:config:set paypal.webhook_id="<LIVE_PAYPAL_WEBHOOK_ID>"
firebase functions:config:set paypal.plan_explorer="<PLAN_ID_EXPLORER>"
firebase functions:config:set paypal.plan_pro="<PLAN_ID_PRO>"
firebase functions:config:set paypal.plan_elite="<PLAN_ID_ELITE>"
```

#### Paystack
```bash
firebase functions:config:set paystack.secret_key="<LIVE_PAYSTACK_SECRET_KEY>"
firebase functions:config:set paystack.currency="USD"
firebase functions:config:set paystack.amount_explorer="2900"
firebase functions:config:set paystack.amount_pro="9700"
firebase functions:config:set paystack.amount_elite="29700"
```

#### Shared
```bash
firebase functions:config:set app.frontend_url="https://your-vercel-domain.com"
```

> If your functions code reads `process.env.*` directly, set env vars via the Firebase Console runtime environment variables or deploy-time configuration.

## 2. Vercel frontend

### Configure Vercel environment variables
Set these in your Vercel project settings for the production environment.

#### Firebase client
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (if used)

#### PayPal
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID=<LIVE_PAYPAL_CLIENT_ID>`

#### Any other frontend runtime config
- `NEXT_PUBLIC_API_BASE_URL` or similar if present
- `NEXT_PUBLIC_APP_NAME`, etc.

### Deploy frontend
- Use the Vercel dashboard or CLI
- Confirm the production URL matches `FRONTEND_URL` used in Functions

## 3. PayPal production checklist

### Developer account setup
- Confirm live PayPal app is created in https://developer.paypal.com
- Confirm live Client ID and Secret are copied correctly
- Confirm live Billing Plan IDs are created and mapped correctly

### Webhook setup
- Add production webhook URL in PayPal dashboard:
  `https://[YOUR_FUNCTION_REGION]-[PROJECT_ID].cloudfunctions.net/paypalWebhook`
- Subscribe to these events:
  - `BILLING.SUBSCRIPTION.CREATED`
  - `BILLING.SUBSCRIPTION.ACTIVATED`
  - `BILLING.SUBSCRIPTION.CANCELLED`
  - `BILLING.SUBSCRIPTION.EXPIRED`
- Record the webhook ID and store it in your environment config

### Confirm callback URL
- `FRONTEND_URL` in functions should match your Vercel production URL
- Example: `https://app.example.com`

## 4. Paystack production checklist

### Account setup
- Confirm Paystack is in live mode
- Copy the live secret key

### Webhook setup
- Add production webhook URL in Paystack dashboard:
  `https://[YOUR_FUNCTION_REGION]-[PROJECT_ID].cloudfunctions.net/paystackWebhook`
- Confirm the webhook is active

### Amount values
- Ensure `PAYSTACK_AMOUNT_<plan>` values are in smallest currency unit
  - Example: `9700` for ₦97.00
  - Example: `29700` for ₦297.00

### Confirm callback URL
- `FRONTEND_URL` should point to your Vercel domain so Paystack returns users there

## 5. Verification after deployment

### Smoke checks
- Open the app at your Vercel production URL
- Log in with a real production account or authenticated test account
- Open the upgrade modal and confirm both PayPal and Paystack options render
- Attempt a checkout flow for each provider (sandbox/test or live if ready)
- Confirm redirect returns to `https://yourapp.com/dashboard?subscription=success`
- Confirm user token refreshes and premium access updates

### Confirm Firestore writes
- `users/{uid}.subscription` updates to the canonical state
- `subscriptions/{subscriptionId}` audit record exists
- `webhook_events/{eventId}` records webhook events

### Logs and monitoring
- Check Firebase Functions logs for successful webhook handling
- Confirm no repeated webhook failures or signature errors
- Monitor Vercel deployment logs for frontend runtime issues

## 6. Redeploy rules

### When to redeploy functions
- backend code changes
- env vars change
- webhook URL or callback URL changes
- new cloud function exports are added

### When to redeploy frontend
- UI or frontend code changes
- frontend env vars change
- new feature or provider toggle added

## 7. Common pitfalls

- `FRONTEND_URL` mismatch between Vercel and Functions
- missing production PayPal webhook subscription
- Paystack signature failure due to wrong secret key
- amount values not in smallest currency unit
- deploying frontend but not deploying functions

## 8. Quick production commands

```bash
cd functions
npm run build
firebase deploy --only functions
```

```bash
vercel --prod
```

If you want, I can also add this checklist to the top of `PAYPAL_SETUP.md` and `PAYSTACK_SETUP.md` as a shared production deployment section.