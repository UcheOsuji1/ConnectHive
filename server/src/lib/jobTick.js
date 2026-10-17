// Every job in jobs/ shares the same start<Name>Job() shape: run once
// immediately, then on an interval, each wrapped in its own .catch so one
// bad tick never kills the timer. This is that .catch body, shared so every
// job reports to Sentry with its own name as a tag instead of one undifferentiated
// bucket of job failures.
import * as Sentry from '@sentry/node';

export function reportJobError(jobName, action, err) {
  console.error(`[${jobName}] ${action} failed:`, err);
  Sentry.captureException(err, { tags: { job: jobName } });
}
