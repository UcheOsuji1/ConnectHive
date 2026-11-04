# Real sandbox Test 3: Connect and paid Hive

Status: **PASS: REAL CONNECT PAYMENT, MEMBERSHIP, FEES AND LEDGER VERIFIED; EARLY FEE-EVENT RETRY RECOVERED**.

## Final actual payment and accounting verification

`sandbox.local/verify-paid-hive.mjs` returned PASS before and after duplicate
checks. The real hosted Checkout is complete/paid with a successful $12.00 USD
test charge on the existing connected account acct_1UWppORuxbP8zrXG.

- Stripe subscription: sub_1UXDaJRuxbP8zrXGcsotD6JT, active, monthly,
  application_fee_percent 10; customer cus_VYKEZtwiVNK7TO.
- Invoice: in_1UXDaJRuxbP8zrXGjT5PhScG; charge
  ch_3UXDaJRuxbP8zrXG0JFFCyE5. Connected-account scoped retrieval, local account,
  customer, subscription, reservation metadata and intended member all agree.
- Member prompt73a-paid-hive-member@truehive-test.invalid now has exactly one
  active/completed membership in the intended Hive and sees it through the
  authenticated /api/hives/mine endpoint. Owner finances remain denied 404.
- Pre-payment access was false with null dates. Membership joined_at equals the
  original invoice.paid event's transaction timestamp, 2026-11-02T05:15:12.554Z;
  the verified webhook attempt acknowledged processing at 05:15:15.084Z.
- Period: 2026-11-02T05:15:07Z through 2026-12-02T05:15:07Z. Local paid_through
  and access_until match the paid invoice period end (December 1, 9:15:07 PM PST).
- Actual platform application fee fee_1UXDaLRuxbP8zrXGTI2r4uDf is 120 USD cents,
  unrefunded, correctly bound to the connected charge. Its platform balance
  transaction credits net 120 cents with zero additional fee, status pending.
- Connected charge balance transaction: gross 1200 cents, Stripe processing fee
  65 cents and application fee 120 cents separately identified, net 1015 cents.
  Owner balance API and Stripe agree: 0 available, 1015 pending USD cents. This is
  pending settlement, not proof of bank payout.
- Dev invoice ledger matches gross 1200, platform fee 120, processing fee 65,
  refunded 0. Authenticated owner totals agree, with no unknown-fee counts and
  one active subscriber. Ledger net can be derived as 1200 - 120 - 65 = 1015.
- Actual Endive checkout.session.completed, customer.subscription.created,
  customer.subscription.updated and invoice.paid each processed on first delivery
  in the correct connected-account context. Pinned Acacia invoice/charge/balance
  retrieval is compatible with this real paid membership flow. Unselected
  invoice events are not failed deliveries.

### Explicit early platform-fee delivery and retry evidence

Original application_fee.created arrived at 05:15:12.508Z, before the invoice
transaction committed, and returned a retryable processing_error without retaining
an acknowledged billing_events record. The financial ledger nonetheless correctly
retrieved the real fee while reconciling the paid invoice. This failed original
platform delivery is not described as a successful Stripe-origin delivery.

Retried the actual existing fee event payload with a locally generated test
signature: HTTP 200, processed true, same account/charge/invoice binding, original
error cleared. Then replayed each of the real connected invoice.paid and platform
application_fee.created payloads twice: all four returned HTTP 200, duplicate true.
These are local signed replay/recovery tests, not Stripe-origin redelivery.
The connected-account envelope was preserved/restored for its destination.

Before/after counts remain exactly one subscription, one membership, one invoice,
and 120 platform-fee cents. Stripe also returns exactly one application-fee object
for this charge. Duplicate replays do not move money or create another fee.
The fee attempt ledger now records four attempts: one original failed arrival,
one successful local recovery, and two acknowledged duplicates, no current error.
The standalone CLI does not provide production-style automatic webhook retries;
the test explicitly exercised the retry-safe handler rather than hiding the race.

Both successful Plus subscriptions match their saved Stripe/dev baselines after
all checks. No new Checkout, charge, account, production access, migration,
deployment, merge or push occurred during this final verification.

