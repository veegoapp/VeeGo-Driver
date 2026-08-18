const fs = require("fs");
const path = require("path");

// ── Android FCM wiring (the piece that was missing) ──────────────────────────
// Android push notifications on Expo SDK 53+ REQUIRE Firebase Cloud Messaging.
// That means a `google-services.json` (downloaded from the Firebase console for
// the `com.veego.driver` Android app) must be bundled into the native build and
// referenced here via `android.googleServicesFile`. Without it the native app
// has no Firebase config, so at runtime `getExpoPushTokenAsync()` /
// `getDevicePushTokenAsync()` throw ("Default FirebaseApp is not initialized"),
// the driver never obtains a push token, and NOTHING can reach a backgrounded
// or killed app — which is exactly the "ride request only arrives with the app
// open" bug. See PUSH_NOTIFICATIONS_SETUP.md for the full one-time setup.
//
// The file is resolved from (in order):
//   1. process.env.GOOGLE_SERVICES_JSON  — an EAS secret *file* env var
//      (recommended for CI: `eas secret:create --type file`), or
//   2. ./google-services.json            — a file committed at the repo root.
// If neither exists we DO NOT set the key (so `expo prebuild` / EAS build still
// succeeds) but we print a loud warning, because Android push will not work
// until this is provided.
function resolveGoogleServicesFile() {
  const candidates = [
    process.env.GOOGLE_SERVICES_JSON,
    path.resolve(__dirname, "google-services.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore and try the next candidate */
    }
  }
  return null;
}

module.exports = ({ config }) => {
  const googleServicesFile = resolveGoogleServicesFile();

  if (!googleServicesFile) {
    // eslint-disable-next-line no-console
    console.warn(
      "\n⚠️  [veego-driver] google-services.json NOT FOUND.\n" +
        "    Android push notifications (ride-request alerts to a backgrounded/\n" +
        "    killed app) WILL NOT WORK in this build. Add the file from the\n" +
        "    Firebase console for com.veego.driver, then rebuild.\n" +
        "    See PUSH_NOTIFICATIONS_SETUP.md.\n",
    );
  }

  return {
    ...config,

    ios: {
      ...config.ios,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS || "",
      },
    },

    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID || "",
        },
      },
    },

    plugins: [...(config.plugins ?? []), "expo-secure-store"],
  };
};
