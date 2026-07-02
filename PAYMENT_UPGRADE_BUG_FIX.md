# Payment Upgrade Bug Fix

## Problem Summary

Users were incorrectly appearing as upgraded (Pro/Elite tier) even when they:
1. Selected Paystack but got an internal error
2. Selected PayPal and dropped payment midway (abandoned checkout)

The user would return to the dashboard with `?subscription=success` and appear upgraded without actually completing payment.

## Root Cause

The bug was in the `saveCanonicalSubscriptionState` function across multiple files:

1. **`functions/src/paypal.ts`**
2. **`functions/src/paystack.ts`**
3. **`functions/src/billing-helpers.ts`**

When a subscription was created (with `status: 'approval_pending'`), the function **always** updated the user's `tier` and `subscriptionTier` fields in Firestore, regardless of whether the payment was actually completed.

### Code Flow That Caused the Bug:

1. User clicks "Go Elite" → `createPayPalSubscription` or `createPaystackSubscription` is called
2. Subscription document created with `status: 'approval_pending'`
3. `saveCanonicalSubscriptionState` called with `state.subscriptionStatus = 'expired'` (for pending)
4. **BUG**: User's tier was ALWAYS updated to 'elite' in Firestore, even for pending subscriptions
5. User returns to dashboard with `?subscription=success`
6. `syncProfile` reads the tier from user document and shows them as upgraded

## Fixes Applied

### 1. Backend: `saveCanonicalSubscriptionState` functions

Modified the function in all three locations to only update the user's tier when the subscription is actually `active`:

```typescript
// Only update user tier if subscription is active
// This prevents users from appearing upgraded during pending/cancelled states
if (state.subscriptionStatus === 'active') {
  batch.set(
    userRef,
    {
      subscription: { ...state, updatedAt: timestamp },
      subscriptionTier: state.subscriptionPlan,
      tier: state.subscriptionPlan,
      updatedAt: timestamp,
    },
    { merge: true }
  );
} else {
  // For non-active states, only update the subscription object without changing tier
  // This preserves the user's current tier until payment is confirmed
  batch.set(
    userRef,
    {
      subscription: { ...state, updatedAt: timestamp },
      updatedAt: timestamp,
    },
    { merge: true }
  );
}
```

### 2. Frontend: `syncProfile` in useUserStore.ts

Added defensive check to only use subscription tier if subscription is actually active:

```typescript
// Only use tier from subscription if it's active
// This prevents showing upgraded tier for pending/cancelled subscriptions
const subscription = data.subscription;
const isSubscriptionActive = subscription?.subscriptionStatus === 'active' || subscription?.status === 'active';

// Priority: active subscription.plan > subscriptionTier > tier > existing
// Only use subscription tier if subscription is actually active
const newTier = isSubscriptionActive
  ? (subscription?.subscriptionPlan || subscription?.plan)
  : (data.subscriptionTier || data.tier || state.tier);
```

## Files Modified

1. `functions/src/paypal.ts` - Fixed `saveCanonicalSubscriptionState`
2. `functions/src/paystack.ts` - Fixed `saveCanonicalSubscriptionState`
3. `functions/src/billing-helpers.ts` - Fixed `saveCanonicalSubscriptionState`
4. `src/store/useUserStore.ts` - Added defensive check in `syncProfile`

## Expected Behavior After Fix

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| Start PayPal checkout, abandon | User appears upgraded | User stays Explorer |
| Start Paystack, get error | User appears upgraded | User stays Explorer |
| Complete payment successfully | User upgraded | User upgraded (unchanged) |
| Webhook activates subscription | User upgraded | User upgraded (unchanged) |
| Subscription expires | User stays upgraded | User downgraded to Explorer |

## Testing Checklist

- [ ] Start PayPal checkout, cancel at PayPal → Return and verify still Explorer
- [ ] Start Paystack checkout, don't complete → Return and verify still Explorer
- [ ] Complete PayPal payment → Verify upgraded to Pro/Elite
- [ ] Complete Paystack payment → Verify upgraded to Pro/Elite
- [ ] Cancel active subscription → Verify downgraded to Explorer
- [ ] Let subscription expire → Verify downgraded to Explorer

## Deployment Notes

After deploying these changes:
1. Users with pending subscriptions will no longer appear upgraded
2. Active subscriptions continue to work normally
3. The webhook handlers will correctly upgrade users when payment is confirmed
4. No database migration needed - existing data is compatible
