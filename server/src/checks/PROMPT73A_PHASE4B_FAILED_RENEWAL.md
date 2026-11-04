# Phase 4B: monthly Plus failed renewal and recovery

Status: **PASS: INITIAL PAYMENT, REAL FAILED RENEWAL, SIGNED FAILURE AND RECOVERY
WEBHOOKS, DEV GRACE, SEPARATE TIME-AWARE EXPIRY AND ONE AUTHORIZED $7.99 RECOVERY.
REAL RETRY EXHAUSTION REMAINS NOT RUN.**

## One authorized real recovery payment — November 1, 2026

The user explicitly authorized one sandbox recovery payment of 799 USD cents
against existing renewal invoice in_1UXET2RuxbB0fH11S6aVdMPL for ONLY
subscription sub_1UXERTRuxbB0fH110fVtiWuf. This payment was completed without a
new Checkout, invoice, subscription, refund, cancellation or clock advancement.

Before mutation, verified Stripe sandbox platform account acct_1UUV9MRuxbB0fH11
with test-key authentication and balance livemode false; exact Neon dev endpoint
ep-fancy-cherry-at7zftnq / branch br-holy-poetry-atkl4gsc; dedicated synthetic
customer cus_VYKzbaodBnHUL6, owner metadata, subscription metadata and clock
clock_1UXEJnRuxbB0fH11Bdt51Ygy. Invoice was open/unpaid with amount_due and
amount_remaining 799, amount_paid zero, USD, correct customer and subscription.
Dev was past_due, paid through December 2 with access retained through December 5.
Saved pre-operation fixture/financial/protected-record snapshots privately.

Attached documented successful test method pm_card_visa to ONLY this customer and
updated ONLY this subscription's default_payment_method, with no proration. No
customer-wide default or shared Stripe setting was changed. Paid the existing
invoice with SDK invoices.pay and a stable invoice-scoped idempotency key.

An initial request explicitly supplied paid_out_of_band false along with
payment_method; Stripe rejected this parameter combination before charging:
"You may only specify one of these parameters: paid_out_of_band, payment_method."
Read-only checks confirmed invoice remained open/unpaid and successful-charge
count remained one. Corrected the private script to omit paid_out_of_band, which
defaults false, and submitted the supported request with a stable corrected key.
No interactive confirmation was required. This was a sandbox script parameter
correction; no application/production code was changed. Final invoice explicitly
reports paid_out_of_band false.

| Recovery check | Actual result |
| --- | --- |
| Existing renewal invoice | PASS: same invoice paid, amount_paid 799 USD cents, amount_remaining zero |
| Actual recovery charge | PASS: ch_3UXETMRuxbB0fH110D4uu4ZD succeeded for 799 USD cents, correct customer, invoice and successful method |
| Subscription recovery | PASS: same subscription now active in Stripe and dev, cancel_at_period_end false |
| Signed invoice.paid | PASS: actual evt_1UXEalRuxbB0fH11UEVmtHLD, API 2026-09-30.endive, first delivery processed at 2026-11-02T06:19:43.019Z |
| Payment-gated entitlement extension | PASS: pre-payment paid-through December 2 / grace end December 5; only after actual paid invoice and processed verified event does dev show the newly paid period ending January 2 |
| Paid-through/access dates | PASS: Stripe renewal period 2026-12-02T06:02:06Z through 2027-01-02T06:02:06Z; dev paid_through and access_until both equal the latter |
| Authenticated Plus | PASS: real backend summary returns plus true and testMode true; access continued from grace and was extended, not falsely described as restoring a previously false real-wall-clock entitlement |
| Ledger | PASS: recovered invoice gross 799 cents, processing 53, platform fee zero, refunded zero, correct charge and paid-through |
| Duplicate financial records | PASS: exactly one new successful charge relative to pre-operation IDs; two successful charges total, same two Stripe invoices, one local subscription and two paid ledger rows |
| Protected fixtures | PASS: all three original successful subscriptions and completed cancellation fixture match their Stripe/dev snapshots; protected invoice financial fields unchanged |
| Clock | PASS: ready, frozen_time still 1796194927; no advancement |
| Real retry exhaustion | NOT RUN; recovery acceptance does not claim exhaustion |

