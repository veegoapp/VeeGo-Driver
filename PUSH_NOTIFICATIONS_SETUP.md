# Push Notifications — why ride requests don't reach a backgrounded app, and how to actually fix it

## The honest diagnosis

The **app code and the backend code are correct**. I verified the whole chain:

- The driver app creates a high-importance Android channel `ride-requests-v3`
  with the custom `trip_request.wav` sound (`app/_layout.tsx`), sets a
  notification handler that only stays silent when VeeGo Driver is literally the
  app on screen (`hooks/usePushNotifications.ts`), and registers both an Expo
  push token and a native FCM token with the backend (`POST /driver/push-token`).
- The backend, on every new ride, calls `sendRideOfferPush`
  (`artifacts/api-server/src/lib/sendNotification.ts`), which sends **both** a
  proper FCM message (with a `notification` block, `priority: high`,
  `channelId: ride-requests-v3`, `sound: trip_request`) **and** an Expo push
  (`channelId: ride-requests-v3`, `priority: high`).

So why does it still only work with the app open? Because **the notification
*infrastructure* was never connected** — and no amount of JavaScript changes can
substitute for it. That is why every previous rebuild reproduced the bug.

When the app is in the foreground, ride offers arrive over the **Socket.IO**
connection (`lib/socketContext.tsx`) — that is a live TCP socket and needs no
push infrastructure, which is why it always works while the app is on screen.
The moment the driver switches to another app (Uber, etc.), the OS suspends that
socket, and the **only** thing that can wake the app is a **remote push through
FCM/APNs**. That path is not configured.

## Root cause (verified in this repo)

**There is no `google-services.json` and no `android.googleServicesFile` config.**
On Expo SDK 53+ (this app is on SDK 54), **Android push notifications require
Firebase Cloud Messaging**. Without `google-services.json` bundled into the
native build:

- The native app has no Firebase config.
- At runtime `getExpoPushTokenAsync()` / `getDevicePushTokenAsync()` **throw**
  (`Default FirebaseApp is not initialized`).
- The driver therefore obtains **no push token at all**, so the backend has
  nothing to send to — a backgrounded/killed app can never be reached.

(This throw used to be swallowed silently; it is now logged as a clear
`[PushNotifications] Could not obtain a push token …` error so you can confirm
it on a real device.)

## What I changed in code (necessary, but NOT sufficient on its own)

1. `app.config.js` now wires `android.googleServicesFile` automatically as soon
   as a `google-services.json` is present (from `GOOGLE_SERVICES_JSON` env or the
   repo root), and prints a loud warning at build time when it is missing.
2. `hooks/usePushNotifications.ts` now logs the real reason token registration
   failed instead of hiding it.

These make the fix *possible* and *diagnosable*. They do **not** create the
Firebase project or the credentials — those are account-level steps only you can
do. Here they are.

## The one-time setup you must complete (I cannot do these for you)

### A. Android — Firebase / FCM (this is the missing piece)

1. In the [Firebase console](https://console.firebase.google.com/), create (or
   open) a project. Add an **Android app** with package name **`com.veego.driver`**
   (must match `app.json` exactly).
2. Download **`google-services.json`** for that app.
3. Provide it to the build, either:
   - commit it to the repo root as `google-services.json` (simplest), **or**
   - upload it as an EAS file secret and expose it as `GOOGLE_SERVICES_JSON`:
     ```bash
     eas secret:create --scope project --name GOOGLE_SERVICES_JSON \
       --type file --value ./google-services.json
     ```
4. Give Expo permission to send through FCM v1: in the same Firebase project,
   **Project settings → Service accounts → Generate new private key**, then
   upload that JSON to EAS:
   ```bash
   eas credentials
   # Platform: Android → Push Notifications: FCM V1 → upload the service-account key
   ```

### B. iOS — APNs

- Run `eas credentials` → iOS → **Push Notifications**, and let EAS create/upload
  the **APNs key**. The bundle id `com.veego.driver` must have Push Notifications
  enabled (EAS handles the entitlement in the managed build).

### C. Backend — Firebase Admin env vars (for the direct FCM route)

The backend's FCM path is gated on `FCM_CONFIGURED`. Set these in the API
server's production environment (same Firebase project as step A):

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...        # keep the \n escapes; the code un-escapes them
```

(The Expo push route works even without these, but only once A is done.)

### D. Rebuild — must be a real native build, not Expo Go / OTA

The channels and the `.wav` files are baked into the native binary, and remote
push was removed from Expo Go in SDK 53. Test on an **EAS development or
production build**:

```bash
eas build --profile production --platform android
```

## How to VERIFY it actually works (don't take anyone's word — including mine)

1. **Token exists:** install the new build, log in as a driver, grant the
   notification permission. In the DB, that driver's `users.pushToken` and
   (Android) `users.fcmToken` must be **non-null**. If they're null, step A/B is
   incomplete — check the device logs for the `[PushNotifications] Could not
   obtain a push token …` error.
2. **Raw delivery, app killed:** copy the Expo token and send a test from the
   [Expo push tool](https://expo.dev/notifications) **with the app swiped away**.
   A banner + the custom sound must appear. If this fails, it's still infra
   (A/B), not app code.
3. **End-to-end:** put the driver online, background the app (open another app),
   and dispatch a real ride. The `ride-requests-v3` alert with `trip_request.wav`
   must fire.
4. **Android OEM battery killing (secondary):** on Xiaomi/Oppo/Samsung/Huawei,
   enable "Autostart" and set battery usage to "No restrictions"/"Don't optimize"
   for VeeGo Driver, otherwise the OS can drop even a correctly-sent push. The
   app already nudges this via `lib/batteryOptimization.ts`.

Only after step 2 passes is the infrastructure genuinely connected. Until then,
the background bug is a configuration gap, not a code bug.
