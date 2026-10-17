// The Sentry half of CLAUDE.md's "repairs must be loud" — every site that
// already shouts via console.error for a silent-data-fault repair also
// reports here, so the same faults that scroll past in a terminal show up
// as a Sentry alert. Never replaces the console.error; always alongside it.
import * as Sentry from '@sentry/node';

export function reportProblem(message, extra) {
  console.error(message, extra ?? '');
  Sentry.captureMessage(message, { level: 'error', extra });
}
