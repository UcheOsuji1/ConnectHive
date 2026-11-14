# Authenticated Home redesign

## Architecture and implementation

TrueHive retains its React 18/Vite client, React Router, existing AuthContext, Express API, and Postgres schema. No dependencies were added. The marketing landing page and billing work were not edited.

Home now uses a responsive profile/feed/discovery grid, gold/charcoal and ivory palettes, centralized `--th-*` tokens, the existing logo, real profile data, Hive shortcuts, welcome actions, composer, feed, Hive Pulse, recommendations, upcoming events, and nearby suggestions. Missing profile images use the existing initials avatar; missing covers use decorative artwork rather than invented personal photos. Network opportunities have an honest empty state.

`ThemeContext` provides Light, Dark, and System in the profile menu, storage persistence, OS change listeners, and initial theme detection before React. Home styling is scoped; existing non-Home page palettes remain intact and readable. Shared authenticated navigation and post/composer controls use the selected palette.

Existing APIs provide profiles, memberships, pending requests, unread chat counts, upcoming events, compatibility scores, join requests, RSVPs, reactions, comments, moderation, and signed Cloudinary uploads. Home preserves owner/admin-only publishing. The composer supports text, optional photo, Hive audience, events, loading/errors, keyboard dismissal, focus trapping, and focus return.

Backend additions: real Following/Nearby/Trending filtering within the existing feed visibility gate, bounded pagination, per-user post bookmarks, and author-only editing behind membership checks. Save writes are idempotent. Shares open `/home?post=ID` and use the existing protected single-post API. Existing delete/report/reaction/comment permissions remain enforced. The feed deduplicates paginated results and ignores stale responses after tab changes. Event RSVP errors now show feedback and roll back optimistic state.

## Database / release

The additive `saved_home_posts` table is included in `server/src/db/schema.sql` and `server/src/db/migrations/014_home_post_bookmarks.sql`. It has foreign keys with cascading deletion and a composite user/post key.

Apply the schema before releasing the updated server: the shared feed SELECT now reads this table. The standard command is `npm run db:migrate` in `server`. This was NOT run against the configured database: the runner also applies unrelated pending billing migrations in the current workspace. The standalone 014 SQL can be applied through the normal database release process if those migrations are not ready. No production data was changed during this task.

## Validation

Passed:
- `npm run build` in client (Vite still warns about the existing large application bundle).
- `node client/src/checks/home-redesign-browser.mjs` with local Vite running on port 5173. Playwright API fixtures are confined to the test file; no fixture content is shipped in Home. Checks cover desktop/tablet/mobile, no mobile overflow, light/dark persistence, System changes, comment draft preservation across theme changes, saving, feed tab requests, composer Escape/focus, API failures, and no runtime errors.
- `node server/src/checks/homeFeed.check.mjs`.
- `node --experimental-vm-modules server/src/checks/homeControllers.check.mjs`: real controller code with an isolated database adapter checks private-post bookmark denial, public-follow visibility, edit membership denial, filtered feed privacy, and database errors.
- `npm run check:collab`: 82 checks.
- `npm run check:collab-match`: 29 checks.
- Syntax checks of changed server controller/routes.

Browser screenshots are local ignored artifacts: `client/verify-home-dark.png`, `client/verify-home-light.png`, and `client/verify-home-mobile.png`. They use clearly isolated test fixtures.

Live Postgres, Cloudinary upload, real-account RSVP/membership writes, and a full application regression suite have not been exercised. Those remain release checks after migration in an appropriate test environment.

## Remaining scope / practical limits

This does not satisfy every item of the original full feature brief:
- Dedicated social polls, poll voting, and structured collaboration post types are not implemented. Existing Hive announcement/milestone/welcome cards remain supported; project discovery uses the existing collaboration questionnaire and matching system.
- Saved Posts are implemented; Saved Hives and separate activity bookmarks are not.
- Search uses the existing Hive search API; there is no global people/event search backend. Messages and calendar actions lead to the existing Hive selector because messaging and plans are scoped to individual Hives.
- Nearby feed matching currently uses the saved city text, not a geographic radius. Nearby activity cards use the existing personalized suggested-event API and respect its filtering.
- Happening This Week displays the next seven days; Hive Pulse counts all upcoming plans from the existing API. Existing per-Hive unread-count endpoints cap counts at 99; Pulse sums those capped counts.
- Recommendations retain the existing join/request/capacity enforcement. They show compatibility only when provided by the matching service. No scores or engagement figures are fabricated.
- Dedicated capacity/remaining-spots displays require data beyond the current feed response. No person-verification badge is inferred from email verification.
- Actual photos, content density, and populated cards depend on available account data, so empty accounts intentionally differ from the populated reference screenshot.
