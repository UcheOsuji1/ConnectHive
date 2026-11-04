# Real sandbox Test 2: Plus annual

Status: **PASS: actual annual sandbox payment, signed webhooks, invoice ledger,
annual entitlement, and duplicate-event protection verified**.

The first session expired unpaid with no customer/subscription. Its Endive
expiration webhook processed successfully. The replacement used the same
synthetic user and existing annual catalog price and was paid manually.

Actual post-payment verification:

- `sandbox.local/verify-plus-annual.mjs` returned PASS.
- Checkout complete/paid; charge succeeded for 6999 USD cents, livemode false.
- Active subscription `sub_1UWpi7RuxbB0fH11DVVWURiK` and customer
  `cus_VXvZQa8HMDKRsF` match the Checkout, local subscription row and intended
  annual test user. Subscription metadata matches the authorized reservation.
- Period: `2026-11-01T03:45:35Z` through `2027-11-01T03:45:35Z`, a full calendar
  year. Dev paid_through/access_until match period end; interval year and
  price_cents 6999. In Pacific time both boundaries are October 31 at
  8:45:35 PM PDT, in 2026 and 2027 respectively.
- Actual Endive checkout.session.completed, customer.subscription.created,
  customer.subscription.updated, and invoice.paid were processed. The original
  paid event processed on its first attempt, with no error. Other invoice event
  types not selected by the listener are not required delivery failures.
- Pinned Acacia retrieval of the actual invoice/charge contract and the 6999-cent
  invoice ledger passed. Endive billing payload compatibility passed for annual
  Checkout. No annual-specific integration repair was needed.
- Dev billing_has_plus true. Authenticated GET /api/billing/summary returned 200,
  plus true, testMode true, and one active annual Plus subscription.
- Two locally signed replays of the actual annual invoice.paid payload both
  returned HTTP 200 with duplicate true. Before/after counts remained one active
  subscription, one invoice, one event record. These are not claimed as Stripe
  retries; the original real Stripe delivery was verified before the replays.
- Monthly dev row and Stripe subscription match the saved baseline, including
  ownership, status, period/access dates and cancellation flag.

The success URL remains http://localhost:5173/settings?billing=activating.
Settings requires authentication; the test script's cookie is not installed in
the manual payment browser. Sign In is therefore expected for this unauthenticated
browser. The previously documented port 5173 frontend/API mismatch remains a
separate UI testing concern, not a payment or entitlement failure. The protected
route preserves the destination in the login next parameter.

Detailed ignored evidence: sandbox.local/plus-annual-end-to-end.json and
sandbox.local/plus-annual-verification.json. No Checkout/payment was created
during this post-payment verification. No production changes or migrations.

Verified Neon dev endpoint `ep-fancy-cherry-at7zftnq` and branch
`br-holy-poetry-atkl4gsc`, API health 200, and Stripe sandbox balance livemode false.

Created separate synthetic user `prompt73a-plus-annual@truehive-test.invalid` with
an isolated generated local password, synthetic adult DOB, current policy consent,
and verified test email. Actual backend login supplied an unprinted cookie to
POST `/api/billing/checkout` with `{ "interval": "year" }`.

Checkout reuses the existing active annual TrueHive Plus catalog price
`price_1UUcgKRuxbB0fH11IQy39oBr`: 6999 USD cents, yearly interval/count one,
quantity one, subscription mode, livemode false. No catalog object was created.
Full unmodified Checkout URL and bindings are saved under ignored
`server/sandbox.local/plus-annual-test2.json`.

Pre-payment assertions passed: Plus false before and after Checkout creation,
session open/unpaid, no Stripe subscription, local reservation processing,
paid_through/access_until null. Monthly subscription ownership/status/access
fields were compared before and after and remain unchanged. No existing dev
user was edited. No API/listener restart, migration, deployment or merge.

Manual sandbox payment is complete. To rerun read-only verification from `server/`:

```powershell
node sandbox.local/verify-plus-annual.mjs
```

The read-only verifier requires matching customer/subscription/user, 6999-cent
paid invoice and charge, existing annual price, a full calendar-year billing
period, a processed signed invoice.paid webhook receipt, invoice ledger and
active Plus entitlement. It also compares the monthly subscription to its saved
dev/Stripe baseline. Actual duplicate-event handling passed separately as recorded
above, using the real paid event's payload.

No annual-specific implementation issue was found in Checkout preparation.
The existing backend catalog-price reuse fix handles both approved intervals.
