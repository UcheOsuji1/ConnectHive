# Prompt 73A final automated billing-readiness review

> Current consolidated outcome: six authorized scenarios PASS; natural retry exhaustion FAIL/BLOCKED after a harness timeout and cleanup cancellation. All original financial caps were respected. See [one consolidated final report](PROMPT73A_CONSOLIDATED_FINAL.md). Statements below describe earlier stages.

> November 3 authorized-suite update: three real scenarios passed; execution stopped at the one-Hive resource boundary after cleanup. See [actual financial acceptance results](PROMPT73A_AUTHORIZED_FINANCIAL_ACCEPTANCE.md). Historical not-authorized status below is superseded for this exact plan only; production remains blocked.

> Engineering update: dependency audits now report zero vulnerabilities; catalog reuse, durable callback nonce consumption and the dialog race are repaired. See [engineering completion and bounded financial budget](PROMPT73A_ENGINEERING_COMPLETION.md). Historical findings below are retained for traceability; the newer report supersedes those specific engineering findings. Remaining financial acceptance and business/operational launch gates still apply.

**Decision: sandbox billing paths verified; production launch BLOCKED.**
Reviewed November 1, 2026 Pacific / November 2 UTC. Stripe sandbox account
acct_1UUV9MRuxbB0fH11; verified Neon dev ep-fancy-cherry-at7zftnq /
br-holy-poetry-atkl4gsc. No production access/deployment, merge/push, new Checkout,
charge, refund, clock advance or protected-record mutation during this review.
No further manual card entry is requested. This report supersedes historical
pending statuses in earlier handoffs; it does not turn simulated tests into real
Stripe acceptance or legal/business approval.

## PASSED: real Stripe and dev evidence

| Scenario                                      | Verified result                                                                                                                            | Evidence                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Plus monthly purchase                         | $7.99 paid, signed events, invoice/charge/owner binding and active entitlement                                                             | [Test 1](PROMPT73A_REAL_TEST1.md)                           |
| Plus annual purchase                          | $69.99 paid, full calendar-year period, signed events and entitlement; monthly unchanged                                                   | [Test 2](PROMPT73A_REAL_TEST2.md)                           |
| Paid Hive purchase / platform fee             | $12 connected-account payment, $1.20 actual application fee, 65-cent processing, $10.15 owner net, membership after payment                | [Test 3](PROMPT73A_REAL_TEST3.md)                           |
| Monthly scheduled and period-end cancellation | Dedicated clock canceled exact boundary; actual signed deletion, no new invoice/charge; original paid dates retained                       | [Cancellation](PROMPT73A_PHASE4B_REAL_LIFECYCLE.md)         |
| Failed monthly renewal                        | Real invoice open/unpaid, past_due, card_declined; signed failure, no new paid-period grant; three-day grace                               | [Renewal](PROMPT73A_PHASE4B_FAILED_RENEWAL.md)              |
| One authorized recovery                       | Existing $7.99 invoice paid once, signed invoice.paid, active through January 2, matching ledger; no duplicate invoice/subscription        | [Recovery](PROMPT73A_PHASE4B_FAILED_RENEWAL.md)             |
| Full Plus refund                              | Exactly one $7.99 refund succeeded, signed refund events, one refund row, refunded cents 799, Plus revoked, renewal cancellation confirmed | [Refund](PROMPT73A_PHASE4B_REFUNDS.md)                      |
| Protected fixtures                            | Original three purchases, completed cancellation, successful recovery and completed full refund all preserved in current read-only checks  | final-readonly-review.json under ignored sandbox.local      |
| API contracts                                 | Four current real Acacia contract checks pass: Standard Connect capability read and monthly/annual/Hive financial retrieval                | prompt73a-sandbox.mjs with private existing-object bindings |

Payment and refund acceptance used actual Stripe-origin events and verified
ingress/attempt/inbox/event receipts. Historical duplicate/recovery probes were
locally signed replays, not Stripe-origin redeliveries. Test 3's early fee event
initially failed before invoice commit and was recovered locally; that history
is retained rather than misrepresented as automatic Stripe delivery success.

Current financial cross-check: connected owner balance $0 available / $10.15
pending USD; platform fee remains 120 cents, unrefunded. No bank-payout/settlement
claim. Full Plus refund: original gross 799, processing 53, charge balance credit
746 and actual refund balance debit -799 cents. Combined transaction net is -53
cents; refund does not erase original processing cost. Invoice gross history is
preserved separately from refunded amounts. Plus after full refund remains false.

