import { Platform } from "react-native";
import { Sentry } from "./sentry";

// Firebase App Check: proves that requests to Firebase (phone sign-in / SMS) come from the genuine
// CompareProjects app, so a copied API key can't be used to send OTP texts.
//   - Release builds use Play Integrity (Google Play verifies the install).
//   - Debug builds use the debug provider. On first launch it logs a debug token in logcat
//     ("Enter this debug secret into the allow list..."); register it in Firebase console ->
//     App Check -> Apps -> Manage debug tokens, or pass one via EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN.
// Nothing is blocked until App Check is ENFORCED for Authentication in the Firebase console, so
// this is safe to ship before the console side is set up (see docs/setup.md, section 10 Step 7).
let appCheck = null;
if (Platform.OS !== "web") {
  try {
    appCheck = require("@react-native-firebase/app-check");
  } catch {
    appCheck = null; // native module missing (Expo Go, web, old installs)
  }
}

const DEBUG_TOKEN = String(process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN || "").trim() || undefined;

let started = null;

// Call once at start-up, before any Firebase Auth call. Safe to call again; never throws.
export function startAppCheck() {
  if (started || !appCheck) return started;
  started = (async () => {
    const { getApp } = require("@react-native-firebase/app");
    const provider = new appCheck.ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: { provider: __DEV__ ? "debug" : "playIntegrity", debugToken: DEBUG_TOKEN },
      apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback", debugToken: DEBUG_TOKEN },
    });
    await appCheck.initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  })().catch((e) => {
    // Sign-in still works while App Check isn't enforced; report so a misconfiguration is visible.
    if (__DEV__) console.warn(`App Check not started: ${e?.message || e}`);
    Sentry.captureException(e, { tags: { area: "app-check" } });
  });
  return started;
}
