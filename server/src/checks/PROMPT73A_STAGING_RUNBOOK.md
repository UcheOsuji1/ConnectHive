# Prompt 73A: isolated staging and real sandbox runbook

No production target is authorized. Do not reuse the main checkout's unknown
`DATABASE_URL`. No Stripe/Neon/Render account connection was available in this run.

## Credentials and account setup

1. In Stripe Dashboard select a **Sandbox/test environment**, not live mode.
   Open Developers → API keys and store the test secret locally in the ignored
   `server/.env.sandbox` copied from `.env.sandbox.example`. Set
   `BILLING_ENABLED=test`. Never paste keys or signing secrets into chat, screenshots,
   reports or command arguments. This implementation accepts only `sk_test_`.
2. Open Connect settings in that same sandbox. Configure the platform profile,
   hosted onboarding business information, country eligibility and branding.
   Complete Standard test-owner onboarding through TrueHive after purchasing test
   Plus. Use Stripe's test identity/bank data, never an unnecessary real bank.
   Verify enabled card/transfers capabilities, charges/payouts and requirements.
   Configure refund and dispute access for the owner; approve controller/loss settings.
3. In Workbench → Webhooks/Event destinations, create a platform destination at
   `https://<isolated-staging-api>/api/billing/webhooks/platform` for this account
   and a separate connected-accounts destination at
   `/api/billing/webhooks/connect`. Select **snapshot** events and API version
   **2025-02-24.acacia** on both. If the UI cannot select it, stop and use Stripe's
   supported versioned endpoint configuration; do not silently accept a new version.
   Store each destination's signing secret in its matching local/staging variable:
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Enable the events listed in `PROMPT73_HANDOFF.md`, plus platform events
   `application_fee.created`, `application_fee.refunded` and
   `application_fee.refund.updated`. Confirm account context and
   delivery/retry logs without exporting bodies or credentials. A CLI forwarder's
   signing secret is different from a registered endpoint's secret. For local
   development use an authenticated Stripe CLI with `--forward-to` and
   `--forward-connect-to` targeting the separate routes; verify the CLI's actual
   event API version before using its deliveries as evidence. Never use a
   constructed signed fixture as evidence of Stripe delivery.
5. Set `CLIENT_URL` to the trusted staging frontend HTTPS origin, the isolated
   staging `DATABASE_URL`, strong staging `JWT_SECRET`, `SITE_ADMIN_EMAILS`, and
   existing auth/consent/Sentry settings. Configure secrets through the deployment
   provider's secret controls. No frontend Stripe key is needed for hosted pages.

## Neon and Render boundary

Create a **separate empty Neon staging project/database**, not a child branch
containing production customer records. Name it `truehive-payment-staging` and
create a staging-only role. Save its TLS connection string in staging secrets.
Confirm project/database identity in the provider UI before migration. The local
test preload deliberately refuses hosted databases; do not loosen that guard.
A separate hosted runner must require an explicit confirmed target and unique
synthetic schema before adapting concurrency/restart tests. Hosted restart and
connection-termination tests also need provider support and staging-only permission.

Deploy only this feature branch to separate Render staging web services, with
Node >=22.12 and build commands `npm ci` and frontend `npm run build`. Apply
`npm run db:migrate --prefix server` explicitly to the confirmed staging database;
API start does not migrate. Check health and schema/data guards. Production env,
domains, auto-deploying main and production records remain excluded.

