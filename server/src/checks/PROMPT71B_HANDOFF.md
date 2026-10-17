# Prompt 71B — Universal area search

Completed on 17 October 2026 on `feature/prompt71b-location-consistency`.
Ready for review. **Not merged, pushed, or deployed. Production data was not accessed or modified.**

## Implementation

Reused the preliminary `AreaLocationInput` component from commits `a0f8cb6` and
`626c3b7`; did not introduce a second component or geographic database.

- The shared combobox debounces requests for 200ms, cancels obsolete results,
  supports Arrow Up/Down, Enter, Escape and Tab/blur, and retains input focus
  after selection. Stable generated IDs connect combobox/listbox/active option.
- Suggestions display city/state and the related metro; metro areas themselves
  are also searchable and selectable. Pasted city/state labels work, and partial
  neighborhood names such as "Silver La" are not mistaken for a state suffix.
- A viewport-positioned portal prevents card/modal overflow from clipping the
  menu. It flips above the input when needed, tracks scrolling/resizing, wraps
  long labels, and does not push other form fields around.
- Ivory/gold styling retains each page's existing input classes and layout.
  Opening and closing use lightweight CSS; reduced-motion disables animation.
  Loading, empty, and failed requests all leave manual entry available.
- Refine now affects category counts **and** the "Might suit you" candidates.
  It carries the selected area and existing connection/size/cadence filters into
  the deep dive and actual matching. Anywhere clears the geographic constraint;
  the existing connection checkbox still supplies online-only filtering.
- Hive creation/editing and waitlists validate supplied metro keys against the
  recognized location. Mismatches return 400 without changing records. Online
  Hives have no geographic association; unknown manual locations stay NULL.
- Existing saved Hive locations/associations are preserved when unchanged,
  including locations previously assigned manually by an administrator.
  No backfill or remapping runs. The eight Prompt 71 manual-review Hives remain
  an owner/admin task, not an automatic correction.
- Profile setup/edit continue saving location text through the existing profile
  API. No profile columns or unrelated fields were removed or reset.
- The deep dive retains current-location and online-only chips, the 75-mile
  browser-only GPS lookup, ages, and navigation. Late GPS callbacks cannot
  override a newer chip selection; saved GPS area confirmations restore on Back.

## Screens updated

| Screen | Change |
| --- | --- |
| Find Your Hive | Refine autocomplete, Anywhere, metro-aware counts/suggestions, filter handoff |
| Category Deep Dive — all six categories | Shared typing input; existing GPS/online question retained |
| Create Hive | Shared autocomplete; city/state/metro prefill remains editable |
| Hive Settings / General | Shared autocomplete; loaded location and server-resolved metro retained on save |
| Profile Setup | Refined inherited shared component; existing design retained |
| Edit Profile | Same component, loaded values and unrelated profile data preserved |
| Hive Discovery | Refine handoff preserved through results/back navigation; Prompt 71 scoring/area rules retained |
| Itinerary — new trip | Shared general destination search; manual destinations remain possible |
| Opportunities — post/edit | Shared general-area field; Remote toggle and manual text retained |
| Plans — ride offer/request blocks | Shared departure/pickup area inputs; values remain text, not metro IDs |

### Exact meeting locations

Audited, deliberately unchanged: `CreatePlanModal`, `EditPlanModal`,
`CreatePostModal` event location, `SuggestionCard`/chat suggestion editing,
`CreateTimePollModal`, ideas' proposed activity locations, and itinerary-item
locations. These accept venue names, street addresses, URLs or meeting points;
they are not general-area selectors. Venue/address autocomplete via Google Places
or Mapbox is a future enhancement requiring separate approval/provider setup.
No paid service, API key, authentication, payment, or subscription changes were added.

## Files changed

Frontend:

- `client/src/components/AreaLocationInput.jsx`
- `client/src/styles/area-location-input.css` (new)
- `client/src/components/HiveSettings.jsx`
- `client/src/components/tools/RidesPlanBlock.jsx`
- `client/src/pages/CategoryDeepDivePage.jsx`
- `client/src/pages/CreateHivePage.jsx`
- `client/src/pages/FindYourHivePage.jsx`
- `client/src/pages/HiveDiscoveryPage.jsx`
- `client/src/pages/ProfileSetupPage.jsx`
- `client/src/pages/hive/HiveItineraryPage.jsx`
- `client/src/pages/hive/HiveOpportunitiesPage.jsx`
- `client/src/styles/find-your-hive.css`

Backend:

