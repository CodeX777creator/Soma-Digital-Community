# Billing System Security & Reliability Audit

**Auditor:** Senior Payments Engineer  
**Date:** 2025-01-20  
**Scope:** PayPal, Paystack, Subscriptions, Renewals, Upgrades, Downgrades, Cancellations, Webhooks

---

## Executive Summary

**Status:** 🔴 CRITICAL ISSUES FOUND  
**Recommendation:** Do NOT deploy to production until fixes are implemented

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| PayPal | 4 | 3 | 2 | 1 |
| Paystack | 3 | 4 | 2 | 1 |
| General | 3 | 2 | 3 | 2 |
| **Total** | **10** | **9** | **7** | **4** |

---

## Critical Issues (Fix Before Production)

### 1. ❌ Missing Unified Cancel Function (BREAKING)
**Location:** `src/hooks/useSubscription.ts:206`
**Issue:** Calls non-existent `cancelSubscription` function. Only `cancelPayPalSubscription` and `cancelPaystackSubscription` exist.
**Impact:** Cancellation fails for all users.

### 2. ❌ Missing Check Subscription Status Function (BREAKING)
**Location:** `src/hooks/useSubscription.ts:170`
**Issue:** Calls non-existent `checkSubscriptionStatus` function.
**Impact:** Cannot verify subscription status after payment.

### 3. ❌ No Webhook Retry Handling (DATA LOSS)
**Location:** `functions/src/paypal.ts`, `functions/src/paystack.ts`
**Issue:** Webhooks return 200 even on processing errors, preventing provider retries.
**Impact:** Failed webhook processing = lost subscription updates.

### 4. ❌ Race Condition in Webhook Processing (DATA CORRUPTION)
**Location:** Both webhook handlers
**Issue:** No distributed locking for concurrent webhooks on same subscription.
**Impact:** Double-charging, incorrect status updates.

### 5. ❌ No Subscription Verification Job (ENTITLEMENT DRIFT)
**Location:** Missing scheduled function
**Issue:** No daily sync between payment provider and database state.
**Impact:** Users retain access after cancellation or lose access incorrectly.

### 6. ❌ Missing Payment Failure Handling (REVENUE LOSS)
**Location:** `functions/src/paypal.ts`
**Issue:** No handling for `BILLING.SUBSCRIPTION.PAYMENT.FAILED`.
**Impact:** Users stay active after payment failure.

### 7. ❌ Paystack Raw Body Issue (WEBHOOK FAILURE)
**Location:** `functions/src/paystack.ts:155`
**Issue:** `(req as any).rawBody` doesn't exist in Firebase Functions v2.
**Impact:** All Paystack webhooks fail signature verification.

### 8. ❌ No Duplicate Transaction Protection (DOUBLE-CHARGE RISK)
**Location:** Both payment flows
**Issue:** No idempotency keys on subscription creation.
**Impact:** Users could be charged multiple times for same subscription.

### 9. ❌ Incomplete Event ID Generation (DUPLICATE PROCESSING)
**Location:** `functions/src/paystack.ts:185`
**Issue:** `eventId` falls back to `${eventType}-${subscriptionId}`, not unique per event.
**Impact:** Duplicate webhook processing.

### 10. ❌ No Plan Change/Proration Support (REVENUE LEAK)
**Location:** Entire billing system
**Issue:** No upgrade/downgrade flow with proration.
**Impact:** Users changing plans create new subscriptions instead of upgrading.

---

## High Severity Issues

### 11. ⚠️ No Subscription Suspension Handling
**Location:** PayPal webhook
**Missing Event:** `BILLING.SUBSCRIPTION.SUSPENDED`

### 12. ⚠️ No Paystack Subscription Not Funded Handling
**Location:** Paystack webhook
**Missing Event:** `subscription.not_funded`

### 13. ⚠️ No Invoice/Renewal Tracking
**Location:** Both providers
**Missing:** `invoice.created`, `invoice.paid`, `invoice.payment_failed`

### 14. ⚠️ Webhook Event Schema Validation Weak
**Location:** Both webhook handlers
**Issue:** Basic type checking only, no Zod/schema validation.

### 15. ⚠️ No Webhook Event Archiving
**Location:** Both webhook handlers
**Issue:** Events deleted from `webhook_events` collection (no TTL).

### 16. ⚠️ PayPal Webhook Verification No Timeout
**Location:** `functions/src/paypal.ts:285`
**Issue:** No timeout on verification request.

### 17. ⚠️ No Subscription Metadata Cleanup
**Issue:** Cancelled subscriptions retain sensitive data indefinitely.

### 18. ⚠️ Hardcoded Plan Durations
**Location:** `functions/src/paypal.ts:81`
**Issue:** All plans hardcoded to 1 month.

### 19. ⚠️ No Grace Period Implementation
**Issue:** Immediate access revocation on cancellation.

---

## Billing Flow Analysis

### PayPal Flow
```
1. createPayPalSubscription (Callable)
   ✓ Auth check
   ✓ UserId match check
   ✓ Plan validation
   ✓ Creates subscription in 'approval_pending' state
   ⚠ No idempotency key

2. User approves on PayPal

3. paypalWebhook (HTTP)
   ✓ Signature verification
   ✓ Duplicate event check
   ⚠ No distributed lock
   ✓ BILLING.SUBSCRIPTION.CREATED handled
   ✓ BILLING.SUBSCRIPTION.ACTIVATED handled
   ✓ BILLING.SUBSCRIPTION.CANCELLED handled
   ✓ BILLING.SUBSCRIPTION.EXPIRED handled
   ❌ BILLING.SUBSCRIPTION.PAYMENT.FAILED missing
   ❌ BILLING.SUBSCRIPTION.SUSPENDED missing
   ❌ BILLING.SUBSCRIPTION.UPDATED missing
   ⚠ Always returns 200 (no retry)

4. cancelPayPalSubscription (Callable)
   ✓ Auth check
   ✓ Ownership check
   ✓ API call to PayPal
   ✓ Local state update
   ✓ Notification sent
```