Detailed ignored evidence: sandbox.local/paid-hive-verification.json and
sandbox.local/paid-hive-end-to-end.json. This PASS covers the paid-Hive purchase,
activation, accounting and replay checks requested here; it does not claim later
refund, dispute, renewal, cancellation or real bank-payout acceptance.

Earlier pending/blocker statuses below are historical.

## Authorized paid-Hive Checkout preparation

Reverified the exact Neon dev endpoint/branch, test-only key, healthy port 5183
API, and eligible existing account acct_1UWppORuxbP8zrXG. Authenticated owner POST
/api/billing/connect/refresh returned connected for that account and moved the
offering to pending_approval.

Created dedicated synthetic reviewer prompt73a-reviewer@truehive-test.invalid.
An explicit P73A_SANDBOX_REVIEWER_ENABLED=1 opt-in in the ignored sandbox launcher
adds only that reviewer to the sandbox API's staff allowlist. The shared .env and
application authorization rules were not changed; no existing user was
impersonated. The sandbox API alone was restarted; listener unchanged.

The normal authenticated review queue returned the existing offering. A member
attempt to approve was denied 404. The authenticated reviewer POSTed approve with
a sandbox-only review note through /api/billing/admin/hives/:id/review; the owner
then POSTed publish. The existing offering is active, approved revision matches,
and the authenticated member offer endpoint reports available true. No direct
offering state update was used.

The same separate synthetic member logged in through the backend. Member Plus
was false, active Hive membership count zero, and no prior subscription to this
Hive existed. POST /api/billing/checkout with the existing hiveId created one real
connected-account hosted session. Stripe retrieval under the verified connected
account confirmed livemode false, subscription mode, open/unpaid, $12.00 USD,
monthly interval/quantity one, and local reservation metadata/binding. No Stripe
subscription exists yet. The backend supplies application_fee_percent 10; actual
$1.20 application-fee creation and accounting cannot be confirmed before payment.

Exact Checkout expiration: 2026-11-02T05:44:19Z, November 1 at 9:44:19 PM PST.
The full unmodified URL, including fragment, is in ignored
sandbox.local/connect-test3.json under paidCheckout. Stop for manual test-card
payment. No automatic payment confirmation or new connected account.

Read-only sandbox.local/verify-paid-hive.mjs returned PENDING: Checkout open/unpaid,
local reservation processing, memberAccess false, paid_through/access_until null.
Both successful Plus subscriptions match their saved dev/Stripe baselines.
After payment the verifier checks the actual connected charge/subscription,
signed invoice.paid receipt, membership, invoice ledger, $1.20 application fee,
and separate actual processing costs. Duplicate paid-event accounting and owner
summary checks remain to run after the real paid event exists. No Test 3 PASS yet.

Historical statuses below describe earlier stages and are superseded by this
pre-payment result. No production change, migration, deployment, push or merge.

## Latest account eligibility check

At 2026-11-02T05:04:06Z, retrieved the SAME existing sandbox account
acct_1UWppORuxbP8zrXG with v1 Acacia and v2 Endive reads. Stripe now reports:
details_submitted true, charges_enabled true, payouts_enabled true,
card_payments active, transfers active. currently_due, past_due,
pending_verification and errors are all empty; disabled_reason is null.
Accounts v2 requirements.entries is also empty. No outstanding identity-number
or document requirement is reported. The previous in-review state has resolved.

The stored dev owner/account association and Stripe owner metadata match.
TrueHive's accountStatus evaluates to connected: the connected account now meets
our payment-eligibility checks. This is not a paid-Hive lifecycle PASS: the
existing offering is still awaiting_verification in dev and requires refresh,
authorized review and publication before member Checkout can start.

Read-only dev transaction and Stripe GETs only. Both successful Plus subscriptions
match their saved dev/Stripe baselines. Paid-Hive Checkout count remains zero.
No identity data was changed, no new account or Checkout was created, and no
verification was bypassed. No production access. Sanitized evidence is in
ignored sandbox.local/connect-in-review-verification.json.

