// Expo's default Metro config plus Sentry's debug IDs, so release crash stack traces can be matched to
// the uploaded source maps (readable file names and line numbers instead of minified bundle code).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
