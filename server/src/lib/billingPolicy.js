// Product rules approved in TrueHive_Subscription_and_Paid_Hive_Plan.docx.
export const PLUS_PRICES = Object.freeze({ month: 799, year: 6999 });
export const PLATFORM_FEE_PERCENT = 10;
export const BILLING_DELETE_MESSAGE = 'You cannot delete your account while you have active paid Hives or outstanding paid membership obligations. Close your paid Hives and resolve remaining subscriptions, refunds, disputes, and payouts before continuing.';
// A failed renewal keeps previously paid access, then allows three days to recover.
export const GRACE_SECONDS = 3 * 24 * 60 * 60;
export function accountStatus(account) {
  if (account.requirements?.disabled_reason) return 'restricted';
  if (account.requirements?.currently_due?.length || account.requirements?.past_due?.length) return 'action_required';
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted && account.capabilities?.card_payments === 'active' && account.capabilities?.transfers === 'active' && !account.requirements?.pending_verification?.length) return 'connected';
  return 'verification_pending';
}
export function validatePaidConfig(body) {
  const price = Number(body.monthlyPriceCents);
  if (!Number.isSafeInteger(price) || price < 50 || price > 99999999) throw Object.assign(new Error('Enter a valid USD monthly price in cents (minimum $0.50).'), { status: 400 });
  for (const key of ['benefits', 'description', 'cancellationPolicy']) {
    if (typeof body[key] !== 'string' || body[key].trim().length < 30 || body[key].length > 8000) throw Object.assign(new Error('Describe ongoing benefits, membership value, and cancellation terms (30–8,000 characters each).'), { status: 400 });
  }
  return { price, benefits: body.benefits.trim(), description: body.description.trim(), cancellationPolicy: body.cancellationPolicy.trim() };
}
export function subscriptionAccess(sub, now = Date.now()) {
  if (sub.access_revoked || sub.status === 'refunded' || sub.status === 'incomplete_expired') return false;
  return new Date(sub.access_until || 0).getTime() > now;
}
