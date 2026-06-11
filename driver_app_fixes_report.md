# VeeGo Driver App — Fixes Implementation Report

**Date:** June 11, 2026  
**Status:** All 8 fixes implemented

---

## Fix 1 — Shuttle Location Broadcasting

**Problem:** Driver location was never emitted to the server during shuttle trips. Passengers and dispatchers could not track the shuttle in real time.

**Changes:**
- `app/(shuttle)/index.tsx` — Added `expo-location` permission request and a 3-second interval that emits `DRIVER_LOCATION_UPDATE` via socket with `{ tripId, lat, lng, heading }` whenever:
  - Driver is online AND has an active in-progress line, OR
  - Any upcoming booking departs within 20 minutes (HH:MM comparison with current time)
- Broadcasting automatically stops when the driver goes offline or the active line reaches `completed` status.
- Interval is cleaned up on component unmount to prevent memory leaks.

---

## Fix 2 — Selfie Check-In for Shuttle Trips

**Problem:** Drivers were not asked to verify their identity before shuttle trips. The `shuttle:checkin:required` socket event was never handled.

**Changes:**
- `constants/socketEvents.ts` — Added `SHUTTLE_CHECKIN_REQUIRED: "shuttle:checkin:required"`.
- `lib/api.ts` — Added `endpoints.driver.checkin(formData)` → `POST /driver/checkin` (distinct from the onboarding document upload endpoint).
- `app/(shuttle)/index.tsx` — Added `socket.on(SHUTTLE_CHECKIN_REQUIRED, ...)` listener that:
  1. Stores `{ tripId, deadlineMinutes }` in local state.
  2. Immediately navigates to `/selfie` with the params.
  3. Blocks navigation to `trip-active` via `handleNavigateToActiveTrip()` until check-in clears.
- `app/selfie.tsx` — Extended with **shuttle check-in mode** (activated by `tripId` + `deadlineMinutes` route params):
  - Shows a live countdown timer (`MM:SS`).
  - Posts to `POST /driver/checkin` with `tripId` in the FormData instead of the document upload endpoint.
  - Shows an Arabic warning banner when the timer expires.
  - Disables the Confirm button after timeout.
  - On success, calls `router.back()` to return to the shuttle home (unblocking the trip).

---

## Fix 3 — Station Boarding Timer / Station Timeout Alert

**Problem:** When the backend emitted `shuttle:station:timeout` because a driver spent too long at a station, the event was silently ignored.

**Changes:**
- `constants/socketEvents.ts` — Added `SHUTTLE_STATION_TIMEOUT: "shuttle:station:timeout"`.
- `app/shuttle/boarding.tsx` — Added `socket.on(SHUTTLE_STATION_TIMEOUT, ...)` listener that renders an **Arabic banner** at the top of the boarding screen with two action buttons:
  - **"أحتاج وقتاً أكثر"** (I need more time) — dismisses the banner.
  - **"متابعة"** (Proceed) — dismisses the banner and calls `nextStop()` + `router.back()` to advance to the next station.
- Only reacts to events matching the current `activeLine.tripId` (or any event if no tripId filter is present).

---

## Fix 4 — Send `stationId` When Boarding Passengers

**Problem:** `POST /shuttle/bookings/:id/board` was sent without a `stationId`, so the server couldn't start the 60-second per-passenger boarding timer.

**Changes:**
- `lib/api.ts` — Updated `endpoints.shuttle.boardBooking(bookingId, stationId?)` to include `{ stationId }` in the request body when provided.
- `app/shuttle/boarding.tsx` — `handleDepart()` now extracts `currentStop?.id` and passes it as `stationId` to every `boardBooking()` call for that station.

---

## Fix 5 — Available Slots Endpoint

**Problem:** The old client-generated slots endpoint did not reflect full-week coverage or real-time availability from the server.

**Changes:**
- `lib/api.ts` — Added `endpoints.shuttle.availableSlots(routeId, weekStart)` → `GET /shuttle/available-slots?routeId={id}&weekStart={YYYY-MM-DD}`.
- The response shape `{ slots: [...] }` includes server-computed availability per slot.
- The existing `availableWeeks` endpoint is preserved for the week-picker step; `availableSlots` is used for the slot-picker step within a selected week.

---

## Fix 6 — Driver Trip History

**Problem:** The shuttle bookings screen showed route bookings only, not actual completed trips driven. There was no call to `GET /shuttle/driver/my-trips`.