Use the API's durable queue initially on an always-running staging instance, or
set `BILLING_WORKER_MODE=external` on the API and run an always-running background
worker with `npm run billing:worker --prefix server` and the same staging secrets.
Worker crashes lose a lease, not the task. Multiple workers are supported for
cancellation claims; reconciliation is serialized by financial locks. Billing
maintenance on a sleeping/free API has no continuous execution guarantee.
No paid infrastructure was created. A separate worker adds a provider instance's
current plan cost; select and approve that plan in Render before provisioning.
[Render background workers](https://render.com/docs/background-workers).

## Real sandbox acceptance matrix

Use synthetic consenting staging users and Hives. Record sanitized evidence for
each row: expected/actual result, Stripe delivery status, local event/subscription/
invoice state, entitlement and screenshot. All rows below are **not executed**
until account credentials/configuration exist.

| Scenario | Required result / evidence |
| --- | --- |
| Plus monthly and annual | Actual hosted test payment at $7.99/$69.99; invoice and platform subscription; redirect alone grants nothing; verified invoice activates correct term. |
| Owner onboarding/resumption | Plus required; Standard account bound to that owner; actual hosted completion and refreshed requirements; restricted/deauthorized account cannot publish. |
| Paid Hive | Approved owner offering, actual connected-account Checkout, correct monthly USD price/quantity, 10% application fee, separate actual processing fee. No Plus requirement for buyer. |
| Raw real deliveries | Both destinations verify signatures/context; duplicate and delayed resend safe; ledger acknowledged only after commit; entitlement matches paid invoice. |
| SCA / failed initial payment | Test authentication and decline cards from Stripe documentation; no admission on failure/pending authentication. |
| Renewals and recovery | Actual invoices via supported Test Clocks; failed renewal preserves paid-through plus three days only under existing policy; recovery restores appropriate access. Advance clock and poll until ready; do not assume synchronous advancement or connected-account support. |
| Dunning | Document actual retry schedule and terminal collection action. At grace expiry unpaid access ends even if Stripe is still retrying; member notices must describe that distinction. |
| Cancellation / Portal | Subscriber-only, correct account methods/invoices; plan changes/cancellation disabled in hosted Portal; in-app period-end cancellation confirmed, paid access retained. |
| Refunds | Real partial/full refund; current-period full refund revokes access/queues cancellation; pending/failed states remain tracked. Compare charge refund and application-fee refund independently. |
| Disputes | Supported sandbox dispute create/resolve; owner/member notified; current state retained; no irreversible access revocation solely from dispute. |
| Closure / eligibility loss | Stop purchases immediately, preserve paid dates and obligations, expire open sessions, retry durable cancellations after simulated outage and process restart. |
| Restriction/deauthorization | Real supported account changes; pause admission; incident/remediation plan for inability to retrieve or cancel subscriptions. |
| Isolation / accounting | Cross-owner IDs denied; account-scoped balance/payout retrieval; reconcile gross, costs, application-fee refunds and historical invoices. No estimate labeled a payout. |

Use [Stripe test methods](https://docs.stripe.com/testing) and
[Test Clocks](https://docs.stripe.com/billing/testing/test-clocks).
Pending refunds, bank payouts and some restriction/dispute states may require
specific supported sandbox methods or provider assistance. Record unsupported
cases and an alternative procedure rather than fabricate results.

After completing three real Checkouts, set only their session IDs and connected
account reference in `.env.sandbox`, plus the Hive's integer price. From `server/`:

```powershell
node src/checks/prompt73a-sandbox.mjs
```

The read-only verifier calls actual Stripe, checks the pinned response and
expanded invoice/charge/fee contract and emits a sanitized temp report. It makes
no charges or database changes. It does **not** replace the acceptance matrix or
prove real delivery/local activation. Missing inputs return BLOCKED before network
access. Do not publish the ignored configuration file.

## Operations and incident checks

Existing `reportProblem` sends sanitized errors through Sentry when configured.
Webhook attempts survive failed financial transactions, and worker/task rows
expose retries, errors and heartbeat timestamps. Staff-only
`GET /api/billing/admin/operations` provides queue, failed-event, stale-checkout
counts and last worker success. It requires existing staff authentication/consent.

Configure and exercise Sentry rules for webhook processing failures, repeated
invalid signatures, reconciliation/checkout expiry errors and cancellation retry
errors. Configure an authenticated monitor: heartbeat older than two minutes,
tasks with attempts >=3, stale reservations and unprocessed verified events should
page the staging operator. These are proposed thresholds, not configured alerts.
Per-item failures can coexist with a successful overall maintenance tick, so a
heartbeat alone is insufficient. Check oldest task/event age and restrictions.
Do not send event bodies, customer data or signing secrets into logs/alerts.

During a cancellation outage keep UI pending, retry, inspect Stripe for any
intervening renewal and apply the approved remediation/refund process. Never mark
a task complete merely because a network request was attempted. Lost lease claims
are recoverable; Stripe updates are naturally idempotent and stale tokens cannot
acknowledge another worker's claim. For deauthorization, escalate to owner/Stripe;
do not fake success or erase records. For DB outage, restore staging availability,
confirm health, resume worker, resend failed real events and compare ledgers.
