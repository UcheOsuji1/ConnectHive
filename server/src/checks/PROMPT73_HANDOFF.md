# Prompt 73 — subscription billing implementation and release boundary

17 October 2026. Branch: `feature/prompt73-billing`. Worktree:
`C:/Users/osuji/ConnectHive1-prompt73`.

**Implementation is for review and isolated/test-mode verification. NOT certified
production-ready. No production migration, deployment, live charge, push, or merge
was performed.** Stripe test credentials and signing secrets are absent from the
main checkout's environment (only presence was checked; values were not printed).
All Stripe API results in the automated suites are simulated. Real Stripe-hosted
onboarding, Checkout, Billing Portal, and webhook deliveries still require testing.

## Audit and product rules

Read `CLAUDE.md`, both Prompt 71 handoffs, the existing schema/migration runner,
auth/membership/socket guards, Create Hive, Settings, deletion/purge code, admin
authorization, and `TrueHive_Subscription_and_Paid_Hive_Plan.docx` from Downloads.
Prompt 71B is in this branch's ancestry. There was no existing Stripe integration.
The main checkout's uncommitted analytics/newsletter work was left intact. The
branch starts at `8000327`, including the previously committed Sentry work.
No reference billing image was supplied; visual review follows the requested
ivory/charcoal/gold direction and the existing application, not a claimed match
to an unseen mockup. The repository's Plans mockup concerns event planning.

Approved prices: Plus **799 cents/month** or **6999 cents/year**; Free **$0**.
Free users may create one active Hive and join five active free Hives. Plus
allows three active created Hives and unlimited free-Hive memberships. Paid
members need no Plus and consume no free-Hive slots. Monetization requires Plus
and Stripe verification, with a maximum of three non-closed offerings. Existing
over-limit free memberships are not retroactively removed; new admissions and
creations enforce quotas, including reactivation of archived Hives. Ownership of a free Hive also counts
toward the five free memberships; failed owner admission rolls back creation.

## Implemented flows

- Separate platform Plus and connected-account paid-Hive subscriptions.
- Stripe-hosted Standard Connect onboarding/resumption; return/refresh retrieves
  actual requirements, capabilities, charges and payout states. No bank details,
  documents or card data are collected in TrueHive.
- Atomic paid-draft creation in Create Hive; shared configuration in owner
  Monetization. Ongoing benefits, description, monthly USD price and cancellation
  terms are required. Capacity uses the existing Hive setting.
- Draft / awaiting verification / pending approval / approved / active / paused /
  closing / closed states. All initial offerings and configuration revisions are
  reviewed by existing `SITE_ADMIN_EMAILS` staff. Staff review is available at
  `/admin/monetization`, linked from Reports. Owners publish explicitly after
  approval and refreshed verification. No automatic approval.
- Existing free Hives with active members cannot silently become paid. Prices
  and benefits are locked while subscription obligations remain. Closed paid
  offerings cannot reopen through this implementation.
- **Admission policy:** paid Hives use open admission after verified payment.
  Configure their join policy as Open. Request/invite-only paid publication is
  rejected; legacy join routes and direct membership writes cannot bypass billing.
  No member is charged while awaiting a manual admission decision.
- Paid badges/prices and an offer page disclose benefits, renewal, cancellation,
  separate Plus eligibility, and owner refund responsibilities before Checkout.
  Draft/paused/closed offerings are excluded from public discovery candidates.
- Durable Checkout reservations, server-owned integer prices, connected account
  binding, capacity locks, unique subscription indexes and Stripe creation
  idempotency keys prevent duplicates. Reservations last 35 minutes; completed
  Checkouts still reserve capacity until verified admission. Capacity reductions
  cannot discard reserved paid seats. A closure during session creation expires
  the new session instead of returning its URL.
- Redirects and `checkout.session.completed` do not grant access. Reconciliation
  validates the server-created Checkout Session, account, subscription, customer
  binding, metadata, quantity, price, currency, billing interval and 10% fee.
  Verified paid invoices establish paid-through entitlements. Trials, coupons,
  manual/off-Stripe paid invoices and arbitrary price changes do not grant access.