The actual recovery event was matched to Stripe's event, signature-verified inbox
payload, committed billing_events receipt and acknowledged webhook attempt. No
synthetic payload/local replay was used for payment or signed-delivery evidence.
No second pay request was issued after success. Read-only reconciliation confirms
exactly one additional successful charge; the earlier failed-renewal attempt is
preserved as failure evidence, not counted as a paid charge.

Evidence: ignored sandbox.local/phase4b-recovery-before.json,
phase4b-recovery-operation.json and phase4b-recovery-verification.json.
Read-only verifier: node sandbox.local/verify-phase4b-recovery.mjs.
The mutation helper recover-phase4b-renewal.mjs requires an open/unpaid invoice;
it must not be rerun to create another payment. No further payment is authorized.

Official operation reviewed: https://docs.stripe.com/api/invoices/pay
and successful test method https://docs.stripe.com/testing?testing-method=payment-methods.

This completes the authorized one-payment recovery. Retry exhaustion or recovery
after actual grace expiry would require a separate explicitly isolated follow-up;
neither is claimed from this successful grace-period recovery. Earlier pending
recovery statuses below are historical and superseded by this section.

## Actual failed-renewal acceptance — November 1, 2026

Initial manual Checkout was complete/paid. Before any payment-method change,
verified actual 799-cent USD sandbox charge ch_3UXERTRuxbB0fH1117oQwAsV,
paid invoice in_1UXERTRuxbB0fH112LwDq1Zl, active monthly subscription
sub_1UXERTRuxbB0fH110fVtiWuf, customer cus_VYKzbaodBnHUL6 and inherited clock
clock_1UXEJnRuxbB0fH11Bdt51Ygy. Stripe metadata, dev owner/reservation,
catalog price and authenticated Plus entitlement all matched. Signed Endive
checkout.session.completed, customer.subscription.created/updated and invoice.paid
receipts and inbox acknowledgements passed. Initial ledger gross 799, processing
53, platform fee zero, refunded zero.

Reverified that the dedicated clock has only this customer and that the customer
has only this subscription. Backed up its pre-failure state to ignored local
evidence. Attached documented sandbox PaymentMethod pm_card_chargeCustomerFail
to ONLY this customer, then set ONLY this subscription's default_payment_method
to the resulting method pm_1UXESxRuxbB0fH11o00yYTuw, proration_behavior none.
No customer-wide default, shared retry setting or other subscription was changed.
Confirmed the update did not create an invoice or change the current period.

Advanced ONLY this clock to renewal boundary 2026-12-02T06:02:06Z. Stripe created
draft renewal invoice in_1UXET2RuxbB0fH11S6aVdMPL and reported its automatic
finalization/payment time as 2026-12-02T07:02:06Z. Advanced the same clock to one
second after that Stripe-provided time. It is now ready and frozen at
2026-12-02T07:02:07Z (1796194927). This was an explicitly authorized FAILED
renewal attempt with the documented failing method, not a recovery charge.

