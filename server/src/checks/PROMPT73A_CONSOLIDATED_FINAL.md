# Prompt 73A consolidated billing acceptance

**Final bounded-suite result: 6 PASS, 1 FAIL / BLOCKED. Production is not ready.**

November 3, 2026 Pacific. Base authorization SHA-256:
`2f2e37046dd067040fda43320dd594a3eb2ec7be9047e9504300aac406a93391`.
The subsequent explicit amendment authorized exactly one replacement Hive,
product and price, with no increase to financial caps. The SAME run journal
`e10e371c-16fc-4314-8cc0-956a8b06246f` and all financial counters were retained.

All operations used Stripe sandbox platform `acct_1UUV9MRuxbB0fH11`, the existing
connected account `acct_1UWppORuxbP8zrXG`, and verified Neon dev endpoint
`ep-fancy-cherry-at7zftnq` / branch `br-holy-poetry-atkl4gsc`. No manual card entry,
live payments, bank payouts, production access/change, deployment, merge or push.

## Consolidated outcomes

Earlier real acceptance remains PASS and preserved: monthly and annual Plus
purchases, original paid-Hive purchase and 10% fee, monthly period-end cancellation,
real failed renewal/three-day grace and one authorized recovery, and full Plus
refund. Historical evidence remains in the linked scenario reports; no completed
payment/refund was repeated to resume this suite.

| Authorized scenario | Final result | Actual Stripe/dev evidence |
| --- | --- | --- |
| Annual period-end cancellation | PASS | `sub_1UXmyuRuxbB0fH11LAUGsHzM`; 6999-cent payment, dedicated clock cancellation at `2027-11-03T19:02:46Z`, signed deletion, exactly one invoice/successful charge; original paid dates preserved. |
| Partial Plus refund | PASS | `sub_1UXmzHRuxbB0fH11C4ewlkG0`; one 200-cent refund `re_3UXmzHRuxbB0fH111k3rBrJE`, signed events and ledger; Plus retains access through `2026-12-03T19:02:46Z`. |
| Full Hive refund/full fee reversal | PASS | `sub_1UXmzcRuxbP8zrXGIT9UO3oN`; refund `re_3UXmzcRuxbP8zrXG1pX7GqTC` 1200 cents, actual fee refund `fr_1UXmzlRuxbP8zrXGeLiQ8f5f` 120 cents; membership expired/access revoked. Owner lifecycle net -65 cents; platform fee net 0. |
| Partial Hive refund/proportional fee reversal | PASS | Replacement Hive `522ae3e3-5403-48f2-9047-9cd4c0842926`; `sub_1UXnlpRuxbP8zrXGjys5423L`; refund `re_3UXnlpRuxbP8zrXG1qn9jgzT` 300 cents and fee refund `fr_1UXnlxRuxbP8zrXGTcFgbN35` 30 cents. Paid access retained; processing 65, retained platform fee 90, owner net 745 cents. |
| Paid Hive closure | PASS | Separate paid member `sub_1UXnm8RuxbP8zrXGlMVC91J1` used the SAME replacement catalog price. Owner closure stopped recurring billing, retained member access through `2026-12-03T19:52:54Z`, and left the offering closing while paid obligations remain. Backend financial-deletion guard rejects deletion; no destructive deletion request was sent for the shared owner. |
| Dispute creation/closure/accounting | PASS after accounting repair | `du_1UXnp7RuxbB0fH11UMsLsfG2` on `ch_3UXnp4RuxbB0fH111N93oevm`, 799 cents; actual won status, signed closure and local dispute row agree. Principal returned, but actual 1500-cent dispute fee retained. Stripe balance net -1500 and dev dispute balance fields match. |
| Natural retry exhaustion | **FAIL / BLOCKED** | `sub_1UXnpURuxbB0fH11i8Log08k`; actual initial paid invoice and two declined renewal attempts verified. Renewal invoice `in_1UXnpfRuxbB0fH11WkXs85FT` remains open/unpaid, 799 cents. Harness scheduling race timed out and cleanup canceled the subscription before natural exhaustion. Cleanup cancellation is NOT exhaustion evidence. No eighth payment or substitute trial was created. |

