# Prompt 73A — payment readiness handoff

17 October 2026. Branch `feature/prompt73a-payment-readiness`, derived from
Prompt 73 commit `e74f02c`. Worktree `C:/Users/osuji/ConnectHive1-prompt73`.

## A. Executive summary

**STAGING BLOCKED.** Independent engineering, dependency remediation, actual local
PostgreSQL concurrency/recovery and browser verification were performed. Real
Stripe sandbox and hosted Neon/Render integration remain unavailable without
account access/credentials. No production migration, deployment, live payment,
push, main merge or production customer access occurred. Live billing remains
rejected by code. The main checkout's unrelated analytics/newsletter changes were
left intact. Prompt 73A's full definition of done is **not** claimed satisfied.

Implemented:

- Member cancellation intent and queue task persist before Stripe is called.
  Failed calls show a saved/pending request and can be recovered by another worker.
- Queue workers claim with expiring leases and tokens using `SKIP LOCKED`, retry
  fairly with bounded backoff, and acknowledge only confirmed cancellation.
  Stripe calls do not hold task row locks. Shared user → Hive → subscription locks
  serialize financial changes. Final financial sign-off and purge recheck under
  user locks; refund requests use the same financial lock order.
- Optional standalone worker, durable heartbeats, webhook attempt/retry ledger,
  sanitized Sentry diagnostics and staff-only operations counters. Per-item
  checkout failures no longer abort the remaining maintenance batch.
- Strict Stripe-hosted URL allowlists and trusted return-origin validation,
  UUID parameter validation, per-user billing mutation rate limits, Stripe
  customer-binding validation, and idle PostgreSQL connection error handling.
- Removed vulnerable nodemon; upgraded router, Vite, React plugin and Sentry build
  tooling with regression/build verification. All four final npm audits report 0.
- Paid offer identifies its owner; draft Terms clarify refunds, escalation,
  consumer rights and retention. Dialog exit animation retains contents and
  disables duplicate submission while closing; reduced motion remains supported.
- Historical application-fee creation/refund reconciliation from platform events,
  bound by account/charge, with out-of-order retrieval and retry-safe receipts.
- Real sandbox read-only contract verifier, ignored credential template,
  staging/incident runbook, financial ADR and business/legal decision packet.

## B. Stripe sandbox verification

Only credential **presence** was inspected. Main checkout has an unidentified
database URL, but no Stripe secret/signing keys or test flag. The feature worktree
has no real `.env`. No connected Stripe account/tool was available. No request to
Stripe's API was made in this run. Do not describe synthetic SDK signatures as
real Stripe delivery.

| Scenario | Expected | Actual / status | Environment |
| --- | --- | --- | --- |
| Plus monthly/yearly, connected paid Checkout | Actual hosted test payment and matching invoice | BLOCKED: missing platform test key and sandbox setup | Real Stripe not accessed |
| Hosted onboarding/resumption/restrictions | Correct owner binding, current capabilities | BLOCKED: missing connected sandbox owner/account access | Real Stripe not accessed |
| Real platform/Connect delivery | Pinned snapshot, verified signature, committed ledger and access | BLOCKED: destinations/signing secrets unavailable | Real delivery not performed |
| Renewals, SCA, dunning, alternate methods | Actual successful/failed invoice lifecycle and local access | BLOCKED: requires configured sandbox/Test Clocks | Real Stripe not accessed |
| Refunds, disputes, payouts, deauthorization, actual fee expansion | Correct account-scoped financial records | BLOCKED: requires sandbox objects and supported scenarios | Real Stripe not accessed |
| Subscription/refund/closure/security contracts | Existing API, SQL and entitlement rules remain correct | PASS: 78 original backend checks; 31 added security checks | Stripe responses/signed delivery simulated |
| Pinned contract verifier | Inspect actual completed sessions and expanded objects without mutation | BLOCKED, exits 2 naming missing inputs before network | `prompt73a-sandbox.mjs`; sanitized temp JSON |

`stripe` remains official 23.x; request API stays **2025-02-24.acacia**. Official
breaking-change review supports preserving that contract, but does not prove
actual SDK response compatibility. See the ADR for primary-source links and the
runbook for exact Dashboard steps. Real hosted onboarding, Checkout, Portal and
webhook acceptance must still pass; no fake success evidence was generated.