Earlier blockers below are historical and are superseded by this account check.

## Callback redirect-loop repair

Implemented separate public API callbacks, mounted before login/consent gates:

- GET /api/billing/connect/callback/refresh regenerates a Stripe Account Link for
  the existing stored account, then returns a 303 to an allowlisted HTTPS
  connect.stripe.com URL. It ignores arbitrary account/next query parameters.
- GET /api/billing/connect/callback/return renders live Stripe status and remaining
  requirement names directly on the API origin. It does not redirect to Settings
  or require a browser login. No identity values are displayed.

Both require a 15-minute HS256-signed state scoped to callback purpose, issuer,
audience, owner, account and nonce; current active-user/account binding is rechecked
in dev. Refresh nonces are consumed in process memory until expiry and automatic
refresh chains are bounded at three. Process restart clears the nonce cache;
state expiration, signed depth, binding and rate limiting remain enforced. No
migration or existing-user/subscription change is needed. Invalid/expired state
fails closed; retries do not fall back to untrusted redirects. Pages/responses
disable caching/referrer leakage and use restrictive CSP. Callback logs identify
return versus refresh without printing state tokens, user/account IDs or identity.

Local callback origin is http://localhost:5183, independent of the unrelated
frontend on 5173. Hosted environments must explicitly configure a trusted HTTPS
BILLING_CALLBACK_ORIGIN. The authenticated onboard route now uses this helper;
existing connected accounts continue to be reused.

Validation: 15 offline HTTP/security tests pass, including no-session status,
signature tampering, expired/wrong-purpose/audience state, unbound account, nonce
replay, arbitrary account/next manipulation, escaping, trusted origin and redirect
validation, and bounded refresh. All 78 original billing checks pass in an isolated
dev fixture schema. Actual sandbox probes against the existing account verify
return HTTP 200 with individual.id_number displayed; tampered state HTTP 400;
refresh HTTP 303 after Stripe minted the same-account replacement link; and replay
HTTP 503 without another mint. These probes do not open/consume the hosted Stripe
page or prove which branch the user's prior browser visit took.

Actual current account remains restricted: details submitted true, charges and
payouts false, card_payments inactive, transfers active. Accounts v2 reports
dashboard full, requirements_collector stripe, and the single past-due requirement
identity.individual.id_numbers.us_ssn awaiting action from user. Pending address
verification is empty. Previous identity API write was expressly forbidden after
hosted onboarding. account_update links are unsupported for full-Dashboard
accounts; repeated generic onboarding links are not a reliable remediation.

Supported alternative: in the Stripe sandbox Dashboard, open the existing
connected account, Actions required, and its identity-number requirement. Stripe
documents that the requirement details offer the applicable submission form,
account-specific remediation link, or Support path. No dashboard UI access was
available to the agent, so which of those actions this account currently offers
has not been observed. Do not claim the form was completed or bypass verification.
Reference: https://docs.stripe.com/connect/dashboard/managing-individual-accounts

Both Plus subscriptions match their saved Stripe/dev baselines. The API was
restarted to load the repair; listener unchanged. No paid-Hive Checkout, new
account, production changes, migration, deployment, push or merge.

Evidence: ignored connect-callback-verification.json and api-connect-callbacks.log;
tests: src/checks/prompt73a-connect-callbacks.mjs. Historical investigation below
describes the earlier Settings-based callbacks, which this repair replaces.

## Link redirect investigation

At 2026-11-02T04:32:37Z the previously issued Account Link was not yet expired
(expiration 04:33:22Z). Stripe's Account Link response does not expose whether it
was already visited, so a used link versus a normal return cannot be determined
retrospectively. The agent did not open the hosted link, avoiding consumption.

Both configured callbacks in billingService.onboard point to the same protected
Settings URL. Return to Settings is reasonable but depends on a browser session
and the correct sandbox frontend. Refresh is incomplete: Stripe requires that
the refresh route mint a replacement link, whereas Settings does not. The
unrelated frontend on port 5173 compounds the local testing issue. These callback
limitations are separate from verification; a redirect does not establish eligibility.

