# Prompt 73A Phase 4B: real lifecycle acceptance

Status: **PASS: ISOLATED MONTHLY PLUS PERIOD-END CANCELLATION, NO RENEWAL CHARGE,
SIGNED WEBHOOK AND SEPARATE TIME-AWARE EXPIRY ACCEPTANCE. OTHER LIFECYCLE
SCENARIOS REMAIN PENDING.**

## Period-end cancellation and access expiry — November 1, 2026

| Requested result | Outcome |
| --- | --- |
| Stripe period-end cancellation | PASS: actual dedicated Stripe test clock advanced to exactly 2026-12-02T05:42:27Z; ready; subscription canceled with ended_at equal to that boundary |
| No renewal charge | PASS: customer-scoped complete invoice and charge lists retain exactly the original one invoice and one successful 799-cent charge; IDs match the pre-advance snapshot |
| TrueHive post-expiration entitlement | PASS in isolated time-aware SQL/HTTP harness using actual canceled fixture and original dates; no claim that global wall time advanced |
| Signed webhook processing | PASS: actual customer.subscription.deleted event evt_1UXEBrRuxbB0fH11Mp7enhvw, API 2026-09-30.endive, processed on first delivery at 2026-11-02T05:53:57.152Z |

Before advancement, reverified exact Neon dev branch/endpoint, test key, dedicated
customer/owner metadata, subscription and clock bindings, cancel_at_period_end true,
and current Plus access true. Stripe lists showed this was the clock's only customer
and its only subscription. The original three successful subscriptions passed their
preservation check before and after the operation. Only clock
clock_1UXE0lRuxbB0fH111RNZ1YJt was advanced using the documented SDK/API operation.
No Checkout, payment, refund, connected account or catalog object was created.

Clock frozen_time is now 1796190147, status ready. Actual subscription
sub_1UXE6tRuxbB0fH11VWNl0Cx7 is canceled. Dev status is canceled, while original
paid_through and access_until remain 2026-12-02T05:42:27Z. No ledger date was
shortened or extended. The signed deletion event was verified against Stripe's
actual event, signature-verified inbox, webhook-attempt acknowledgement and
committed event receipt. No local webhook replay was used to establish this
Stripe cancellation or its delivery. API health remains 200; operations report
zero pending tasks, failed events, queued events and quarantined events.

### Separate time-aware application acceptance

New src/checks/prompt73a-real-cancellation-expiry.mjs uses the explicitly guarded
Neon dev preload to create a temporary schema with no public fallback. It clones
only the actual canceled fixture's ownership, subscription identifiers and original
paid/access dates. In that schema only, it replaces billing_has_plus's NOW()
dependency with acceptance_now(), backed by a local acceptance_clock table. The
entitlement predicate is unchanged. JavaScript subscriptionAccess receives its
existing explicit time argument. PostgreSQL NOW(), OS time, API process time,
the shared dev function and all protected records remain unchanged.

Nine checks passed in each of two completed runs:

- SQL hasPlus and JavaScript policy allow access one millisecond before boundary.
- Actual authenticated billing summary reports plus true before boundary.
- Both SQL and application policy deny at the exact boundary.
- Authenticated summary and policy deny one second after boundary.
- Actual createHive controller rejects paid-Hive creation with HTTP 403 after expiry.
- A saved actual older subscription.updated payload whose status is active is
  delivered locally to processEvent in the isolated schema. The handler uses
  read-only Stripe retrieval of the actual CURRENT canceled subscription, retains
  the original dates and denies access after expiry. This is a local delayed-event
  acceptance test, NOT a new Stripe-origin delivery or payment.
- Duplicate delivery returns duplicate and cannot reactivate Plus.
- Global database NOW() and system time are still before the December boundary.
- Rejected paid action creates no Hive.