## PASSED: automated scope, distinct from real payment evidence

244 server/offline checks completed: core billing 78; fees 10; security 31;
real PostgreSQL concurrency 24; system guards 14; durable inbox 8; lifecycle 36;
worker 3; callbacks 15; actual-fixture cancellation expiry harness 9;
grace/recovery harness 8; sandbox clock adapter 8.

- Isolated Neon fixture schemas have no public fallback and are dropped after use.
  SQL effects/concurrency are real; most SDK lifecycle responses are simulated.
- Durable verified-event inbox: transient dependency retry, backoff, concurrent
  claims, abandoned lease/fresh-process recovery, duplicate financial receipts,
  account binding, permanent validation quarantine. This is automated database/
  processor acceptance, not certification of production Stripe retry infrastructure.
- Full/partial refunds, fee refunds, disputes, cancellations and Hive closure
  have simulated lifecycle coverage, not unperformed Stripe acceptance.
- Time-aware SQL/policy/HTTP checks prove access at paid/grace boundaries without
  global clock changes. Current real API access follows actual wall time, not a
  Stripe clock. Stale-event tests use current object retrieval and reject unearned
  periods. During this review the grace harness was updated to recognize the
  fixture's subsequently authorized real recovery rather than incorrectly expect
  its historical past_due state forever. Only the harness changed.
- Chromium, Firefox and WebKit each completed 64 fixture-intercepted browser checks
  (192 total), desktop/mobile and reduced motion. No Stripe charge in browser tests.
  Initial WebKit run timed out opening cancellation dialog; initial Firefox run
  had a browser-context teardown protocol error. Separate reruns passed. These
  flakes remain documented; a first-run all-browser green result is not claimed.
- Current real API health 200, frontend 5193 available, pending billing tasks,
  failed receipts, queued events and quarantined events all zero, read directly
  without bypassing the reviewer's previously observed login rate limit.

Legacy local-Postgres restart test was NOT run: it stops a database cluster and
is outside non-destructive Neon dev scope. Legacy boot script was NOT run: it
uses a different local DB and occupied port 5183. Actual sandbox health/schema
status and fresh worker recovery were checked separately. Mutation scripts and
obsolete pre-refund/pre-recovery-state verifiers were not rerun as though their
historical expected state remained current.

Machine-readable evidence/check counts and hashes:
[FINAL_AUTOMATED_REVIEW.json](prompt73a-evidence/FINAL_AUTOMATED_REVIEW.json).
Raw logs/audits remain ignored at server/sandbox.local/final-\*. Historical native
Node exit in the cancellation harness is retained in its scenario report; no
native exit recurred in this final completed harness run.

## PENDING: remaining real sandbox acceptance

| Scenario                                 | Why not completed now / minimum safe path                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partial Plus refund                      | Needs a separately authorized isolated paid transaction and exact refund amount; no preserved fixture may be repurposed                                          |
| Full/partial paid-Hive refund            | Needs authorized isolated member payments/refunds and safe existing-price binding; verify signed Connect events, access and both accounts' balance transactions  |
| 10% application-fee reversal             | Requires explicit policy/amount authorization and an actual fee refund; never infer it from charge refund                                                        |
| Dispute creation/closure and fees        | Requires an authorized dedicated dispute-test payment and supported sandbox evidence controls; simulated dispute checks are not actual dispute accounting        |
| Real retry exhaustion / terminal action  | Needs a dedicated failing paid fixture and clock sequence under unchanged retry settings; recovery fixture is protected; harness expiry is not Stripe exhaustion |
| Annual period-end cancellation           | Original annual subscription protected; separate authorized annual fixture/clock required for real paid-period acceptance                                        |
| Paid Hive closure / deletion obligations | Dedicated offering/member payment(s), authorized review and closure required; never close Test 3 Hive or change its successful member                            |
| Real payout/settlement                   | Owner funds are pending; no bank settlement acceptance or real-money operation is authorized                                                                     |

Supported test APIs can automate those future fixtures using test PaymentMethod
IDs, test clocks, idempotent invoice payment/refund and dispute controls, without
human card entry. They still create payment/refund effects. No zero-value/trial
fixture or fabricated webhook was substituted for paid financial acceptance.
No such money operation was authorized by this review request, so none occurred.

## BLOCKED: launch risks and unresolved decisions

