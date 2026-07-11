# Driver App Audit Verification

> Read-only verification. No files were modified.

---

## Issue 1 — Sensitive information appears in production logs

**Status: YES**

Evidence:
- `app/login.tsx` (L271): `console.log('[SIGNUP] Fields → name:', name.trim(), '| email:', email.trim(), '| phone:', phone.trim()...)` — no `__DEV__` guard
- `app/verify-otp.tsx` (L57): `console.log('[OTP] ▶ Calling verifyOtp | phone:', phone, '| otp:', otp)` — no `__DEV__` guard
- `lib/api.ts` (L174): `console.log('[API DEBUG] Authorization:', token ? \`Bearer ${token.slice(0, 20)}...\` : 'MISSING...')` — no `__DEV__` guard

---

## Issue 2 — SOS does not notify the saved emergency contact

**Status: YES**

Evidence:
- `app/ride/[rideId].tsx`, `handleSOS` (L218): emits `socket.emit(SOCKET_EVENTS.DRIVER_SOS, { ... })` and falls back to `endpoints.rides.sos(...)`. No reference to `savedContact` or `EC_STORAGE_KEY`. Emergency contact in `AsyncStorage` is never read during SOS.

---

## Issue 3 — Emergency contact is saved only on the device

**Status: YES**

Evidence:
- `app/safety.tsx`, `handleSaveContact` (L53): `await AsyncStorage.setItem(EC_STORAGE_KEY, JSON.stringify(contact))` — sole persistence call. No API call present.

---

## Issue 4 — Location tracking data can be lost before upload confirmation

**Status: YES**

Evidence:
- `hooks/useActiveLocationTracking.ts`, `syncPending` (L50): `await AsyncStorage.removeItem(PENDING_KEY)` executes **before** `await endpoints.tracking.sendBatch(chunk)`. On upload failure, data is permanently gone.

---

## Issue 5 — Share Trip feature is incomplete

**Status: YES**

Evidence:
- `app/safety.tsx` and `app/ride/[rideId].tsx`: no "Share Trip" button, component, or handler exists. Screen is limited to SOS socket emit and local emergency contact management. Feature exists only as i18n keys (see Issue 15).

---

## Issue 6 — "I'm Safe" feature performs no real action

**Status: YES**

Evidence:
- `app/safety.tsx`: no "I'm Safe" button or backend call of any kind. Screen only handles `AsyncStorage.setItem(EC_STORAGE_KEY, ...)` and `Linking.openURL` for WhatsApp/call. The feature is entirely absent from the implementation.

---

## Issue 7 — Background location tracking is not stopped on logout

**Status: YES**

Evidence:
- `lib/authContext.tsx`, logout handler: calls `endpoints.auth.logout()` and deletes tokens only. No call to `stopLocationTracking`.
- `stopLocationTracking` is only invoked in `app/(tabs)/home.tsx` via `useEffect` cleanup or manual offline toggle.

---

## Issue 8 — Shuttle booking cancellation and reassignment events lack dedicated handlers

**Status: YES**

Evidence:
- `lib/shuttleContext.tsx` (L695–696):
  ```
  socket.on(SOCKET_EVENTS.SHUTTLE_BOOKING_CANCELLED, handleBookingCancelled)
  socket.on(SOCKET_EVENTS.SHUTTLE_BOOKING_REASSIGNED, handleBookingCancelled)
  ```
  Both events are bound to the **same** `handleBookingCancelled` function. Reassigned bookings produce identical UI feedback to cancelled ones — no dedicated handler or distinct user message for reassignment.

---

## Issue 9 — Check-in API does not handle HTTP errors

**Status: YES**

Evidence:
- `lib/api.ts`, `checkin` endpoint (L424–429): returns a raw `fetch(...)` promise. No `.ok` check, no `checkStatus`, no `ApiError` wrapping — unlike every other endpoint in the file.

---

## Issue 10 — API JSON parsing errors are silently ignored

**Status: YES**

Evidence:
- `lib/api.ts` (L224): `try { errorBody = await response.json(); } catch { /* empty */ }`
- `app/safety.tsx` (L47): `catch { /* ignore */ }`