An initial harness process exited unexpectedly with Windows status -1073740791
before completing the stale-event checks. No product-code repair was made on
that evidence; two subsequent complete runs passed all nine checks. The exact
temporary schema left by the interrupted run was identified from its log, checked
for the sole fixture identity and acceptance-clock table, and removed. Both
successful runs removed their own temporary schemas normally. The native exit's
cause is unconfirmed; it is retained as a test-run anomaly, not hidden as a PASS.

The real API still correctly reports Plus true at actual November wall time,
because December's paid-through boundary has not occurred in that clock domain.
The isolated harness establishes expiry behavior at the boundary without changing
that legitimate current-period entitlement or manufacturing Stripe evidence.

Evidence under ignored sandbox.local/: phase4b-period-end-before.json,
phase4b-period-end-progress.json, phase4b-period-end-actual.json,
phase4b-period-end-verification.json, phase4b-expiry-harness.json,
phase4b-expiry-harness-confirmed.log and phase4-final-preservation.json.

Official clock operation: https://docs.stripe.com/api/test_clocks/advance

This completes the requested monthly cancellation scenario with the separate
Stripe-clock and application-clock evidence stated above. Next planned lifecycle
scenario requires its own isolated fixture (for example annual cancellation or
failed-renewal recovery); stop before any new manual payment. No further charge
is needed for this completed monthly cancellation fixture. Earlier pending statuses
below are historical and superseded for this scenario only.

## Actual payment and cancellation result — November 1, 2026

The human completed the existing Checkout. Read-only payment verification passed
before the authenticated cancellation route was invoked for ONLY reservation
b059bc4c-3d39-4f23-b1a4-600b7a930c68. No replacement Checkout or payment was created.

- Checkout complete/paid; actual sandbox charge succeeded for 799 USD cents.
- Active monthly subscription: sub_1UXE6tRuxbB0fH11VWNl0Cx7.
- Customer cus_VYKgYsb3LCTyeN and inherited clock
  clock_1UXE0lRuxbB0fH111RNZ1YJt match the dedicated synthetic user, Checkout,
  Stripe subscription metadata and local reservation.
- Paid invoice in_1UXE6tRuxbB0fH114S4DvBAZ; charge
  ch_3UXE6uRuxbB0fH1100C6caEu. Dev ledger: gross 799 cents,
  Stripe processing 53 cents, platform fee zero, refunded zero. Invoice/charge
  bindings and paid-through date match Stripe.
- Actual signed Endive checkout.session.completed, customer.subscription.created,
  customer.subscription.updated and invoice.paid processed successfully through
  verified ingress, durable inbox and committed event receipts. No local replay
  or synthetic payload was used for this acceptance.
- Before cancellation: local status active, billing_has_plus true; authenticated
  GET /api/billing/summary returned plus true and testMode true.
- Authenticated POST /api/billing/subscriptions/:id/cancel returned HTTP 200.
  Stripe and dev now both have cancel_at_period_end true; Stripe remains active
  for the already-paid period. Cancellation request persisted at
  2026-11-02T05:50:09.972Z.
- Actual cancellation customer.subscription.updated event
  evt_1UXE8FRuxbB0fH11SjuoDSDp, API 2026-09-30.endive, processed on its first
  signed delivery at 2026-11-02T05:50:13.110Z, without an error. Its verified
  inbox payload contains the correct subscription and cancellation flag.
- Paid period remains 2026-11-02T05:42:27Z through 2026-12-02T05:42:27Z.
  Both dev paid_through and access_until equal the end: December 1, 2026,
  9:42:27 PM PST. Authenticated summary still reports plus true after cancellation.
- Exactly one fixture subscription and invoice remain. All three original
  successful subscriptions and protected financial fields still match their
  Stripe/dev baselines. API health 200; pending tasks, failed events, queued
  events and quarantined events all zero.
- Clock remains ready at frozen_time 1793598147. It was NOT advanced. No refund,
  renewal charge, protected-subscription mutation, production access or migration.