- Member Billing shows Plus, paid memberships, dates, status, invoices, refunds
  and owner responses. Hosted Portal configurations explicitly disable plan/price
  changes and cancellation, while enabling methods and invoice history. In-app
  cancellation confirms period-end behavior. Other members cannot manage the
  subscription or open its Portal.
- Failed renewals retain previously paid access with **three additional days**
  for `past_due`/`unpaid`, anchored to the paid-through date, not webhook delivery.
  Canceled subscriptions keep paid-through access without extra cancellation
  grace. Recovery updates entitlements. In-app notices link to billing.
- A current-period full refund revokes refunded access and queues cancellation;
  partial refunds keep paid access. Pending/action-required refunds are tracked
  as obligations. Disputes record current status, notify member and owner, and
  require review; the dispute alone does not irreversibly revoke access.
- Members can request an owner refund for their latest not-fully-refunded invoice
  even after access ends. Requests are deduplicated per invoice. Owners record a
  final response; money is handled in Stripe. Recording a response does not move
  money or waive legal rights. Pending financial refunds remain separate blockers.
- Close Hive disables new purchases, preserves records/access and durably queues
  each subscription's period-end cancellation. The UI shows remaining members,
  latest paid-through date and pending cancellations. Failed Stripe calls retry
  fairly. Cancellation updates are naturally idempotent; a later external resumption
  is requeued when reconciled. Already-open sessions are expired by maintenance.
- Losing Plus pauses new paid admissions and schedules existing renewals to end
  at members' period boundaries. Owners can close/resolve obligations without
  keeping Plus forever.
- Owner deletion checks active offerings, paid access, unresolved subscriptions,
  cancellation tasks, disputes, pending refunds, unanswered refund requests and
  financial sign-off. The final deletion transaction rechecks under the user lock.
  Closed, never-paid drafts do not permanently block deletion. Paid history is
  retained and excluded from solo-Hive purge scheduling. Paid Hive deletion and
  free-Hive ownership-transfer/leave flows cannot erase financial responsibility.
- Actual processing costs, platform fees, gross collections, refunds, restrictions,
  Stripe balances and payouts are shown separately. Unknown costs are labeled;
  estimates are not guaranteed payouts. Account balances are account-wide.
- Motion for React provides shared panel/button/status/dialog/tab/disclosure
  patterns. Reduced motion removes movement; native dialogs preserve focus,
  Escape and keyboard trapping. Billing tabs support arrow/Home/End navigation.

## Stripe architecture — proposed for approval before live activation