Rechecked existing account: details submitted, charges/payouts disabled,
card_payments inactive, transfers active. Sole due/past-due item remains
individual.id_number; pending_verification is empty. Generated a fresh
account_onboarding link for the same account with collection_options.fields set
to eventually_due. account_update is unsupported for full Stripe Dashboard
accounts, per Stripe's Account Links API reference.

This diagnostic link uses distinct connect_result=returned and
connect_result=refresh_required query markers on the callbacks, so the next
redirect (or login next parameter) identifies the branch. This does not implement
automatic link regeneration; the shared callback code was not changed. Complete
current link/expiration/parameters are in ignored connect-test3.json. Both Plus
baselines remain unchanged; no account replacement or database writes occurred.

References: https://docs.stripe.com/api/account_links/create and
https://docs.stripe.com/connect/hosted-onboarding.

## Identity requirement resolution attempt — November 1

Reviewed Stripe's official Accounts v2 verification walkthrough and current
Endive account-update reference, plus the Connect test identity-number table:

- https://docs.stripe.com/connect/testing-verification?accounts-namespace=v2
- https://docs.stripe.com/api/v2/core/accounts/update
- https://docs.stripe.com/connect/testing#test-personal-id-numbers

Stripe documents full personal ID `222222222` for an immediate successful test
match (`000000000` is the normal successful test match). The full Accounts v2 US
individual field is identity.individual.id_numbers with type us_ssn. Reverified
the existing account's livemode false, US/individual identity, metadata ownership,
Neon dev branch, and test credentials before attempting only this field through
v2.core.accounts.update with explicit API version 2026-10-28.endive.

Stripe rejected the attempt with StripePermissionError / forbidden: permission
to write identity.individual.id_numbers is unavailable because the Account was
onboarded through an Account Link or Account Session. No identity value was changed
by the rejected API request; no attempt was made to circumvent that restriction.

Latest state: details_submitted true, charges_enabled false, payouts_enabled
false, card_payments inactive, transfers active. The address verification has
cleared: pending_verification is empty. The sole currently_due/past_due item is
individual.id_number, disabled_reason requirements.past_due, no requirement errors.

Generated a fresh hosted onboarding link through the authenticated backend for
the SAME stored account (no accounts.create call). The full URL is in ignored
connect-test3.json; expiration 2026-11-01T07:08:14Z (12:08:14 AM PDT). The human
must resume sandbox onboarding, edit individual/representative personal details,
and supply the documented full nine-digit successful test identity value. Never
enter a real SSN or upload real identity documents. Recheck actual eligibility
after submission; do not approve, publish, or create Checkout meanwhile.

Both successful Plus subscriptions match their dev/Stripe baselines. The Hive
remains awaiting_verification and its Checkout count is zero. No production,
migration, live-payment, or successful existing-account change occurred.

## Post-submission verification

Retrieved the same existing account after the human submitted onboarding:
details_submitted true, charges_enabled false, payouts_enabled false;
card_payments inactive, transfers active. Stripe disabled_reason is
requirements.past_due. Both currently_due and past_due contain
`individual.id_number`. Pending verification contains `individual.address.city`,
`individual.address.line1`, `individual.address.postal_code`, and
`individual.address.state`. No requirement errors were returned.

The v1 account remains standard and its owner metadata and dev association match
the synthetic monthly Plus owner. Owner Plus remains active; local Connect state
is restricted, and the paid offering remains awaiting_verification. Both successful
Plus subscriptions were compared to their saved dev/Stripe baselines and remain
unchanged. Member access and paid-Hive Checkout count are both zero.

Stopped before approval, publication or member Checkout as required. Information
submission alone did not establish payment eligibility. Complete the outstanding
identity requirement in Stripe sandbox and allow address verification to resolve,
then retrieve the account again before proceeding. No new connected account,
Checkout, payment, production change or migration was created in this check.