## C. Security report

Machine-readable baseline/final reports are committed in `prompt73a-evidence/`.
Audit results describe the registry snapshot at this run, not a guarantee against
unknown vulnerabilities.

| Package audit | Before | After |
| --- | --- | --- |
| Server, all dependencies | 3 high | **0** |
| Server, omit dev | 0 | **0** |
| Client, all dependencies | 6 high + 3 moderate | **0** |
| Client, omit dev | 2 moderate | **0** |

| Finding/path | Exposure assessment | Remediation |
| --- | --- | --- |
| Server nodemon → chokidar → braces | Development file watching; not server runtime, still actionable developer exposure | Removed nodemon; native Node watch replaces it. |
| Client Sentry Vite plugin → bundler core → unplugin/chokidar/braces | Build/CI tooling, not shipped runtime; build inputs/tool chain matter | `@sentry/vite-plugin` 11.8.0 and current transitive dependencies. |
| Client Vite → esbuild and Vite advisories | Development server/build exposure; loopback testing does not fix vulnerable tools | Vite 8.3.4, React plugin 6.1.2; production build and all UI regressions tested. |
| react-router-dom → react-router | Runtime navigation; open redirect behavior is relevant, SSR advisory has limited reach in this client-rendered app | Router 7.18.4; strict external payment URLs; settings, Hive, creation and staff navigation tested. |

