# Driver App Local Fixes Report

---

# Changes Made

## Task 1 — Remove sensitive data from production logs

### `app/login.tsx`
Wrapped all `console.log` statements in the `handle()` (register) function with `if (__DEV__)` guards. Specifically removed PII from log messages:
- Removed user name, email, phone, and password length from the log at the Fields line
- Removed full register API response from the success log
- Removed phone number from the "Navigating to OTP" log
- All remaining debug logs (flow markers, error codes) retained but now dev-only

**Why:** These logs were unconditional and printed user PII and full API responses to system logs in production builds.

### `app/verify-otp.tsx`
Wrapped all `console.log` statements in `handleVerify()` with `if (__DEV__)` guards:
- Removed phone number and OTP value from the "Calling verifyOtp" log
- Removed full `verifyOtp` response JSON from the success log
- Removed `err.body` (which may contain server-side PII) from the error log

**Why:** OTP values and phone numbers in plaintext logs are a critical credential leak in production.

### `lib/api.ts`
The token log at line 174 was already correctly guarded by `if (isVehicleDebug && __DEV__)` — no change needed there. The silent `catch { /* empty */ }` block for the 403 error body parser (line 224) was updated to log a warning in dev mode instead of swallowing the parse failure silently.

---

## Task 2 — Fix location tracking data loss

### `hooks/useActiveLocationTracking.ts` — `syncPending()`

**Before:** Records were removed from `AsyncStorage` with `await AsyncStorage.removeItem(PENDING_KEY)` *before* the batch upload loop began. Any network failure left the locations permanently deleted.

**After:** Each chunk is uploaded first; the chunk is only removed from storage after a confirmed successful response. If any batch upload fails, the failed chunk and all remaining items are written back to `AsyncStorage` for retry on the next sync cycle. If all batches succeed, storage is cleared normally.

**Why:** This prevents silent data loss for trip history records whenever there is a network timeout or server error during sync.

---

## Task 3 — Stop background location tracking on logout

### `lib/backgroundLocationTask.ts`
Added an exported `stopLocationTracking()` async helper that:
1. Checks whether the background task is currently registered via `TaskManager.isTaskRegisteredAsync`
2. Calls `Location.stopLocationUpdatesAsync` only if it is registered
3. Swallows any error so it never blocks the logout flow

**Why:** Centralising the stop logic as an exported utility makes it callable from any context without importing Location/TaskManager directly.

### `lib/authContext.tsx`
Imported `stopLocationTracking` from `./backgroundLocationTask` and called it at the **start** of the `logout()` function, before the server logout call and before token deletion.

**Why:** Previously, background GPS updates continued transmitting after a driver was logged out (e.g. forced logout due to token expiry or admin action). The stop now happens unconditionally on every logout path, regardless of which screen triggers it.

---

## Task 4 — Improve API JSON parsing error handling

### `lib/api.ts` — 403 error body parser
Changed the silent `catch { /* empty */ }` on the 403 response body JSON parse to `catch (e) { if (__DEV__) console.warn('[API] Could not parse 403 response body as JSON:', e); }`.

**Why:** Silently swallowing a JSON parse error here made it impossible to diagnose malformed backend responses during development. The fallback behavior (null error body) is preserved for compatibility; only the visibility in dev mode changed.

---

## Task 5 — Fix document upload MIME type handling

### `lib/api.ts` — `registerDocument` + `inferMimeType` helper

Added a module-level `inferMimeType(uri: string): string` helper that:
- Strips query strings from the URI before extracting the extension
- Maps common extensions to correct MIME types: `jpg`/`jpeg` → `image/jpeg`, `png` → `image/png`, `gif` → `image/gif`, `webp` → `image/webp`, `heic` → `image/heic`, `heif` → `image/heif`, `pdf` → `application/pdf`
- Falls back to `image/jpeg` for unrecognised extensions

