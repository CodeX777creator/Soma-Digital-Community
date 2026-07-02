# Billing System Quick Reference

## Common Operations

### Checking User Subscription Status

```typescript
import { useSubscription } from '@/hooks/useSubscription';

const { checkSubscriptionStatus } = useSubscription();
const status = await checkSubscriptionStatus();
// Returns: { tier: 'pro', expiresAt: Date, status: 'active', provider: 'paypal' }
```

### Creating a Subscription

```typescript
// PayPal
const { createPayPalSubscription } = useSubscription();
await createPayPalSubscription('pro');
// Redirects to PayPal

// Paystack
const { initializePaystackTransaction } = useSubscription();
await initializePaystackTransaction('elite');
// Redirects to Paystack
```

### Cancelling a Subscription

```typescript
const { cancelSubscription } = useSubscription();
await cancelSubscription(); // Auto-detects active subscription
// Or specify: await cancelSubscription('sub_123');
```

### Checking Entitlements

```typescript
import { useUserStore } from '@/store/useUserStore';
import { TierGuard, FeatureGate } from '@/components/auth/TierGuard';

// Get current tier
const { tier } = useUserStore(); // 'explorer' | 'pro' | 'elite'

// Route guard
<TierGuard minTier="pro">
  <PremiumContent />
</TierGuard>

// Feature gate
<FeatureGate featureId="ai_mentor">
  <AIMentor />
</FeatureGate>
```

---

## Webhook Events Reference

### PayPal Events

| Event | Action | Status Change |
|-------|--------|---------------|
| `BILLING.SUBSCRIPTION.CREATED` | Subscription created | `created` |
| `BILLING.SUBSCRIPTION.ACTIVATED` | Payment successful | `active` |
| `BILLING.SUBSCRIPTION.UPDATED` | Plan changed | `active` |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED` | Payment failed | `past_due` |
| `BILLING.SUBSCRIPTION.SUSPENDED` | Multiple failures | `suspended` |
| `BILLING.SUBSCRIPTION.RE-ACTIVATED` | Payment resolved | `active` |
| `BILLING.SUBSCRIPTION.CANCELLED` | User/provider cancelled | `cancelled` |
| `BILLING.SUBSCRIPTION.EXPIRED` | Subscription ended | `expired` |

### Paystack Events

| Event | Action | Status Change |
|-------|--------|---------------|
| `charge.success` | Payment successful | `active` |
| `subscription.disable` | Subscription disabled | `cancelled` |
| `subscription.deactivate` | Subscription deactivated | `cancelled` |
| `subscription.not_funded` | Insufficient funds | `past_due` |
| `charge.failed` | Charge failed | `past_due` |
| `invoice.create` | New invoice | No change |
| `invoice.update` | Invoice updated | No change |

---

## Firestore Schema

### subscriptions/{subscriptionId}

```typescript
{
  userId: string;
  planId: 'explorer' | 'pro' | 'elite';
  status: 'approval_pending' | 'created' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired';
  provider: 'paypal' | 'paystack';
  subscriptionPlan: string; // Canonical
  subscriptionStatus: string; // Canonical
  subscriptionId: string;
  currentPeriodEnd: Timestamp | null;
  paypalSubscriptionId?: string;
  paystackReference?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  cancelledAt?: Timestamp;
}
```

### users/{userId}

```typescript
{
  subscription: {
    provider: string;
    subscriptionPlan: string;
    subscriptionStatus: string;
    subscriptionId: string;
    currentPeriodEnd: string | null;
    updatedAt: Timestamp;
  };
  subscriptionTier: 'explorer' | 'pro' | 'elite';
  tier: 'explorer' | 'pro' | 'elite';
}
```

### webhook_events/{eventId}

```typescript
{
  eventId: string;
  eventType: string;
  subscriptionId: string;
  processedAt: Timestamp;
  status: 'processing' | 'success' | 'error' | 'skipped';
  error?: string;
  reason?: string;
}
```

---

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `unauthenticated` | User not signed in | Redirect to login |
| `permission-denied` | Wrong userId | Check auth state |
| `invalid-argument` | Missing/invalid params | Validate inputs |
| `failed-precondition` | Pre-req not met (no email) | Complete profile |
| `not-found` | Subscription doesn't exist | Refresh and retry |
| `internal` | Server error | Retry or contact support |

---

## Testing Commands

### Deploy Functions
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Test Webhooks Locally
```bash
# PayPal
ngrok http 5001
# Update webhook URL in PayPal dashboard to ngrok URL

# Paystack
ngrok http 5001
# Update webhook URL in Paystack dashboard to ngrok URL
```

### Simulate Events (PayPal)
```bash
curl -X POST https://api.sandbox.paypal.com/v1/billing/subscriptions/{id}/simulate-event \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "TEST"}'
```

---

## Troubleshooting

### Webhook Not Received
1. Check webhook URL is correct in provider dashboard
2. Verify SSL certificate is valid
3. Check Firebase Functions logs
4. Ensure function is deployed: `firebase functions:list`

### Signature Verification Failing
1. **PayPal:** Verify webhook ID matches secret
2. **Paystack:** Ensure raw body is preserved
3. Check environment variables are set
4. Verify no middleware modifies request body

### Duplicate Subscriptions
1. Check idempotency logic is working
2. Verify UI prevents double-clicks
3. Check network tab for duplicate requests

### Grace Period Not Working
1. Verify `currentPeriodEnd` is set correctly
2. Check entitlement logic uses `isAfter(currentPeriodEnd, now)`
3. Ensure cancelled status + period end = access granted

---

## Support Contacts

- **PayPal Developer:** developer.paypal.com/support
- **Paystack Support:** support@paystack.com
- **Internal:** #payments-alerts Slack
- **On-call:** Check PagerDuty schedule

---

## Related Documentation

- [Full Audit Report](./BILLING_AUDIT_REPORT.md)
- [Testing Checklist](./BILLING_TESTING_CHECKLIST.md)
- [Fixes Summary](./BILLING_FIXES_SUMMARY.md)
- [PayPal Setup](./PAYPAL_SETUP.md)
- [Paystack Setup](./PAYSTACK_SETUP.md)