| Scenario | Actual result |
| --- | --- |
| Initial paid invoice, ownership, clock and Plus | PASS, real Stripe/dev/API reads |
| Actual renewal failure | PASS: subscription past_due, renewal invoice open, amount due 799 cents, amount paid zero, attempt_count 1 |
| Payment failure details | PASS: PaymentIntent requires_payment_method, amount_received zero, card_declined / generic_decline |
| Signed invoice.payment_failed | PASS: evt_1UXETTRuxbB0fH11al2eCquZ, API 2026-09-30.endive, first verified delivery processed at 2026-11-02T06:12:09.898Z |
| Database consistency | PASS: dev past_due, original paid_through unchanged at 2026-12-02T06:02:06Z; access_until exactly three days later, 2026-12-05T06:02:06Z |
| Current access | PASS: authenticated summary Plus true; within the defined retained-access/grace policy, no new period marked paid |
| Financial ledger | PASS: exactly one successful charge and one paid invoice ledger row, both the original 799-cent payment; failed renewal is not inserted as paid revenue |
| Grace expiry | PASS in separate isolated time-aware harness; no global clock or shared dev function changes |
| Stale/duplicate protection | PASS in local isolated event-delivery harness using original real invoice.paid plus current Stripe retrieval; not a Stripe-origin redelivery |
| Recovery payment | PENDING user approval; no recovery attempted |
| Real retry exhaustion / terminal Stripe state | NOT RUN; no exhaustion claim |

The failure webhook was verified against Stripe's actual event, signature-verified
durable inbox payload, committed billing_events receipt and processed attempt.
No synthetic payload or local replay was used to establish the actual failure.

## Separate grace-clock acceptance

src/checks/prompt73a-real-renewal-grace.mjs passed eight checks against its own
temporary schema on verified dev, with no public fallback. It clones the actual
past_due fixture and original dates. Only the private billing_has_plus NOW()
dependency is replaced with a fixture time provider; subscriptionAccess receives
its existing explicit time argument. SQL/system global time is unchanged.

Actual retained paid access is allowed inside grace and one millisecond before
its end, and denied at and after 2026-12-05T06:02:06Z without recovery payment.
Locally delivering the original real initial invoice.paid event fetches CURRENT
Stripe past_due/unpaid state, leaves both dates unchanged, and cannot reactivate
expired access; duplicate delivery returns duplicate. No paid ledger entry is
manufactured for the unpaid current renewal. This harness does not establish that
Stripe exhausted retries or that the main API's real wall clock has reached December.
The temporary schema was removed normally.

## Preservation and remaining steps

All three original successful subscriptions/financial fields match their saved
Stripe/dev baseline after testing. The completed cancellation fixture remains
canceled with its original paid dates and clock at 1796190147. API health 200 and
operations report zero pending tasks, failed events, queued/quarantined events.
No production access, migration, deployment, push/merge, new Checkout, product,
price or connected account. No additional successful payment occurred.

Stripe currently reports next_payment_attempt 2026-12-04T02:37:28Z. The dedicated
clock remains frozen before it; no additional clock advancement was performed.
To test recovery, first obtain approval for payment of this existing $7.99 open
invoice, then update ONLY this subscription's method using supported test data and
verify a real paid invoice/webhook before claiming extended paid access. No new
Checkout is necessary. Retry exhaustion remains a separate supported isolated
clock scenario; do not alter shared retry settings or claim it from harness expiry.

Private evidence: phase4b-renewal-verification.json,
phase4b-renewal-payment-verified.json, phase4b-renewal-before-failure.json,
phase4b-renewal-failure-progress.json, phase4b-renewal-boundary-invoice.json,
phase4b-renewal-failed-actual.json, phase4b-renewal-failed-verification.json,
phase4b-renewal-grace-harness.json/.log, phase4b-renewal-preservation.json under
server/sandbox.local/. Verifier verify-phase4b-failed-renewal.mjs is read-only.

Official control: https://docs.stripe.com/testing?testing-method=payment-methods#declined-payments
and https://docs.stripe.com/billing/testing#test-payment-failures.

Earlier preparation details below are historical and superseded by these results.

## Isolated fixture prepared November 1, 2026

