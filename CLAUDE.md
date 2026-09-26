# TrueHive — engineering conventions

Short list. Everything here cost a real incident.

## Repairs must be loud

**A repair that runs silently hides the bug it repairs. A repair that logs
loudly fixes the user and reports the fault.**

This is the generalisable rule, and it reaches well beyond the case that
produced it. Two things wear the same costume:

- A **migration-time backfill** that runs on every deploy. Nobody is present,
  nothing is logged, and it erases the evidence of a bug on a schedule. These
  do not belong in a re-runnable file — see below.
- A **runtime fallback** that keeps a user working when the data is in a state
  it should not be. Keep these. Removing one trades a working page for
  visibility, and that is a bad trade when you can have both.

The fix for a silent repair is almost never to delete it. It is to make it
shout: log at error level, name the record, and say plainly that the state
should be unreachable.

Worked example: `createHive` never created a default channel. Three separate
silent repairs — a `schema.sql` backfill, `seed.js`, and a lazy-create in
`getDefaultChannelId` — kept papering over it, so the gap went unnoticed for a
month. One Hive ("Luu and Chuu") escaped all three only because nobody ever
opened its chat. See `server/src/lib/hiveChannels.js` and the channel check in
`server/src/db/schemaGuard.js`: the runtime path repairs and shouts, the boot
check catches the record nobody has touched yet. The two cover different
windows — keep both.

## Deployed code is not applied schema

`schema.sql` does not run itself. Shipping a column reference without running
the migration returns 500s to real users and nothing surfaces it. Signup was
broken this way for roughly five days.

Any change that adds a column ends with: run the migration against production
and confirm the column exists.

`server/src/db/schemaGuard.js` checks at boot that the columns the code writes
actually exist, and flips `/api/health` to 503 naming what is missing. It does
not refuse to boot — a crash loop turns one broken feature into a total outage.

## Idempotent in structure is not idempotent in effect

`CREATE TABLE IF NOT EXISTS` is safe forever. `UPDATE … WHERE col IS NULL` is
not, because the guard also matches rows created later.

- `server/src/db/schema.sql` — structural only, re-runnable, applied every time.
- `server/src/db/migrations/*.sql` — anything that writes or repairs **data**.
  Applied once each, recorded in `schema_migrations`.

Running the welcome backfill a second time silently cancelled the welcome
takeover for 69 members who were legitimately owed it. It never errored.
`002_backfill_welcome_seen.sql` carries the full account.

## Prove the failure, not just the success

Creating a Hive successfully says very little. Failing between two inserts and
finding no orphan says a lot. When you fix an atomicity bug, the test that
matters is the one that breaks it on purpose.

## Postgres `NOW()` is transaction-start time

A test that inserts a row and marks it seen in one transaction gets identical
timestamps and a false negative. Use `clock_timestamp()` in tests.

## Verification notes

- `scrollWidth <= innerWidth` is not sufficient: `overflow-x: hidden` masks
  element-level overflow while the document assertion passes. Check element
  bounds too.
- Screenshots cannot show motion. Animation work needs a screen recording.
- "Committed" is not "pushed." Vercel and Render build `origin/main`. Confirm
  with `git log origin/main -1 --oneline`.
- Reporting from a summary is not reporting from the code. Re-read the file.
- A design built from prose is not a design built from the image.
