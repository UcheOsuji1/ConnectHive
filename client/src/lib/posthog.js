import posthog from 'posthog-js';

const apiKey = import.meta.env.VITE_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_POSTHOG_HOST;

export const isPostHogEnabled = Boolean(apiKey && apiHost);

// Verify, reset and unsubscribe links carry one-time tokens in the query
// string — same reason Sentry's main.jsx strips it from event.request.url.
function stripQuery(url) {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

function beforeSend(captureResult) {
  if (!captureResult) return captureResult;
  const props = captureResult.properties;
  if (props?.$current_url) props.$current_url = stripQuery(props.$current_url);
  if (props?.$referrer)    props.$referrer    = stripQuery(props.$referrer);
  return captureResult;
}

if (isPostHogEnabled) {
  posthog.init(apiKey, {
    api_host: apiHost,
    defaults: '2026-05-30',
    logs: {
      serviceName: 'truehive-client',
      environment: import.meta.env.MODE,
    },
    // Sentry already captures exceptions (main.jsx) — leaving this on would
    // double-report every client error under two different tools.
    capture_exceptions: false,
    // Chats, private pair chats and reports must never be recorded. If
    // replays are wanted later, they need maskAllText/maskAllInputs on top
    // of this, not instead of it.
    disable_session_recording: true,
    // Autocapture must never send what people typed or read — only that an
    // <a> or <button> was interacted with, with its text masked too.
    autocapture: {
      element_allowlist: ['a', 'button'],
    },
    mask_all_text: true,
    mask_all_element_attributes: true,
    before_send: beforeSend,
  });
} else if (import.meta.env.DEV) {
  const missingVariable = apiKey ? 'VITE_POSTHOG_HOST' : 'VITE_POSTHOG_KEY';
  console.error(new Error(`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`));
}

export const posthogLog = {
  info(message, attributes) {
    if (isPostHogEnabled) {
      posthog.logger.info(message, attributes);
    }
  },
};

export default posthog;
