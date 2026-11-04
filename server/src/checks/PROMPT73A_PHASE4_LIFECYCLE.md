# Prompt 73A Phase 4: lifecycle, reliability and recovery

Status: **Durable ordering recovery implemented and tested. Lifecycle regression
checks PASS with simulated Stripe states; real Stripe lifecycle acceptance remains
PENDING isolated paid fixtures and manual payment. This is not an overall Phase 4 PASS.**

Verified November 1, 2026 Pacific time against Neon dev endpoint
`ep-fancy-cherry-at7zftnq`, branch `br-holy-poetry-atkl4gsc`, test-only Stripe
credentials, and sandbox API port 5183. No production access, live payment,
deployment, push or merge. No new Stripe Checkout, charge, customer, subscription,
refund, cancellation or connected account was created by this phase.

## Durable event ordering repair

The original Test 3 application_fee.created arrived before its invoice transaction
committed. Rolling back its processed receipt was correct, but the CLI supplied
no automatic retry. The earlier locally signed recovery remains historical
evidence, not evidence of a Stripe-origin retry.

Signature and destination checks now precede an independent durable insert into
`billing_event_inbox`. The first verified sandbox envelope is retained and cannot
be rebound to another account, event type or object on redelivery. Raw payloads
and signatures are never logged. Worker retries reuse the envelope verified at
ingress; they do not fabricate a new signature or claim a new Stripe delivery.

The existing inline/external billing worker drains the inbox on startup and each
30-second maintenance tick. Claims use SKIP LOCKED and five-minute leases;
transient failures have capped exponential backoff and no attempt exhaustion.
Dependency failures, transport failures, transaction rollback and deadlocks remain
recoverable. Explicit non-rate-limit 4xx validation failures and Stripe invalid
request/authentication/permission failures are quarantined for operator review.
Unknown failures remain retryable. There is no unauthenticated quarantine-reset
endpoint. Authenticated staff operations expose queued and quarantined counts.

The original billing_events receipt and financial/membership effects still commit
atomically. A crash after financial commit but before inbox acknowledgement causes
a harmless duplicate on recovery. An expired worker lease can be reclaimed by a
new process. Successful processing clears stale quarantine/error state; a worker
failure cannot overwrite an already acknowledged delivery.

Only migration `010_billing_event_inbox.sql` was applied to verified dev, atomically
with its schema_migrations ledger entry. Equivalent structural DDL is in billing.sql
and the startup guard requires the new table/columns. No existing record backfill
was run. A private local backup of subscriptions, invoices, receipts, attempts and
migration ledger was taken first. Historical unresolved attempts without a saved
envelope cannot be recovered from this new table alone; dev currently has zero
such failed attempts. The original Test 3 fee had already recovered before this work.

## Scenario results

| Scenario | Result and evidence scope |
| --- | --- |
| Early fee before invoice commit | PASS: real Postgres fixture, actual fee handler, simulated Stripe retrieval; worker recovers after delayed invoice insert without webhook replay |
| Concurrent and duplicate delivery | PASS: concurrent inbox inserts/claims, one committed event; existing concurrency and financial duplicate regressions pass |
| Backoff and delayed events | PASS: not-due events skipped; delayed dependency later reconciles |
| Worker restart / abandoned claim | PASS: fresh Node process drains persisted envelope after lease expiry; no database/server restart was attempted |
| Permanent versus transient errors | PASS: validation quarantined; dependencies/transport/deadlock retry |
| Signature, destination and account isolation | PASS: existing real SDK signature/security checks; live envelopes and event/account substitution rejected |
| Monthly Plus failed renewal, grace, exhaustion and expiration | PASS simulated Stripe states with real isolated dev SQL; real Stripe transition PENDING |
| Annual Plus failed renewal, grace, exhaustion and expiration | PASS simulated Stripe states with real isolated dev SQL; real Stripe transition PENDING |
| Paid Hive failed renewal, grace, exhaustion and expiration | PASS simulated Stripe states with real isolated dev SQL; real Stripe transition PENDING |
| Payment-method update without paid evidence | PASS simulated active state grants no new access; actual hosted method update PENDING |
| Recovery before/after expiration | PASS simulated paid evidence restores access; real Stripe retries/recovery PENDING |
| Monthly/annual Plus and Hive period-end cancellation | PASS simulated current state preserves paid-through access; real cancellation PENDING |
| Renewal boundary advancement and stale events | PASS simulated paid invoices/current-state retrieval; real clock advancement PENDING |
| Partial and full refunds | PASS simulated ledger/access rules: partial retains access; full current-period refund revokes it; real refunds PENDING |
| Failed/pending refunds | PASS simulated refund ledger and access behavior; real refund failure PENDING |
| Dispute creation and closure | PASS simulated current dispute state, including won closure; dispute alone does not revoke access; real Stripe dispute PENDING |
| Application-fee refunds | PASS simulated fee retrieval and historical invoice accounting; real fee refund/owner balance impact PENDING |
| Hive closure and cancellation retry | PASS existing isolated tests: purchases blocked, recurring cancellations queued/retried, individual paid dates retained; real closure PENDING |
| Financial account-deletion blockers | PASS isolated tests for unresolved subscriptions/disputes and server-side deletion denial; full real pending-refund/payout acceptance PENDING |
| Dedicated frontend | PASS real authenticated read-only settings/success destination, owner billing, member billing and paid-Hive screens against port 5183 |
| Frontend mutating controls | PASS intercepted UI fixtures for cancellation, closure, Checkout errors, Connect/review/billing; real destructive/payment clicks intentionally not performed |

