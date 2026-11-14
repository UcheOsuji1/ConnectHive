# TrueHive Home visual refinement — Phase 2

Implemented on branch `visual/home-refinement-phase2`.

## Visual changes

- Authenticated navigation now has an explicit ivory surface in Light Mode and near-black surface in Dark Mode. Charcoal/warm-white controls, gold active indicators, search, notifications, dropdowns, and the mobile menu use the existing theme tokens. Removing the header background transition prevents a dark intermediate frame when switching to Light Mode.
- Home post cards now begin with the author avatar/name, Hive, optional category, timestamp, and a compact options disclosure. Edit/Delete are author-only and appear in the disclosure alongside Copy Link; existing permitted Report/Block actions appear for other authors. Like, Comment, Share, and Save form a single touch-friendly footer. Engagement totals share a compact row. Existing reaction pickers, comments, edit/delete calls, bookmark writes, and moderation behavior are retained.
- The new post layout is opt-in through `homeLayout`; shared PostCard instances inside Hive workspaces keep their previous layout.
- Composer actions have consistent alignment, icons, hover states, and spacing. At 320px the actions use two columns instead of compressing labels. Existing modal and audience behavior are unchanged; only modal styling was refined.
- Profile proportions, avatar overlap, tags, statistics, navigation rows, badges, and View Profile emphasis are refined. The cover fallback uses decorative artwork and the existing TrueHive mark, never an assigned personal photo.
- Hive Pulse has clearer nested surfaces. Recommendations show existing API compatibility in small rings and retain the existing join/request flow. Upcoming events have improved date tiles, location text, and typography. Empty event/activity panels have short discovery prompts. Existing category chips and activity images are retained and polished.

## Files changed in this phase

- `client/src/styles/home-redesign.css` — theme-aware navigation, Home card and responsive refinements.
- `client/src/components/PostCard.jsx` — Home-specific social header, menu, engagement, and footer presentation.
- `client/src/components/PostOverflowMenu.jsx` — new keyboard-accessible disclosure with outside-click, Escape, focus-return, and Tab behavior.
- `client/src/components/HomeIcon.jsx` — Like/Share line icons.
- `client/src/components/Navbar.jsx` — active classes and accessible themed mobile navigation.
- `client/src/pages/HomePage.jsx` — enable Home post presentation, branded cover fallback, activity empty state.
- `client/src/components/SuggestedHivesCard.jsx` — compatibility ring and compact recommendation presentation.
- `client/src/components/UpcomingEventsCard.jsx` — event location/empty-state presentation.
- `client/src/checks/home-redesign-browser.mjs` — update selectors for the relocated Save control; make screenshot paths deterministic.
- `client/src/checks/home-refinement-browser.mjs` — expanded UI interaction and screenshot verification.
- `docs/home-refinement-phase2.md` — this report.

No backend API, business-rule, database, payment, subscription, or marketing landing-page source changes were made in this phase. Existing unrelated uncommitted changes remain in the workspace; the branch has not been committed or deployed.

## Screenshots

All screenshots are local verification artifacts generated using isolated test fixtures. They do not populate production feeds. The four primary screenshots are:

- `C:\Users\osuji\ConnectHive1\client\verify-home-phase2\desktop-dark.png`
- `C:\Users\osuji\ConnectHive1\client\verify-home-phase2\desktop-light.png`
- `C:\Users\osuji\ConnectHive1\client\verify-home-phase2\mobile-light.png`
- `C:\Users\osuji\ConnectHive1\client\verify-home-phase2\mobile-dark.png`

The same folder contains 320px and 390px screenshots in both themes, the post options disclosure, an empty state, and the original browser suite's screenshots. Original `verify-home-dark.png`, `verify-home-light.png`, and `verify-home-mobile.png` files are preserved.

Reviewed against the original approved mockup and all three previous screenshots. Remaining differences are intentional: decorative cover artwork and initials when user images are absent, available real account data controls density, the optional category/engagement metadata differs with post data, and existing supported composer actions are retained without adding polls. The implementation uses quieter gold accents and a compact post options menu rather than copying fabricated example counts or personal photos from the mockup.

## Tests performed

- `npm --prefix client run build` — passed. Vite continues to report the existing large-bundle warning.
- `node client/src/checks/home-redesign-browser.mjs` — passed: desktop/tablet/mobile layout, theme persistence, System preference changes, comment draft preservation, bookmark behavior, feed tabs, composer Escape, API failure feedback, and runtime-error checks.
- `node client/src/checks/home-refinement-browser.mjs` — passed: options-menu keyboard opening, Escape/focus return, outside click, author controls, edit/delete, Share/Copy Link, Save/Unsave, reactions, comments, composer submission, joining, RSVP success and failure rollback, both themes, System/persistence, mobile menu, 320px/390px overflow, and populated/empty screenshot capture. No page runtime errors were observed.
- `git diff --check` on the changed tracked UI files — passed.

Browser tests use the local Vite server at `http://127.0.0.1:5174` by default; set `HOME_TEST_URL` to test a different local origin. API responses are mocked only in the test scripts. Interaction checks verify client requests/state and presentation, not live external services or real account writes.

## Existing issues left unchanged

- Phase 1's bookmark table must still be migrated before deploying its server code. This phase neither adds nor applies migrations.
- Live Postgres, Cloudinary uploads, real-account membership/RSVP writes, and full application regression testing remain staging release checks.
- Dedicated polls, Saved Hives, global people/event search, and geographic-radius Nearby remain outside this visual pass. The existing city-text feed filter and Hive-scoped messages/calendars are unchanged.
- Existing Home event data comes from the legacy upcoming-event API. Attendance/location/image details are rendered when supplied; this phase does not invent missing event details or expand that API.
- The production bundle size warning remains; no unrelated code-splitting refactor was attempted.