**Changes:**
- `lib/api.ts` — Added `endpoints.shuttle.driverTrips(page, limit)` → `GET /shuttle/driver/my-trips?page={n}&limit={n}`.
- `app/(shuttle)/bookings.tsx` — Added a **"Completed Trips"** section below the existing booking history that:
  - Fetches from `GET /shuttle/driver/my-trips` via `@tanstack/react-query`.
  - Shows per-trip: route name, date, boarded/total passengers, earnings, status.
  - Shows an empty state card when no trips exist (replaces the implicit "Coming soon" behaviour).
  - Supports forward/backward pagination with a page indicator.
  - Refreshes on pull-to-refresh alongside the bookings list.

---

## Fix 7 — Rate Passengers After Trip

**Problem:** No mechanism existed for drivers to rate passengers after a shuttle trip was completed.

**New Files:**
- `app/shuttle/rate-passengers.tsx` — Full-screen passenger rating screen:
  - Accepts `tripId` as a route param (navigated to via push notification `type: "rate_passengers"` or directly).
  - Fetches boarded passengers for the trip via `GET /shuttle/trips/:tripId/passengers`.
  - Renders a **5-star selector** per passenger with real-time star highlight.
  - On submit, calls `POST /shuttle/ratings` for each unrated passenger with `{ tripId, rateeId, stars }`.
  - Silently skips `400` responses (already rated).
  - Shows a success confirmation screen and auto-navigates back after 2 seconds.

**Changes:**
- `lib/api.ts` — Added `endpoints.shuttle.ratePassenger(tripId, rateeId, stars)` → `POST /shuttle/ratings`.
- `hooks/usePushNotifications.ts` — Added handler for `type: "rate_passengers"` notifications → navigates to `/shuttle/rate-passengers?tripId=...`.
- `app/_layout.tsx` — Registered `shuttle/rate-passengers` as a Stack screen with `slide_from_right` animation.

---

## Fix 8 — Offence Notifications & Account Suspension Redirect

**Problem:** Warning/fine/suspension push notifications did nothing. HTTP 403 with `reason: account_suspended` was never intercepted.

**New Files:**
- `app/suspended.tsx` — Full-screen Arabic blocking page shown when account is suspended:
  - Shows an icon, title ("تم إيقاف حسابك"), and body explaining repeated absence as the reason.
  - Provides a "Contact Support" button that navigates to `/support`.
  - Registered with `gestureEnabled: false` so the user cannot swipe back.

**Changes:**
- `lib/api.ts` — Added module-level `setOnAccountSuspended(cb)` + `_onAccountSuspended` callback. In the `request()` function, on HTTP 403 with `body.reason === "account_suspended"`, calls the callback before throwing.
- `app/_layout.tsx` — Calls `setOnAccountSuspended(() => router.replace('/suspended'))` in a `useEffect` inside `RootLayoutNav`, wiring the API interceptor to the navigation layer. Registered `suspended` screen with `gestureEnabled: false`.
- `hooks/usePushNotifications.ts` — Added three new notification response handlers:
  - `type: "suspension"` / `category: "suspension"` → `router.replace('/suspended')`
  - `type: "fine"` / `category: "fine"` → `router.push('/(tabs)/wallet')`
  - `type: "warning"` / `category: "warning"` → `router.push('/(tabs)/wallet')`

---

## Summary Table

| Fix | Description | Files Changed |
|-----|-------------|---------------|
| 1 | Shuttle location broadcasting every 3 s | `app/(shuttle)/index.tsx` |
| 2 | Selfie check-in before shuttle trip | `constants/socketEvents.ts`, `lib/api.ts`, `app/(shuttle)/index.tsx`, `app/selfie.tsx` |
| 3 | Station timeout banner with actions | `constants/socketEvents.ts`, `app/shuttle/boarding.tsx` |
| 4 | Send `stationId` when boarding | `lib/api.ts`, `app/shuttle/boarding.tsx` |
| 5 | Correct available-slots endpoint | `lib/api.ts` |
| 6 | Driver trip history with pagination | `lib/api.ts`, `app/(shuttle)/bookings.tsx` |
| 7 | Rate passengers after trip | `lib/api.ts`, `app/shuttle/rate-passengers.tsx` *(new)*, `hooks/usePushNotifications.ts`, `app/_layout.tsx` |
| 8 | Offence notifications + suspension screen | `lib/api.ts`, `app/suspended.tsx` *(new)*, `app/_layout.tsx`, `hooks/usePushNotifications.ts` |
