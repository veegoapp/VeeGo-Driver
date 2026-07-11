# Driver App Production Audit

**Date:** July 11, 2026  
**Scope:** Driver App (Expo / React Native / TypeScript) — read-only analysis  
**Out of Scope:** Backend, Passenger App, Admin Dashboard, Database, API contracts, Payment logic

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [Medium Issues](#2-medium-issues)
3. [Low Priority Cleanup](#3-low-priority-cleanup)
4. [Files Involved](#4-files-involved)
5. [Recommended Implementation Order](#5-recommended-implementation-order)

---

## 1. Critical Issues

### C-1 — PII and Auth Credentials Leaked to System Logs in Production

**Area:** Security  
**Severity:** Critical

`console.log` statements containing sensitive data are **not guarded by `__DEV__`** and will print to system logs in production builds.

| Location | What is Logged |
|---|---|
| `app/verify-otp.tsx` (lines 57–60) | Full OTP value + full JSON response from `verifyOtp` |
| `app/login.tsx` (line 271) | User name, email, phone number, and password length |
| `lib/api.ts` (line 174) | First 20 characters of the Bearer token |

**Risk:** On Android, system logs are accessible to other apps with `READ_LOGS` permission. On iOS, logs are accessible via Xcode or crash-report tools. Token fragments and OTPs are enough for session hijacking.

**Recommended Fix:** Wrap all three log sites in `if (__DEV__) { ... }` guards. Consider a centralized `logger` utility that strips in production.

---

### C-2 — SOS Button Does Not Alert the Saved Emergency Contact

**Area:** Safety Features  
**Severity:** Critical

The SOS button in `app/ride/[rideId].tsx` emits a `DRIVER_SOS` socket event (with fallback to `endpoints.rides.sos`) which correctly notifies the operations team. However:

- The `app/safety.tsx` screen lets drivers save an emergency contact (name + phone) to `AsyncStorage`.
- The UI and i18n strings (`sos_sent_msg`, `share_trip_title`) imply the contact will be notified with driver, passenger, and location details.
- **The SOS handler never reads or alerts the saved emergency contact.** No WhatsApp link, SMS, or automated message is sent to that contact.

**Current behavior:** Operations team is alerted. Emergency contact receives nothing.  
**Expected behavior:** Both the operations team AND the emergency contact are notified on SOS activation.

**Recommended Fix:** Within `handleSOS` in `app/ride/[rideId].tsx`, after the socket emit succeeds, read `savedContact` from `AsyncStorage` and call `Linking.openURL` with a pre-filled WhatsApp or SMS URI containing the driver's current coordinates.

---

### C-3 — Emergency Contact Not Persisted to Backend

**Area:** Safety Features / API  
**Severity:** Critical

Emergency contacts saved in `app/safety.tsx` are stored only in `AsyncStorage`. They are:
- Lost if the app is uninstalled or the device is wiped.
- Inaccessible to the backend for server-side SOS routing.
- Not synced across devices if a driver reinstalls.

**Recommended Fix:** Add an API call in `handleSaveContact` (in `app/safety.tsx`) to persist the emergency contact to the backend. The backend can then trigger contact notification server-side on SOS, removing the dependency on the driver's device being online.

---

### C-4 — Pending Location Batch Data Loss on Upload Failure

**Area:** Location Tracking  
**Severity:** Critical

In `hooks/useActiveLocationTracking.ts`, the `syncPending` function removes buffered location records from `AsyncStorage` (`veego_pending_locations`) **before** the batch API call to `endpoints.tracking.sendBatch` completes. If the upload fails (network timeout, server error), the data is permanently lost — no retry, no re-queue.

**Current behavior:** Locations removed from buffer → upload attempted → on failure, locations are gone.  
**Expected behavior:** Locations should only be removed from the buffer **after** a confirmed successful upload response.

**Recommended Fix:** Move the `AsyncStorage` removal to inside the `.then()` success handler of the batch upload call, not before the `await`.

---

## 2. Medium Issues

### M-1 — "Share Trip" and "I'm Safe" Features Are Not Implemented

**Area:** Safety Features  
**Severity:** Medium

Translation keys `share_trip_title` and `whatsapp_emergency_title` exist in `lib/i18nContext.tsx`, indicating these features were designed but never built. There are no corresponding UI components or logic in `app/safety.tsx` or `app/ride/[rideId].tsx`.

**Risk:** Drivers or stakeholders may expect these features to exist based on marketing or documentation.

**Recommended Fix:** Either implement the features (share a live tracking link via `expo-sharing`; add a manual "I'm Safe" check-in button that POSTs a status update) or remove the orphaned i18n keys to prevent confusion.

---

### M-2 — Background Location Task Not Stopped on Logout

**Area:** Location Tracking  
**Severity:** Medium

`lib/backgroundLocationTask.ts` is registered as a side-effect in `app/_layout.tsx`. The task is started in `HomeScreen.tsx` but `stopLocationTracking` is only called on:
- `HomeScreen` unmount, or
- Manual "Go Offline" toggle.

If a driver is forcibly logged out (token expiry, admin action) without visiting HomeScreen, the background task may continue running and sending location updates associated with the previous session until the OS kills it.

**Recommended Fix:** Call `stopLocationTracking` in the auth logout handler (`lib/auth.ts`) so that it is always stopped regardless of which screen triggers the logout.

---

### M-3 — `ADMIN_SHUTTLE_BOOKING_CANCELLED` and `SHUTTLE_BOOKING_REASSIGNED` Have No Dedicated Handlers

**Area:** Socket System  
**Severity:** Medium

Both events are defined in `constants/socketEvents.ts` (lines 57, 73). In `lib/shuttleContext.tsx` (line 696), `SHUTTLE_BOOKING_REASSIGNED` is mapped to a generic cancellation handler rather than a dedicated one. `ADMIN_SHUTTLE_BOOKING_CANCELLED` has no explicit handler.

**Risk:** When an admin cancels a booking or reassigns a shuttle, the driver may not get an appropriate notification distinguishing cancellation from reassignment. The driver's UI could show stale booking state.

**Recommended Fix:**
- Add a dedicated handler for `ADMIN_SHUTTLE_BOOKING_CANCELLED` that shows a specific alert and invalidates the affected booking query.
- Separate the `SHUTTLE_BOOKING_REASSIGNED` path from the generic cancellation handler to surface a "your booking was reassigned" message.

---

### M-4 — `endpoints.driver.checkin` Lacks Error Handling

**Area:** API Integration  
**Severity:** Medium

In `lib/api.ts` (line ~419), the `checkin` endpoint returns a raw `fetch` promise without:
- HTTP status code validation.
- `ApiError` wrapping (unlike all other endpoints in the file).
- A typed response.

**Risk:** A 4xx or 5xx response from the check-in endpoint will be silently treated as success. If check-in enforces the selfie/identity verification gate, a silent failure could allow a driver to proceed without completing the required check.

**Recommended Fix:** Wrap the `checkin` endpoint with the same `checkStatus`/`ApiError` pattern used throughout the rest of `lib/api.ts`.

---

### M-5 — Silent JSON Parse Failures in API Layer

**Area:** API Integration  
**Severity:** Medium

Multiple `try/catch` blocks in `lib/api.ts` (lines ~224, ~357, ~406) catch JSON parsing errors and swallow them with `/* empty */` comments. Malformed backend responses are silently ignored and callers receive `undefined` or a default value with no indication that the response was invalid.

**Risk:** Debugging is extremely difficult when the backend returns malformed JSON — the app appears to succeed while actually receiving garbage data.

**Recommended Fix:** At minimum, log parse errors in `__DEV__` mode. Consider surfacing a generic error to the user rather than silently continuing with bad data.

---

### M-6 — Redundant and Unconnected API Endpoints

**Area:** API Integration  
**Severity:** Medium

Several endpoints in `lib/api.ts` are either redundant or entirely disconnected from the UI:

| Endpoint | Issue |
|---|---|
| `endpoints.driver.me` (L340) | Appears redundant to `endpoints.driver.profile` (L342) |
| `endpoints.driver.status` (L376) | Appears redundant to `endpoints.driver.checkinStatus` (L435) |
| `endpoints.trips.accept/reject/cancel` (L494–501) | Explicitly noted as "defined — not yet connected to UI" |
| `endpoints.shuttle.history` + `endpoints.shuttle.driverTrips` | Both call the same path |

**Recommended Fix:** Audit which endpoints are actively consumed by the UI, remove true duplicates, and either connect or clearly document the `trips.accept/reject/cancel` endpoints.

---

### M-7 — Shuttle Wallet Payout Does Not Confirm Transaction Success

**Area:** API Integration  
**Severity:** Medium

In `app/(shuttle)/wallet.tsx` (line ~252), a "Payout successful" alert is shown based on a truthy response from the payout endpoint, without verifying whether the backend returned a `status: "completed"` or `status: "pending"` state. A pending payout is treated the same as a completed one in the UI.

**Recommended Fix:** Check the response status field before showing a success message. If the payout is pending, show a "Your payout is being processed" message instead.

---

### M-8 — Certificate Pinning Errors Are Logged But Not Enforced at App Level

**Area:** Security  
**Severity:** Medium

`lib/certificatePinning.ts` and `app/_layout.tsx` configure SSL public key pinning. The `addSslPinningErrorListener` callback only calls `console.error` on a pinning failure. There is no app-level response: no forced disconnect, no user-facing error, no session termination.

**Risk:** While the native library (`react-native-ssl-public-key-pinning`) blocks the specific request at the network layer, the app does not actively respond to pinning violations (e.g., to alert the security team or force a re-auth). A MITM attacker who triggers a pinning error will simply see the request fail silently.

**Recommended Fix:** In the `addSslPinningErrorListener` callback, log the incident server-side (via a non-pinned channel or device log aggregation) and optionally show a "Secure connection failed" dialog to the user.

---

### M-9 — Document Upload MIME Type Hardcoded to `image/jpeg`

**Area:** API Integration  
**Severity:** Medium

In `lib/api.ts` (line ~416), the MIME type for document uploads defaults to `image/jpeg`. If a driver attempts to upload a PDF version of their license or registration, the file is sent with an incorrect content type, which may cause backend validation to reject it or store it incorrectly.

**Recommended Fix:** Detect the actual MIME type from the file URI extension (or use `expo-file-system` to read the file info) and pass the correct type to the upload call.

---

## 3. Low Priority Cleanup

### L-1 — "Share Trip" i18n Keys Are Orphaned

`lib/i18nContext.tsx` contains `share_trip_title`, `whatsapp_emergency_title`, and related strings with no UI component consuming them. These should be removed or implemented (see M-1).

---

### L-2 — `endpoints.trips.accept/reject/cancel` Are Defined but Unused

These three endpoints (lines 494–501 of `lib/api.ts`) are documented as not connected to any UI. They should either be wired up or removed to keep the API surface clean.

---

### L-3 — Unused Reserved Socket Events

`constants/socketEvents.ts` contains several events flagged as "unused/reserved":
- `DRIVER_LOCATION_ACK`
- `DRIVER_TRIP_START`
- `DRIVER_STATUS_ONLINE`

These should be removed if not part of an active contract, or documented if they are reserved for future backend changes.

---

### L-4 — Alert Used for Non-Critical UI Feedback

`app/(shuttle)/profile.tsx` (line ~144) uses a native `Alert.alert` dialog to show the referral code to the driver instead of copying it to the clipboard or showing a toast. This is a poor UX pattern for a non-critical action.

**Recommended Fix:** Use `Clipboard.setStringAsync` (from `expo-clipboard`) to copy the referral code and show a lightweight toast confirmation.

---

### L-5 — `SHUTTLE_BOOKING_REASSIGNED` Handled by Generic Cancellation Path

Noted in M-3. At low priority, this is a UX/clarity issue even if the data is correct — the driver sees a "booking cancelled" message when their booking was actually reassigned to a different shuttle.

---

### L-6 — `updates.enabled: false` Requires Manual Store Releases for Security Patches

`app.json` sets `updates.enabled: false`, disabling Expo OTA (over-the-air) updates. This means any critical security fix (e.g., rotating a certificate pin, patching the C-1 log leak) requires a full app store submission cycle.

**Recommendation:** Evaluate enabling OTA updates for JS-layer changes to allow faster security patch delivery without a store review cycle.

---

### L-7 — `ShuttleCompleteResponse` Double-Fallback Is a Code Smell

`lib/api.ts` (line ~47) defines `ShuttleCompleteResponse` with a "double-fallback" that checks both the root response and a `.data` field to find the booking object, specifically because of historical backend inconsistencies. This should be cleaned up once the backend response shape is confirmed stable.

---

## 4. Files Involved

| File | Issues |
|---|---|
| `app/verify-otp.tsx` | C-1 (OTP logging) |
| `app/login.tsx` | C-1 (PII logging) |
| `lib/api.ts` | C-1, C-4, M-4, M-5, M-6, M-7, M-9 |
| `app/ride/[rideId].tsx` | C-2 (SOS missing contact alert) |
| `app/safety.tsx` | C-2, C-3, M-1 |
| `hooks/useActiveLocationTracking.ts` | C-4 (data loss on batch failure) |
| `lib/backgroundLocationTask.ts` | M-2 (not stopped on logout) |
| `lib/auth.ts` | M-2 (logout should stop location task) |
| `lib/shuttleContext.tsx` | M-3 (missing dedicated event handlers) |
| `constants/socketEvents.ts` | M-3, L-3 |
| `lib/socketContext.tsx` | M-8 (cert pinning response) |
| `lib/certificatePinning.ts` | M-8 |
| `app/(shuttle)/wallet.tsx` | M-7 (payout status not verified) |
| `app/(shuttle)/profile.tsx` | L-4 (Alert for referral code) |
| `lib/i18nContext.tsx` | L-1 (orphaned i18n keys) |
| `app.json` / `app.config.ts` | L-6 (OTA updates disabled) |
| `hooks/useLocationBroadcast.ts` | Location tracking (clean) |
| `lib/shuttleContext.tsx` | `shuttle:renewal:confirmed` handled correctly |

---

## 5. Recommended Implementation Order

Fix in this order to address the highest risk to drivers and data first:

### Phase 1 — Security & Data Integrity (Do First)

| # | Issue | Why |
|---|---|---|
| 1 | **C-1** — Remove unguarded `console.log` with PII/tokens | Leaks credentials to system logs in every production build today |
| 2 | **C-4** — Fix `AsyncStorage` removal before batch upload completes | Silent data loss on every network failure during active trips |
| 3 | **M-4** — Add error handling to `endpoints.driver.checkin` | Silent failures on identity gate could allow unverified drivers to work |

### Phase 2 — Safety Feature Gaps

| # | Issue | Why |
|---|---|---|
| 4 | **C-3** — Persist emergency contact to backend | Local-only contact is useless if device is offline during SOS |
| 5 | **C-2** — SOS handler should notify emergency contact | Core safety promise of the feature is unmet |
| 6 | **M-1** — Implement or remove Share Trip / I'm Safe | Either deliver the features or remove misleading i18n strings |

### Phase 3 — API & Socket Reliability

| # | Issue | Why |
|---|---|---|
| 7 | **M-2** — Stop background location on logout | Prevent stale location data from ex-sessions reaching backend |
| 8 | **M-5** — Surface JSON parse errors instead of swallowing | Debugging malformed responses is currently impossible |
| 9 | **M-7** — Verify payout status before showing success | Drivers may believe payment succeeded when it is still pending |
| 10 | **M-9** — Fix document upload MIME type detection | PDF uploads may be rejected or mishandled by backend |
| 11 | **M-3** — Dedicated handlers for booking cancelled/reassigned events | Drivers see wrong status messages for reassigned bookings |
| 12 | **M-6** — Remove or connect orphaned/duplicate endpoints | Keeps API surface clean and avoids confusion in future development |

### Phase 4 — Polish & Future-Proofing

| # | Issue | Why |
|---|---|---|
| 13 | **M-8** — App-level response to cert pinning errors | Improve security observability |
| 14 | **L-6** — Evaluate enabling OTA updates | Faster security patch delivery without full store cycle |
| 15 | **L-1 through L-5** | Code quality and UX cleanup |

---

*This report is read-only. No files were modified during the audit.*
