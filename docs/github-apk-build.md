# GitHub Actions APK Build (Optional, Non-EAS Path)

This document describes a **second, optional** way to produce an Android APK
for VeeGo Driver, using GitHub Actions instead of the EAS Build cloud queue.

This path does **not** replace EAS. The existing command still works exactly
as before:

```bash
pnpm exec eas build --platform android --profile preview
```

Use the GitHub Actions path when you want a quick debug/test APK without
waiting on the EAS Build queue.

## How it works

The workflow lives at:

```
.github/workflows/android-apk-build.yml
```

It is **manual-trigger only** (`workflow_dispatch`) — it never runs
automatically on push or pull request. Each run:

1. Checks out the repo.
2. Installs Node.js + pnpm + dependencies.
3. Runs `expo prebuild --platform android` to generate a temporary native
   Android project (the repo stays in Expo Managed workflow — nothing native
   is committed back to git).
4. Sets up JDK 17 and the Android SDK.
5. Runs a Gradle assemble task (`assembleDebug` by default, or
   `assembleRelease` if selected).
6. Uploads the resulting `.apk` as a GitHub Actions build artifact.

## How to run it from mobile

1. Open the **GitHub mobile app** (or a mobile browser at github.com).
2. Go to the repository → **Actions** tab.
3. Select the **"Android APK Build (GitHub Actions)"** workflow from the list.
4. Tap **Run workflow**.
5. Choose the `build_variant` input: `debug` (default) or `release`.
6. Tap **Run workflow** to start the build.

## Where to download the APK

1. Once the workflow run finishes (green check), open that run.
2. Scroll to the **Artifacts** section at the bottom of the run summary page.
3. Download the artifact named `veego-driver-<variant>-apk` (a `.zip`
   containing the `.apk`).
4. Unzip and install the APK on an Android device (enable "Install from
   unknown sources" if sideloading).

Artifacts are retained for 14 days, then automatically deleted by GitHub.

## Required GitHub Secrets

These are **optional** — the build will succeed without them, but some
runtime features will be degraded in the resulting APK. No secrets are
committed to the repository; they must be added manually under
**Settings → Secrets and variables → Actions** in GitHub.

| Secret name                  | Required? | Purpose                                                                 |
|-------------------------------|-----------|--------------------------------------------------------------------------|
| `GOOGLE_MAPS_API_KEY_ANDROID` | Optional  | Without it, Google Maps will be blank/non-functional in the built APK. |
| `GOOGLE_MAPS_API_KEY_IOS`     | Optional  | Not used by the Android build; included for parity with `app.config.js`.|
| `EXPO_PUBLIC_API_URL`         | Optional  | Backend API URL baked into the JS bundle at build time.                |

No signing keystore, credentials, or passwords are configured in this
workflow. The `release` variant is built **unsigned** with Gradle's default
debug-signing config unless you add your own signing setup — this workflow
intentionally does not add one, to avoid committing secrets.

## EAS Build vs GitHub Actions APK Build

| | EAS Build (`eas build`) | GitHub Actions (this workflow) |
|---|---|---|
| Trigger | Manual CLI command | Manual `workflow_dispatch` only |
| Where it runs | Expo's cloud build queue | GitHub-hosted Ubuntu runner |
| Native project | Generated + managed by EAS | Generated ephemerally via `expo prebuild`, discarded after the run |
| Output | AAB (per current `eas.json` profiles) or APK if configured | Always a `.apk` |
| Signing | EAS-managed or provided credentials | Unsigned/debug-signed only (no keystore configured) |
| Distribution | Internal distribution via EAS / app stores | Manual download from the Actions run artifact |
| Use case | Primary, production-grade builds | Optional, fast test/debug APK without the EAS queue |

## Remaining manual setup

- Add the optional secrets above in GitHub repo settings if you want Maps /
  backend URL working in the CI-built APK.
- If a **signed release APK** is needed from this pipeline in the future, a
  keystore and signing secrets would need to be added separately — this is
  intentionally out of scope here to avoid committing any credentials.