Payment, scheduled cancellation and current-period access are PASS. End-of-period
termination/no renewal charge and application access expiry are still PENDING.
Next: validate an isolated strategy for the Stripe-clock versus application/SQL
wall-clock boundary, then advance ONLY this fixture clock to the period end and
verify real cancellation/deletion events and absence of a renewal charge. Do not
claim PostgreSQL-time access expiry from clock advancement alone. No new payment
is required for that cancellation follow-up.

Evidence: ignored sandbox.local/phase4b-cancel-payment-verified.json,
phase4b-cancel-verification.json and phase4-final-preservation.json. The verifier
sandbox.local/verify-phase4b-cancellation.mjs is read-only by default; its --cancel
mode performs the authenticated cancellation only after payment assertions pass.

Earlier preparation details below are historical; their unpaid/pending status
is superseded by this verified payment and cancellation result.

## Verified setup and preservation

Neon dev endpoint ep-fancy-cherry-at7zftnq and branch br-holy-poetry-atkl4gsc
were asserted before fixture writes. Stripe key is test-only. API health on 5183
is 200. Frontend 5193 responds and targets 5183. The existing Stripe CLI listener
process remains running with an established connection; actual process arguments
were checked for platform and Connect destinations on port 5183. Signed event
delivery for this new paid fixture remains to verify after manual payment.

All three original successful subscriptions were compared against their saved
Stripe/dev baseline after preparation. Ownership, status, amounts, dates,
cancellation flags and financial invoice fields are unchanged. No new connected
account, product or price was created. No migration, production access,
deployment, push or merge. Only the guarded sandbox API was restarted; frontend
5193, unrelated frontend 5173 and Stripe listener were left running.

## First fixture: monthly Plus cancellation

- Synthetic user: prompt73a-lifecycle-plus-cancel-month@truehive-test.invalid.
- Local user: 1a3d469e-7b3c-444c-9059-b7813e86dca8.
- Local subscription reservation: b059bc4c-3d39-4f23-b1a4-600b7a930c68.
- New dedicated customer: cus_VYKgYsb3LCTyeN.
- New dedicated clock: clock_1UXE0lRuxbB0fH111RNZ1YJt; not advanced.
- Checkout: cs_test_a1jw2Mi2rKh3IdcRwFXWbOHP87ytAXkmRon3l5eO2z7ark7lJHNOtBGVzw.
- Existing monthly price: price_1UUcbxRuxbB0fH11B5OI9oJy, 799 USD cents,
  monthly, quantity one, subscription mode, livemode false.
- Expiration: 2026-11-02T06:18:01Z, November 1, 2026 at 10:18:01 PM PST.
- Stripe retrieval: open/unpaid, subscription null, correct dedicated customer.
- Dev: processing, paid_through/access_until null, billing_has_plus false.
- Authenticated summary also reports plus false. These checks passed before and
  after actual authenticated POST /api/billing/checkout with interval month.
- Success URL: http://localhost:5193/settings?billing=activating.

The complete Stripe URL, including its unmodified fragment, is retained in ignored
sandbox.local/phase4b-cancel-checkout.json. It is returned directly to the human.
No payment method was attached and no payment confirmed by scripts.

## Test-clock compatibility and safe local support

The existing application Checkout path did not pass a customer, so Stripe would
create an unclocked customer. It cannot select a clock-bound customer without
additional server-side binding. Added src/checks/sandboxClockCheckout.mjs, imported
ONLY by ignored sandbox.local/start.mjs; application entry points and production
Checkout code were not changed. There is no client-supplied customer/clock option.

