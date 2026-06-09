# PayPal Subscription System Setup Guide

## Overview
This guide covers the complete setup of the PayPal subscription system for the Soma Digital platform.

## 1. PayPal Developer Setup

### Create PayPal Business Account
1. Go to https://www.paypal.com/business
2. Sign up for a business account

### Create App in Developer Dashboard
1. Visit https://developer.paypal.com/dashboard/
2. Log in with your PayPal account
3. Create a new App (both Sandbox and Live)
4. Note your:
   - **Client ID** (for frontend)
   - **Client Secret** (for backend only, never expose)

### Create Billing Plans
1. In PayPal Developer Dashboard, go to **Billing Plans**
2. Create three subscription plans:
   - **Explorer Plan** (Monthly, $29)
   - **Pro Plan** (Monthly, $97)
   - **Elite Soma Plan** (Monthly, $297)
3. Copy each plan's ID

### Configure Webhook
1. In Developer Dashboard, go to **Webhooks**
2. Create new webhook for your Firebase Function endpoint:
   ```
   https://us-central1-[PROJECT_ID].cloudfunctions.net/paypalWebhook
   ```
3. Subscribe to these events:
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
4. Copy the **Webhook ID**

## 2. Environment Variables

### Frontend (.env.local)
```env
NEXT_PUBLIC_PAYPAL_CLIENT_ID=<your-paypal-client-id>
```

### Firebase Functions (.env)
```env
# PayPal Configuration
PAYPAL_ENV=sandbox  # Use 'production' for live
PAYPAL_CLIENT_ID=<your-paypal-client-id>
PAYPAL_CLIENT_SECRET=<your-paypal-client-secret>
PAYPAL_WEBHOOK_ID=<your-webhook-id>

# Plan IDs (from PayPal Developer Dashboard)
PAYPAL_PLAN_EXPLORER=<plan-id-for-explorer>
PAYPAL_PLAN_PRO=<plan-id-for-pro>
PAYPAL_PLAN_ELITE=<plan-id-for-elite-soma>

# Frontend URL for callbacks
FRONTEND_URL=http://localhost:3000  # Change to your domain in production
```

### Firebase Config (Alternative to .env)
Instead of environment variables, you can store in Firebase Config:
```bash
firebase functions:config:set paypal.clientId="<CLIENT_ID>"
firebase functions:config:set paypal.clientSecret="<CLIENT_SECRET>"
firebase functions:config:set paypal.webhookId="<WEBHOOK_ID>"
firebase functions:config:set paypal.planExplorer="<PLAN_ID>"
firebase functions:config:set paypal.planPro="<PLAN_ID>"
firebase functions:config:set paypal.planElite="<PLAN_ID>"
```

## 3. Firestore Schema

The system automatically creates these collections:

### /subscriptions/{subscriptionId}
```json
{
  "userId": "user-uid",
  "planId": "pro",
  "paypalSubscriptionId": "I-XXXXXXXXXX",
  "status": "active",
  "currentPeriodStart": "2024-05-29T00:00:00Z",
  "currentPeriodEnd": "2024-06-29T00:00:00Z",
  "createdAt": "2024-05-29T10:00:00Z",
  "cancelledAt": null,
  "updatedAt": "2024-05-29T10:00:00Z"
}
```

### /webhook_events/{eventId}
```json
{
  "eventId": "WH-XXXXXXXXXX",
  "eventType": "BILLING.SUBSCRIPTION.ACTIVATED",
  "subscriptionId": "I-XXXXXXXXXX",
  "processedAt": "2024-05-29T10:00:00Z"
}
```

## 4. Firestore Security Rules

Add to your `firestore.rules`:

```firestore
match /subscriptions/{subscriptionId} {
  // Users can read their own subscription records
  allow read: if request.auth.uid != null && 
              request.auth.uid == resource.data.userId;
  
  // Only backend can write to subscriptions (via webhook)
  allow write: if false;
  
  // Admins can read all subscriptions
  allow read: if request.auth.token.admin == true;
}

match /webhook_events/{eventId} {
  // Only backend writes webhook events
  allow write: if false;
  allow read: if request.auth.token.admin == true;
}
```

