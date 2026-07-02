# Billing System Testing Checklist

**Version:** 1.0  
**Last Updated:** 2025-01-21  
**Status:** Comprehensive test plan for all billing flows

---

## Table of Contents

1. [PayPal Subscription Flow](#paypal-subscription-flow)
2. [Paystack Subscription Flow](#paystack-subscription-flow)
3. [Webhook Testing](#webhook-testing)
4. [Cancellation Flow](#cancellation-flow)
5. [Entitlement & Access Control](#entitlement--access-control)
6. [Edge Cases & Error Handling](#edge-cases--error-handling)
7. [Security Testing](#security-testing)

---

## PayPal Subscription Flow

### Creating a New Subscription

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| P1 | Explorer creates Pro subscription | 1. Sign in as Explorer<br>2. Click "Upgrade to Pro"<br>3. Select PayPal<br>4. Complete PayPal flow | - Redirect to PayPal<br>- Return with ?subscription=success<br>- Webhook activates subscription<br>- Firestore shows active<br>- Auth claims updated | ⬜ |
| P2 | Idempotency - duplicate click | 1. Click subscribe twice rapidly | - Second click returns existing subscription<br>- No duplicate PayPal subscription created | ⬜ |
| P3 | Already has active subscription | 1. User has active Pro<br>2. Try to create another Pro | - Error: "already has active subscription"<br>- Suggests upgrade flow | ⬜ |
| P4 | Attempt to create for other user | 1. Modify request to use different userId | - Permission denied error | ⬜ |
| P5 | Invalid plan ID | 1. Send invalid planId in request | - Invalid argument error | ⬜ |
| P6 | No email on account | 1. Create user without email<br>2. Try to subscribe | - Failed precondition error | ⬜ |
| P7 | Cancel during PayPal flow | 1. Start PayPal flow<br>2. Cancel at PayPal<br>3. Return to app | - Return with ?subscription=cancelled<br>- Subscription remains expired | ⬜ |

### Webhook Handling

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| P8 | BILLING.SUBSCRIPTION.CREATED | Trigger via PayPal sandbox | - Subscription doc created<br>- Status: created | ⬜ |
| P9 | BILLING.SUBSCRIPTION.ACTIVATED | Complete payment in PayPal | - Status: active<br>- currentPeriodEnd set<br>- Notification sent<br>- Auth claims updated | ⬜ |
| P10 | BILLING.SUBSCRIPTION.UPDATED | Change plan in PayPal dashboard | - Plan updated in Firestore<br>- Auth claims updated | ⬜ |
| P11 | BILLING.SUBSCRIPTION.PAYMENT.FAILED | Use failing test card | - Status: past_due<br>- Notification sent<br>- Retain access temporarily | ⬜ |
| P12 | BILLING.SUBSCRIPTION.SUSPENDED | Multiple failed payments | - Status: suspended<br>- Auth claims downgraded<br>- Notification sent | ⬜ |
| P13 | BILLING.SUBSCRIPTION.RE-ACTIVATED | Update payment method | - Status: active<br>- Notification sent<br>- Auth claims restored | ⬜ |
| P14 | BILLING.SUBSCRIPTION.CANCELLED | Cancel in PayPal dashboard | - Status: cancelled<br>- Grace period until period end | ⬜ |
| P15 | BILLING.SUBSCRIPTION.EXPIRED | Let subscription expire | - Status: expired<br>- Auth claims downgraded | ⬜ |
| P16 | Duplicate webhook | Send same webhook twice | - Second request returns 200 with duplicate flag<br>- No duplicate processing | ⬜ |
| P17 | Concurrent webhooks | Send 5 identical webhooks simultaneously | - All processed correctly<br>- No data corruption<br>- Only one notification sent | ⬜ |
| P18 | Invalid signature | Modify webhook payload | - Returns 401<br>- Event archived with error | ⬜ |
| P19 | Processing error | Force DB error during processing | - Returns 500<br>- PayPal retries<br>- Lock released | ⬜ |

---

## Paystack Subscription Flow

### Creating a New Subscription

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| S1 | Explorer creates Pro subscription | 1. Sign in as Explorer<br>2. Click "Upgrade to Pro"<br>3. Select Paystack<br>4. Complete Paystack flow | - Redirect to Paystack<br>- Return with ?subscription=success<br>- Webhook activates subscription<br>- Firestore shows active<br>- Auth claims updated | ⬜ |
| S2 | Idempotency - duplicate click | 1. Click subscribe twice rapidly | - Second click returns existing subscription<br>- No duplicate Paystack transaction | ⬜ |
| S3 | Existing pending subscription (<1hr) | 1. Create pending subscription<br>2. Try again within 1 hour | - Returns existing authorizationUrl<br>- No new transaction created | ⬜ |
| S4 | Expired pending subscription (>1hr) | 1. Create pending subscription<br>2. Wait 1+ hours<br>3. Try again | - Old subscription marked expired<br>- New transaction created | ⬜ |
| S5 | Webhook signature verification | Send webhook with valid signature | - Signature verified<br>- Event processed | ⬜ |
| S6 | Webhook with invalid signature | Send webhook with modified signature | - Returns 401<br>- Event archived with error | ⬜ |

### Webhook Events

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| S7 | charge.success | Successful payment webhook | - Status: active<br>- Notification sent<br>- Auth claims updated | ⬜ |
| S8 | subscription.disable | Disable subscription | - Status: cancelled<br>- Notification sent | ⬜ |
| S9 | subscription.not_funded | Insufficient funds | - Status: past_due<br>- Notification sent | ⬜ |
| S10 | charge.failed | Failed charge | - Status: past_due<br>- Notification sent | ⬜ |
| S11 | invoice.create | New invoice created | - Logged for tracking<br>- No status change | ⬜ |
| S12 | invoice.update | Invoice updated | - Logged for tracking<br>- No status change | ⬜ |
| S13 | Duplicate webhook | Send same event twice | - Second returns 200 with duplicate flag | ⬜ |
| S14 | Concurrent webhooks | Send multiple simultaneously | - All processed correctly<br>- No data corruption | ⬜ |
| S15 | Missing userId in metadata | Webhook without user identification | - Returns 200 with ignored flag<br>- Archived with error | ⬜ |
| S16 | Processing error | Force DB error | - Returns 500<br>- Paystack retries<br>- Lock released | ⬜ |

---

## Cancellation Flow

### User-Initiated Cancellation

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| C1 | Cancel PayPal subscription | 1. Click cancel<br>2. Confirm in dialog | - PayPal API called<br>- Status: cancelled<br>- Grace period active<br>- Notification sent<br>- Access until period end | ⬜ |
| C2 | Cancel Paystack subscription | 1. Click cancel<br>2. Confirm in dialog | - Paystack API called<br>- Status: cancelled<br>- Grace period active<br>- Notification sent | ⬜ |
| C3 | Cancel already cancelled | Try to cancel cancelled subscription | - Returns success (idempotent) | ⬜ |
| C4 | Cancel other user's subscription | Attempt to cancel someone else's sub | - Permission denied error | ⬜ |
| C5 | Cancel non-existent subscription | Try to cancel invalid ID | - Not found error | ⬜ |
| C6 | Grace period access | Cancel subscription, check access before period end | - Retain premium access<br>- Tier shows correctly<br>- Features available | ⬜ |
| C7 | Post-grace period | Wait for grace period to end | - Access revoked<br>- Tier downgraded to explorer<br>- Premium features blocked | ⬜ |

### Provider-Initiated Cancellation

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| C8 | PayPal cancels (payment failure) | Let PayPal cancel due to failed payments | - Status: cancelled<br>- Grace period until period end<br>- Notification sent | ⬜ |
| C9 | Paystack disables subscription | Paystack disables due to non-payment | - Status: cancelled<br>- Grace period active<br>- Notification sent | ⬜ |

---

## Entitlement & Access Control

### Tier-Based Access

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| E1 | Explorer access | Sign in as Explorer | - Can access community<br>- AI limited to 3 chats<br>- Cannot download Pro resources<br>- Cannot join live calls | ⬜ |
| E2 | Pro access | Sign in as Pro | - Unlimited AI (50 included)<br>- Can download Pro resources<br>- Can join live calls<br>- Cannot access Elite features | ⬜ |
| E3 | Elite access | Sign in as Elite | - Unlimited everything<br>- Founder access<br>- All resources available | ⬜ |
| E4 | Tier upgrade | Upgrade Explorer → Pro | - Immediate access to Pro features<br>- AI quota updated<br>- Can download resources | ⬜ |
| E5 | Tier downgrade | Downgrade Pro → Explorer | - Retain access until period end<br>- After: limited to Explorer features | ⬜ |
| E6 | Token refresh after subscription | Refresh Firebase token | - Custom claims updated<br>- Tier reflected in token | ⬜ |

### Feature Gates

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| E7 | TierGuard blocks | Try to access Pro page as Explorer | - Blocked with upgrade prompt<br>- Clear messaging | ⬜ |
| E8 | TierGuard allows | Access Pro page as Pro | - Full access granted | ⬜ |
| E9 | FeatureGate preview | View gated feature as Explorer | - Blurred preview shown<br>- Upgrade CTA visible | ⬜ |
| E10 | PremiumLock displays | View locked content | - Lock overlay shown<br>- Upgrade button prominent | ⬜ |

---

## Edge Cases & Error Handling

### Network & Retry Scenarios

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| X1 | Network timeout during creation | Simulate timeout | - Error shown to user<br>- No partial subscription state | ⬜ |
| X2 | Webhook timeout | Delay webhook processing | - Returns 500<br>- Provider retries<br>- Eventually processes | ⬜ |
| X3 | Database unavailable during webhook | Stop Firestore | - Returns 500<br>- Provider retries<br>- No data loss | ⬜ |
| X4 | Partial webhook processing | Crash mid-processing | - Lock expires after timeout<br>- Next webhook processes<br>- State consistent | ⬜ |
| X5 | Race condition - same event | Send same event from 2 servers | - One processes<br>- Second returns duplicate<br>- No double-processing | ⬜ |
| X6 | Race condition - different events | Activate + Cancel simultaneously | - Last writer wins<br>- State consistent<br>- Notification appropriate | ⬜ |

### Data Integrity

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| X7 | Subscription without userId | Create orphaned subscription | - Handled gracefully<br>- Webhook archived with error | ⬜ |
| X8 | Invalid planId in webhook | Webhook with unknown plan | - Normalized to explorer<br>- Logged for review | ⬜ |
| X9 | Malformed webhook payload | Send invalid JSON | - Returns 400/500<br>- Error logged | ⬜ |
| X10 | Missing required fields | Webhook without subscription ID | - Returns 200 with ignored flag | ⬜ |
| X11 | Very long subscription ID | Edge case ID length | - Handled correctly<br>- No truncation issues | ⬜ |

### Subscription Synchronization

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| X12 | Manual sync job | Trigger syncSubscriptions | - All active subs checked<br>- Discrepancies corrected<br>- Audit logs created | ⬜ |
| X13 | Expired subscription cleanup | Run cleanup job | - Expired subs marked correctly<br>- Auth claims updated | ⬜ |
| X14 | Past due → suspended | 3 days past due | - Auto-suspended<br>- Auth claims downgraded | ⬜ |

---

## Security Testing

### Authentication & Authorization

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| SEC1 | Unauthenticated create | Call create without auth | - Unauthenticated error | ⬜ |
| SEC2 | Unauthenticated cancel | Call cancel without auth | - Unauthenticated error | ⬜ |
| SEC3 | Wrong user ID | Try to create for other user | - Permission denied | ⬜ |
| SEC4 | CSRF attempt | Forge cross-site request | - Blocked by Firebase Auth | ⬜ |
| SEC5 | Replay attack | Replay old subscription request | - Idempotency check blocks | ⬜ |

### Webhook Security

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| SEC6 | Forged PayPal webhook | Send fake webhook | - Signature verification fails<br>- Returns 401 | ⬜ |
| SEC7 | Forged Paystack webhook | Send fake webhook | - Signature verification fails<br>- Returns 401 | ⬜ |
| SEC8 | Replay webhook | Replay old webhook | - Duplicate detection<br>- Returns 200 | ⬜ |
| SEC9 | Webhook with SQL injection | Inject SQL in payload | - No SQL execution<br>- Safely stored/ignored | ⬜ |
| SEC10 | Webhook with XSS | Inject XSS in payload | - No script execution<br>- Safely escaped | ⬜ |

### Data Protection

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| SEC11 | Subscription data exposure | Try to read other user's sub | - Firestore rules block | ⬜ |
| SEC12 | Webhook archive access | Try to read webhook events | - Firestore rules block (admin only) | ⬜ |
| SEC13 | Audit log tampering | Try to modify audit log | - Firestore rules block | ⬜ |
| SEC14 | Payment data in logs | Check logs for sensitive data | - No PII in logs<br>- Reference IDs only | ⬜ |

---

## Performance Testing

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| PERF1 | 100 concurrent subscriptions | Load test creation | - All succeed<br>- No duplicates<br>- Response time < 5s | ⬜ |
| PERF2 | Webhook flood | Send 1000 webhooks | - All processed<br>- No dropped events<br>- Queue handles load | ⬜ |
| PERF3 | Large subscription history | User with 100+ subs | - List loads quickly<br>- Pagination works | ⬜ |
| PERF4 | Cold start | First request after deploy | - Response time acceptable<br>- No timeouts | ⬜ |

---

## Regression Testing

After any code changes, verify:

- [ ] Existing active subscriptions still work
- [ ] Existing pending subscriptions can be completed
- [ ] Cancellation still works for existing subs
- [ ] Webhooks process correctly
- [ ] No data migration needed
- [ ] Backward compatible with old subscription format

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Payments Engineer | | | |
| Product Manager | | | |
| Security Review | | | |

---

## Notes

### Testing Environments

1. **Development:** Local Firebase emulator
2. **Staging:** Staging Firebase project with sandbox payment providers
3. **Production:** Live environment with test cards/accounts

### Test Data

**PayPal Sandbox:**
- Buyer account: sb-buyer@example.com
- Test card: 4111111111111111
- Failing card: 4000000000000002 (insufficient funds)

**Paystack Test:**
- Test card: 4084084084084081 (success)
- Failing card: 4084084084084082 (failure)

### Known Limitations

1. Webhook signature verification requires proper raw body configuration
2. Paystack webhooks may have slight delays (up to 30 seconds)
3. PayPal sandbox webhooks can be delayed several minutes

### Support Contacts

- PayPal Developer Support: developer.paypal.com/support
- Paystack Support: support@paystack.com
- Internal Escalation: #payments-alerts Slack channel
