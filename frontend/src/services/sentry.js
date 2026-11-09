import * as Sentry from '@sentry/react-native';

// Sentry crash and error reporting. Import this module before anything else renders (App.js does).
// Without EXPO_PUBLIC_SENTRY_DSN, or in development (__DEV__), Sentry stays off and every
// Sentry.* call is a harmless no-op, so local debugging doesn't flood the project.
const DSN = String(process.env.EXPO_PUBLIC_SENTRY_DSN || '').trim();
const ENABLED = !!DSN && (!__DEV__ || process.env.EXPO_PUBLIC_SENTRY_IN_DEV === 'true');

// Records screen changes as breadcrumbs, so each error shows which screens led to it.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: false,
});

Sentry.init({
  dsn: DSN || undefined,
  enabled: ENABLED,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? 'development' : 'production'),
  // Performance tracing is off unless EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE is set (e.g. 0.1 = 10%).
  tracesSampleRate: Math.min(1, Math.max(0, Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0)),
  // No IPs or device user details are sent automatically; only the account id is added (setSentryUser).
  sendDefaultPii: false,
  integrations: [navigationIntegration],
  beforeBreadcrumb(crumb) {
    // HTTP breadcrumbs keep the method, URL and status, but never request/response bodies.
    if (crumb.category === 'xhr' || crumb.category === 'fetch') {
      const { method, url, status_code } = crumb.data || {};
      crumb.data = { method, url: String(url || '').split('?')[0], status_code };
    }
    return crumb;
  },
});

// Attach (or clear, on sign-out) the signed-in account id to future error reports.
export function setSentryUser(user) {
  const id = user?.id || user?._id;
  Sentry.setUser(id ? { id: String(id) } : null);
}

export { Sentry };