## Validation

- Original billing: 78 checks.
- Fee accounting and delayed-event worker: 10 checks.
- Durable inbox/restart/concurrency: 8 checks.
- Added lifecycle matrix: 36 checks (12 each for monthly Plus, annual Plus, Hive).
- Security: 31; real PostgreSQL concurrency: 24; system exemptions: 14.
- Connect callback security: 15; standalone worker/heartbeat: 3.
- Chromium, Firefox and WebKit: 64 UI checks each, mobile/desktop and reduced motion.
- Four authenticated real sandbox pages: no runtime errors; no mutating controls used.
- Actual paid-Hive read-only verifier still PASS. All three successful Stripe/dev
  subscriptions retain ownership, status, paid/access dates, amounts and cancellation
  flags. Protected invoice amounts, fee/refund values and associations also match
  their backup. Normal maintenance refreshed the two Plus hosted invoice URLs from
  Stripe; this was the only protected invoice field difference observed.
- API health 200; staff operations: zero pending tasks, failed events, queued events,
  or quarantined events, with a successful durable worker heartbeat.

Dedicated frontend remains running at `http://localhost:5193` with
`VITE_API_URL=http://localhost:5183`; only the ignored sandbox launcher CLIENT_URL
was changed to 5193. Port 5173 was left untouched. The sandbox API was restarted
to load the repair; the existing Stripe listener was left running.

## Remaining manual acceptance

Do not use the three protected successful subscriptions for destructive lifecycle
tests. The next paid acceptance step needs separate synthetic monthly Plus,
annual Plus and paid-Hive fixtures, each with an explicitly identified customer,
subscription and charge. Create through authorized backend flows, stop at the
hosted Checkout URL, and allow the human to complete each new test payment.
No such new payment has been initiated here.

For time-dependent tests, use isolated Stripe test-clock customers where supported
by the backend Checkout/customer binding; do not attach clocks or failing methods
to the protected subscriptions. The existing Checkout path has not been extended
or validated for clock-bound customers in this phase. Verify that prerequisite
before claiming clock-driven annual renewal coverage. Advance only isolated clocks,
verify real signed events and dev state, and distinguish clock simulation from
real elapsed time and financial settlement.

On those isolated fixtures: update the payment method through the hosted portal,
exercise failed renewals/exhaustion and recovery, then test each cancellation,
refund/failure, dispute/closure and Hive closure independently. Fee refunds must
be requested/retrieved separately as appropriate for direct charges; never infer
that refunding a connected charge automatically refunded the platform fee. Check
actual balances, refund statuses, ledger amounts and access after each transition.
Stop for any required human payment action. Actual refund/dispute balance effects,
bank payout and production retry behavior are not certified by these regressions.

Official references reviewed:
- https://docs.stripe.com/billing/testing
- https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage
- https://docs.stripe.com/testing
- https://docs.stripe.com/connect/direct-charges

Ignored evidence/logs use `server/sandbox.local/phase4-*`; preservation can be rerun
from server with `node sandbox.local/verify-phase4-preservation.mjs`. New regression
scripts require the explicitly guarded prompt73a-dev-preload and create/drop only
their own isolated schema, with no public search-path fallback.
