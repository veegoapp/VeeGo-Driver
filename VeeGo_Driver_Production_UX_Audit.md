# VeeGo Driver — Production UX State Audit

> **Audit Date:** July 13, 2026  
> **Scope:** All major screens — Authentication, Main Driver Experience, Shuttle, Account  
> **Type:** READ ONLY — no files were modified

---

## Executive Summary

| Metric | Value |
|---|---|
| **Overall Production Readiness Score** | **6.2 / 10** |
| **Screens Reviewed** | 30 |
| **Critical Issues** | 6 |
| **High Priority Issues** | 9 |
| **Improvements** | 11 |

### Biggest Risks

1. **Silent Online/Offline Toggle Failure** — If the go-online or go-offline API call fails, the driver's UI shows them as online/offline but the backend has a different state. The driver can be invisible to riders or receive requests while believing they are offline. No error is ever surfaced.

2. **Ride Accept Proceeds Regardless of API Success** — `acceptRequest` navigates to the active ride screen even if the accept API call throws. The driver can enter a "ghost ride" state where they are driving but no active ride exists on the backend.

3. **Push Notification Token Registration is Silent** — If the device token fails to register with the backend, the driver will silently never receive push notifications with no indication anything went wrong.

4. **Wallet/Earnings Error States Defined but Never Shown** — `wallet.tsx` and `earnings.tsx` compute `balanceError`, `txError`, and `summaryError` but never render any error UI. Drivers see a blank or stale screen with no way to know a load failure occurred.

5. **Chat Send Failure Provides No Error Message** — When a message fails to send, the text is restored to the input field but no toast, alert, or indicator tells the driver what happened.

6. **Terms Accept Failure is Silent** — If a driver's attempt to accept terms of service fails, the app silently swallows the error, potentially leaving the driver stuck without explanation.

---

## Critical Issues

### C-01 — Go Online/Offline API Failure is Silently Ignored
| Field | Detail |
|---|---|
| **File** | `app/(tabs)/home.tsx` |
| **Screen** | Home — Online/Offline Toggle |
| **Missing Behavior** | No error message when goOnline/goOffline API call fails. UI switches state but backend does not. |
| **User Impact** | Driver believes they are online but receives no rides; or believes they are offline but backend still dispatches requests. Revenue loss, safety risk. |
| **Severity** | 🔴 Critical |

### C-02 — Ride Accept Navigates to Ride Screen on API Failure
| Field | Detail |
|---|---|
| **File** | `app/(tabs)/home.tsx` — `acceptRequest` function |
| **Screen** | Home — Ride Request Sheet |
| **Missing Behavior** | `endpoints.rides.accept` failure is caught and discarded; app navigates to ride screen regardless. |
| **User Impact** | Driver enters ghost ride — navigates to pickup but no active ride exists on the server. Rider is left waiting; driver loses earnings. |
| **Severity** | 🔴 Critical |

### C-03 — Push Token Registration Fails Silently
| Field | Detail |
|---|---|
| **File** | `hooks/usePushNotifications.ts` (line ~55) |
| **Screen** | Global (on app launch) |
| **Missing Behavior** | `endpoints.pushTokens.register(t).catch(() => {})` — failure is swallowed. |
| **User Impact** | Driver never receives push notifications for ride requests, bookings, or account changes with no warning. |
| **Severity** | 🔴 Critical |

### C-04 — Wallet and Earnings Error States Never Rendered
| Field | Detail |
|---|---|
| **File** | `app/(tabs)/wallet.tsx`, `app/earnings.tsx` |
| **Screen** | Wallet, Earnings |
| **Missing Behavior** | `balanceError`, `txError`, `summaryError` variables are computed but no error UI branch exists in JSX. |
| **User Impact** | Driver sees blank/empty/stale data with no explanation. Cannot distinguish "no earnings" from "failed to load." May believe balance is zero when it is not. |
| **Severity** | 🔴 Critical |

### C-05 — Chat Message Send Failure Provides No Feedback
| Field | Detail |
|---|---|
| **File** | `app/ride/chat.tsx` |
| **Screen** | Ride Chat |
| **Missing Behavior** | On send failure, text is restored to input but no error alert, toast, or visual indicator is shown. |
| **User Impact** | Driver types a message, hits send, sees the input restored, and has no idea if the message was delivered. May attempt to re-type and resend with duplicate risk. |
| **Severity** | 🔴 Critical |

