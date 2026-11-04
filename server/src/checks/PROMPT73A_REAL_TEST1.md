# Real sandbox Test 1: Plus monthly

Status: **PASS: actual sandbox payment, verified signed webhook, and dev Plus entitlement**.

The initial session expired unpaid; its Endive expiration event was processed.
A replacement created through the backend reused the same monthly price and
completed successfully after manual test-card payment. The original expired
session has no customer or subscription.

Actual paid replacement verification:

- Checkout complete/paid; charge succeeded, 799 USD cents, livemode false.
- Subscription `sub_1UWVXIRuxbB0fH11TSrG8Wmv`, customer `cus_VXaiOuTUSMpze7`:
  both match the intended test user's dev subscription row and Checkout binding.
- Active period: October 30, 2026 11:13:04 PM PDT through November 29,
  2026 10:13:04 PM PST. Dev paid_through/access_until match period end.
- Actual Endive `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, and `invoice.paid` processed with no remaining
  errors. The original invoice.paid receipt processed on its first attempt.
- Pinned Acacia retrieval of the actual expanded invoice/charge/balance contract
  passed. Endive billing event handling therefore passed for this monthly flow.
- `billing_has_plus` is true; actual authenticated GET `/api/billing/summary`
  returns 200, plus true, testMode true, and one active Plus subscription.
- Two locally signed replays of the real invoice.paid payload returned HTTP 200
  and duplicate true. Before/after: one active subscription, one invoice, one
  processed record for that event. These replays are not claimed as Stripe retries.

The success URL is `http://localhost:5173/settings?billing=activating`.
Settings correctly requires authentication; the script's login cookie was never
installed in the manual payment browser. A sign-in redirect is consequently
expected for that browser session. An additional local environment issue was
verified: port 5173 is served by a different worktree and its runtime API override
does not target localhost:5183. It must not be used as proof of sandbox UI access.
No change was made to that unrelated frontend or its API. Use a dedicated sandbox
frontend targeting port 5183 before browser acceptance testing. No billing/access
repair was needed; backend entitlement activation already succeeded.

Ignored detailed evidence: `sandbox.local/plus-monthly-end-to-end.json` and
`sandbox.local/plus-monthly-verification.json`. No new Checkout or payment was
created during post-payment verification.

Verified Neon dev endpoint and branch before creating a dedicated synthetic user,
`prompt73a-plus-monthly@truehive-test.invalid`. The account has synthetic adult DOB,
current policy consent, verified test email and a generated local password.
Actual backend login supplied the session cookie for POST `/api/billing/checkout`
with `{ "interval": "month" }`; no authentication token was printed.

Found integration issue: Plus Checkout used inline `price_data`, which would
create duplicate catalog entries. Changed Plus Checkout to select one existing
active sandbox TrueHive Plus price with matching USD amount and monthly/annual
interval. Missing, ambiguous, truncated or live catalog results fail closed.
Hive Checkout retains its previous pricing behavior. Restarted only the verified
sandbox API to load the fix; the existing listener was left running.

Both real Checkouts reuse monthly price `price_1UUcbxRuxbB0fH11B5OI9oJy`:
799 USD cents, quantity one, subscription mode, livemode false. Client reference
matches the synthetic user's local subscription reservation. No products/prices
were created by this test. The first session expired October 30, 2026 at 1:15 AM PDT;
the paid replacement had an expiration of October 30 at 11:44 PM PDT.

Pre-payment evidence: Checkout open/unpaid, local subscription processing,
paid_through and access_until null, billing_has_plus false. Existing 78 billing
checks pass with catalog reuse; missing/live price rejection checks also pass.

Local session evidence and the read-only follow-up verifier are under ignored
`server/sandbox.local/`. After manual payment run, from server/:

```powershell
node sandbox.local/verify-plus-monthly.mjs
```

PASS requires a real paid 799-cent USD invoice/charge, matching intended user,
Stripe customer/subscription and catalog price, a processed invoice.paid event
with a verified webhook-attempt receipt, matching invoice ledger, and active
Plus access. The verifier records actual webhook API versions and checks the
pinned Acacia invoice/charge response contract. Endive billing webhook
compatibility is now verified for this paid monthly Checkout flow, as recorded above.

No production access, migration, live billing, deployment, merge or push.