Changed `registerDocument` signature from `mimeType = 'image/jpeg'` (hardcoded default) to `mimeType?: string` (optional), using `mimeType ?? inferMimeType(fileUrl)` when calling the endpoint.

**Why:** All existing callers that already pass an explicit MIME type are unaffected. Callers that omit it now get the correct type detected from the file extension instead of always sending `image/jpeg`, which was incorrect for PDFs and other document types.

---

## Task 6 — Improve simple UI feedback

### `app/(shuttle)/profile.tsx` — `handleCopyCode()`

**Before:** The `catch` block (triggered when `Clipboard.setStringAsync` fails) showed a native blocking `Alert.alert` dialog displaying the referral code.

**After:** The `catch` block is silent — the referral code is already visible on screen. `setCopied(true)` is now called unconditionally (moved outside the try/catch) so the existing inline green "Copied" indicator always appears and provides feedback.

**Why:** The referral code is displayed on screen so the driver can always read it. A blocking native alert for a clipboard failure is poor UX — it interrupts the user for a non-critical event. The existing `copied` state + `copiedMsg` text already serves as the appropriate feedback mechanism.

---

## Task 7 — Clean confirmed unused local code

### `lib/api.ts` — stale `trips` endpoint comments
Removed three stale `/* defined — not yet connected to UI */` comments from `endpoints.trips.accept`, `endpoints.trips.reject`, and `endpoints.trips.cancel`. Verification confirmed these endpoints are actively called from `app/(tabs)/trips.tsx` and `app/trips/[tripId].tsx`.

**Why:** Misleading comments cause unnecessary confusion for future developers and were flagged as a false positive in the audit verification.

**Not changed:** The `/* unused — reserved for future */` socket event constants (`DRIVER_LOCATION_ACK`, `DRIVER_STATUS_ONLINE`, `DRIVER_TRIP_START`, etc.) in `constants/socketEvents.ts` were left intact. The instructions specify not to remove anything that may be part of a future backend contract, and these constants are explicitly marked as such.

---

# Not Changed

| Area | Status |
|---|---|
| **Backend** | Untouched — no backend files exist in this repository |
| **API contracts** | Untouched — no endpoint paths, methods, or request/response shapes were changed |
| **Database** | Untouched |
| **Authentication flow** | Untouched — login/logout token handling is unchanged; only a cleanup call was appended to logout |
| **Payment logic** | Untouched |
| **Socket event contracts** | Untouched — no event names or payloads were changed |

---

# Verification

### Type check result

```
pnpm run typecheck
```

**17 pre-existing type errors found. 0 new errors introduced by these changes.**

All 17 errors exist in files that were not modified by this task:

| File | Error |
|---|---|
| `app.config.ts` | Implicit `any` on config binding (pre-existing) |
| `app/(shuttle)/home.tsx` | `activeLine` used before declaration (pre-existing) |
| `app/(tabs)/home.tsx` | Cannot find module `@/components/MapBackdrop` (pre-existing) |
| `app/(tabs)/wallet.tsx` | `queryFn` type mismatch with react-query (pre-existing) |
| `app/_layout.tsx` | Pre-existing errors |
| `app/ride/[rideId].tsx` | Pre-existing error |
| `app/selfie.tsx` | Pre-existing error |
| `app/shuttle/boarding.tsx` | Pre-existing error |
| `app/shuttle/trip-active.tsx` | Cannot find module `@/components/MapBackdrop` + `navigation` reference (pre-existing) |
| `lib/i18nContext.tsx` | `ViewStyle` not found (pre-existing) |
| `lib/postAuthRouter.ts` | Missing `approved` key in `STEP_ROUTES` (pre-existing) |

None of the 7 files modified in this task (`app/login.tsx`, `app/verify-otp.tsx`, `hooks/useActiveLocationTracking.ts`, `lib/backgroundLocationTask.ts`, `lib/authContext.tsx`, `lib/api.ts`, `app/(shuttle)/profile.tsx`) produced any type errors.