Exact advisory URLs, ranges, dependency effects and npm fix metadata are in the
baseline JSON. No `audit fix --force` was used. Major router/tool upgrades were
deliberate; React remains 18.3. Node **>=22.12.0** is required; tests used 24.15.0.
[Router migration](https://reactrouter.com/7.18.4/upgrading/v6),
[Vite migration](https://vite.dev/guide/migration).
Browser tests exercise authenticated route rendering with mocked auth/API, not
real Google sign-in or session delivery. Sentry upload with production credentials
was not attempted. Frontend build still emits the existing >500 KB chunk warning.

Additional 31 security checks exercise hostile redirect/origin inputs, live-key
rejection, API pin, UUID inputs, rate limits, staff isolation and commit-failure
webhook rollback/retry tracking. Original 78 include cross-user financial access,
forged prices, signatures/replay, owner access, refund/dispute isolation and access
expiry. No customer payloads or secrets are written into evidence.

## D. Staging database report

Used **actual PostgreSQL 17.11**, downloaded from EDB's official Windows binary
distribution, in `%TEMP%/truehive-73a-postgres`. This is isolated **local** staging,
not Neon. Explicit loopback port 55474, database `truehive_73a_staging`, synthetic
data only. Trust auth is confined to this local fixture server; it is unsuitable
for hosted deployment. TLS disabling requires explicit local-test flag, loopback
hostname and that exact fixture database. Hosted database TLS behavior is unchanged.

`npm run db:migrate` applied structural schema/billing and eight existing numbered
migrations, then reran without data loss. Final rerun included new queue/monitoring
schema and skipped already-recorded numbered migrations. Actual Express startup
passed connection, schema/data guards and `/api/health` HTTP 200. No automatic
API-start migration was added. Per-suite unique synthetic schemas isolate tests.

New structural additions: task claim/lease/due/error fields and due index,
`billing_subscriptions.cancellation_requested_at`, `billing_webhook_attempts`,
`billing_worker_heartbeats`. SchemaGuard requires the new structures. Existing
financial records remain intact; no new data backfill was introduced.

| Verification | Final result | Limits |
| --- | --- | --- |
| Original Prompt 73 on real PostgreSQL | **78 passed** | Stripe API simulated |
| Concurrent reservations, quotas, duplicate checkout/event | Included in **24 passed** concurrency suite | Actual independent PostgreSQL connections; Stripe simulated |
| Cancellation/webhook/closure/refund races; deletion blockers; worker leases/retry | Included in same **24** | Synthetic records; no real Stripe network timing |
| Lock timeout, connection termination, real deadlock and retry | Included in same **24** | One local server, not Neon failover/load proof |
| Actual server stop/restart during uncommitted transaction | **3 passed** | Verified exact owned temp cluster; rollback and pool recovery |
| Historical application-fee creation/refund/retry | **8 passed** | Real PostgreSQL; Stripe simulated |
| External API mode suppression and standalone heartbeat | **3 passed** | Real PostgreSQL, empty queue, no Stripe API calls |
| Actual API boot/schema/data/health | PASS | Isolated local PostgreSQL |

Restart failure injection targets only the explicitly verified temp cluster.
The unused auxiliary local cluster was stopped. Hosted Neon concurrency,
network/failover behavior, load and real Stripe races are not certified by this
evidence. The runbook identifies the separate empty hosted staging project needed.

## E. Financial architecture review

See [Stripe ADR](PROMPT73A_STRIPE_ADR.md). Standard/direct charges with 10% fees are
preserved, **not approved for live activation**. Actual controller/loss settings,
merchant role, geographic eligibility, costs, tax, application-fee refund policy,
disputes and payouts need account-specific review. No claim of zero platform
liability is made. Historical fee adjustment events are now reconciled; actual sandbox verification
and accounting reconciliation/export procedures remain required.

## F. Legal and compliance review packet

See [policy packet and decision register](PROMPT73A_POLICY_REVIEW.md). Contains
approved versus proposed rules, refund responsibility, cancellation and retention
language, consumer disclosures, emergency closure, fees, geography and tax
decisions. US/California applicability is a review assumption requiring confirmation.
Terms changes remain draft and consent version is unchanged. No counsel approval,
tax determination, final retention period or binding refund promise is invented.

## G. Operational readiness

See [staging and incident runbook](PROMPT73A_STAGING_RUNBOOK.md). The API worker can
continue on an always-running instance; optional `BILLING_WORKER_MODE=external`
plus `npm run billing:worker --prefix server` separates maintenance from web load.
No paid Render service was provisioned. Leases recover crashes; bounded retry
backoff avoids an immediately failing task monopolizing the queue. Claim-token
checks prevent stale workers acknowledging a newer claim. Stripe cancellation
updates remain naturally idempotent; an outage can still cause a delayed renewal.

Sentry hooks report failures without bodies/credentials. Staff operations endpoint
shows failed events, pending/repeated tasks, stale Checkouts and last successful
heartbeat. **External alerts and incident delivery are not configured/tested**;
proposed thresholds and exact checks are in the runbook. Per-item errors may occur
during an otherwise successful heartbeat, so queue/event monitoring is essential.
Worker startup and lease recovery were verified locally; Render deploy/restart,
real Stripe outages and hosted database recovery remain external tests.

## H. UI/UX verification

The original 275 checks are preserved: backend 78 + Prompt71 DB21 + Prompt71B DB30
+ billing browser64 + Prompt71 browser43 + Prompt71B browser39. These are not 275
real Stripe tests. Additional browser engines repeat the billing contracts and
must not be counted as new independent financial integration scenarios.

| Suite | Result | Test type |
| --- | --- | --- |
| Prompt71 / 71B database | **21 / 30 passed** | Isolated PostgreSQL/WASM |
| Prompt73 backend | **78 passed** | PGlite, also repeated on real PostgreSQL; Stripe simulated |
| Prompt71 / 71B browser | **43 / 39 passed** | Chromium, API intercepted |
| Prompt73 Chromium / Firefox / WebKit | **64 / 64 / 64 passed** | 1440/390 × normal/reduced motion; API intercepted |
| Additional fee events | **8 passed** | Actual PostgreSQL, Stripe simulated |
| Additional security | **31 passed** | Express/SDK signatures real, delivery synthetic |
| Additional PostgreSQL concurrency / restart / heartbeat | **24 / 3 / 3 passed** | Actual local PostgreSQL; external Stripe simulated/unused |
| Production frontend build | PASS | Existing large-chunk warning |
| JS syntax / whitespace | Checked before commit | See reproducibility commands |

Evidence `%TEMP%/truehive-prompt73a/{chromium,firefox,webkit}`: desktop/mobile
member billing, paid offer, owner monetization and Create screenshots; normal/
reduced-motion WebM recordings, `report.json`, `requests.json`. Records are
synthetic fixtures. Existing location evidence remains in its original temp
directories. Dialog Escape/focus, confirmation submission, waiting/canceled return,
refund requests, deletion blockers, closure dates, staff review, viewport bounds
and runtime errors are checked. Browser screenshots now wait for transitions to
settle. An intermediate capture caught a closing dialog; capture timing was fixed.
Repeated Firefox automation exposed smooth-scroll click timing; the Create radio
is now brought into view before its native checked-state assertion. Final runs
passed sequentially; a concurrent intermediate WebKit run had navigation-time
access-control errors, which did not reproduce in its final isolated run. These engines are desktop automation, not physical mobile/Safari devices
or a manual screen-reader certification.

## I. Remaining blockers

| Category | Precise unresolved requirement / next step |
| --- | --- |
| Stripe account/configuration | Configure sandbox platform/Standard owners, test key, separate Acacia snapshot webhook destinations and secrets locally. Execute every real acceptance row in the runbook, including invoice expansion, actual fees, onboarding, Portal, renewal, refund/dispute, SCA, dunning and deauthorization. Run the read-only contract verifier after real Checkouts. |
| Infrastructure | Create/confirm separate empty Neon staging project and isolated Render services. Migrate only that confirmed target; repeat hosted concurrency, health, worker restart and failure/recovery checks. No production target is inferred from `.env`. |
| Engineering | Verify historical financial adjustments/fee refunds against real Stripe and finish the accounting reconciliation procedure; enforce approved geography and implement final notices/consent/email requirements after decisions. Resolve any actual sandbox contract incompatibilities before declaring staging ready. |
| Infrastructure/operations | Configure Sentry/heartbeat/backlog alerts and prove incident delivery. Exercise actual worker deployment/restart, cancellation-outage remediation and deauthorization response. |
| Business approval | Approve charge/controller/loss model, operator identity, countries, fee/refund allocation, dunning/grace alignment, escalation and emergency closure using the decision register. |
| Legal/tax approval | Professional approval of Terms, renewal consent/notices/cancellation, consumer/refund rights, retention/privacy, tax and marketplace/reporting responsibilities. Then publish approved text and deliberately update consent version. |

## J. Release decision

**STAGING BLOCKED.** Locally tested implementation is reviewable and committed to
the requested feature branch. Missing real Stripe and hosted staging evidence are
genuine integration boundaries. Business/legal/tax approvals also remain open.
No live-ready or fully complete Prompt73A claim is made. Live mode remains blocked.

## Reproduce

Use Node >=22.12, `npm ci --prefix server`, `npm ci --prefix client`. PGlite remains
test-only in `%TEMP%/truehive-p71b-tools` as described by Prompt71B's handoff.
Local PostgreSQL requires an explicitly created loopback fixture database named
`truehive_73a_staging` on port55474. Its preload never reads an unknown main `.env`.
Restart tests additionally require the exact EDB temp paths documented above.

```powershell
# server/
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt73.mjs
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt71.mjs
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt71b.mjs
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt73a-security.mjs
node --import ./src/checks/prompt73a-postgres-preload.mjs src/checks/prompt73.mjs
node --import ./src/checks/prompt73a-postgres-preload.mjs src/checks/prompt73a-concurrency.mjs
node --import ./src/checks/prompt73a-postgres-preload.mjs src/checks/prompt73a-restart.mjs
node --import ./src/checks/prompt73a-postgres-preload.mjs src/checks/prompt73a-worker.mjs
node --import ./src/checks/prompt73a-postgres-preload.mjs src/checks/prompt73a-fees.mjs
node src/checks/prompt73a-boot.mjs
node src/checks/prompt73a-sandbox.mjs # BLOCKED without actual sandbox inputs
# client/, with Vite running separately on 127.0.0.1:5176
$env:P73_BASE_URL='http://127.0.0.1:5176'
$env:P73A_BROWSER_RUN='1'
$env:P73_BROWSER='chromium' # repeat sequentially for firefox and webkit
node src/checks/prompt73-browser.mjs
$env:P71_BASE_URL='http://127.0.0.1:5176'
node src/checks/prompt71-browser.mjs
node src/checks/prompt71b-browser.mjs
npm.cmd run build
# In each package: npm.cmd audit --json; npm.cmd audit --omit=dev --json
```

Detailed logs are `%TEMP%/truehive-73a-*.log`, audit JSON is committed, and the
sanitized missing-input report is `%TEMP%/truehive-73a-sandbox.json`. Temporary
screenshots/videos/logs are local evidence, not durable CI storage or production data.
