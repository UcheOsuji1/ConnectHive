# Phase 4B: real Stripe refund acceptance

Status: **FULL PLUS REFUND PASS: ONE AUTHORIZED $7.99 SANDBOX REFUND SUCCEEDED,
SIGNED REFUND EVENTS PROCESSED, LEDGERS RECONCILED, PLUS REVOKED AND PERIOD-END
CANCELLATION CONFIRMED. OTHER REFUND SCENARIOS REMAIN PENDING.**

## Actual authorized full Plus refund — November 1, 2026

After explicit charge/subscription/amount-specific user authorization, reconfirmed
test-only Stripe account acct_1UUV9MRuxbB0fH11 and exact Neon dev endpoint/branch.
Charge ch_3UXF9VRuxbB0fH1111hmZ4Kn was captured/paid/succeeded, USD 799 cents,
undisputed, amount_refunded zero and with no prior refund objects. Charge invoice,
customer and subscription sub_1UXF9VRuxbB0fH116KbIz9W0 matched the authorized
synthetic user and active dev reservation. Saved a private pre-refund snapshot.

Executed exactly one refunds.create with charge, amount 799, reason
requested_by_customer and a stable charge/amount-scoped idempotency key. No
additional refund API request was made to test idempotency.

| Acceptance check | Actual result |
| --- | --- |
| Stripe refund | PASS: re_3UXF9VRuxbB0fH111IIUkAoM, succeeded, 799 USD cents, correct charge |
| Charge | PASS: refunded true, amount_refunded 799, exactly one Stripe refund object |
| Signed refund webhooks | PASS: actual refund.created, charge.refunded and refund.updated processed via signature-verified ingress, inbox, committed receipt and acknowledged attempt |
| Invoice/refund ledgers | PASS: one invoice gross 799/refunded 799, one refund row for the exact Stripe refund ID, status succeeded, amount 799 |
| Processing cost | Original processing fee 53 cents remains recorded separately; platform fee zero. No claim of returned processing fees or bank settlement |
| Entitlement | PASS: local status refunded, access_revoked true, access_until null, SQL billing_has_plus false and actual authenticated billing summary plus false |
| Original paid-through history | Preserved at 2026-12-02T06:55:33Z; access revocation does not erase the original paid period |
| Future recurrence | PASS: billing worker processed cancellation task; Stripe and dev cancel_at_period_end true. Stripe remains active until its period end, while refunded TrueHive access is already revoked |
| Duplicate handling | PASS: two local signed replays each of real charge.refunded and refund.created returned HTTP 200/duplicate true; still one invoice, one refund row, one event receipt per ID, 799 refunded cents and one Stripe refund object |

Original actual refund deliveries, before local duplicate checks:
- refund.created evt_3UXF9VRuxbB0fH111MyszBOK processed 2026-11-02T06:58:52.292Z.
- charge.refunded evt_3UXF9VRuxbB0fH111v2QNddw processed 2026-11-02T06:58:52.963Z.
- refund.updated evt_3UXF9VRuxbB0fH1114QAFuo5 processed 2026-11-02T06:58:53.910Z.

These are real Stripe-origin delivery observations. The four subsequent duplicate
checks use locally generated signatures over saved actual event payloads and are
NOT claimed as Stripe-origin retries. They do not call refunds.create or move money.

Read-only recovery and original preservation checks pass: the original three
successful subscriptions, completed cancellation fixture and recovered renewal
retain their Stripe/dev ownership, dates, status and financial fields. No protected
fixture was refunded or canceled. No new Checkout/payment, clock advance, production
access, migration, deployment, push or merge occurred. No application-code change.
The separate admin-operations probe hit HTTP 429 on reviewer login after repeated
automated logins; it was not bypassed. That probe had already passed financial
baseline assertions before login, and the independent recovery verifier passed
all protected-fixture checks. API health remains 200. No final admin-operations
result is claimed from the rate-limited probe.

Evidence under ignored sandbox.local/: phase4b-full-refund-before.json,
phase4b-full-refund-operation.json, phase4b-full-refund-verification.json and
phase4b-full-refund-events.json. This completes only the full Plus refund scenario;
partial Plus and paid-Hive refund/fee acceptance remain pending isolated fixtures
and their own explicit payment/refund authorizations. Earlier pending/refund-not-run
statuses below are historical and superseded for this fixture.

## Actual paid full-refund fixture — November 1, 2026

Read-only verification of the manually completed replacement Checkout returned PASS.
Confirmed verified Neon dev endpoint/branch and Stripe test-only credentials.

- Checkout complete/paid; correct replacement reservation
  106c371d-e9ed-4927-a082-06f3f72a6fd4 and synthetic user
  prompt73a-lifecycle-plus-refund-full@truehive-test.invalid.
- Exact refundable charge: ch_3UXF9VRuxbB0fH1111hmZ4Kn.
- Amount: 799 USD cents ($7.99); charge succeeded, paid and captured, livemode false.
  Disputed false, amount_refunded zero, refunded false, refund list empty (complete
  pagination). Full remaining refundable amount is 799 cents. No refund API was called.