- User: prompt73a-lifecycle-plus-renewal-month@truehive-test.invalid.
- Dev user ID: 3cdc8566-0bff-4ae1-a185-9016f3c85bb4.
- Reservation: a41c8148-bf4c-407c-b0d7-8c24b984f98f.
- Dedicated sandbox customer: cus_VYKzbaodBnHUL6.
- Dedicated test clock: clock_1UXEJnRuxbB0fH11Bdt51Ygy. Not advanced.
- Checkout: cs_test_a1CBnvcUwMaDjdRkNgkMVA1ethDrlUqyMTcygMaVE9qNeZipFtSjSONQmW.
- Existing price: price_1UUcbxRuxbB0fH11B5OI9oJy, USD 799 cents/month,
  quantity one, subscription mode, livemode false.
- Expiration: 2026-11-02T06:37:14Z, November 1 at 10:37:14 PM PST.
- Actual session open/unpaid with subscription null; customer/clock metadata and
  backend reservation match. Dev reservation processing, paid/access dates null.
- Plus false both before and after authenticated backend Checkout creation;
  authenticated GET /api/billing/summary also reports plus false.
- Success URL: http://localhost:5193/settings?billing=activating.

The complete unmodified URL including fragment is saved in ignored
sandbox.local/phase4b-renewal-checkout.json and returned to the human.
Generated local credentials are never printed and remain ignored.

## Environment and preservation

Verified exact Neon dev endpoint ep-fancy-cherry-at7zftnq and branch
br-holy-poetry-atkl4gsc before writes; test-mode Stripe key only. API health 200
on 5183, frontend 5193 responding with runtime API target 5183, and actual Stripe
listener process forwards platform/Connect events to the expected local routes
with an established connection. New paid webhook delivery remains pending payment.

All three original successful Stripe/dev subscriptions retain their baseline
ownership, lifecycle, paid/access dates, cancellation flags and financial fields.
The completed monthly cancellation fixture remains canceled in Stripe/dev, with
its clock ready at 1796190147 and original December 2 paid/access dates intact.
It was not used to create this new fixture. No production access, migration,
deployment, push/merge, new product/price or connected account occurred.
No service restart or application-code change was needed: existing sandbox-only
clock adapter rereads its local user/customer allowlist on each Checkout request.

## Scenario status and next actions

| Scenario | Status |
| --- | --- |
| Sandbox/dev/services and protected records | PASS, actual reads |
| Isolated clock-bound authenticated $7.99 Checkout | PASS, actual Stripe session |
| No access before initial payment | PASS, actual dev and API checks |
| Initial successful invoice, signed events and entitlement | PENDING manual payment |
| Actual failed renewal and invoice.payment_failed delivery | PENDING initial payment and isolated failure-method configuration |
| Three-day grace and access behavior | PENDING actual failed renewal; distinguish Stripe clock from application/SQL wall time |
| Verified payment recovery | PENDING; stop for each required human payment action |
| Retry exhaustion and expiration | PENDING supported isolated scenario; do not change shared Stripe retry settings or protected subscriptions |
| Stale/duplicate event protection for this renewal | PENDING actual events; label local delivery tests separately |

Human: pay only this new session for $7.99 with Stripe's normal successful sandbox
card 4242 4242 4242 4242, future expiry and any test CVC. Do not use a decline card
for the initial purchase. After payment, verify the real invoice/charge, clock
inheritance, signature-verified inbox/processed receipts and entitlement before
changing ONLY this fixture's payment method using documented test controls.

Then verify supported failure-method setup and advance ONLY this new clock to
its actual renewal boundary, waiting for Stripe readiness and signed events.
Recovery/exhaustion must not be inferred from mock responses or manually replayed
payloads. A separate exhaustion fixture may be needed to keep recovery and terminal
failure evidence independent. Do not auto-confirm a new recovery payment.

Private evidence/scripts: sandbox.local/phase4b-renewal-user.json,
phase4b-clock-bindings.json, phase4b-renewal-checkout.json,
phase4b-renewal-environment.json, prepare-phase4b-renewal.mjs and
checkout-phase4b-renewal.mjs. Existing preservation verifier passed after creation.

Official guidance reviewed:
- https://docs.stripe.com/billing/testing
- https://docs.stripe.com/testing?testing-method=payment-methods#declined-payments