Test implementation uses **direct charges on Standard connected accounts**.
Customers and Hive subscriptions live on the connected account; Plus lives on the
platform. Hive subscriptions set `application_fee_percent: 10`. Processing fees
are separate and collected according to the connected account's Stripe agreement.
Direct charges suit owner-provided benefits and full Dashboard refund management.
Account capabilities and requirements are checked before publication and Checkout.
See [Stripe Connect subscriptions](https://docs.stripe.com/connect/subscriptions)
and [direct charges](https://docs.stripe.com/connect/direct-charges).

| Model | Objects and operational responsibility |
| --- | --- |
| Direct charges — implemented in test mode | Connected account owns the charge, customer and subscription. Refunds and disputes debit its balance; ultimate fee/negative-balance responsibility still depends on account configuration and agreements. Platform fees need separate refund handling. Reconciliation must use the connected account context. |
| Destination charges — alternative | Platform owns the payment/subscription and transfers proceeds. Platform balance bears fees, refunds and disputes, with transfer/application-fee reversal decisions and recovery procedures. A transfer does not remove platform liability. |
| Separate charges/transfers — alternative | Platform payment and transfer timing are separate; allocation, reversal, reconciliation and liability operations become more involved. No implementation in this branch. |

This is a proposal, **not business approval or a claim of zero platform liability**.
Approve merchant-of-record, account controller/loss settings, eligible countries,
tax responsibilities, processing/Billing/Connect fees, refund fee allocation and
dispute operations before live activation. Review
[Stripe charge types](https://docs.stripe.com/connect/charges) and account agreements.
Owner refunds run in Stripe's Dashboard, not through a new TrueHive money-moving
API. Application fees are not automatically promised back; actual fee refunds
are reconciled when Stripe reports them. Legal must approve that policy.

The SDK is official `stripe` 23.x. Requests pin **2025-02-24.acacia** because the
reconciliation uses its invoice `charge` and subscription period model. Both
webhook destinations must use this version and snapshot events. An API-version
upgrade requires fixtures and real Stripe verification, not just a package bump.

## Database and API report

`npm run db:migrate` explicitly applies structural `schema.sql`, then the new
structural `billing.sql`, then the existing numbered one-time data migrations.
There is **no new data backfill** or automatic API-start migration. Billing SQL was
executed and rerun only in isolated PostgreSQL/WASM. SchemaGuard checks its tables.

New tables: `billing_accounts`, `hive_monetization`, `billing_subscriptions`,
`billing_checkouts`, `billing_events`, `billing_invoices`, `billing_disputes`,
`billing_refunds`, `billing_refund_requests`, `billing_audit`, `billing_tasks`.
Financial/audit foreign keys do not cascade on user/Hive deletion. Unique indexes
cover open products, Stripe account/subscription IDs, event IDs, per-invoice refund
requests and durable tasks. Triggers enforce creation, membership and reserved
capacity rules; user/Hive/subscription locks serialize critical operations.

All endpoints below are under `/api/billing`. Authenticated routes use the
existing consent gate. Mutations are rate limited. Owner financial data requires
the actual Hive owner, not every community admin. Site staff permissions use the
existing `requireSiteAdmin`, which returns 404 for non-staff.

| Method/path | Permission / function |
| --- | --- |
| GET `/summary` | Signed-in user; own subscriptions, invoices, refunds and owned-Hive links |
| POST `/checkout` | Verified active user; `{interval: month/year}` or `{hiveId}`; trusted server pricing |
| POST `/subscriptions/:id/cancel` | Subscriber only; period end |
| POST `/subscriptions/:id/portal` | Subscriber only; account-scoped hosted methods/invoices |
| POST `/subscriptions/:id/refund-request` | Paying subscriber only; latest eligible invoice, reason required |
| POST `/connect/onboard`, `/connect/refresh` | Own connection; Plus required for onboarding |
| GET `/connect/finances` | Own connected account; balances and recent payouts |
| GET `/hives/:id/offer` | Signed-in user; public membership description/pricing only |
| GET `/hives/:id/owner` | Actual owner; configuration, totals, subscribers, refunds/disputes/requests |
| PUT `/hives/:id/configuration` | Verified owner with Plus; validated revision submitted for review |
| POST `/hives/:id/publish`, `/pause`, `/close` | Actual owner; publish checks eligibility/approval/Stripe; close requires `CLOSE` |
| POST `/hives/:id/refund-requests/:requestId/respond` | Actual owner of that Hive; documented final response, no money movement |
| GET `/admin/reviews` | Site staff queue |
| POST `/admin/hives/:id/review` | Site staff; approve/request changes/decline with reason |
| POST `/admin/accounts/:userId/resolve` | Site staff; audited financial sign-off after obligations and Stripe balances resolve |
| POST `/webhooks/platform`, `/webhooks/connect` | Stripe signature, original raw body, separate signing secrets; no browser auth/consent |

Events: `checkout.session.completed`, `checkout.session.expired`,
`invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`,
`charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`,
`account.updated`, `account.application.deauthorized`.
Subscription/invoice event variants reconcile the current account-scoped object.
Unknown events are harmless ledger entries. Event processing failures roll back
receipt and financial changes so Stripe can safely retry. Older invoice ledger
entries are retained separately from current subscription state. See
[Stripe webhook ordering/signatures](https://docs.stripe.com/webhooks).

## Security and operational review

- Live API keys and `livemode` events are rejected in code. The only enabling flag
  is `BILLING_ENABLED=test`; there is no live escape hatch.
- Raw-body signatures use Stripe's SDK and timestamp tolerance. Separate platform
  and connected destinations reject the wrong account context.
- Access derives from verified invoice/subscription records. Authentication expires
  stale membership rows before existing controllers read them; the shared Hive
  guard independently checks entitlements. Real-time sockets arm an expiry timer
  and disconnect when paid access expires. Refund revocations disconnect sessions.
- Removed members cannot silently repurchase/reenter or be readmitted by a renewal.
- Refunds/disputes are scoped by charge, invoice, subscription and connected account.
  Webhook and worker failures report sanitized IDs/codes through Sentry/reportProblem;
  event bodies, credentials and Stripe customer payloads are not logged.
- Maintenance runs every 30 seconds with durable cancellation tasks, `SKIP LOCKED`,
  retries, session expiry and periodic Stripe retrieval. DB history is persistent;
  the timer itself runs in the API process and requires operational monitoring.
- Arbitrary Dashboard price edits fail reconciliation rather than granting access
  under a changed contract. Treat these failures and deauthorized Connect accounts
  as staff incidents. Dashboard access means external changes remain possible.
- Staff financial sign-off requires resolved obligations and zero positive/negative
  Stripe available/pending balances. This is conservative; unrelated Standard
  account activity may need an approved manual reconciliation procedure.

## Test report

| Verification | Result |
| --- | --- |
| Prompt 73 backend | **78 passed**; full SQL, trigger/constraint/rollback checks, actual Express auth and signature handling, real Socket.IO expiry; Stripe API responses simulated |
| Prompt 73 browser | **64 passed**; 1440/390 widths × normal/reduced motion, billing, cancellation, activation/canceled redirects, refund requests, owner closure, Create, staff UI and bounds; API mocked |
| Prompt 71 database | **21 passed** |
| Prompt 71B database | **30 passed** |
| Prompt 71 browser | **43 passed** |
| Prompt 71B browser | **39 passed** |
| Actual isolated API boot | Passed connection, schema/data guards and health 200 |
| Frontend production build | Passed; existing >500 KB bundle warning remains |
| JS syntax and git whitespace | Checked before commit |

Total automated assertions: **275** (78 + 64 + 21 + 30 + 43 + 39).
Old geographic database fixtures intentionally disable only the new Hive-creation
quota trigger because they create five Hives for one synthetic owner. Prompt 73's
suite separately tests that trigger enabled. No production trigger was disabled.
All backend fixtures use the existing PGlite preload, a local unreachable fallback
DSN, and disabled email/AI. The preload installs no production database connection.

Covered failures include missing Plus, fourth creation, sixth free membership,
incomplete Stripe verification, missing approval, forged prices, direct join bypass,
redirect-without-payment, duplicate Checkout/event/refund request, invalid/stale
signature, out-of-order subscription state, failed renewal/recovery, cross-user
cancellation/Portal/refunds, partial/full/pending refunds, disputes, expired access,
different closure dates, cancellation outage/retry, blocked deletion and schema rerun.

Untested/release blockers: actual Stripe test accounts/CLI events/cards, SCA and
asynchronous methods, actual invoice expansion/fees on the pinned API version,
real bank/payout flows, refunds/disputes/Test Clocks, multi-process concurrency on
Neon/Postgres, load, Safari/Firefox/real devices, email delivery and production.
PGlite serializes fixture execution; it does not prove multi-connection deadlock,
transaction-isolation or failover behavior. Review those on a dedicated staging DB.

Initial verification found an SQL conditional syntax issue, old quota-incompatible
geographic fixtures, a missing React hook import, duplicate edit insertion, a
timezone-only fixture date, and a test migration runner using prepared queries for
multi-statement SQL. These were corrected; passing results above are final runs.

### Reproduce and evidence

Install both checkouts with `npm ci --prefix server` and `npm ci --prefix client`.
PGlite remains test-only in `%TEMP%/truehive-p71b-tools` (see Prompt 71B handoff).

```powershell
# from server/ — no real .env or Stripe credentials required
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt73.mjs
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt71.mjs
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt71b.mjs
node src/checks/prompt71b-boot.mjs
# from client/ — Vite in a separate terminal
npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort
node src/checks/prompt73-browser.mjs
$env:P71_BASE_URL='http://127.0.0.1:5175'
node src/checks/prompt71-browser.mjs
node src/checks/prompt71b-browser.mjs
npm.cmd run build
```

`%TEMP%/truehive-prompt73` contains desktop/mobile screenshots:
`member-billing-{1440,390}.png`, `paid-offer-{1440,390}.png`,
`owner-monetization-{1440,390}.png`, `create-paid-{1440,390}.png`,
plus normal/reduced-motion WebM recordings, `report.json` and `requests.json`.
Screenshots are synthetic fixtures, never production customer data. The inherited
location evidence remains in `%TEMP%/truehive-prompt71` and `truehive-prompt71b`.

### Dependency audit

Ran `npm audit` on both packages and applied **nonbreaking `npm audit fix` only**.
No `--force` or major upgrades. Server findings fell from 10 (including one
critical) to **3 high, dev-only**: nodemon/chokidar/braces. Client findings fell
from 14 to **9**: six high and three moderate, involving the Sentry build plugin,
chokidar/braces/unplugin, Vite/esbuild, and react-router/react-router-dom. Remaining
fix suggestions require major changes; no breaking update was applied. The router
findings include an open-redirect advisory and an SSR-hydration advisory; TrueHive
is a client-rendered app, but the findings still require explicit review. No
Stripe advisory appeared in the audit results. The separate server runtime-only
`npm audit --omit=dev` reports zero vulnerabilities. Do not call these audits clean.
JSON reports: `%TEMP%/truehive-prompt73-{server,client}-audit.json`.

## Deployment checklist and outstanding decisions

1. Review this feature branch; reconcile the independent uncommitted main-checkout
   analytics/newsletter changes before any future merge. This task does not merge
   or push to the auto-deploying main branch.
2. Approve the proposed direct-charge Standard Connect model and controller/loss,
   merchant-of-record, geographic eligibility, taxes and fee responsibilities.
3. Have counsel review the clearly marked draft Terms additions, subscription
   disclosures, refund response/escalation procedure, grace period, chargeback
   handling, financial retention and safety-closure/refund policy. Bump the consent
   policy version only when the final contractual text is approved for publication.
4. Create a dedicated **test/staging** database, apply `npm run db:migrate` there,
   inspect all new tables, triggers, indexes and health. Test concurrent final-seat
   purchases, quota races, webhook/closure races, failed commits and recovery.
   Production migration requires a separately confirmed target and explicit approval.
5. Configure Stripe sandbox/test Connect and platform accounts, public business
   profiles/terms URLs, payment-method settings and eligible countries. Supply
   `BILLING_ENABLED=test`, test-only `STRIPE_SECRET_KEY`, separate
   `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET`, `CLIENT_URL`, existing
   auth/DB settings, `SITE_ADMIN_EMAILS`, and existing Sentry settings. Never commit
   credentials. No frontend Stripe secret or publishable key is needed for hosted
   Checkout.
6. Register **both** webhook destinations with pinned snapshot API version and
   listed events. Verify raw-body signature delivery, retries, old/duplicate events,
   connected account context, consent-independent webhook access and diagnostics.
7. Exercise hosted onboarding/verification, both Plus plans, paid Checkout, SCA,
   cancellation/Portal, failed renewal/recovery, refunds/disputes, payouts, account
   restrictions/deauthorization, and closure with Test Clocks. Verify actual fee
   amounts, webhook ledger, membership entitlements and record retention together.
8. Configure Stripe retries to match the three-day local grace policy. Decide and
   verify the Stripe dunning terminal action. An unpaid entitlement must not be
   confused with cancellation of future Stripe collection attempts.
9. Set up alerts for webhook 5xx, queue attempts/backlog, unbound/processing
   Checkouts, mismatched products, stale account checks and failed reconciliation.
   A Stripe outage can delay cancellation; closure is explicitly shown as Closing
   until obligations finish. Define owner/member remediation for any renewal that
   occurs while cancellation is delayed, and manual procedures for deauthorization,
   pending refunds and account-wide financial sign-off.
10. Review/upgrade the remaining vulnerable dependencies in separately verified
    work, and review the bundle-size warning before release.
11. **Live activation remains blocked in code.** It requires explicit business,
    legal, Stripe configuration and deployment approval, successful real test-mode
    evidence, a reviewed change to the live guard, and a confirmed migration target.
    No real-money transaction should be attempted from this implementation now.

Prompt 73's live-readiness definition is not claimed met by mocked tests. The
reviewable implementation is committed separately; the external verification and
approval boundary above remains open.
