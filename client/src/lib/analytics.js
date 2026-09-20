export function track(event, props = {}) {
  if (typeof window.analytics?.track === 'function') {
    window.analytics.track(event, props);
  }
}