Verified Neon dev endpoint `ep-fancy-cherry-at7zftnq`, branch
`br-holy-poetry-atkl4gsc`, healthy sandbox API on port 5183 and test-only Stripe
credentials. Reused the dedicated synthetic monthly Plus account
`prompt73a-plus-monthly@truehive-test.invalid` as the Hive owner. Both successful
Plus subscriptions were snapshotted and compared in Stripe and dev: ownership,
status, period/access dates and cancellation flags remain unchanged.

## Actual Connect creation and repair

POST /api/billing/connect/onboard initially failed. This Stripe sandbox refuses
Accounts v1 creation, even when the owner email is supplied. Stripe explicitly
directed the integration to Accounts v2.

New account creation now uses SDK v2.core.accounts.create with the verified
owner's contact_email, full Dashboard, Stripe fee/loss collection, requested
merchant card_payments and recipient stripe_transfers, owner metadata, an explicit
2026-09-30.endive creation version, and a versioned stable idempotency key.
Existing stored account bindings are reused. Plus/payment APIs and financial
reconciliation keep the pinned 2025-02-24.acacia contract. No subscription or
charge was created to enable the owner.

The actual backend created account `acct_1UWppORuxbP8zrXG`. Its v1 Acacia read
returns type standard and the correct truehive_user_id metadata. Existing v1
Account Links creation successfully produced a hosted sandbox onboarding URL.
Compatibility references:

- https://docs.stripe.com/connect/accounts-v2/account-creation
- https://docs.stripe.com/connect/accounts-v2
- https://docs.stripe.com/connect/accounts-v2/connected-account-configuration

Current actual state: details_submitted false; charges_enabled false;
payouts_enabled false; card_payments/transfers inactive. Local state remains
verification_pending. The human must complete the hosted sandbox form using only
synthetic/test information. Current link and expiration are in ignored
sandbox.local/connect-test3.json. Regenerate an expired link for the same stored
account through the backend; do not create a replacement connected account.

## Paid Hive and member preparation

Actual authenticated owner POST /api/hives created non-discoverable synthetic
Hive `1c7c79d9-f367-4fec-81f9-4bf1ec86cd3d`, "Prompt 73A Sandbox Paid Hive", with
$12.00/month paid configuration and capacity 10. Its offering is awaiting_verification,
not published. Review approval and eligible-owner publication remain required.

Separate member: `prompt73a-paid-hive-member@truehive-test.invalid`.
The member has no Plus and no active membership in the paid Hive. Generated
credentials remain only in ignored local configuration. No member Checkout has
been created; it cannot be presented as ready while onboarding is incomplete.

## Completed checks

- 78 original billing checks pass on the verified dev database in an isolated
  synthetic schema, including the updated v2 creation contract assertions.
- Nine probes against the running API pass: non-Plus Connect denied 403,
  non-owner configuration and finances denied 404, unpaid direct Hive join denied
  402, unauthenticated Checkout denied 401, invalid signature, incorrect account
  destination in both directions, and stale signed replay each denied 400 before
  writing webhook-attempt records. Signature probes are locally constructed,
  not evidence of actual Stripe payment deliveries.
- Both successful Plus subscriptions remain unchanged in dev and Stripe.

## Pending acceptance

Complete hosted Connect onboarding, refresh actual account requirements and
capabilities through the backend, approve/publish the synthetic offering through
authorized routes, then initiate the member's real Checkout and stop for manual
test-card payment. Expected membership payment $12.00 USD/month, application fee
10% ($1.20), with Stripe processing costs recorded separately.

Actual paid Connect webhook payload compatibility, correct-account payment,
invoice/charge/application-fee reconciliation, processing fees, access activation,
unrelated-Hive isolation and duplicate paid-event accounting remain pending.
Do not substitute synthetic events for these checks or declare the flow passed.

Ignored evidence: connect-test3.json, connect-plus-baselines.json,
connect-prepayment-verification.json, connect-prepayment-security.json, and
connect-regression.log under server/sandbox.local/.

Only the sandbox API was restarted for the creation repair. The existing Stripe
listener was left running. No production access, production migration, live
payment, deployment, push or merge occurred.