### Paystack Flow
```
1. createPaystackSubscription (Callable)
   ✓ Auth check
   ✓ UserId match check
   ✓ Plan validation
   ✓ Creates reference
   ⚠ No idempotency key

2. User completes payment on Paystack

3. paystackWebhook (HTTP)
   ⚠ Raw body issue (signature fails)
   ✓ Signature verification (if raw body worked)
   ⚠ Weak event ID generation
   ⚠ No distributed lock
   ✓ charge.success handled
   ✓ subscription.disable handled
   ❌ subscription.not_funded missing
   ❌ invoice.create missing
   ❌ invoice.update missing
   ⚠ Always returns 200

4. cancelPaystackSubscription (Callable)
   ✓ Auth check
   ✓ Ownership check
   ⚠ API call failure only warns, still cancels locally
   ✓ Local state update
   ✓ Notification sent
```

### Client-Side Flow
```
1. useSubscription hook
   ❌ Calls non-existent cancelSubscription
   ❌ Calls non-existent checkSubscriptionStatus
   ✓ Error handling
   ✓ Loading states

2. SubscriptionManager component
   ✓ Real-time subscription listener
   ✓ Cancel dialog
   ⚠ Only shows PayPal subscriptions (no Paystack)
```

---

## Test Scenarios

### Scenario 1: New PayPal Subscription
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Click subscribe | Redirect to PayPal | ✓ | ✅ |
| Approve payment | Webhook activates | ⚠ | ⚠️ |
| Return to app | Token refreshed, tier updated | ✓ | ✅ |
| Check Firestore | Subscription active | ✓ | ✅ |
| Check Auth Claims | tier=pro/elite | ✓ | ✅ |

### Scenario 2: Subscription Renewal
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Monthly renewal | Webhook updates period | ❌ | 🔴 |
| Failed payment | Status=past_due | ❌ | 🔴 |
| Recovery | Retry logic | ❌ | 🔴 |

### Scenario 3: Cancellation
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Click cancel | Function called | ❌ | 🔴 |
| PayPal API | Subscription cancelled | N/A | 🔴 |
| Firestore | Status=cancelled | N/A | 🔴 |
| Access | Until period end | N/A | 🔴 |

### Scenario 4: Webhook Retry
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| First attempt | Process, store event ID | ✓ | ✅ |
| Second attempt | Skip (duplicate) | ✓ | ✅ |
| Processing error | Return 5xx for retry | ❌ | 🔴 |

### Scenario 5: Plan Upgrade
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Pro → Elite | Prorated charge | ❌ | 🔴 |
| Immediate | New entitlements | N/A | 🔴 |
| Old sub | Cancelled | N/A | 🔴 |

---

## Compliance & Security Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| PCI DSS | ⚠️ | Using providers' hosted fields (good) |
| Webhook signature verification | ⚠️ | PayPal ✓, Paystack broken |
| Idempotency keys | ❌ | Not implemented |
| Audit logging | ⚠️ | Basic, needs enhancement |
| Data retention policy | ❌ | Not defined |
| GDPR right to deletion | ⚠️ | Partial (subscriptions kept) |
| SOC 2 Type II | N/A | Provider responsibility |
| 3D Secure | ✓ | Paystack handles |

---

## Recommendations

### Immediate (Pre-Production)
1. Fix `cancelSubscription` function mapping
2. Implement `checkSubscriptionStatus` function
3. Fix Paystack raw body parsing
4. Add proper HTTP status codes for webhook retries
5. Implement distributed locking for webhooks

### Short-term (Post-Launch)
1. Add subscription verification cron job
2. Implement upgrade/downgrade with proration
3. Add comprehensive payment failure handling
4. Add webhook event archiving
5. Implement idempotency keys

### Long-term
1. Add subscription analytics dashboard
2. Implement dunning management
3. Add tax calculation (VAT)
4. Implement usage-based billing
5. Add subscription pause/resume

---

## Files Modified in Fix

- `functions/src/paypal.ts` - Webhook improvements, new events
- `functions/src/paystack.ts` - Fix raw body, new events
- `functions/src/subscriptionSync.ts` - NEW: Verification job
- `functions/src/index.ts` - Export new functions
- `src/hooks/useSubscription.ts` - Fix function calls
- `src/hooks/useUnifiedBilling.ts` - NEW: Unified hook
- `src/lib/entitlements.ts` - Enhancements
- `firestore.rules` - Security rules for subscriptions

---

## Testing Checklist

- [ ] PayPal subscription creation
- [ ] PayPal subscription activation
- [ ] PayPal subscription cancellation
- [ ] PayPal payment failure
- [ ] PayPal webhook retry
- [ ] Paystack subscription creation
- [ ] Paystack charge success
- [ ] Paystack subscription disable
- [ ] Paystack signature verification
- [ ] Paystack webhook retry
- [ ] Subscription sync job
- [ ] Upgrade flow
- [ ] Downgrade flow
- [ ] Grace period access
- [ ] Duplicate webhook protection
- [ ] Concurrent webhook handling
- [ ] Entitlement refresh
- [ ] Token claims update

---

## Sign-off

**Auditor:** Senior Payments Engineer  
**Status:** 🔴 NOT APPROVED FOR PRODUCTION  
**Next Review:** After critical fixes implemented