---

## Issue 11 — Unused or duplicated API endpoints

**Status: YES**

Evidence:
- `lib/api.ts`: `endpoints.shuttle.driverTrips` (L658) and `endpoints.shuttle.history` (L661) both resolve to `/shuttle/driver/my-trips?page=${page}&limit=${limit}` — identical path.
- `endpoints.driver.me` (L340) and `endpoints.driver.profile` (L342) serve overlapping profile data concerns.

---

## Issue 12 — Wallet payout shows success without confirming real payout status

**Status: YES**

Evidence:
- `app/(shuttle)/wallet.tsx`, `handlePayoutSubmit` (L242–252): `Alert.alert('✓', res?.message ?? t.payout_pending_msg)` fires on any truthy response. No check for a `status: "completed"` vs `status: "pending"` field.

---

## Issue 13 — Document uploads always send a fixed file type

**Status: YES**

Evidence:
- `lib/api.ts`, `registerDocument` (L416): `registerDocument: (type: string, fileUrl: string, mimeType = 'image/jpeg')` — MIME type defaults to `image/jpeg` with no detection of the actual file type.

---

## Issue 14 — Certificate pinning failures only log and take no action

**Status: YES**

Evidence:
- `lib/certificatePinning.ts`, `initializeCertificatePinning` (L99–101):
  ```js
  addSslPinningErrorListener((error) => {
    console.error('[CertPinning] SSL pin validation failed:', error);
  });
  ```
  No disconnect, no session termination, no user-facing alert.

---

## Issue 15 — Safety/share translation keys exist without implementation

**Status: YES**

Evidence:
- `lib/i18nContext.tsx` (L853): `share_trip_title: 'Share trip status'`
- `lib/i18nContext.tsx` (L1110): `whatsapp_emergency_title: 'Emergency WhatsApp Alert'`
- Neither key is referenced in `app/safety.tsx` or any ride screen.

---

## Issue 16 — Trip accept/reject/cancel functions not connected to UI

**Status: NO** *(False positive)*

Evidence:
- `app/(tabs)/trips.tsx` (L104, L113, L142): `await endpoints.trips.accept(tripId)`, `endpoints.trips.reject(...)`, `endpoints.trips.cancel(...)` are all called from UI handlers. The "not yet connected to UI" comment in `lib/api.ts` is stale and does not reflect current usage.

---

## Issue 17 — Unused socket events defined without listeners

**Status: YES**

Evidence:
- `constants/socketEvents.ts` — explicitly marked "unused — reserved for future":
  - `DRIVER_LOCATION_ACK` (L46): `"driver:location:ack"` — no `socket.on` listener found
  - `DRIVER_STATUS_ONLINE` (L124): `"driver:status:online"` — no `socket.on` listener found
  - `DRIVER_TRIP_START` (L132): `"driver:trip:start"` — no `socket.on` listener found

---

## Issue 18 — Simple actions use blocking alerts instead of better feedback

**Status: YES**

Evidence:
- `app/(shuttle)/profile.tsx`, `handleCopyCode`: catch block falls back to `Alert.alert(t.referral_code_section, referralCode)` — a native blocking dialog — when the clipboard API fails, instead of a non-blocking toast.

---

## Issue 19 — Over-the-air updates are disabled

**Status: YES**

Evidence:
- `app.json`: `"updates": { "enabled": false }` — OTA updates explicitly disabled.

---

## Issue 20 — Old temporary fallback code in response handling

**Status: YES**

Evidence:
- `lib/api.ts`, `ShuttleCompleteResponse` interface: comment reads *"Backend has historically returned fields at root level AND nested under data — both paths are guarded at the call site."* Double-fallback structure checks both root-level and `.data` fields to locate the same booking object.

---

# Summary

**Confirmed issues (19):** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20

**False positives (1):** 16 — Trip accept/reject/cancel endpoints are connected to the UI in `app/(tabs)/trips.tsx`; the "not yet connected" comment in `lib/api.ts` is stale.

**Already fixed items (0):** None — all remaining 19 issues are present in the current codebase as originally reported.