- Subscription: sub_1UXF9VRuxbB0fH116KbIz9W0, active, platform account, existing
  approved monthly 799-cent price, quantity one. Stripe metadata matches the
  authorized local reservation; subscription/customer IDs match Checkout and dev.
- Customer: cus_VYLrx7fI9ew1if. No test clock for this fixture.
- Paid invoice: in_1UXF9VRuxbB0fH11onXOfbkG, 799 cents, USD, not paid out of band.
- Period: 2026-11-02T06:55:33Z through 2026-12-02T06:55:33Z. Dev paid_through and
  access_until match the latter; billing_has_plus true and authenticated real
  /api/billing/summary reports plus true, testMode true.
- Actual signed Endive Checkout completion, subscription creation/update and
  invoice.paid processed through verified ingress/inbox/committed receipts.
  Paid event: evt_1UXF9YRuxbB0fH117WRx2GXH. No local replay was used.
- Dev invoice ledger matches charge/invoice/user/subscription, gross 799 cents,
  processing 53, platform fee zero, refunded zero and correct paid-period end.
  Exactly one successful charge and one invoice exist for this customer.

Protected original three subscriptions, completed cancellation fixture and recovered
renewal all pass their read-only preservation/recovery checks. No existing payment,
refund, clock or subscription was mutated. No production changes or new Checkout.

Await explicit authorization for exactly 799 USD cents against ONLY
ch_3UXF9VRuxbB0fH1111hmZ4Kn. Under the inspected implementation, a successful
full current-period refund revokes this fixture's Plus and queues period-end
cancellation; these outcomes remain untested for the real refund until authorized.
Do not use the original purchase/recovery charges for this test.

Private read-only verifier: sandbox.local/verify-phase4b-refund-full-payment.mjs;
evidence: phase4b-refund-full-verification.json and
phase4b-refund-full-payment-verified.json. Earlier unpaid/preparation statuses
below are historical and superseded by this actual payment verification.

## Replacement Checkout — November 1, 2026

On replacement request, direct Stripe retrieval showed the original session was
still OPEN/UNPAID, with expiration 2026-11-02T06:59:35Z, rather than already
expired. Customer, subscription and PaymentIntent were all null; no payment had
occurred. Expired only that unpaid session to fulfill the requested replacement.
Actual signed checkout.session.expired evt_1UXF4mRuxbB0fH11c3w4Hb8G processed at
2026-11-02T06:50:41.770Z; the old dev reservation is expired, Plus false, and its
history retained. No charge/refund operation was used.

The SAME synthetic user then logged in through the backend and POSTed interval
month to /api/billing/checkout. Replacement session:

- cs_test_a13BO2uzZeQQaQjsQvHTgmZA5FWhM7UVZEhJGtSd79UKXM6HuxLnY5jDoY.
- New reservation 106c371d-e9ed-4927-a082-06f3f72a6fd4.
- Exact expiration 2026-11-02T07:25:48Z, November 1 at 11:25:48 PM PST.
- Existing monthly price price_1UUcbxRuxbB0fH11B5OI9oJy, 799 USD cents,
  quantity one, subscription mode, livemode false.
- Stripe session open/unpaid, customer and subscription null; local paid/access
  dates null; Plus false in dev and authenticated API before/after creation.
- Complete unmodified URL/fragment saved in phase4b-refund-full-checkout.json;
  original URL/bindings preserved in phase4b-refund-full-original-checkout.json;
  signed expiration evidence in phase4b-refund-full-replacement-precheck.json.

Original purchase baselines and read-only recovery verifier PASS; all three
original subscriptions, completed cancellation fixture, successful recovery and
their financial fields remain unchanged. No saved method charged, refund issued,
new product/price/account created, production change, migration or service restart.
Only the replacement URL should be used for the next manual sandbox payment.
Earlier initial Checkout details below are historical.

## Policy and implementation inspection

Reviewed billingEvents.js refund/fee handlers and reconciliation, billingJob.js
cancellation tasks, billing routes, billingStore financial blockers,
PROMPT73A_POLICY_REVIEW.md and marketing/TermsPage.jsx. Existing product behavior:

- Successful full current-period refund revokes paid access, marks local status
  refunded, expires active paid membership where applicable, and queues
  cancel_at_period_end so recurrence is stopped by the billing worker.
- Partial refund retains paid-through access. Historical invoice refunds do not
  revoke a later paid period. Pending/failed refund objects require explicit
  status review; handlers do not treat every refund request as successful money return.
- Webhooks retrieve current charge/refund state, upsert refund IDs, update invoice
  refunded cents, and read actual application-fee refunded amounts separately.
  Event receipts and financial effects are transactional; durable inbox retries
  cover missing-invoice ordering. Real acceptance remains pending.
- In-app member refund-request/owner response routes record a request/response
  only; they do not issue Stripe refunds. The request route is Hive-specific.
  There is no equivalent Plus refund-execution route in the inspected billing API.
- Terms and policy packet are drafts, not legal approval. Plus support criteria
  and application-fee refund policy remain pending business decisions. This
  sandbox test will use the user's explicit charge/amount-specific authorization;
  it does not invent a live refund policy or promise fee returns.

