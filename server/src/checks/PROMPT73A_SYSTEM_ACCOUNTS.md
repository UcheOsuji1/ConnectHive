# Prompt 73A system account exemption verification

Target: verified Neon dev endpoint `ep-fancy-cherry-at7zftnq`, branch
`br-holy-poetry-atkl4gsc`. No production or Stripe settings were accessed or changed.

Applied updated `billing.sql` and recorded
`009_system_account_billing_guards.sql` in `schema_migrations` in one transaction.
The named migration contains the same three guard definitions as the baseline.
Existing affected records and prior function definitions were backed up under
`%LOCALAPPDATA%/TrueHive/backups/prompt73a-system-before-1793255433510.json`.
Final comparisons confirmed every backed-up user, Hive, membership and billing
record unchanged. Temporary fixture schemas were removed.

- System creators bypass active Hive creation limits; system memberships bypass
  admission limits and do not consume other members' capacity slots.
- System-owned Hives bypass capacity guards. Real users still need paid
  subscriptions for monetized Hives and seed Hive joins still count toward their
  own free membership limit.
- Create, direct join and approval join controllers translate billing SQLSTATEs
  into readable 402/409 responses. The schema guard requires `users.is_system`.
- Stripe routes, SDK/API version, billing prices and test-only gates are unchanged.

Verified on actual Neon dev with separate, synthetic schemas containing no
existing development records: 14 system exemption/controller checks, 78 original
billing checks, 8 fee checks, 31 security checks and 24 concurrency checks passed.
The security fixture now preserves the real pg pool's callback interface while
injecting its commit failure. Concurrency tests accept the verified isolated dev
preload without weakening the original local-only preload.

Three further checks exercised the installed public dev guards in a transaction
that was rolled back: system user creates seven active Hives with memberships;
normal free creator's second active Hive raises P7301; sixth free membership in
system-owned seed Hives raises P7303. Controller tests verify readable 409s and
rollback of a failed approval. Capacity and paid entitlement regressions passed.

Actual API schema/data checks passed and `/api/health` returned 200. That health
process used a read-only database connection and disabled all scheduled jobs.

No existing dev user was marked `is_system=true` at verification time. This change
does not choose or flag the house account; the separate account task must do so.

To rerun isolated dev checks from `server/`:

```powershell
$env:P73A_VERIFIED_DEV_TESTS = '1'
node --import ./src/checks/prompt73a-dev-preload.mjs src/checks/prompt73a-system.mjs
```

The preload independently checks the exact endpoint and database branch, uses a
direct connection with a private search path, and removes its generated schema
on normal test completion. These fixtures simulate Stripe; actual sandbox
transactions and webhook acceptance remain separate verification work.
