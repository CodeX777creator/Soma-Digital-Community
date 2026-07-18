type PricingType = 'free' | 'paid' | 'included_with_plan' | 'promo_only';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function canDirectEnroll(input: {
  pricingType: PricingType;
  hasEntitlement?: boolean;
  hasPaidPurchase?: boolean;
  planIncluded?: boolean;
}) {
  if (input.hasEntitlement) return true;
  if (input.hasPaidPurchase) return true;
  if (input.pricingType === 'free') return true;
  if (input.pricingType === 'included_with_plan') return input.planIncluded === true;
  return false;
}

function calculateMrrPrice(basePriceCents: number, eligibility?: { priceCents?: number | null; discountKind?: 'percent' | 'fixed'; amount?: number }) {
  let price = eligibility?.priceCents && eligibility.priceCents > 0 ? eligibility.priceCents : basePriceCents;
  if (eligibility?.discountKind === 'percent') price = Math.max(0, Math.round(price * (1 - (eligibility.amount || 0) / 100)));
  if (eligibility?.discountKind === 'fixed') price = Math.max(0, price - Math.round(eligibility.amount || 0));
  return price;
}

function run() {
  assert(canDirectEnroll({ pricingType: 'free' }), 'Free courses should enroll directly.');
  assert(!canDirectEnroll({ pricingType: 'paid' }), 'Paid courses must not enroll without purchase or entitlement.');
  assert(canDirectEnroll({ pricingType: 'paid', hasPaidPurchase: true }), 'Paid course purchase should unlock enrollment.');
  assert(canDirectEnroll({ pricingType: 'promo_only', hasEntitlement: true }), 'Founder/promo entitlement should unlock promo-only courses.');
  assert(!canDirectEnroll({ pricingType: 'promo_only' }), 'Promo-only courses should reject direct enrollment.');
  assert(canDirectEnroll({ pricingType: 'included_with_plan', planIncluded: true }), 'Included plan should unlock included courses.');
  assert(!canDirectEnroll({ pricingType: 'included_with_plan', planIncluded: false }), 'Missing plan should not unlock included courses.');

  assert(calculateMrrPrice(999) === 999, 'Default founder MRR price should remain configurable at 999 cents.');
  assert(calculateMrrPrice(2000, { priceCents: 999 }) === 999, 'Reserved MRR eligibility should override course MRR price.');
  assert(calculateMrrPrice(2000, { discountKind: 'percent', amount: 50 }) === 1000, 'Percent MRR discount should reduce checkout price.');
  assert(calculateMrrPrice(2000, { discountKind: 'fixed', amount: 2500 }) === 0, 'Fixed MRR discount should support free license unlock.');

  console.log('Academy commerce validation passed.');
}

run();
