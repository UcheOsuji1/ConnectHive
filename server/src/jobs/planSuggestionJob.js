import { resolveAllOverdueSuggestions } from '../controllers/planSuggestionsController.js';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — a vote deadline is user-facing, so a lazy read already
                                    // covers anyone looking at the page; this just catches the rest.

// Exported separately so checks can call one pass directly and assert on its
// return value instead of waiting on a timer — same shape as rsvpReminderJob.
export async function runPlanSuggestionJob() {
  return resolveAllOverdueSuggestions();
}

let started = false;
export function startPlanSuggestionJob() {
  if (started) return; // guard against being called twice in one process
  started = true;
  runPlanSuggestionJob().catch(e => console.error('[planSuggestionJob] initial run failed:', e));
  setInterval(() => {
    runPlanSuggestionJob().catch(e => console.error('[planSuggestionJob] run failed:', e));
  }, INTERVAL_MS);
}
