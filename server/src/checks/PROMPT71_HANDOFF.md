# Prompt 71 verification and release handoff

Implementation and verification completed 14 October 2026 (America/Los_Angeles).
Production release remains pending database-target confirmation. Do not describe this as deployed.

## Commits recovered from Claude

| Hash | Part |
| --- | --- |
| `aa05fa7` | A: schema, metro APIs, save-path resolution, admin area picker |
| `6b7bd95` | A: one-time dataset and Hive backfill migrations |
| `c8da099` | B: multi-select ages and shared location questions |
| `974d071` | C: matching area filter and age ranking |

Part D and the discovered A–C edge-case fixes are committed under
`feat(discovery): create-your-own panel, location labels, outside-LA screen`.
Use `git log -1 --oneline` for that commit's hash.

## Final implementation

- R1: sticky founder panel beside the original cards, below them under 760px;
  category/area/age summary, prefilled Create action, area-specific queue.
- R2: approved outside-LA copy and actions, count-aware online cards, including
  zero-online-results case. LA's existing founder empty-state markup is retained.
- Gold in-person/hybrid and blue online labels use each Hive's own location.
- Create and Settings use the same autocomplete data as the questions. A picked
  location retains its state abbreviation; stale autocomplete responses are ignored.
- Create passes the metro and selected ages, prefills the meeting type and location,
  and allows the prefilled category to be changed. **Create has no age-range field;
  none was added.**
- Waitlist accepts `metro_key` and the earlier `metroKey`, stores and counts by
  category and area, preserves explicit NULL for online-only searches, and does
  not display a success message after a failed save.
- Unknown typed search cities no longer fall back to the saved profile city.
  Online-only requests ignore stale metro keys. `ageShare` is exposed alongside
  the earlier `age_share` field for compatibility.
- Browser Back restores the deep-dive answers, including multi-select ages.
- JS normalization now agrees with SQL for blank/punctuation-only inputs too.
- Editing a location with an explicit NULL metro key re-resolves the typed city.

## Fresh verification

| Check | Result |
| --- | --- |
| `node src/checks/prompt71.mjs` from server | **21 passed**; real PostgreSQL controller checks; all fixtures and writes rolled back |
| SQL/JS normalization | **20 strings agree**, including NULL, blank, punctuation, St./Ft., and USA suffix |
| Required metro lookups | Silver Lake, Santa Monica, DTLA, Long Beach, Irvine → LA; Miami Beach → Miami; Springfield → NULL |
| Area matching | LA → Silver Lake + Santa Monica + online; Miami → Miami + online; online-only → online; no area → online + needsArea |
| Age scores | Baseline **31**, selected 21–32 against ages 49/52 **16**, Any age **31** |
| Waitlist | LA and Miami stored separately; duplicates scoped to area; matching counts agree; online bucket stays NULL |
| Fixture cleanup | **0 stray fixture users**; outer rollback removes all fixture Hives and associated data |
| `node src/checks/prompt71-browser.mjs` from client | **43 passed** at 1440px and 390px; mocked API fixtures, no live writes |
| Browser scenarios | Q1 exclusivity, Q2 Silver Lake, Nevada/denied fallback, Q3 autocomplete, all six categories, back restoration, editable prefill, R1/R2/LA-empty, needsArea |
| Privacy | Captured API requests contain no browser latitude/longitude |
| Layout | R1 panel beside cards on desktop and below on mobile; individual result elements stay within viewport |
| Backend smoke boot | Actual API connected, schema/default-channel guards passed, local `/api/health` **200**; read-only DB sessions and disabled email/AI |
| Changed backend files | `node --check` passed |
| Frontend | `npm.cmd run build` passed; existing large-bundle warning remains |
| Whitespace | `git diff --check` passed |

Browser evidence is saved in the OS temporary directory `truehive-prompt71`:
`q1-1440.png`, `q1-390.png`, `q2-1440.png`, `q2-390.png`, `q3-1440.png`,
`q3-390.png`, `r1-1440.png`, `r1-390.png`, `r2-1440.png`, `r2-390.png`,
`la-empty-1440.png`, `la-empty-390.png`, `create-1440.png`, `create-390.png`,
`network.json`, and `report.json`.

Claude's earlier records also include the admin-tab screenshot and passing API/admin checks.
The original approved Q1–R2 design source was not supplied in this handoff; screenshots
were inspected against the written requirements and existing application styling.

## Dataset and backfill

Configured database currently has **100 metros**, **446 places**:
359 city rows and 87 neighborhood rows; 209 places belong to Los Angeles.
Claude's original backfill proof recorded 10 in-person/hybrid Hives with a metro and
8 left unresolved. The same 8 unresolved active Hives were found in the fresh check:

| Hive | Saved location |
| --- | --- |
| Aerospace Lunch Club | El Segundo / Torrance / Long Beach, CA |
| Film Raiders | NULL |
| Finance Nerds SFV | San Fernando Valley, CA |
| LA Explorers | NULL |
| LA Startup | Los Anglese |
| LA Weekend Hikers | Greater Los Angeles, CA |
| Leimert Park Art Walks | Leimert Park, Los Angeles, CA |
| Valley New Arrivals | San Fernando Valley, CA |

These need owner/admin review in **Admin → Reports → Hives without an area**.
No guesses or manual changes were made to these real Hives.

Dataset qualification: the inherited seed was authored from memory as the prompt
requested. No explicit list of uncertain LA/Orange County cities was preserved in
the available handoff. Census rank/completeness has not been independently certified.
Springfield, MA is absent; the prompt's conditional lookup for it cannot be demonstrated.

## Release checkpoint — still required

`origin/main` was freshly fetched and remains at `3b86c91` (Prompt 70).
The user could not confirm whether `server/.env` targets the production Neon database.
Its client origin is localhost; that alone does not identify its database environment.

Before pushing to the auto-deploying main branch:

1. In Render, identify the backend serving `api.truehive.app` and compare its
   `DATABASE_URL` endpoint/database with the configured migration target. Do not
   paste or commit database passwords.
2. Run `npm.cmd run db:migrate` against that confirmed production target; retain
   the migration ledger, table/column proof, dataset counts, and backfill leftovers.
   Numbered migrations must be skipped if already applied, never manually replayed.
3. Push the completed commits and confirm `git log origin/main -1 --oneline`.
4. Verify the new production deployment and `/api/health` returns 200 after its
   new schema guard has run. Existing production health alone does not prove Prompt 71 shipped.

No production migration or push was performed while the target remained uncertain.
The separate existing `LandingPage.jsx` wording edit and unrelated untracked files
are deliberately excluded from the Prompt 71 commit.