## 5. Deploy Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

## 6. Custom Claims & Authentication

The system automatically sets custom claims on the user's Firebase Auth token:
- `subscriptionTier`: Set to plan ID when subscription is active (e.g., "pro")
- When subscription expires/cancels, reset to "explorer"

To check claims in frontend:
```typescript
const claims = auth.currentUser?.getIdTokenResult();
console.log(claims?.claims.subscriptionTier); // "pro", "elite", or "explorer"
```

## 7. Testing in Sandbox

### Test Cards
Use these test cards in PayPal Sandbox:
- **Success**: 4111111111111111
- **Failure**: 5555555555554444

### Test Flow
1. Click "Upgrade" in dashboard
2. Select plan
3. You'll be redirected to PayPal
4. Complete payment with test card
5. After approval, you'll be redirected back
6. Token is refreshed with new `subscriptionTier`

## 8. Production Deployment

Before going live:

1. **Update PayPal Environment**
   - Change `PAYPAL_ENV` to `production`
   - Use live Client ID and Secret
   - Update webhook to production URL

2. **Update Frontend URL**
   - Change `FRONTEND_URL` in Functions environment

3. **Firestore Rules**
   - Deploy production rules

4. **Test with Real Account**
   - Use real PayPal account for testing
   - Verify webhook processing

5. **Monitor**
   - Check Firebase Functions logs
   - Monitor Firestore for subscription records
   - Set up alerts for failed webhooks

## 9. Troubleshooting

### Webhooks Not Processing
1. Check PayPal Webhook Status in Developer Dashboard
2. Verify webhook signature validation passes
3. Check Firebase Functions logs

### Subscription Not Activated
1. Ensure webhook for `BILLING.SUBSCRIPTION.ACTIVATED` is subscribed
2. Check that `currentPeriodEnd` is calculated correctly

### Token Not Refreshing
1. Ensure `refreshUserToken()` is called after approval
2. Verify custom claim is set in Firebase Auth
3. Check user can access premium features after token refresh

### Payment Failures
1. Verify PayPal plan IDs are correct
2. Ensure return/cancel URLs are accessible
3. Check browser console for SDK errors

## 10. API Reference

### Frontend Hooks

#### usePayPalSubscription()
```typescript
const {
  initializeSubscription,    // (planId) => Promise<{subscriptionId, approvalUrl}>
  cancel,                     // (subscriptionId) => Promise<boolean>
  refreshUserToken,          // () => Promise<void>
  loading,                    // boolean
  error,                      // string | null
  setError,                   // (error) => void
} = usePayPalSubscription();
```

### Components

#### PayPalSubscribeButtons
```tsx
<PayPalSubscribeButtons
  planId="pro"
  planName="Pro Member"
  onSuccess={() => console.log('Success!')}
  onError={(error) => console.log(error)}
  onCancel={() => console.log('Cancelled')}
/>
```

#### SubscriptionManager
```tsx
<SubscriptionManager />
```

### Backend Functions

#### createPayPalSubscription
```typescript
const result = await httpsCallable(functions, 'createPayPalSubscription')({
  planId: 'pro',
  userId: 'user-uid'
});
// Returns: { subscriptionId, approvalUrl }
```

#### cancelPayPalSubscription
```typescript
await httpsCallable(functions, 'cancelPayPalSubscription')({
  subscriptionId: 'I-XXXXXXXXXX'
});
```

## 11. Support & Resources

- [PayPal Developer Docs](https://developer.paypal.com/docs/)
- [PayPal Subscription API](https://developer.paypal.com/docs/api/subscriptions/v1/)
- [React PayPal JS](https://github.com/paypal/react-paypal-js)
