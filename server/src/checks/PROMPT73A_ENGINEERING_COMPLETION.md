# Prompt 73A engineering completion and automated acceptance budget

> Current consolidated outcome: six authorized scenarios PASS; natural retry exhaustion FAIL/BLOCKED after a harness timeout and cleanup cancellation. All original financial caps were respected. See [one consolidated final report](PROMPT73A_CONSOLIDATED_FINAL.md). Statements below describe earlier stages.

> November 3 authorized-suite update: three real scenarios passed; execution stopped at the one-Hive resource boundary after cleanup. See [actual financial acceptance results](PROMPT73A_AUTHORIZED_FINANCIAL_ACCEPTANCE.md). Historical not-authorized status below is superseded for this exact plan only; production remains blocked.

Current status: **6 real bounded scenarios PASS; natural retry exhaustion FAIL/BLOCKED. Engineering regressions PASS; production NOT READY.**

The sections below preserve the earlier engineering-only preparation and original budget; current outcomes are in the consolidated report.

This update supersedes dependency, Hive catalog and process-local Connect nonce findings in the earlier final-readiness report. It preserves all historical real-payment evidence and its limitations. No new Checkout, charge, refund, dispute, clock advancement, Stripe catalog object or connected account was created during this work. No production access, deployment, push or merge.

## Implemented fixes

- Compatible dependency updates: DOMPurify 3.4.17, Express 4.22.3 / body-parser 1.20.9, and same-major Sentry patches. Scoped overrides select glob 14.0.2 / minimatch 11.0.1 for the affected tooling dependency chain. Both complete npm audits report **zero vulnerabilities**. The exact Sentry glob wrapper passes filesystem compatibility checks; client build passes without a Sentry upload token. Advisory clearance does not establish absence of every possible vulnerability.
- Hive Checkout selects an account/Hive-bound reusable catalog price, validates amount, currency, recurrence, sandbox mode and product state, and rejects ambiguous bindings. Publication provisions a deterministic product/lookup-key price once. Authorized existing offerings migrate lazily under row locks. Checkout no longer uses inline price_data. Existing subscriptions are never repriced.
- Actual read-only Stripe inspection found Test 3's inline price `price_1UXDUjRuxbP8zrXGb5ePkYlB` and product archived. Stripe documents that inline prices cannot be reused. A canonical reusable price is therefore necessary on the next authorized purchase; archived historical objects are preserved, not reactivated. No catalog object was created merely to test this fix. Offline contract/concurrency tests cover provisioning/reuse; actual new canonical provisioning remains part of the authorized suite.
- Connect refresh nonces are consumed atomically in PostgreSQL, so concurrent instances and process restarts cannot reuse an already-consumed state. Expired nonces are removed. Migration **011_connect_refresh_nonces.sql** was applied only to the asserted Neon dev branch, atomically with its migration ledger entry; previous ledger backed up privately. No protected financial rows were migrated or backfilled.
- Billing confirmation dialog animation now checks current open state before closing, preventing a stale animation callback from closing a reopened dialog.

## Verification completed

**268 server/offline checks**: core 78, fees 10, security 31, PostgreSQL concurrency 24, system guards 14, inbox 8, lifecycle 36, worker 3, callbacks 15, cancellation expiry 9, grace/recovery 8, clock adapter 8, catalog 10, durable nonce concurrency/restart 3, financial-budget guards 8, Sentry glob compatibility 3.

**219 browser checks**: 64 billing UI checks in each of Chromium, Firefox and WebKit, plus 27 actual-browser sanitization checks. The UI fixtures intercept API requests and create no Stripe payment. Client build passes; its existing large-bundle warning remains.

An initial parallel core run exited natively with Windows status -1073740791; a sequential rerun and the subsequent final core run both passed all 78 checks. The cause remains unproven. The interrupted run's exact schema was identified by its log time, all-synthetic users and exact mock subscription/customer IDs, rechecked on dev, and removed; its evidence is retained. Future preload logs identify their generated schema explicitly. An initial concurrency mock lacked the new catalog SDK contract; it was corrected to model the new API and all 24 checks passed. No product security assertions were relaxed. An offline clock-adapter test was inadvertently launched with a DB preload and left its connection open after passing; that exact test process was instructed to run its own pool cleanup, removing its own generated schema. The standalone rerun passed. Future regression orchestration keeps that offline test separate.

Read-only Stripe/dev preservation passes for the three original successful subscriptions, completed cancellation, successful recovery and completed full refund. API health 200; frontend 5193 responds; listener destinations are `/api/billing/webhooks/platform` and `/api/billing/webhooks/connect` on 5183. Pending tasks, failed receipts, queued events and quarantined events are all zero. Only the guarded API was restarted; listener and ports 5173/5193 were left running.

Reusable non-financial command, from server:

```powershell
node src/checks/acceptance/regressions.mjs
```

This runs the isolated server and browser checks sequentially, records private logs and stops on failure. Legacy local-Postgres restart/boot scripts remain excluded because they target a different database or occupied API port. Audits and build were run separately. Private current logs use `sandbox.local/engineering-*`; protected reconciliation is `sandbox.local/final-readonly-review.json`. Machine-readable results: `prompt73a-evidence/ENGINEERING_REVIEW.json`.

