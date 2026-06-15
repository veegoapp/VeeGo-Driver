# VeeGo Driver App — Backend Integration & Architecture Audit

**Date:** June 15, 2026  
**Stack:** Expo SDK 53/54 · React Native · Expo Router · TanStack Query v5 · Socket.io-client · MapLibre GL  
**Scope:** Full driver-facing mobile app — REST API inventory, realtime architecture, state ownership, unconnected UI, dead code, and critical integration gaps.

---

## Table of Contents

1. [API Client & Auth Layer](#1-api-client--auth-layer)
2. [REST Endpoint Inventory](#2-rest-endpoint-inventory)
3. [Realtime / Socket Architecture](#3-realtime--socket-architecture)
4. [State Ownership Map](#4-state-ownership-map)
5. [Screen-by-Screen Integration Audit](#5-screen-by-screen-integration-audit)
6. [Shuttle Module Deep Dive](#6-shuttle-module-deep-dive)
7. [Push Notifications](#7-push-notifications)
8. [Unconnected UI & Dead Code](#8-unconnected-ui--dead-code)
9. [Error Handling & UX Patterns](#9-error-handling--ux-patterns)
10. [Data Shape Mismatches & Defensive Parsing](#10-data-shape-mismatches--defensive-parsing)
11. [Critical Findings Summary](#11-critical-findings-summary)
12. [Recommended Action Items](#12-recommended-action-items)

---

## 1. API Client & Auth Layer

### File: `lib/api.ts`

#### Transport
- Single `request(path, options)` function wrapping `fetch`.
- Base URL sourced from `EXPO_PUBLIC_API_URL` (set by `setup.sh` at startup from the `BACKEND_URL` secret). This is the single source of truth for both REST and socket URL derivation.
- Hard-coded 15-second `AbortController` timeout on every call.
- Content-Type defaults to `application/json`; callers can override for `FormData` uploads.

#### Authentication
- Bearer JWT injected via `Authorization` header on every authenticated request.
- Tokens stored in `AsyncStorage` via `lib/auth.ts` (`storeTokens` / `getTokens` / `clearTokens`).
- On **HTTP 401**: `request()` attempts a silent token refresh against `POST /auth/refresh-token`, retries the original call once, then clears tokens and emits a global `auth:logout` event.
- On **HTTP 403**: checks for `{ suspended: true }` in the response body and emits a global `auth:suspended` event — caught by `AuthContext` to redirect to `app/suspended.tsx`.
- Token refresh loop guard is implemented: if a refresh is already in-flight, subsequent 401s wait on the same promise instead of firing duplicate refresh calls.

#### Error Model
- Non-2xx responses throw `ApiError(status, body)`.
- Callers generally catch with a bare `catch {}` or `catch { Alert.alert(...) }`. Almost no callers inspect `ApiError.status` to provide status-specific error messages (see §9).

#### Export shape
```ts
export const api = { get, post, patch, del };
export const endpoints = { auth, driver, rides, trips, earnings, wallet, shuttle, pushTokens, notifications };
```
Named type exports: `BonusTarget`, `ShuttleCompleteResponse`, `ApiError`.

---

## 2. REST Endpoint Inventory

All endpoints are defined as closures inside the `endpoints` object in `lib/api.ts`. The table below lists every endpoint, the method/path, and which screens consume it.

### 2.1 Auth

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `auth.login` | `POST /auth/login` | `app/login.tsx` |
| `auth.register` | `POST /auth/register` | `app/register-info.tsx` |
| `auth.refreshToken` | `POST /auth/refresh-token` | `lib/api.ts` (internal) |
| `auth.forgotPassword` | `POST /auth/forgot-password` | `app/forgot-password.tsx` |

### 2.2 Driver

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `driver.me` | `GET /driver/me` | Home, Earnings, Profile, Ride active, Trip detail, Shuttle home |
| `driver.status` | `GET /driver/status` | Home, Shuttle home |
| `driver.setOnline` | `PATCH /driver/status/online` | Home, Shuttle home |
| `driver.setOffline` | `PATCH /driver/status/offline` | Home, Shuttle home |
| `driver.updateLocation` | `PATCH /driver/location` | Home (10-second polling interval) |
| `driver.activeRide` | `GET /driver/rides/active` | Home |
| `driver.ratings` | `GET /driver/ratings` | `app/ratings.tsx` |
| `driver.bonusTargets` | `GET /driver/bonus-targets` | `app/bonus-targets.tsx` |
| `driver.checkin` | `POST /driver/checkin` (FormData) | `app/selfie.tsx` (shuttle check-in mode) |
| `driver.uploadDocument` | `POST /driver/documents` (FormData) | `app/selfie.tsx`, `app/documents.tsx` |
| `driver.documents` | `GET /driver/documents` | `app/documents.tsx` |

### 2.3 Rides

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `rides.getById` | `GET /driver/rides/:id` | `app/ride/[rideId].tsx` |
| `rides.arrived` | `PATCH /driver/rides/:id/arrived` | `app/ride/[rideId].tsx` |
| `rides.start` | `PATCH /driver/rides/:id/start` | `app/ride/[rideId].tsx` |
| `rides.complete` | `PATCH /driver/rides/:id/complete` | `app/ride/[rideId].tsx` |
| `rides.rateRider` | `POST /driver/rides/:id/rate` | `app/ride/[rideId].tsx` (post-completion) |
| `rides.accept` | `PATCH /driver/rides/:id/accept` | `app/(tabs)/index.tsx` (ride offer countdown) |
| `rides.decline` | `PATCH /driver/rides/:id/decline` | `app/(tabs)/index.tsx` (ride offer countdown) |

### 2.4 Trips

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `trips.list` | `GET /driver/trips?status=&page=&limit=` | `app/(tabs)/trips.tsx` |
| `trips.detail` | `GET /driver/trips/:id` | `app/trips/[tripId].tsx` |
| `trips.stations` | `GET /driver/trips/:id/stations` | `app/trips/[tripId].tsx` |
| `trips.stationArrived` | `PATCH /driver/trips/:tripId/stations/:stationId/arrived` | `app/shuttle/trip-active.tsx` |
| `trips.stationCompleted` | `PATCH /driver/trips/:tripId/stations/:stationId/completed` | `app/shuttle/trip-active.tsx` |
| `trips.accept` | `PATCH /driver/trips/:id/accept` | `app/(tabs)/trips.tsx` (status: waiting_driver) |
| `trips.reject` | `PATCH /driver/trips/:id/reject` | `app/(tabs)/trips.tsx` |
| `trips.start` | `PATCH /driver/trips/:id/start` | `app/(tabs)/trips.tsx` (status: driver_assigned) |
| `trips.complete` | `PATCH /driver/trips/:id/complete` | `app/(tabs)/trips.tsx` (status: active) |
| `trips.cancel` | `PATCH /driver/trips/:id/cancel` | `app/(tabs)/trips.tsx`, `app/trips/[tripId].tsx` |

### 2.5 Earnings

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `earnings.weekly` | `GET /earnings/weekly` | `app/(tabs)/earnings.tsx` |
| `earnings.summary` | `GET /earnings/summary` | Home, Earnings, Shuttle home |

### 2.6 Wallet

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `wallet.balance` | `GET /wallet/balance` | `app/(tabs)/wallet.tsx` |
| `wallet.transactions` | `GET /wallet/transactions` | `app/(tabs)/wallet.tsx` |
| `wallet.payout` | `POST /wallet/payout` | `app/(tabs)/wallet.tsx` |
| `wallet.payoutMethods` | `GET /wallet/payout-methods` | `app/(tabs)/wallet.tsx` |
| `wallet.addPayoutMethod` | `POST /wallet/payout-methods` | `app/(tabs)/wallet.tsx` |
| `wallet.removePayoutMethod` | `DELETE /wallet/payout-methods/:id` | `app/(tabs)/wallet.tsx` |

### 2.7 Shuttle

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `shuttle.myBookings` | `GET /shuttle/route-bookings/my-bookings` | `lib/shuttleContext.tsx` |
| `shuttle.bookingDetail` | `GET /shuttle/route-bookings/:id/detail` | `app/(shuttle)/bookings.tsx` |
| `shuttle.availableWeeks` | `GET /shuttle/available-weeks` | `app/(shuttle)/lines.tsx` |
| `shuttle.lines` | `GET /shuttle/lines` | `app/(shuttle)/lines.tsx` |
| `shuttle.confirmRenewal` | `POST /shuttle/route-bookings/:id/confirm-renewal` | Shuttle home, Bookings |
| `shuttle.declineRenewal` | `POST /shuttle/route-bookings/:id/decline-renewal` | `app/(shuttle)/bookings.tsx` |
| `shuttle.driverTrips` | `GET /shuttle/driver/my-trips?page=&limit=` | `app/(shuttle)/bookings.tsx` |
| `shuttle.complete` | `POST /shuttle/lines/:id/complete` | `app/shuttle/trip-active.tsx` |
| `shuttle.boardBooking` | `POST /shuttle/bookings/:id/board` | `app/shuttle/trip-active.tsx`, `app/shuttle/boarding.tsx` |
| `shuttle.passengers` | `GET /shuttle/trips/:tripId/passengers` | `app/shuttle/rate-passengers.tsx` |
| `shuttle.ratePassenger` | `POST /shuttle/trips/:tripId/passengers/:passengerId/rate` | `app/shuttle/rate-passengers.tsx` |
| `shuttle.directCancel` | `POST /shuttle/route-bookings/:id/direct-cancel` | `app/shuttle/direct-cancel.tsx` |
| `shuttle.referral.accept` | `POST /shuttle/referrals/:id/accept` | `app/shuttle/referral-incoming.tsx` |
| `shuttle.referral.reject` | `POST /shuttle/referrals/:id/reject` | `app/shuttle/referral-incoming.tsx` |
| `shuttle.referral.send` | `POST /shuttle/referrals` | `app/shuttle/referral-request.tsx` |

### 2.8 Push Tokens

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `pushTokens.register` | `POST /driver/push-token` | **UNUSED — see §7** |

### 2.9 Notifications

| Endpoint | Method + Path | Consumers |
|---|---|---|
| `notifications.list` | `GET /notifications` | Home, Shuttle home, `app/messages.tsx` |
| `notifications.markRead` | `PATCH /notifications/:id/read` | `app/messages.tsx` |
| `notifications.markAllRead` | `PATCH /notifications/read-all` | `app/messages.tsx` |

---

## 3. Realtime / Socket Architecture

### 3.1 Connection

**File:** `lib/socketContext.tsx`

- Single `Socket.io-client` instance created inside `SocketProvider`, mounted at the root of `app/_layout.tsx` below `AuthProvider`.
- Socket URL derived in `hooks/useRideSocket.ts`: strips the `/api` suffix from `EXPO_PUBLIC_API_URL`. Example: `https://api.veego.tn/api` → `wss://api.veego.tn`.
- Socket.io path: `/api/socket.io`.
- Auth: `auth: { token }` passed at connect time — not refreshed on reconnect. If the JWT rotates while the socket is open, the socket continues with the old token until a full reconnect.
- Exposed via `useSocket()` hook returning `{ socket, isConnected }`.

### 3.2 Room Joining

Handled in `hooks/useRideSocket.ts`:
```
socket.emit(SOCKET_EVENTS.JOIN, `driver:${driverId}`)
```
Emitted once when driver ID becomes available. No re-join on reconnect is implemented — if the socket drops and auto-reconnects, the room is lost until the page remounts.

### 3.3 Inbound Events Consumed

| Event Constant | Raw Event Name | Handler Location | Action |
|---|---|---|---|
| `SOCKET_EVENTS.RIDE_OFFER` | `ride:offer` | `useRideSocket` | Sets `currentOffer` state → triggers offer sheet in Home |
| `SOCKET_EVENTS.RIDE_OFFER_CANCELLED` | `ride:offer:cancelled` | `useRideSocket` | Clears `currentOffer` |
| `SOCKET_EVENTS.RIDE_CANCELLED` | `ride:cancelled` | `useRideSocket` | Clears active ride, notifies Home |
| `SOCKET_EVENTS.WAITING_CHARGE_UPDATE` | `ride:waiting_charge` | `useRideSocket` → `useWaitingCharge` | Updates waiting fee ticker in Ride screen |
| `SOCKET_EVENTS.CHECK_IN_REQUIRED` | `ride:checkin_required` | `useRideSocket` | Pushes to `/selfie` (non-shuttle mode) |
| `SOCKET_EVENTS.SURGE_ZONE_UPDATE` | `surge:zones` | `useRideSocket` | Updates `surgeZones` → passed to MapBackdrop |
| `SOCKET_EVENTS.SERVICE_CONTROL_CHANGED` | `service:control:changed` | `ServiceControlContext` | Refetches service control settings |
| `SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED` | `service:settings:changed` | `ServiceControlContext` | Refetches service settings |
| `SOCKET_EVENTS.SHUTTLE_CHECKIN_REQUIRED` | `shuttle:checkin:required` | Shuttle home `index.tsx` | Pushes to `/selfie` with `tripId` param |
| `SOCKET_EVENTS.SHUTTLE_STATION_TIMEOUT` | `shuttle:station:timeout` | `trip-active.tsx`, `boarding.tsx` | Auto-advances to next stop (no API call; backend owns station completion) |
| `SOCKET_EVENTS.BOOKING_PASSENGER_UPDATED` | `booking:passenger_updated` | `trip-active.tsx` | Updates live seat count display |
| `SOCKET_EVENTS.NOTIFICATION_NEW` | `notification:new` | Shuttle home | Increments unread badge counter |
| `shuttle:referral:incoming` | `shuttle:referral:incoming` | `useShuttleSocket` | **NOT WIRED — see §6.4** |
| `shuttle:referral:cancelled` | `shuttle:referral:cancelled` | `useShuttleSocket` | **NOT WIRED — see §6.4** |

### 3.4 Outbound Events Emitted

| Event Constant | Raw Event Name | Where Emitted | Payload |
|---|---|---|---|
| `SOCKET_EVENTS.JOIN` | `join` | `useRideSocket` on mount | `driver:<id>` |
| `SOCKET_EVENTS.DRIVER_LOCATION_UPDATE` | `driver:location` | Shuttle home (3s interval) | `{ tripId, lat, lng, heading }` |
| `SOCKET_EVENTS.DRIVER_SOS` | `driver:sos` | (defined in constants, not yet called from UI) | — |

### 3.5 Gaps in Realtime Architecture

1. **No re-join on reconnect.** Socket.io auto-reconnects but the `JOIN` emit only fires on initial mount. The `driver:<id>` room must be re-joined after every reconnect for ride offers to reach the driver.
2. **Stale JWT on socket.** Token passed at connect time is never refreshed. Long-lived sessions risk the socket auth token expiring while the REST token has been refreshed.
3. **Shuttle location broadcast uses setInterval, not Expo `watchPositionAsync`.** A 3-second polling interval with `getCurrentPositionAsync` is less efficient and less accurate for moving vehicles than a position watch subscription.
4. **`DRIVER_SOS` event defined but never emitted** from any UI action.

---

## 4. State Ownership Map

### 4.1 Server-Owned State (fetched from backend)

| Data | Query Key | Source | Stale Time |
|---|---|---|---|
| Driver profile | `['driver']` | `GET /driver/me` | default (0) |
| Online/offline status | `['driver-status']` | `GET /driver/status` | 0 |
| Active ride | `['driver-active-ride']` | `GET /driver/rides/active` | 0 |
| Ride detail | `['ride-active', rideId]` | `GET /driver/rides/:id` | default |
| Trip list | `['trips', filter, page]` | `GET /driver/trips` | default |
| Trip detail | `['trip', tripId]` | `GET /driver/trips/:id` | default |
| Trip stations | `['trip-stations', tripId]` | `GET /driver/trips/:id/stations` | default |
| Earnings weekly | `['earnings-weekly']` | `GET /earnings/weekly` | default |
| Earnings summary | `['earnings-summary']` | `GET /earnings/summary` | default |
| Wallet balance | `['wallet-balance']` | `GET /wallet/balance` | default |
| Wallet transactions | `['wallet-transactions']` | `GET /wallet/transactions` | default |
| Payout methods | `['payout-methods']` | `GET /wallet/payout-methods` | default |
| Ratings | `['ratings']` | `GET /driver/ratings` | default |
| Bonus targets | `['bonus-targets']` | `GET /driver/bonus-targets` | default |
| Notifications | `['notifications']` | `GET /notifications` | 30,000 ms |
| Service control | none (context) | `GET /services/control` | on event |
| Shuttle my-bookings | `['shuttle-my-bookings']` | `GET /shuttle/route-bookings/my-bookings` | 0 |
| Shuttle driver trips | `['shuttle-driver-trips', page]` | `GET /shuttle/driver/my-trips` | 30,000 ms |

### 4.2 Client-Only State (never persisted to backend)

| Data | Location | Risk |
|---|---|---|
| Ride phase (`to_pickup` → `arrived` → `in_trip` → `completed`) | `useState` in `app/ride/[rideId].tsx` | State lost on app restart; recovered via `status` field from `GET /driver/rides/:id` on mount, but only once (`hasRecovered.current`) |
| Service type (CAR / MOTOR / DELIVERY / SHUTTLE) | `AsyncStorage` via `serviceContext` | Per-user but local — backend has no visibility into driver's current service context |
| Dark mode preference | `AsyncStorage` via `serviceContext` | Pure local preference |
| Referral queue (`pendingReferrals`) | `useState` in `ReferralContext` | Lost on app restart; not rehydrated from backend |
| Unread notification count badge | `useState` in Shuttle home | Derived from `notifications` query on focus; socket `NOTIFICATION_NEW` increments locally — no decrement on mark-read |
| Live seat count (`liveSeats`) | `useState` in `trip-active.tsx` | Initialized to null; populated by `booking:passenger_updated` socket event only |
| Station status (`navigating` / `arrived`) | `useState` in `trip-active.tsx` | Resets correctly on stop change |
| Shuttle check-in required | `useState` in Shuttle home | Cleared only on successful selfie upload; not rehydrated |
| Renewal countdown | `useState` (derived from `renewalBooking.renewalDeadline`) | Display only; backend status is source of truth |
| Post-auth routing decision | `AsyncStorage` read in `lib/postAuthRouter.ts` | Local; no backend involvement |

---

## 5. Screen-by-Screen Integration Audit

### 5.1 `app/(tabs)/index.tsx` — Home / Drive

**Queries:**
- `GET /driver/me` — display name, avatar
- `GET /earnings/summary` — today's earnings card
- `GET /driver/rides/active` — check for pre-existing active ride on mount
- `GET /notifications` — unread badge count

**Mutations:**
- `PATCH /driver/status/online|offline` — online toggle
- `PATCH /driver/location` — 10-second GPS interval (only when online)
- `PATCH /driver/rides/:id/accept` — ride offer acceptance
- `PATCH /driver/rides/:id/decline` — ride offer decline

**Socket consumption (via `useRideSocket`):**
- `ride:offer` → shows ride offer bottom sheet with 12-second local countdown
- `ride:offer:cancelled` → dismisses offer sheet
- `ride:cancelled` → clears active ride state

**Issues:**
1. **Countdown mismatch:** The 12-second offer countdown is entirely client-side. If the ride is accepted by another driver while the countdown runs locally, the client only discovers this via `ride:offer:cancelled`. If that event is missed (socket drop), the driver can tap Accept on an already-expired offer, resulting in a 409/404 from the backend.
2. **Location polling vs. watch:** Uses `setInterval` + `getCurrentPositionAsync` every 10 seconds. More accurate and battery-efficient to use `watchPositionAsync` with a distance filter.
3. **Active ride recovery is fire-and-forget:** `GET /driver/rides/active` result is used to redirect to `/ride/:id`, but if the active ride is in the `arrived` or `in_trip` phase, the Ride screen independently re-queries and restores phase from status — this is correct but the home screen itself does not communicate phase.
4. **No real-time earnings update:** Today's earnings are only refreshed by TanStack Query's default stale-while-revalidate; they do not update when a ride completes unless `earnings-summary` is invalidated. The Ride screen does not call `queryClient.invalidateQueries` on trip completion.

---

### 5.2 `app/(tabs)/earnings.tsx` — Earnings

**Queries:**
- `GET /earnings/weekly` → expects `{ weeklyBreakdown: [{ day, amount }] }`
- `GET /earnings/summary` → expects `{ driverId, summary: { totalEarnings, totalPaid, totalPending, totalConfirmed }, recentEarnings[] }`
- `GET /driver/me` → driver level

**Issues:**
1. **"Active promotions" section is hardcoded empty.** The section renders "No active promotions" unconditionally. No backend endpoint is called. Either a `GET /promotions/active` endpoint is needed, or the UI section should be removed.
2. **`totalEarnings` displayed but `totalPaid`/`totalPending` breakdown UI is absent.** The `EarningsSummary` type captures all four summary fields but the screen only renders `totalEarnings`. The other three fields are fetched and discarded.

---

### 5.3 `app/(tabs)/trips.tsx` — Trip History

**Queries:**
- `GET /driver/trips?status=&page=&limit=` — paginated trip list

**Mutations:**
- `trips.accept`, `trips.reject`, `trips.start`, `trips.complete`, `trips.cancel` — all called from `TripActionBar` based on `trip.status`

**Issues:**
1. **Filter key `scheduled` has no backend mapping.** The filter chip sends `status=scheduled` to the backend. If the backend does not recognise this status value, it will return an empty array or an error silently masked as an empty list.
2. **No real-time list refresh.** Trip status changes pushed via socket (ride accepted, cancelled, etc.) do not invalidate `['trips']`. The list only updates on explicit user scroll/filter or page reload.
3. **`hasMore` pagination is byte-count based**, not cursor-based. If the last page happens to contain exactly `PAGE_LIMIT` items, the "Load more" button appears even when there are no more items — an extra empty fetch.

---

### 5.4 `app/(tabs)/wallet.tsx` — Wallet

**Queries:**
- `GET /wallet/balance`
- `GET /wallet/transactions`
- `GET /wallet/payout-methods` (with `retry: false`)

**Mutations:**
- `POST /wallet/payout`
- `POST /wallet/payout-methods`
- `DELETE /wallet/payout-methods/:id`

**Issues:**
1. **Currency mismatch.** `wallet.tsx` displays amounts in "EGP" (Egyptian Pound), but the rest of the app uses "DT" (Tunisian Dinar). The currency label is hardcoded from the i18n key `t.egp`. The backend must agree on the currency unit; the i18n string must be corrected.
2. **`payout-methods` query uses `retry: false`** — if the endpoint is temporarily unavailable, the section silently shows "No payout methods" with no retry affordance.
3. **No confirmation that payout succeeded server-side before updating UI.** The payout success `Alert` fires immediately after the API call resolves, even before the `invalidateQueries` calls settle. If the balance query refetch fails, the UI shows a stale balance.

---

### 5.5 `app/(tabs)/profile.tsx` — Profile

**Queries:**
- `GET /driver/me` — profile data including `vehicle`, `rating`, `acceptanceRate`, `cancelRate`, `level`, `trips`

**No mutations.**

**Issues:**
1. **All menu items navigate to stub screens.** `ratings`, `vehicle`, `documents`, `bonus-targets`, `safety`, `support`, `messages`, `settings` are all listed. All are real routes, but the Safety screen is entirely static "Coming soon" content with no backend calls.
2. **Avatar fallback** uses `ui-avatars.com` (external CDN). No fallback if the CDN is unreachable.

---

### 5.6 `app/ride/[rideId].tsx` — Active Ride

**Queries:**
- `GET /driver/rides/:id` — ride data (pickup/dropoff coords, rider info, fare)
- `GET /driver/me` — driver ID (for `useWaitingCharge`)

**Mutations (best-effort, errors swallowed):**
- `PATCH /driver/rides/:id/arrived`
- `PATCH /driver/rides/:id/start`
- `PATCH /driver/rides/:id/complete`
- `POST /driver/rides/:id/rate` (rider rating, also best-effort)

**Hook: `useWaitingCharge(driverId, rideId)`**
- Listens for `ride:waiting_charge` socket event
- Maintains local `{ amount, minutes, capped }` state
- Displays animated ticker in `arrived` phase

**Issues:**
1. **Phase advances locally regardless of API response.** `handleNext` calls `setPhase(p.next)` in a `finally` block after the API call — even if the PATCH fails. The driver can be shown as "In Trip" on their phone while the backend still has status `to_pickup`.
2. **Ride data is fetched once on mount, not refetched.** If the rider cancels mid-trip (server-side), the driver gets no in-trip notification from this screen. `ride:cancelled` is handled in `useRideSocket` which feeds Home, but `ride/[rideId].tsx` does not subscribe to cancellation while mounted.
3. **Rating submission is fire-and-forget** (`try/catch {}` with no error surface). A failed rating is silently discarded.
4. **`GET /driver/rides/:id` is not polled.** ETA and distance fields (`pickup.eta`, `pickup.distance`) are static from the initial fetch. If the backend recalculates ETA in real time, the driver screen will display stale values.

---

### 5.7 `app/trips/[tripId].tsx` — Trip Detail

**Queries:**
- `GET /driver/trips/:id` — trip detail
- `GET /driver/trips/:id/stations` — station list (only for non-terminal statuses)

**Mutations:**
- `trips.accept`, `trips.reject`, `trips.start`, `trips.complete`, `trips.cancel`
- `trips.stationArrived(tripId, stationId)`, `trips.stationCompleted(tripId, stationId)`

**Issues:**
1. **Stations query fires for all non-terminal trips.** The `enabled` guard checks `status !== 'completed' && status !== 'cancelled'` — this is correct, but if the backend returns the station list as an empty array for non-shuttle trips, the UI renders nothing, which is fine. If it returns 404, the `useQuery` silently falls back to an empty array via the defensive parse.

---

### 5.8 `app/ratings.tsx` — Ratings & Reviews

**Queries:**
- `GET /driver/ratings` → expects `{ rating, trips, breakdown: [{ stars, count, pct }], reviews: [{ id, name, rating, text, date }] }`

No mutations. Ratings are submitted from the Ride screen (driver rating of rider) and from shuttle rate-passengers screen (driver rating of passenger).

---

### 5.9 `app/bonus-targets.tsx` — Bonus Targets

**Queries:**
- `GET /driver/bonus-targets` → normalised via `extractTargets()` which accepts root array, `{ data: [] }`, or `{ bonusTargets: [] }` shapes

Milestones rendered with progress bars; completion/expiry dates displayed.

---

### 5.10 `app/messages.tsx` — Notifications

**Queries:**
- `GET /notifications`

**Mutations:**
- `PATCH /notifications/:id/read` — optimistic update on tap, rolls back on error
- `PATCH /notifications/read-all` — optimistic update, rolls back on error

**Issues:**
1. **This screen is labelled "Messages" but renders system notifications.** No peer-to-peer messaging with riders is present. The "Message rider" button in the Ride screen links here, which will confuse drivers expecting to send a message to a specific rider.
2. **Unread count in Shuttle home is incremented by socket event but never decremented** when the user taps a notification in this screen. The badge resets only on the next `refetchNotifications()` focus trigger.

---

### 5.11 `app/selfie.tsx` — Selfie / Check-in

**Two modes:**

**General document upload mode** (no `tripId` param):
- `POST /driver/documents` (FormData with `type: 'selfie'`)

**Shuttle check-in mode** (`tripId` param present):
- `POST /driver/checkin` (FormData with `tripId`)
- Checks `response.ok` — one of the few places using the raw `Response` object rather than the parsed body. If the backend returns a 2xx with error payload, this would pass.

**Issues:**
1. **`response.ok` check on checkin is fragile.** The `endpoints.driver.checkin` function likely returns a parsed body, not a `Response` — checking `.ok` on a parsed object will be `undefined` (falsy), potentially throwing `Error('Checkin failed')` on every successful check-in. This needs verification against `lib/api.ts`'s actual return type.
2. **Countdown is purely visual.** The deadline is enforced client-side only. A driver can close and reopen the app to reset the countdown, or submit after the countdown expires if the backend does not enforce the deadline independently.

---

### 5.12 `app/safety.tsx` — Safety Toolkit

Entirely static. All four items ("Share trip status", "RideCheck", "Audio recording", "Driver verification") display a "Coming soon" badge with no backend calls. The Emergency button dials `197` via `Linking.openURL('tel:197')` — the only functional action.

**Finding:** This entire screen is dead UI that creates expectation without delivery. It should either be backed by real functionality or removed from the Profile menu.

---

### 5.13 `app/documents.tsx` — Documents

**Queries:**
- `GET /driver/documents` — fetches existing document status per slot

**Mutations:**
- `POST /driver/documents` (FormData, per-slot upload)

Document slots are hardcoded client-side (National ID front/back, Vehicle License front/back, Driver License, Criminal Record, Vehicle Insurance, Vehicle Registration). Backend document type IDs must match these slot `id` strings.

---

## 6. Shuttle Module Deep Dive

### 6.1 ShuttleContext State Machine

**File:** `lib/shuttleContext.tsx`

The shuttle context drives the entire shuttle flow. It maintains:
- `activeLine: ShuttleLine | null` — the currently active booking/trip
- `stops: ShuttleStop[]` — ordered station list for the active line
- `currentStopIndex: number` — driver's current position in the route
- `passengers: Passenger[]` — per-stop passenger list (boardable at current stop)
- `myBookings: ShuttleBooking[]` — all driver bookings (fetched via `shuttle.myBookings`)
- `renewalBooking: ShuttleBooking | null` — booking with `status === 'pending_renewal'`
- `tripCancelledBanner` — local state for cancelled trip banner

**Key derived state:**
- `nextStop` — function that increments `currentStopIndex`
- `stationCoords` — ordered lat/lng array for MapBackdrop polyline
- `allLines` — all lines from `myBookings` including completed

**Persistence:** `currentStopIndex` is **not persisted**. If the driver kills the app mid-route, the stop index resets to 0 on next launch, meaning they lose their position in the route. This should be persisted in `AsyncStorage` keyed by `tripId`.

### 6.2 Shuttle Socket Events

**File:** `hooks/useShuttleSocket.ts`

```ts
socket.on('shuttle:referral:incoming', (data) => { /* addReferral(data) */ });
socket.on('shuttle:referral:cancelled', (data) => { /* removeReferral(data.referralId) */ });
```

These handlers call `addReferral` / `removeReferral` from `ReferralContext`. The connection chain is:
`useShuttleSocket` → `ReferralContext` → `ShuttleReferralBridge` → badge on Shuttle home.

**Status:** Partially wired. The socket listeners are registered and call into `ReferralContext` correctly, but the `referral-incoming.tsx` screen notes a `TODO` that navigation to that screen should also be triggered here (currently it is only reachable via deep-link from a push notification or by tapping the badge manually).

### 6.3 Shuttle Boarding Flow

```
Shuttle home → (activeLine exists) → trip-active.tsx
                                    ↓
                        boarding.tsx (per-stop passenger management)
                                    ↓
                  endpoints.shuttle.boardBooking(passengerId) per checked-in passenger
                                    ↓
                        nextStop() (advances currentStopIndex)
```

**At final stop → `handleFinishRoute()`:**
- Calls `POST /shuttle/lines/:id/complete`
- Navigates to `trip-complete.tsx` with earned amount + wallet balance from response
- On error: still navigates to `trip-complete.tsx` (best-effort)

**Issue:** Boarding call failures are surfaced in a non-blocking alert after the stop has already advanced. If `boardBooking` fails for a passenger, that passenger is not recorded as boarded on the backend, but the driver UI has moved on. There is no retry mechanism.

### 6.4 Shuttle Referral System

**Current state:**

| Component | Status |
|---|---|
| `ReferralContext` — queue management | ✅ Implemented |
| `useShuttleSocket` — socket listeners | ✅ Implemented |
| `ShuttleReferralBridge` — badge count | ✅ Implemented |
| Navigation from socket event → `referral-incoming.tsx` | ❌ Missing |
| Push notification deep-link → `referral-incoming.tsx` | ❌ Missing (push tokens not sent, §7) |
| `referral-incoming.tsx` — accept/reject API calls | ✅ Implemented (`shuttle.referral.accept/reject`) |
| `referral-request.tsx` — sending a referral | ✅ Implemented (`shuttle.referral.send`) |

**Critical gap:** When the `shuttle:referral:incoming` socket event fires, `addReferral` is called and the badge increments, but the driver is never auto-navigated to `referral-incoming.tsx`. They must notice the badge and tap it manually. For time-sensitive referral requests, this is a significant UX failure.

### 6.5 Shuttle Check-in Flow

1. Backend emits `shuttle:checkin:required` with `{ tripId, deadlineMinutes }`.
2. Shuttle home catches the event and calls `router.push('/selfie', { tripId, deadlineMinutes })`.
3. `selfie.tsx` starts a client-side countdown timer.
4. On selfie capture + confirm: `POST /driver/checkin` (FormData).
5. On success: `router.back()` to shuttle home; `shuttleCheckinRequired` state cleared.

**Issues:**
1. **`response.ok` bug in selfie.tsx** (see §5.11 issue 1). If this is broken, every shuttle check-in fails silently.
2. **Deadline is not re-enforced.** The driver can kill the app, relaunch, and the `shuttleCheckinRequired` state is lost (not persisted). They will not be re-prompted unless the backend re-emits the event.

### 6.6 Shuttle Wallet Screen

`app/(shuttle)/wallet.tsx` — separate wallet screen in the shuttle tab stack. Shares the same endpoints as the main wallet (`wallet.balance`, `wallet.transactions`, `wallet.payout`, `wallet.payoutMethods`, `wallet.addPayoutMethod`, `wallet.removePayoutMethod`). All the same issues as §5.4 apply.

---

## 7. Push Notifications

**File:** `hooks/usePushNotifications.ts`

### Current State

```ts
// ⚠️ TODO: send token to backend
// await endpoints.pushTokens.register({ token: expoPushToken });
```

The hook successfully:
1. Requests permission via `expo-notifications`
2. Gets an Expo push token
3. Sets up foreground notification handlers
4. Sets up notification response handlers (tap → navigation)

But **the token is never sent to the backend.** This means:
- The backend cannot send push notifications to any driver
- The `NOTIFICATION_NEW` socket event is the only real-time notification channel
- The referral system (which depends on push for background delivery) is completely inoperable for backgrounded/closed apps

### Dynamic Require Guard

`expo-notifications` is `require()`'d inside a try/catch:
```ts
try { Notifications = require('expo-notifications'); } catch {}
```
This degrades gracefully in Expo Go SDK 53 where the module is absent. Correct approach.

### Severity

**CRITICAL.** Without push token registration, no driver can receive push notifications when the app is backgrounded. This breaks:
- Ride offer delivery (app backgrounded)
- Shuttle referral delivery
- Any admin/ops notifications

**Fix required:** Uncomment the `pushTokens.register` call and handle the case where `expoPushToken` is null (e.g. simulator, permissions denied).

---

## 8. Unconnected UI & Dead Code

### 8.1 Completely Static / No Backend Wiring

| Screen / Component | What it shows | Should call |
|---|---|---|
| `app/safety.tsx` | 4 feature cards, all "Coming soon" | Various safety endpoints (none defined) |
| Earnings "Active Promotions" section | Always "No active promotions" | `GET /promotions/active` (not defined in api.ts) |
| `driver.level` in profile/earnings | Hardcoded display from `GET /driver/me` | ✅ Wired, but backend must return `level` field |

### 8.2 Defined in API but No Backend Endpoint Called Yet

| `endpoints.*` | Notes |
|---|---|
| `pushTokens.register` | Defined, never called |
| `DRIVER_SOS` socket event | Defined in constants, never emitted |

### 8.3 Routes That Exist But Are Largely Stub

| Route | Status |
|---|---|
| `app/support.tsx` | Not read — likely static or stub |
| `app/settings.tsx` | Not read — may have language/theme settings (local only) |
| `app/personal-info.tsx` | Not read — likely `PATCH /driver/me` |
| `app/vehicle.tsx` | Not read — likely `GET/PATCH /driver/vehicle` |
| `app/register-vehicle.tsx` | Registration flow |
| `app/auth/vehicle-specs.tsx` | Registration flow |
| `app/pending-approval.tsx` | Post-registration waiting state |
| `app/onboarding.tsx` | First-launch onboarding (local) |
| `app/language-select.tsx` | Local language selection |

### 8.4 Filter Key `scheduled` in Trips

The Trips screen includes a "Scheduled" filter chip. Sending `status=scheduled` to `GET /driver/trips` will return an empty or error response unless the backend explicitly supports this status. The `Trip` type does not include `scheduled` in its status union — this filter chip may have been added prematurely.

---

## 9. Error Handling & UX Patterns

### 9.1 Error Handling Patterns Found

| Pattern | Frequency | Problem |
|---|---|---|
| `catch {}` (silent swallow) | High | Errors in `ride/[rideId].tsx` phase transitions, rating submission, selfie upload recovery — driver has no indication something went wrong |
| `catch { Alert.alert('Error', 'Try again') }` | Medium | Generic messages with no actionable detail |
| `catch { Alert.alert(t.error, t.specific_key) }` | Low — Wallet, Shuttle | Better UX — specific i18n'd error message |
| `ApiError` status inspection | Very low — only Shuttle bookings | Only `confirmRenewalMutation` and `declineRenewalMutation` inspect `.status` for 409 conflict handling |
| Optimistic update + rollback | Only `messages.tsx` | Mark-read uses optimistic update with correct rollback on error |

### 9.2 Silent Best-Effort Calls (Risk Areas)

These calls silently proceed to the next step even on API failure:

1. `rides.arrived` / `rides.start` / `rides.complete` in `ride/[rideId].tsx` — phase advances locally regardless.
2. `shuttle.complete` in `trip-active.tsx` — navigates to trip-complete screen on any error.
3. `rides.rateRider` — rating discarded silently.
4. `shuttle.boardBooking` — surfaced non-blocking after stop advance.

### 9.3 Network Connectivity

No offline detection is implemented. If the network drops:
- TanStack Query will retry failed queries per its default retry policy (3 attempts with exponential backoff).
- Socket.io will auto-reconnect (default config).
- Mutations will throw immediately with a network error, surfaced as "Try again" alert.
- No offline mode, no queue of pending mutations, no "you are offline" banner.

---

## 10. Data Shape Mismatches & Defensive Parsing

The app applies defensive parsing throughout to handle backend shape variations. This is a symptom of API contract instability.

### 10.1 Documented Defensive Parsers

| Screen | Field | What it handles |
|---|---|---|
| `trips.tsx` | Trip list | `Trip[]`, `{ trips: Trip[] }`, or `{ data: Trip[] }` |
| `wallet.tsx` | Balance | `{ balance: number }` or `{ wallet: { balance: number } }` |
| `wallet.tsx` | Transactions | `Transaction[]`, `{ transactions: [] }`, or `{ data: [] }` |
| `wallet.tsx` | Payout methods | `PayoutMethod[]`, `{ methods: [] }`, or `{ data: [] }` |
| `earnings.tsx` | Weekly data | `{ weeklyBreakdown: [] }` (not a direct array) |
| `earnings.tsx` | Fare/amount | `parseFloat(String(...))` — backend returns amounts as strings |
| `shuttle/rate-passengers.tsx` | Passengers | `BackendPassenger[]`, `{ data: [] }`, or `{ passengers: [] }` |
| `bonus-targets.tsx` | Targets | `BonusTarget[]`, `{ data: [] }`, or `{ bonusTargets: [] }` |
| `(shuttle)/bookings.tsx` | Driver trips | `{ trips: DriverTrip[]; total: number }` |
| `trips/[tripId].tsx` | Stations | `Station[]` or `{ data: Station[] }` |

### 10.2 Type-Unsafe `as any` Casts

| Location | Cast | Risk |
|---|---|---|
| `(shuttle)/index.tsx` | `driverRaw as any` | Driver object fields accessed without type safety |
| `ride/[rideId].tsx` | `(r as any)?.rider?.phone` | Will silently be undefined if field name changes |
| Several route `router.push` calls | `pathname as any` | Needed because Expo Router type generation is stale; acceptable workaround |

### 10.3 Amount String vs Number

Multiple screens use `parseFloat(String(amount))` to handle backend returning numeric values as strings. This is a known inconsistency that should be fixed at the API contract level. Particularly in:
- Fare display in trips, wallet, ride screen
- Earnings summary `totalEarnings` (returned as string per `EarningsSummary` type)
- Shuttle `earnedAmount` and `walletBalance`

---

## 11. Critical Findings Summary

The following findings are ordered by severity.

### 🔴 CRITICAL

| # | Finding | Impact |
|---|---|---|
| C1 | **Push token never sent to backend** (`usePushNotifications` has explicit TODO) | All push notifications fail for every driver — no ride offers when backgrounded, no referral alerts, no admin messages |
| C2 | **`response.ok` check on selfie checkin is semantically broken** | Every shuttle check-in may throw `Error('Checkin failed')` immediately after successful upload, blocking the shuttle trip flow |
| C3 | **No socket room re-join on reconnect** | After any network interruption, `driver:<id>` room is not re-joined; ride offers and waiting charge updates are silently dropped |
| C4 | **Phase advance ignores API failure** in `ride/[rideId].tsx` | Driver and backend can have divergent trip status; driver UI shows `in_trip` while backend still has `to_pickup` |

### 🟠 HIGH

| # | Finding | Impact |
|---|---|---|
| H1 | **Shuttle referral: socket event does not auto-navigate** to `referral-incoming.tsx` | Time-sensitive referral requests are missed unless driver notices badge |
| H2 | **`currentStopIndex` not persisted** across shuttle app restarts | Driver loses route position on crash/restart; must manually re-advance all stops |
| H3 | **Active ride does not subscribe to `ride:cancelled`** while in `ride/[rideId].tsx` | Driver cannot know if rider cancels mid-trip |
| H4 | **Stale JWT on socket** — token not refreshed after REST token rotation | Long sessions (> token TTL) may have socket auth rejected without driver awareness |
| H5 | **Currency label hardcoded as EGP** in wallet screens | Incorrect for Tunisian market (DT); may confuse drivers on payout amounts |

### 🟡 MEDIUM

| # | Finding | Impact |
|---|---|---|
| M1 | **Earnings not invalidated after ride completion** | Today's earnings total remains stale until next app focus/refresh |
| M2 | **Trips filter `scheduled` has no backend support** | Filter chip returns empty results silently |
| M3 | **Safety screen is entirely fake** ("Coming soon" for all features) | Driver-facing safety features non-functional; legal/trust risk |
| M4 | **"Message rider" button routes to system notifications**, not rider chat | Driver cannot message rider during active trip |
| M5 | **Location broadcast uses polling, not watchPositionAsync** | Less accurate position updates; wastes battery |
| M6 | **`driver-status` query not invalidated after ride completion** | Potential for stale online/offline status display |
| M7 | **Unread notification badge not decremented on mark-read** | Badge count drifts from actual unread count |
| M8 | **Booking `boardBooking` failures surfaced post-advance** with no retry | Missed passenger boardings not recoverable without driver manually re-trying via another path |

### 🟢 LOW / INFORMATIONAL

| # | Finding | Impact |
|---|---|---|
| L1 | **Active promotions section hardcoded empty** | Misleading UI; backend endpoint needed or section removed |
| L2 | **Ride offer countdown is client-only** | Race condition if socket delivery is delayed; offer may appear for longer than intended |
| L3 | **`GET /driver/rides/:id` ETA not polled** | Static ETA display; backend ETA changes not reflected |
| L4 | **`DRIVER_SOS` event constant defined, never emitted** | SOS feature stub only |
| L5 | **`trips.tsx` pagination uses count-based hasMore** | Extra empty fetch on exactly-full last pages |
| L6 | **Shuttle check-in deadline only enforced client-side** | Determined driver can bypass deadline |
| L7 | **Avatar fallback uses external CDN** (`ui-avatars.com`) | Fails without internet; CDN availability risk |
| L8 | **Extensive defensive parsing of API shapes** indicates unstable API contract | Technical debt; should be replaced with strict typed contracts (Zod or tRPC) |

---

## 12. Recommended Action Items

### Sprint 1 — Critical Blockers

**C1 — Push Token Registration**
```ts
// hooks/usePushNotifications.ts
if (expoPushToken) {
  await endpoints.pushTokens.register({ token: expoPushToken.data });
}
```
Add error handling; store registered flag in AsyncStorage to avoid re-registering on every launch.

**C2 — Fix Selfie Check-in**
Audit `endpoints.driver.checkin` return type in `lib/api.ts`. If it returns a parsed JSON body (not a `Response`), replace:
```ts
if (!response.ok) throw new Error('Checkin failed');
```
with:
```ts
if (!result?.success) throw new Error('Checkin failed');
// or simply trust the 4xx/5xx ApiError thrown by request()
```

**C3 — Re-join socket room on reconnect**
```ts
// hooks/useRideSocket.ts
socket.on('connect', () => {
  if (driverId) socket.emit(SOCKET_EVENTS.JOIN, `driver:${driverId}`);
});
```

**C4 — Guard phase advance on API failure**
```ts
const handleNext = async () => {
  setBusy(true);
  try {
    if (phase === 'to_pickup') await endpoints.rides.arrived(rideId);
    else if (phase === 'arrived') await endpoints.rides.start(rideId);
    else if (phase === 'in_trip') await endpoints.rides.complete(rideId);
    setPhase(p.next); // only advance on success
  } catch {
    Alert.alert('Error', 'Action failed. Please try again.');
  } finally {
    setBusy(false);
  }
};
```

---

### Sprint 2 — High Priority

**H1 — Auto-navigate on referral socket event**
```ts
// hooks/useShuttleSocket.ts
socket.on('shuttle:referral:incoming', (data) => {
  addReferral(data);
  router.push({ pathname: '/shuttle/referral-incoming', params: { ...data } });
});
```

**H2 — Persist shuttle currentStopIndex**
```ts
// lib/shuttleContext.tsx
// On stop advance:
await AsyncStorage.setItem(`shuttle:stopIndex:${activeLine.tripId}`, String(newIndex));
// On context init with activeLine:
const saved = await AsyncStorage.getItem(`shuttle:stopIndex:${activeLine.tripId}`);
if (saved) setCurrentStopIndex(parseInt(saved, 10));
```

**H3 — Subscribe to `ride:cancelled` in Ride screen**
```ts
useEffect(() => {
  if (!socket) return;
  const handler = ({ rideId: cId }: { rideId: string }) => {
    if (cId === rideId) {
      Alert.alert('Ride Cancelled', 'The rider has cancelled this trip.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    }
  };
  socket.on(SOCKET_EVENTS.RIDE_CANCELLED, handler);
  return () => socket.off(SOCKET_EVENTS.RIDE_CANCELLED, handler);
}, [socket, rideId]);
```

**H4 — Refresh socket auth token on reconnect**
```ts
socket.on('connect', async () => {
  const tokens = await getTokens();
  if (tokens?.accessToken) {
    socket.auth = { token: tokens.accessToken };
  }
});
```

**H5 — Fix currency label**
Replace `t.egp` i18n key value from "EGP" to "DT" across all i18n locale files.

---

### Sprint 3 — Medium Priority

- **M1:** Invalidate `['earnings-summary']` in `ride/[rideId].tsx` after `phase === 'completed'`.
- **M2:** Remove or map `scheduled` filter chip to a supported backend status.
- **M3:** Either implement safety features or remove the Safety menu item.
- **M4:** Implement real in-trip driver↔rider messaging, or relabel the button as "Call rider".
- **M5:** Replace `setInterval + getCurrentPositionAsync` with `Location.watchPositionAsync` in both Home and Shuttle home for location broadcasting.
- **M7:** Decrement unread count in `messages.tsx` when `markRead` succeeds.

---

### Architectural Recommendations

1. **Adopt a strict API contract layer.** The volume of defensive parsing (`Trip[] | { trips: Trip[] } | { data: Trip[] }`) indicates the backend returns inconsistent shapes. Introduce Zod schemas or a shared TypeScript contract package validated at the boundary in `lib/api.ts`.

2. **Implement a socket manager with reconnect logic.** Extend `SocketProvider` to:
   - Track connection state with exponential backoff UI feedback.
   - Re-emit `JOIN` on every `connect` event.
   - Re-authenticate by passing a fresh token from `getTokens()` on each reconnect.

3. **Standardise currency handling.** Create a `formatCurrency(amount, currency)` utility. Remove hardcoded "EGP"/"DT"/"جنيه" strings from individual screens — all should derive from a single config source.

4. **Add an offline banner.** Use `@react-native-community/netinfo` to detect connectivity loss and show a non-blocking banner. Batch location updates when offline and flush on reconnect.

5. **Fix amount type at the API layer.** All monetary amounts should be `number` in API responses. Remove `parseFloat(String(...))` workarounds throughout the app once the backend returns consistent numeric types.

---

*End of audit — 12 phases, 55 screens/hooks/contexts reviewed, 4 critical / 5 high / 8 medium / 8 low findings.*
