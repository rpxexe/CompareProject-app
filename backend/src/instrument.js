// Sentry error tracking. Must be required before express/mongoose (first thing in server.js) so
// Sentry can instrument them. Without SENTRY_DSN, or under NODE_ENV=test, Sentry stays off and every
// Sentry.* call elsewhere is a harmless no-op.
const Sentry = require('@sentry/node');
const env = require('./config/env');

const SCRUBBED_HEADERS = ['authorization', 'cookie', 'x-firebase-token'];

if (env.sentry.dsn && !env.isTest) {
  Sentry.init({
    dsn: env.sentry.dsn,
    environment: env.sentry.environment || env.nodeEnv || 'production',
    release: env.sentry.release || undefined,
    // Performance tracing is off unless SENTRY_TRACES_SAMPLE_RATE is set (e.g. 0.1 = 10% of requests).
    tracesSampleRate: env.sentry.tracesSampleRate,
    // SDK v11 collects IPs, cookies, request bodies, DB query values and local variables by default
    // (`sendDefaultPii` no longer exists). Turn all of that off: errors carry the method, URL, headers
    // (tokens scrubbed below) and stack trace, plus only the account id we attach ourselves.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: SCRUBBED_HEADERS }, response: false },
      httpBodies: [],
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // Express errors are reported by middleware/error.js, which knows the final status. Sentry's own
    // hook would treat any status-less error (Mongoose CastError/ValidationError, duplicate keys) as a
    // 500 and report it, even though the API answers those with a 400/409.
    integrations: [Sentry.expressIntegration({ shouldHandleError: false })],
    beforeSend(event) {
      // Belt and braces: no IP address even if an integration sets one.
      if (event.user) delete event.user.ip_address;
      const req = event.request;
      if (req) {
        // Session/Firebase tokens and request bodies (phones, passwords, OTP data) never leave the server.
        if (req.headers) for (const h of Object.keys(req.headers)) if (SCRUBBED_HEADERS.includes(h.toLowerCase())) req.headers[h] = '[Filtered]';
        delete req.cookies;
        delete req.data;
      }
      return event;
    },
  });
}

module.exports = Sentry;