| Severity                                                              | Finding                                                                                                                                                                                                                                                                        | Required disposition                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical package advisory; application exploitability not established | Installed DOMPurify 3.4.16 is flagged critical by npm audit; patch 3.4.17 advertised. Current safeMarkdown uses string input/output and restrictive tags, not SAFE_FOR_TEMPLATES/DOM-returning/IN_PLACE modes of the critical advisory; other reported paths still need triage | Upgrade/verify sanitization and lockfile before launch; do not claim an observed exploit                                                                                                      |
| High                                                                  | body-parser runtime dependency flagged high; raw webhook and JSON middleware use default decompression options                                                                                                                                                                 | Patch dependency or explicitly review supported mitigation, rerun raw-signature/security/browser checks; no destructive DoS probe was run                                                     |
| Moderate                                                              | Server audit also reports four moderate package nodes via Sentry/glob/minimatch (not four independent demonstrated exploits)                                                                                                                                                   | Dependency remediation/reachability review; no automatic major upgrade was attempted                                                                                                          |
| High financial/operational                                            | Hive Checkout still uses inline price_data, unlike Plus catalog reuse                                                                                                                                                                                                          | Bind/reuse the correct existing account/Hive price and test missing/ambiguous/wrong-account cases before further paid-Hive Checkouts; do not create duplicate catalog objects                 |
| High financial                                                        | Real paid-Hive refunds/application-fee reversals/disputes/exhaustion/closure remain unverified                                                                                                                                                                                 | Authorize a bounded automated sandbox financial suite using new fixtures; reconcile actual balance/refund/fee records                                                                         |
| High business-policy                                                  | Plus refund eligibility, time limits, support/escalation and statutory exceptions unresolved                                                                                                                                                                                   | Business/support/counsel approval and executable operating procedure                                                                                                                          |
| High business-policy                                                  | Whether application fee is retained, returned fully or proportionally unresolved                                                                                                                                                                                               | Finance/counsel decision, owner disclosure, charge/fee refund authorization and explicit tests                                                                                                |
| High launch governance                                                | Operator/merchant roles, fees/loss liability, geography/tax, approved terms/consent and retention not fully approved                                                                                                                                                           | Resolve [policy register](PROMPT73A_POLICY_REVIEW.md) and [architecture decisions](PROMPT73A_STRIPE_ADR.md); their historical API-blocker text is superseded only for the actual tested flows |
| Medium reliability/operations                                         | Need deployed-worker restart/failover drills, alerts/quarantine resolution, cancellation-outage remediation, email delivery and reconciliation runbooks                                                                                                                        | Shared operational ownership, staff recovery controls and non-money staging drills; CLI replay tests do not prove production retry delivery                                                   |
| Medium security                                                       | Callback refresh nonce replay cache is process-local; multi-instance/restart replay protection is bounded by signed state expiry/depth rather than durable nonce consumption                                                                                                   | Review durable shared nonce/rate-limiter behavior before multi-instance launch                                                                                                                |
| Medium regression                                                     | Cross-browser first-run flakes and prior native harness anomaly                                                                                                                                                                                                                | Stabilize/characterize clean CI runs; retain failed-run evidence                                                                                                                              |
| Intentional activation gate                                           | Production billing is disabled in code; only sk_test keys and BILLING_ENABLED=test accepted                                                                                                                                                                                    | Separately reviewed live activation/configuration plan after blockers close; do not weaken guard during acceptance                                                                            |

Audit references: [DOMPurify advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7),
[body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828).
Dependency audit is a package advisory check, not a claim of exploit reachability.

## Minimum path before production

1. Resolve critical/high dependency findings and Hive catalog binding; rerun clean
   security, financial, concurrency and browser checks without new money effects.
2. Approve refund/application-fee, operator/liability, geography/tax, support,
   consent and retention decisions. Publish no draft as legally approved terms.
3. If real financial acceptance is to continue, separately authorize a bounded
   automated sandbox suite (specific operations/amount limits). It can avoid all
   further manual card entry. Complete the PENDING financial scenarios or explicitly
   prevent unvalidated capabilities from launch under an approved reduced scope.
4. Verify non-money hosted staging worker/retry/failover, secrets, HTTPS callback
   origin, webhook destinations, alerting, dependency/schema checks and staff
   operations. Back up and review the exact eventual target before any future
   migration; no production access or migration occurred here.
5. Obtain explicit release/live-payment approval and a reviewed activation change.
   This report authorizes neither deployment nor real-money billing.