- `server/src/lib/metros.js` — existing normalization, area search, association validation
- `server/src/lib/discoveryFilters.js` (new) — shared Refine rules for facets and suggestions
- `server/src/controllers/hivesController.js` — filters, Hive saves, waitlist validation

Database/schema/migrations: **none changed**. No production connection was used for testing.
Runtime packages/package locks: **none changed on this feature branch**.

Tests/documentation:

- `client/src/checks/prompt71-browser.mjs` — option-role selectors and configurable preview URL
- `client/src/checks/prompt71b-browser.mjs` (new)
- `server/src/checks/prompt71.mjs` — explicit isolated-fixture guard
- `server/src/checks/prompt71b.mjs` (new)
- `server/src/checks/prompt71b-isolated.mjs` (new)
- `server/src/checks/prompt71b-boot.mjs` (new)
- This handoff

## Verification

| Check | Result |
| --- | --- |
| Original Prompt 71 database suite | **21 passed**, in isolated PostgreSQL/WASM |
| New Prompt 71B database suite | **30 passed**, in isolation |
| Original Prompt 71 browser suite | **43 passed**, 1440px and 390px |
| New Prompt 71B browser suite | **39 passed**, desktop/mobile plus normal/reduced motion |
| Actual Express/Socket.IO smoke boot | **Passed**, isolated DB, schema/data guards, local health 200 |
| Frontend production build | **Passed**; existing large-bundle warning remains |
| Changed backend JS syntax / diff whitespace | **Passed** |

New database checks exercise actual SQL/controllers, city/neighborhood/metro
recognition, ambiguous and unknown locations, Anywhere, LA/online filtering,
outside-LA behavior via the existing suite, Refine propagation, profile persistence,
owner/admin permissions, forged association rejection and unchanged legacy data.
The expected 400 rejection cases log their validation errors; those are test passes.

Browser checks use intercepted API fixtures, never live accounts. They cover all
updated area fields, keyboard/focus, debounce/races, error/empty/manual fallback,
city/state persistence, prefill, Refine navigation, long labels, viewport bounds,
no layout movement when the menu opens, reduced motion, and animated close.

Initial test runs exposed harness issues (legacy option-role selectors, selecting
the plan-rules Save button rather than General, profile-setup fixtures incorrectly
claiming an existing profile, and a Windows preload path). These were corrected;
the final suites pass. A concurrent main-checkout switch interrupted another run;
all final verification uses the separate feature worktree.

### Evidence

Screenshots, request captures, JSON result summaries, and WebM recordings are in
`%TEMP%\truehive-prompt71b`. Screenshots are provided at 1440 and 390 widths:
`refine`, `long-dropdown`, `profile-setup`, `profile-edit`, `create`, `settings`,
`trip`, `opportunity`, and `rides` (for example `refine-390.png`).
The original regression evidence is in `%TEMP%\truehive-prompt71`.
These are synthetic fixture screenshots, not production-user data.

### Reproduce without production access

The test-only preload uses [PGlite](https://pglite.dev/docs/api), with its
[pgcrypto extension](https://pglite.dev/extensions/), to load the repository's
full schema and all numbered migrations in memory. It replaces the `pg` pool
before importing test handlers and points any accidental connection at an unusable
local port. Email/AI are disabled. PGlite is installed **only in the OS temp directory**.

```powershell
npm.cmd install --prefix "$env:TEMP\truehive-p71b-tools" @electric-sql/pglite@0.5.10
# from server/
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt71.mjs
node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt71b.mjs
node src/checks/prompt71b-boot.mjs
# from client/, keep Vite running in a separate terminal
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
$env:P71_BASE_URL='http://127.0.0.1:5174'
node src/checks/prompt71-browser.mjs
node src/checks/prompt71b-browser.mjs
npm.cmd run build
```

## Limits and review readiness

- Suggestions cover the inherited 100 US metros/446 places. Other cities/countries
  and precise addresses remain manual text; no global provider was introduced.
- Profile locations remain text; their metro is resolved when needed, without a
  schema addition. Physical meeting points remain separate from area matching.
- Browser verification used Chromium. Safari/Firefox, real phone keyboard behavior,
  and a live deployment were not tested in this task.
- Source is in `C:\Users\osuji\ConnectHive1-prompt71b` on the requested feature branch.
  The main checkout is being used independently and was not restored/overwritten.
  Both recovery stashes remain intact; user files and ongoing main-branch changes
  were excluded from this work.
- Ready for review and an approved merge/release. No merge, push, deployment,
  production migration, production fixtures, or production remapping was performed.