The adapter requires test mode/key, exact dev endpoint/branch, port 5183 and
non-production NODE_ENV. A private local allowlist maps only newly created
lifecycle user UUIDs to customers/clocks. Before selecting a customer it verifies
the local subscription owner, synthetic email prefix and exact email, Plus kind,
platform account, customer livemode/email/owner metadata, matching clock, and ready
sandbox clock. Unlisted users keep the existing Checkout parameters. Eight offline
guard/binding tests pass. Actual Stripe Checkout creation with the clock-bound
customer also passed under pinned Acacia; subscription clock inheritance remains
to verify after payment. This does not claim time advancement acceptance.

Clock advancement changes Stripe time, not PostgreSQL NOW() or the application's
wall clock. Period-end access testing must explicitly account for that distinction.
Do not change global server/database time, rewrite protected entitlements, or
claim real-time access expiry merely because a Stripe clock advanced. Use a
separate boundary-aligned fixture or an explicitly isolated time-aware acceptance
harness if needed; validate the chosen method before claiming expiry PASS.

## Isolated lifecycle plan

Fixtures below are planned, not created, except the first cancellation fixture.
Use a distinct synthetic user/customer/subscription for each destructive scenario;
never reuse any of the three protected successful subscriptions.

| Scenario | Fixture/payment requirement | Supported Stripe control and evidence |
| --- | --- | --- |
| Monthly Plus cancellation | Current isolated $7.99 Checkout; manual payment required | After verified paid invoice, authenticated cancellation route; retrieve actual cancellation flag, paid-through dates, and signed events; clock/boundary follow-up separately |
| Annual Plus cancellation | Separate $69.99 Checkout using existing annual price; stop for human | Same cancellation checks; isolated clock where supported |
| Plus failed renewal/recovery | Separate clock-bound monthly/annual fixtures, initially paid manually | Hosted payment-method update to supported failing test method, advance only dedicated clock, verify failed invoice/retry exhaustion, then human recovery payment when required |
| Paid Hive failed renewal/recovery | Separate member and clock-bound connected-account customer | Verify Connect customer/clock support before creation; current adapter deliberately allows platform Plus only; same payment/recovery boundaries |
| Plus partial/full refund | Separate paid fixtures for each independent access policy | Actual sandbox refund API/Dashboard controls, signed refund/charge events, invoice ledger and entitlement checks |
| Paid Hive refund and application-fee refund | Separate paid member fixture in an isolated approved offering | Actual connected refund plus explicit application-fee refund behavior, retrieve platform fee and both account balance transactions; do not infer fee refund from charge refund |
| Refund failure | Dedicated paid fixture using documented failure-testing method where supported | Stripe-supported refund-failure controls; label unsupported paths pending instead of substituting local payloads |
| Dispute/closure | Dedicated fixture using documented dispute test payment method; stop before manual charge | Actual sandbox dispute/evidence controls and signed events, disposition, fees, ledger and policy checks |
| Paid Hive closure | Separate Hive/offering and member(s), independently approved and manually paid | Reuse eligible owner/account only if safe; close through owner route, verify recurring cancellations, retained individual paid periods and deletion blockers; never close Test 3 Hive |

Reuse existing approved Plus catalog prices. Do not create prices/accounts merely
to repeat passed setup. Create isolated Hive offerings only when required to keep
closure/refund/dispute operations away from Test 3's successful Hive.

## Required next manual action

Open the returned full Checkout URL and pay exactly $7.99 USD with Stripe's
documented sandbox test card only (4242 4242 4242 4242, future expiry, test CVC).
Do not pay any of the old sessions. An unauthenticated browser can return to Sign
In; that does not establish payment or access status. Report completion so the
actual session, charge, clock-bound subscription, signed invoice.paid receipt,
ledger and Plus entitlement can be verified before invoking cancellation on ONLY
this fixture. All remaining scenario statuses are PENDING real acceptance.

Official references:
- https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage
- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/testing
- https://docs.stripe.com/connect/direct-charges

Private credentials and bindings stay under ignored server/sandbox.local/.
Preparation scripts use idempotent clock/customer keys and backend Checkout
reservation reuse; never blindly create a replacement if an earlier session paid.