### C-06 — Terms Accept Fails Silently
| Field | Detail |
|---|---|
| **File** | `app/(tabs)/home.tsx` (lines ~88–90) |
| **Screen** | Home — Terms Modal |
| **Missing Behavior** | `endpoints.terms.accept` catch block does nothing. Driver's acceptance is not recorded but the modal may dismiss. |
| **User Impact** | Driver may be shown the terms modal repeatedly, or worse — backend never records acceptance, causing downstream access issues. |
| **Severity** | 🔴 Critical |

---

## Screen Audit Table

| Screen / File | Loading | Error | Empty | Retry | Button Disabled | Refresh | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **LOGIN** `app/login.tsx` | ✅ | ✅ | N/A | ❌ | ✅ | N/A | ⚠️ Partial |
| **OTP VERIFICATION** `app/verify-otp.tsx` | ✅ | ✅ | N/A | ✅ (resend) | ✅ | N/A | ✅ Good |
| **REGISTRATION INFO** `app/register-info.tsx` | ✅ | ✅ | N/A | ❌ | ✅ | N/A | ⚠️ Partial |
| **VEHICLE INFO** `app/register-vehicle.tsx` | ✅ | ✅ | N/A | ✅ | ✅ | N/A | ✅ Good |
| **DOCUMENT UPLOAD** `app/register-documents.tsx` / `app/documents.tsx` | ✅ | ✅ | N/A | ✅ (per slot) | ✅ | N/A | ✅ Good |
| **SELFIE VERIFICATION** `app/selfie.tsx` | ✅ | ✅ | N/A | ✅ (retake) | ✅ | N/A | ✅ Good |
| **PENDING APPROVAL** `app/pending-approval.tsx` | ✅ | ⚠️ silent poll | N/A | ✅ (manual + auto) | N/A | ✅ (15s poll) | ⚠️ Partial |
| **SUSPENDED** `app/suspended.tsx` | N/A | N/A | N/A | N/A | N/A | N/A | ✅ Static |
| **HOME** `app/(tabs)/home.tsx` | ⚠️ partial | ❌ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ Issues |
| **ONLINE/OFFLINE TOGGLE** (home.tsx) | ✅ | ❌ | N/A | ❌ | ✅ | N/A | ❌ Issues |
| **RIDE REQUESTS** (home.tsx) | ⚠️ | ❌ | N/A | ❌ | ⚠️ | N/A | ❌ Issues |
| **ACTIVE RIDE** `app/ride/[rideId].tsx` | ✅ | ✅ | N/A | ⚠️ | ✅ | N/A | ⚠️ Partial |
| **RIDE RATING** `app/ride/[rideId].tsx` | ✅ | ⚠️ | N/A | ❌ | ✅ | N/A | ⚠️ Partial |
| **CHAT** `app/ride/chat.tsx` | ✅ | ❌ | ✅ | ❌ | ✅ | N/A | ⚠️ Partial |
| **TRIP HISTORY** `app/trips.tsx` | ✅ | ✅ | ✅ | ❌ | N/A | ❌ no PTR | ⚠️ Partial |
| **TRIP DETAILS** `app/trip/[tripId].tsx` | ✅ | ✅ | N/A | ❌ | ✅ | ❌ | ⚠️ Partial |
| **SHUTTLE HOME** `app/(shuttle)/home.tsx` | ✅ | ⚠️ silent toggle | ✅ | ❌ | ✅ | ⚠️ | ⚠️ Partial |
| **SHUTTLE TRIPS (HISTORY)** `app/shuttle/history.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ manual | ✅ Good |
| **ACTIVE SHUTTLE TRIP** `app/shuttle/trip-active.tsx` | ✅ | ✅ | N/A | ✅ (per pax) | ✅ | N/A | ✅ Good |
| **PASSENGER BOARDING** `app/shuttle/boarding.tsx` | ✅ | ⚠️ depart gap | ⚠️ waiting only | ❌ | ✅ | N/A | ⚠️ Partial |
| **PASSENGER RATINGS** `app/shuttle/rate-passengers.tsx` | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ⚠️ Partial |
| **BOOKINGS** `app/(shuttle)/bookings.tsx` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ PTR | ✅ Good |
| **PROFILE** `app/(tabs)/profile.tsx` | ✅ | ❌ | ❌ | ❌ | ⚠️ partial | ❌ | ❌ Issues |
| **PERSONAL INFO** `app/personal-info.tsx` | ✅ | ✅ | ✅ (—) | ❌ | ✅ | ❌ | ⚠️ Partial |
| **VEHICLE** `app/vehicle.tsx` | ✅ | ✅ | ✅ | ✅ | N/A | ✅ PTR | ✅ Good |
| **WALLET** `app/(tabs)/wallet.tsx` | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ Issues |
| **PAYOUT ACCOUNTS** `app/payout-accounts.tsx` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ PTR | ✅ Good |
| **RATINGS** `app/ratings.tsx` | ✅ | ✅ | ✅ | ❌ | N/A | ❌ | ⚠️ Partial |
| **SUPPORT** `app/support.tsx` | ✅ | ✅ | N/A | N/A | ✅ | N/A | ✅ Good |
| **SETTINGS** `app/settings.tsx` | N/A | N/A | N/A | N/A | N/A | N/A | ✅ Static |

**Legend:** ✅ Implemented · ⚠️ Partial · ❌ Missing · N/A Not Applicable  
**PTR** = Pull-to-Refresh

---

## Async Action Audit

| Action | File | Loading Shown | Button Disabled | Duplicate Prevention | Success Feedback | Failure Feedback |
|---|---|:---:|:---:|:---:|:---:|:---:|
| Login | `app/login.tsx` | ✅ | ✅ `disabled={loading}` | ✅ | ✅ navigate | ✅ inline error |
| Verify OTP | `app/verify-otp.tsx` | ✅ | ✅ `if(loading) return` | ✅ | ✅ navigate | ✅ error state |
| Resend OTP | `app/verify-otp.tsx` | ✅ | ✅ `resending` state | ✅ 60s cooldown | ✅ | ✅ |
| Submit Registration | `app/register-info.tsx` | ✅ | ✅ `!canContinue` | ✅ | ✅ navigate | ✅ Alert |
| Submit Vehicle Info | `app/register-vehicle.tsx` | ✅ | ✅ `!canContinue \|\| submitting` | ✅ | ✅ navigate | ✅ Alert |
| Upload Document | `app/documents.tsx` | ✅ per slot | ✅ per slot | ✅ | ✅ icon update | ✅ error icon + retry |
| Selfie Upload | `app/selfie.tsx` | ✅ | ✅ `isUploading` | ✅ | ✅ navigate | ✅ Alert |
| Go Online | `app/(tabs)/home.tsx` | ✅ | ✅ `togglingOnline` + 2s debounce | ✅ | ✅ toggle state | ❌ **NONE** |
| Go Offline | `app/(tabs)/home.tsx` | ✅ | ✅ | ✅ | ✅ toggle state | ❌ **NONE** |
| Accept Ride | `app/(tabs)/home.tsx` | ⚠️ animation only | ⚠️ sheet hides (no explicit disabled) | ⚠️ **Race possible** | ✅ navigate | ❌ **NONE** |
| Decline Ride | `app/(tabs)/home.tsx` | ⚠️ animation only | ⚠️ | ✅ | ✅ dismiss | ❌ **NONE** |
| Arrive at Pickup / Next Step | `app/ride/[rideId].tsx` | ✅ | ✅ `busy` state | ✅ | ✅ phase change | ✅ Alert |
| Complete Ride | `app/ride/[rideId].tsx` | ✅ | ✅ `busy` state | ✅ | ✅ rating modal | ✅ Alert |
| Rate Passenger | `app/ride/[rideId].tsx` | ✅ | ✅ `ratingSubmitting` | ✅ | ✅ navigate | ⚠️ no message |
| Send Chat Message | `app/ride/chat.tsx` | ✅ | ✅ `sending` state | ✅ | ✅ message appears | ❌ **NO ERROR MSG** |
| Payout / Withdraw | `app/(tabs)/wallet.tsx` | ✅ | ✅ `isPayingOut` | ✅ | ✅ Alert | ✅ Alert |
| Add Payout Account | `app/payout-accounts.tsx` | ✅ | ✅ `isAdding` | ✅ | ✅ list refreshes | ✅ Alert |
| Delete Payout Account | `app/payout-accounts.tsx` | ✅ per row `busyId` | ✅ | ✅ | ✅ list refreshes | ✅ Alert |
| Update Profile | `app/personal-info.tsx` | ✅ | ✅ `isPending` | ✅ | ✅ | ✅ Alert |
| Submit Support Ticket | `app/support.tsx` | ✅ | ✅ `isSubmitting` | ✅ `if(isSubmitting) return` | ✅ | ✅ Alert |
| Board Passenger (Shuttle) | `app/shuttle/boarding.tsx` | ✅ per pax | ✅ `loadingPassengerId` | ✅ | ✅ state update | ✅ Alert |
| No-Show Passenger | `app/shuttle/boarding.tsx` | ✅ per pax | ✅ | ✅ | ✅ | ✅ Alert |
| Depart (Shuttle) | `app/shuttle/boarding.tsx` | ❌ | ❌ **No busy state** | ❌ **Duplicate possible** | ✅ navigate | ⚠️ partial |
| Accept Terms | `app/(tabs)/home.tsx` | ✅ `acceptLoading` | ✅ | ✅ | ✅ modal closes | ❌ **NONE** |
| Shuttle Online Toggle | `app/(shuttle)/home.tsx` | ✅ `onlineLoading` | ✅ | ✅ | ✅ | ❌ **NONE** |
| Renew Shuttle Contract | `app/(shuttle)/home.tsx` | ✅ | ✅ | ✅ | ✅ Alert | ✅ Alert |

---

## Silent Failure Findings

### SF-01 — Go Online/Offline Error Swallowed
- **File:** `app/(tabs)/home.tsx`
- **Pattern:** `try { await goOnline() } catch { /* nothing */ }`
- **Impact:** Driver state desync between app and backend — **high severity**

### SF-02 — Terms Accept Error Swallowed
- **File:** `app/(tabs)/home.tsx` (lines ~88–90)
- **Pattern:** `endpoints.terms.accept(...).catch(() => {})` — catch body empty
- **Impact:** Driver may never have terms recorded; possible account access issues

### SF-03 — Ride Accept/Decline Errors Swallowed
- **File:** `app/(tabs)/home.tsx`
- **Pattern:** Both `acceptRequest` and `dismissRequest` catch and discard errors
- **Impact:** Ghost ride risk on accept; booking may persist on decline

### SF-04 — Push Notification Token Registration Silent
- **File:** `hooks/usePushNotifications.ts` (~line 55)
- **Pattern:** `endpoints.pushTokens.register(t).catch(() => {})`
- **Impact:** Driver never receives push notifications without any warning

### SF-05 — Background Location Sync Failures Silent
- **File:** `hooks/useActiveLocationTracking.ts` (~line 32)
- **Pattern:** `syncPending().catch(() => {})`
- **Impact:** Offline GPS buffers are never synced to server; trip routes may be incomplete or inaccurate

### SF-06 — Pending Approval Status Poll Silent
- **File:** `app/pending-approval.tsx`
- **Pattern:** `fetchStatus` has `catch { // silent }` — poll just stops updating
- **Impact:** Driver on pending approval screen may see stale status indefinitely if network fails

### SF-07 — Login Terms Prefetch Silent
- **File:** `app/login.tsx`
- **Pattern:** `endpoints.terms.fetchDriver().catch(() => {/* fail silently */})`
- **Impact:** Low severity; terms modal may not show updated terms. Acceptable as a prefetch.

### SF-08 — AsyncStorage Failures in OTP and ServiceContext
- **File:** `app/verify-otp.tsx`, `lib/serviceContext.tsx` (multiple lines ~51–135)
- **Pattern:** `AsyncStorage.getItem/setItem(...).catch(() => { /* ignore */ })`
- **Impact:** User preferences (theme, service type) may silently fail to persist or restore. Low individual impact but cumulative UX degradation.

### SF-09 — Chat Send Failure No Message
- **File:** `app/ride/chat.tsx`
- **Pattern:** Catch restores input text but shows no alert/toast
- **Impact:** Driver doesn't know if message was delivered

### SF-10 — Linking/Share Failures Silent in Trip Active
- **File:** `app/shuttle/trip-active.tsx` (lines ~381, 407, 446, 461)
- **Pattern:** `Linking.openURL(...).catch(() => {})`, `Share.share(...).catch(() => {})`
- **Impact:** If a driver tries to call support or share trip info and the action fails, no feedback is given

### SF-11 — Wallet/Earnings isError Never Rendered
- **File:** `app/(tabs)/wallet.tsx`, `app/earnings.tsx`
- **Pattern:** `isError` / `balanceError` / `summaryError` defined but no JSX branch renders error UI
- **Impact:** Driver sees blank screen with no recovery option

### SF-12 — Home Screen driverLoading/earningsLoading isError Not Checked
- **File:** `app/(tabs)/home.tsx`
- **Pattern:** Loading states handled; `isError` not checked or rendered for driver stats and earnings queries
- **Impact:** Home screen shows empty stats silently on API failure

---

## Recommended Fix Priority

### 1. Release Blockers

| # | Issue | File | Fix Needed |
|---|---|---|---|
| RB-01 | Go Online/Offline error swallowed; state desync | `app/(tabs)/home.tsx` | Show `Alert.alert` on catch; revert toggle state on failure |
| RB-02 | Ride accept navigates on API failure | `app/(tabs)/home.tsx` | Await accept API before navigating; show error if it fails |
| RB-03 | Push token registration silent | `hooks/usePushNotifications.ts` | Log + retry with backoff; optionally surface warning if repeated failures |
| RB-04 | Terms accept silent failure | `app/(tabs)/home.tsx` | Show `Alert.alert` on catch; do not dismiss modal on failure |
| RB-05 | Wallet/Earnings error state never rendered | `app/(tabs)/wallet.tsx`, `app/earnings.tsx` | Add `isError` JSX branch with error message + retry button |
| RB-06 | Chat send failure provides no feedback | `app/ride/chat.tsx` | Add `Alert.alert` or inline error indicator on send failure |

### 2. High Priority Fixes

| # | Issue | File | Fix Needed |
|---|---|---|---|
| HP-01 | Shuttle online toggle silent failure | `app/(shuttle)/home.tsx` | Show error alert on catch; revert toggle state |
| HP-02 | Ride decline (dismiss) silent failure | `app/(tabs)/home.tsx` | Show error alert; optionally retry |
| HP-03 | Accept ride — no explicit button disable before API | `app/(tabs)/home.tsx` | Set busy flag before API call to prevent double-tap race |
| HP-04 | Depart button (shuttle boarding) — no busy state | `app/shuttle/boarding.tsx` | Add `isDeparting` state; disable button + show spinner |
| HP-05 | Background location sync silent | `hooks/useActiveLocationTracking.ts` | Retry with backoff; surface error if sync fails repeatedly |
| HP-06 | Home screen isError not checked for driver/earnings queries | `app/(tabs)/home.tsx` | Add error fallback for stats and earnings sections |
| HP-07 | Pending approval poll fails silently | `app/pending-approval.tsx` | Show "Could not check status" message on repeated failures |
| HP-08 | Trip history — no pull-to-refresh | `app/trips.tsx` | Add `RefreshControl` component |
| HP-09 | Ratings screen — no pull-to-refresh | `app/ratings.tsx` | Add `RefreshControl` component |

### 3. Improvements

| # | Issue | File | Fix Needed |
|---|---|---|---|
| I-01 | Login — no retry on failure | `app/login.tsx` | Already shows error inline; consider "Retry" or auto-focus on field |
| I-02 | Registration info — generic error message | `app/register-info.tsx` | Use server error message instead of generic `t.reg_info_err` |
| I-03 | Profile screen — no error state for driver data query | `app/(tabs)/profile.tsx` | Add error view for `isError` case |
| I-04 | Profile screen — no pull-to-refresh | `app/(tabs)/profile.tsx` | Add `RefreshControl` |
| I-05 | Personal info — no pull-to-refresh | `app/personal-info.tsx` | Add `RefreshControl` |
| I-06 | AsyncStorage failures in serviceContext — silent | `lib/serviceContext.tsx` | At minimum, log errors; consider user notification if theme/preference cannot persist |
| I-07 | Shuttle history — "refresh" resets pagination but is not standard PTR | `app/shuttle/history.tsx` | Replace or supplement with `RefreshControl` |
| I-08 | Wallet — no pull-to-refresh | `app/(tabs)/wallet.tsx` | Add `RefreshControl` to balance + transaction list |
| I-09 | Ride decline API failure not surfaced | `app/(tabs)/home.tsx` | Even a silent retry would improve reliability |
| I-10 | Sharing/Linking failures in shuttle trip-active | `app/shuttle/trip-active.tsx` | Catch and show brief toast/alert when phone call or share fails |
| I-11 | Rate passenger — no error message on submit failure | `app/ride/[rideId].tsx` | Add `Alert.alert` in the rating submit catch block |

---

## Summary

The VeeGo Driver app has a **solid foundation** — loading indicators and button-disabled patterns are correctly implemented on the majority of mutation actions, and the shuttle flow in particular has strong error handling with per-passenger retry logic. However, several critical gaps exist in the highest-traffic flows (home screen, online toggle, ride accept) where silent failures can cause serious operational issues for drivers. The wallet and earnings screens have non-functional error states, and the chat screen leaves drivers with no feedback on failed messages. Addressing the six release blockers is essential before production launch.