All seven new subscriptions are canceled for cleanup. Retained paid access is not
falsely described as expired at actual November wall time: Stripe test clocks do
not change PostgreSQL/system time. Previously completed isolated time-aware tests
remain separate evidence for access boundaries. New Hive members retain their
legitimate paid periods despite future billing cancellation.

## Budget reconciliation: no counters reset

| Financial effect | Actual cumulative usage | Authorized maximum |
| --- | ---: | ---: |
| Successful sandbox charges | **7 / $129.96** | 7 / $129.96 |
| Customer refunds | **3 / $17.00** | 3 / $17.00 |
| Application-fee reversals | **2 / $1.50** | 2 / $1.50 |
| Dispute | **1 / $7.99** | 1 / $7.99 |
| Dispute fees | **$15.00 retained** | $50.00 |
| Actual declined payment attempts | **2** | 14 |

The journal conservatively retains **3 failed-attempt reservations**, because the
stale scheduling iteration reserved one before discovering that no new attempt
had occurred. No reservation was erased or reset; actual Stripe charge objects
show two declines. Refunds are not netted against the gross-charge budget, and
unused dispute-fee allowance is not treated as permission for another payment.

Actual resources: seven synthetic users/customers/subscriptions/clocks; two Hives,
two canonical products and two prices in total (the original allowance plus the
single authorized replacement). Existing Plus prices and connected account were
reused. The original run's first three transaction snapshots remain unchanged.
The replacement Hive's two members used one catalog price, not per-member products.

## Financial correctness

Original invoices retain gross amounts; customer refunds, net platform fees,
processing costs and dispute adjustments are separate. Actual connected balance
is **$0 available / $27.10 pending**: protected original $10.15 plus this suite's
Hive lifecycle effects (-$0.65 + $7.45 + $10.15). This is not bank settlement.

For the won dispute, actual balance transactions are principal withdrawal -799
with a 1500-cent fee (net -2299), followed by principal reinstatement +799 with
no fee return. The dispute principal nets to 0; fees remain 1500; balance nets to
-1500. Original payment processing remains 53 cents. Winning the dispute did not
prove fee reimbursement. No extra refund was issued to manufacture a zero balance.

Added dispute accounting records the actual transaction IDs, amounts, fees, net,
currency and checked time. Unknown balances remain NULL rather than falsely zero.
Current-object retrieval prevents delayed dispute events from overwriting won
state with a historical needs-response state. Owner UI exposes recorded fees and
balance impact separately; staff operations report unknown dispute balances.

Actual signed events were matched to Stripe event IDs, signature-verified durable
inbox, committed receipts and acknowledged attempts. Local duplicate and reordered
actual-event tests are explicitly local processor tests, not Stripe-origin retries.
No double charge/refund, duplicate invoice, duplicate subscription or duplicated
fee/refund record was observed. Existing early fee-event durable worker recovery
history remains preserved without inventing new Stripe deliveries.

## Bugs fixed during execution

- Gross versus retained application-fee comparison corrected using actual fee and
  fee-refund objects; processing costs remain separate.
- Windows transient EPERM/EBUSY/EACCES journal renames now retry with bounded delay;
  writes are fsynced. Tests verify counters survive and financial callbacks are not
  repeated. The interrupted dispute clock creation was recovered from the same
  idempotency journal, without a duplicate clock or payment.
- Retry scheduling now waits for BOTH an advanced attempt count and a future retry
  timestamp relative to the dedicated clock. It does not reserve or advance a
  stale schedule. Twelve offline checks cover asynchronous ordering and safe holds.
- Future temporary retry-schedule errors preserve a strictly verified, ready,
  frozen, run-owned clock with the known declining method for repair; they do not
  prematurely cancel that failed-renewal fixture. Unsafe/unbound states are never
  held. The already-canceled fixture in this run was not reopened.
- Failure offering cleanup is tested through real isolated HTTP/SQL owner routes:
  pause preserves review and paid access; only explicit final cleanup closes it.
  Already verified Hive closure is not rewritten by later cleanup attempts.
