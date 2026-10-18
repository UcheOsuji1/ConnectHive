import posthog from 'posthog-js';

const apiKey = import.meta.env.VITE_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_POSTHOG_HOST;

export const isPostHogEnabled = Boolean(apiKey && apiHost);

if (isPostHogEnabled) {
  posthog.init(apiKey, {
    api_host: apiHost,
    defaults: '2026-05-30',
    logs: {
      serviceName: 'truehive-client',
      environment: import.meta.env.MODE,
    },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
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