Stripe documents that direct-charge refunds debit the connected account and do
not automatically refund application fees. A future authorized fee refund must
explicitly specify the approved fee treatment and verify actual fee/refund/balance
objects. Original processing costs are recorded separately; never infer returned
processing fees or settled payouts from a charge refund.

## Smallest fixture: full Plus refund

- Synthetic user: prompt73a-lifecycle-plus-refund-full@truehive-test.invalid.
- Dev user: 01a8d9bb-5165-47b9-a020-e8dacaeb1a7f.
- Local reservation: ec36c8ce-8464-4601-a2cc-170ad25d9b80.
- Checkout: cs_test_a1a8B5BN4dAawWCc9oNugCyci8H5lWdXVJW18T9DBgT61LaTPuvTCwoRM3.
- Existing price price_1UUcbxRuxbB0fH11B5OI9oJy: monthly 799 USD cents,
  quantity one, subscription mode, sandbox/livemode false.
- Exact expiration: 2026-11-02T06:59:35Z, November 1 at 10:59:35 PM PST.
- Authenticated POST /api/billing/checkout used interval month. Stripe retrieval
  confirmed open/unpaid, subscription null, customer null (normal unclocked
  Checkout creates its customer on completion), correct reservation and price.
- Plus false before and after Checkout in dev and authenticated billing summary;
  local status processing and paid_through/access_until null.
- No test clock is needed or created for refund acceptance. Existing sandbox
  clock adapter leaves unlisted users on the normal Checkout path.
- Success URL http://localhost:5193/settings?billing=activating.

Full URL/fragment are saved unchanged under ignored
sandbox.local/phase4b-refund-full-checkout.json and returned to the human.
Generated credentials remain private in phase4b-refund-full-user.json.

## Isolated scenario plan

Only the first fixture above is created. Remaining fixtures are separate planned
users/subscriptions; do not pre-create multiple expiring Checkouts at this stop.

| Scenario | Status | Next gate and expected code behavior |
| --- | --- | --- |
| Full Plus refund | Checkout preparation PASS; actual refund PENDING | Human pays $7.99; verify signed paid events/access; request authorization for exact charge and full amount; successful current-period refund should revoke access and queue period-end cancellation |
| Partial Plus refund | NOT RUN; separate planned Plus user | Separate existing-price payment, then amount-specific refund approval; partial refund should preserve paid-period access |
| Full paid-Hive membership refund | NOT RUN; separate planned member | Resolve Connect price reuse, verify owner eligibility, separate payment and membership first, then full charge/refund and application-fee treatment approval |
| Partial paid-Hive membership refund | NOT RUN; separate planned member | Separate payment; approve exact partial amount and fee treatment; access should remain while actual refunded/fee/balance values reconcile |
| Duplicate/out-of-order refund deliveries | NOT RUN for real refund objects | After real signed refund delivery, test local duplicate/delayed actual payloads in isolated schema and clearly label these as local delivery tests |

Before creating paid-Hive refund Checkouts, address a catalog-reuse gap found in
inspection: billingService.checkout still uses inline price_data for Hive purchases,
while Plus already selects existing catalog prices. Do not create duplicate Connect
products/prices for this phase. Inspect/reuse the existing connected-account Hive
price through a safely verified binding before proceeding; that compatibility work
has not been implemented or claimed passed here. Reuse the verified owner/account
only where it preserves all existing subscriptions; no refund may target Test 3's
successful charge/member. Any isolated new offering must use authorized review.

## Verified environment and preserved evidence

Exact Neon dev endpoint ep-fancy-cherry-at7zftnq and branch br-holy-poetry-atkl4gsc
asserted before writes; BILLING_ENABLED test and test-only Stripe key. Backend
health 200 on 5183; dedicated frontend 5193 and existing Stripe CLI listener
running, platform/Connect destinations checked with established connection.
Listener event filters include charge.refunded, refund.created/updated/failed,
application_fee.refunded and application_fee.refund.updated.

Original three successful subscriptions match saved dev/Stripe baselines.
Read-only recovery verifier also PASS: recovered monthly subscription active,
same two paid invoices and successful charges, January 2 paid/access dates,
clock unchanged, protected original three and cancellation fixture unchanged.
No existing subscription, charge, refund or clock was mutated in preparation.
No production access, migration, deployment, push/merge or application-code change.
No Stripe product, price, connected account, clock or separate customer was created.

## Required manual steps

Pay ONLY this new Checkout's $7.99 using Stripe sandbox card 4242 4242 4242 4242,
future expiry and any three-digit test CVC. No real payment credentials.
Then report completion. Verify actual paid invoice/charge, signed events and
active Plus entitlement before identifying the exact refundable charge and
requesting approval for its full 799-cent sandbox refund. Do not issue a refund
on the basis of this preparation request. No refund has been executed.

Private scripts/evidence under server/sandbox.local/:
prepare-phase4b-refund-full.mjs, checkout-phase4b-refund-full.mjs,
phase4b-refund-full-user.json, phase4b-refund-full-checkout.json.

Official references reviewed:
- https://docs.stripe.com/refunds
- https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted#issue-refunds