- Dispute fee accounting gap repaired in the product handler, worker, owner API and
  UI. Migration **012_dispute_balance_accounting.sql** applied atomically only to
  verified dev with a private before-snapshot and migration ledger record. Worker
  reconciliation filled the existing actual dispute from Stripe GETs. No new
  financial transaction or fabricated webhook was used for backfill.

## Verification and preservation

- **All 24 final regression groups PASS**: 313 server/offline/read-only checks,
  72 billing UI checks in each of Chromium/Firefox/WebKit, 27 sanitization checks,
  plus seven isolated real-refund ordering checks: **563 checks total**.
- Fresh full server/client dependency audits: **zero vulnerabilities**. Client
  build PASS, with its existing large-bundle warning. No native test exit occurred
  in this completed run. Previously recorded native anomalies remain historical.
- SDK lifecycle mocks, private SQL/time-aware harnesses, local actual-envelope
  replays and real Stripe-origin evidence remain explicitly distinguished. These
  passing regressions do not turn the failed real-exhaustion case into a PASS.
- Latest preservation checks: original six fixtures strictly unchanged; all nine
  protected Stripe objects and invoice financial fields unchanged. Normal
  maintenance corrected one stale local cancel_at_period_end cache flag on the
  already-canceled full-Hive-refund fixture from true to false, matching Stripe
  both before and after resumption. No cancellation, payment, access or ledger
  amount changed because of that correction. It is recorded in protected-final.json.
- Pending billing tasks, failed receipts, queued/quarantined events and unknown
  dispute balances are zero; API health is 200.

Original six protected purchase/lifecycle fixtures and the first three completed
bounded-run fixtures pass preservation. Immediate resumption snapshots matched for all nine; the final read-only check
records the single independently verified stale cancellation-flag correction
described above. All financial records remain for audit.
API 5183, frontend 5193 and Stripe listener remain healthy; unrelated port 5173
was not modified. Only the guarded sandbox API was restarted to load repairs.
No production migration was run.

Sanitized machine-readable results:
`prompt73a-evidence/CONSOLIDATED_FINAL.json`.
Private journal/evidence:
`sandbox.local/acceptance/e10e371c-16fc-4314-8cc0-956a8b06246f/`.
Final actual-object verifier: `src/checks/acceptance/verify-run.mjs` (Stripe reads;
optional local duplicate processor tests). Logs use `sandbox.local/replacement-*`.
Earlier reports remain historical evidence and are superseded by this summary.

## Genuine remaining release blockers

1. **High: natural retry-exhaustion acceptance is not complete.** The canceled
   fixture cannot be reactivated; Stripe cancellation disables its open invoice's
   automatic advancement. Manually paying/retrying that invoice or using a trial
   would not prove natural subscription exhaustion. The successful-payment and
   subscription caps are fully consumed, so no replacement was attempted. A fresh
   isolated paid subscription would require separate authorization beyond the
   consumed cap (at least one additional $7.99 payment/subscription); no manual
   card entry is needed. The repaired scheduler/hold logic has offline coverage,
   not a new real-exhaustion PASS.
2. **High business/legal:** live refund eligibility/windows/exceptions,
   application-fee treatment, merchant/operator/liability allocation,
   geography/tax, terms/consent, support and retention remain unapproved. The test
   refund/fee treatment and observed fee costs do not approve live policy.
3. **Medium operational:** hosted worker failover/restart drills, monitoring and
   quarantine/reconciliation runbooks, shared rate limiting and reviewed HTTPS,
   secrets and webhook configuration remain release gates. Prior intermittent
   native Windows test exit remains uncharacterized; passing reruns do not prove
   its cause or production retry infrastructure.
4. Production billing remains intentionally disabled. Live activation/deployment
   needs a separate reviewed release approval. No deployment is authorized here.

References: [Stripe cancellation semantics](https://docs.stripe.com/billing/subscriptions/cancel),
[retry scheduling](https://docs.stripe.com/billing/revenue-recovery/smart-retries),
[testing controls](https://docs.stripe.com/testing).