## Prepared financial runner

`src/checks/acceptance/run.mjs` defaults to **PLAN_ONLY** and loads no credentials in that mode. `--execute` requires a private explicit approval tied to the exact plan hash, run UUID and expiry (at most 24 hours). No approval file has been created.

The runner uses supported test PaymentMethod IDs and Stripe subscription/invoice/refund/dispute APIs; no human card entry. Synthetic reservations start without access. Only real signed ingress/inbox/event receipts and paid Stripe invoices establish entitlement. Direct API subscriptions are identified as API acceptance, not fabricated hosted Checkout completion. Existing actual Checkout acceptance remains preserved. Synthetic API sessions still traverse normal authorization/consent/owner/staff checks; this harness does not certify the login UI or login rate limiter.

Before money operations it validates the exact sandbox platform, dev endpoint/branch, catalog prices, connected account/owner binding and reviewer route. A private exclusive journal reserves financial effects before calls, preserves stable idempotency keys and rejects changed requests or overspending. Each resource is bound to the run. Payments, invoices, charge balance fees, refunds, access, signed deliveries and protected baselines are reconciled. Local processor duplicate tests are explicitly labeled local; they are not Stripe-origin retries.

On failure it stops and attempts no-proration/no-invoice cancellation of only run-owned subscriptions, discovers subscriptions whose create response may have been lost, and closes only its own offering. Financial/user/audit records and evidence are retained. A failed or cleaned run cannot silently restart financial scenarios; `--cleanup-only` can finish cleanup within the approved scope. Unsupported Connect clocks, unavailable dispute controls, retry schedules extending beyond the bounded cycle, unexpected fees or caps stop the suite; they never become simulated PASS results. Actual API behavior and the complete runner remain **pending financial acceptance**, not claimed tested end to end.

## One proposed bounded authorization: remaining scenarios only

Plan SHA-256: `2f2e37046dd067040fda43320dd594a3eb2ec7be9047e9504300aac406a93391`.

| New isolated scenario | Maximum successful payment | Authorized refund treatment proposed |
| --- | ---: | --- |
| Annual cancellation | $69.99 | None |
| Partial Plus refund | $7.99 | $2.00 customer refund; access retained |
| Full paid-Hive refund | $12.00 | $12.00 customer refund plus full $1.20 fee reversal |
| Partial paid-Hive refund | $12.00 | $3.00 customer refund plus proportional $0.30 fee reversal |
| Paid-Hive closure | $12.00 | None; verify future recurring cancellation/paid access |
| Dispute and closure | $7.99 | One supported test dispute on that payment; up to $50 sandbox dispute fees |
| Retry exhaustion | $7.99 | Failing renewals only, no successful recovery payment |

Hard caps: **7 successful charges totaling $129.96; 3 customer refunds totaling $17.00; 2 application-fee reversals totaling $1.50; 1 dispute on $7.99 and up to $50 dispute fees; 14 failed attempts totaling at most $111.86 attempted, not paid.** Normal Stripe processing costs are recorded separately. A dispute concerns an already-counted payment, not an additional successful charge. This does not authorize bank payouts, external-account changes, extra renewals, refunds of protected fixtures or any live operation.

Resource caps: seven new synthetic users/customers/subscriptions/clocks; one new isolated Hive under the already-verified owner/account; at most one canonical Hive product and price. Existing monthly/annual prices are reused. Only run-owned clocks advance. Shared retry settings and protected clocks never change. Cleanup cancels at most seven run-owned subscriptions, without proration or new invoices. Stored history remains for audit.

The proposed fee-refund treatment is an explicit sandbox test expectation, **not approval of a live business policy**. No repeat of the already-completed monthly cancellation, full Plus refund or monthly recovery payment is included. Future expansion changes the plan hash and requires authorization.

## Genuine remaining launch blockers

- **High financial:** execute and reconcile the bounded real suite after explicit authorization. Until then partial/refund-fee/dispute/exhaustion/annual cancellation/closure acceptance remains PENDING.
- **High business/legal:** approve refund eligibility/windows/exceptions, application-fee retention/reversal rules, merchant/operator liability, supported geography/tax, consent/terms, support/escalation and retention. No draft is represented as legally approved.
- **Medium operations/security:** hosted worker failover/restart drills, alerting/quarantine resolution, cancellation-outage and reconciliation runbooks, shared multi-instance rate limiting and HTTPS/secrets/webhook configuration. Durable nonce consumption is fixed; the callback request limiter is still process-local.
- **Medium regression:** characterize the intermittent native Windows test exit and obtain stable clean CI runs. Passing reruns do not establish its cause.
- Production billing remains intentionally disabled. A separately reviewed activation/release change is required after acceptance and policy approval. No deployment is authorized here.

Official catalog limitation: https://docs.stripe.com/products-prices/manage-prices#create-inline-prices

Supported test methods and dispute controls: https://docs.stripe.com/testing
