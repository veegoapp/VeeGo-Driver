# VeeGo Driver App — Full Audit Report

> **Generated:** 2025-06-15  
> **Stack:** Expo SDK 54 / React Native · Expo Router · pnpm · TanStack Query v5 · Socket.IO client · MapLibre GL  
> **Active Service:** SHUTTLE only (Car / Scooter / Delivery: coming soon)  
> **Backend:** 320 REST endpoints · 40 socket events

---

## 1. Project Structure

### Folder Tree

```
/
├── app/                          Expo Router screen files (file-based routing)
│   ├── _layout.tsx               Root layout: font loading, auth guard, all providers
│   ├── index.tsx                 Splash/redirect: checks auth → login or post-auth route
│   ├── login.tsx                 Login screen (credential + password)
│   ├── register-info.tsx         Registration form (name, email, phone, password, optional IDs)
│   ├── register-documents.tsx    Document upload flow (license, registration, photo, selfie)
│   ├── selfie.tsx                Face verification — used in registration AND shuttle check-in
│   ├── pending-approval.tsx      Shown after registration until admin approves
│   ├── service-select.tsx        Service type chooser (Shuttle/Car/Scooter/Delivery)
│   ├── vehicle.tsx               Read-only vehicle info viewer (not a registration form)
│   ├── documents.tsx             Read-only document status viewer
│   ├── personal-info.tsx         Edit personal info (name, email, DOB)
│   ├── forgot-password.tsx       Forgot password → reset code flow
│   ├── onboarding.tsx            Onboarding slides (new user intro)
│   ├── language-select.tsx       Language picker screen (EN / AR)
│   ├── suspended.tsx             Account suspended error screen
│   ├── messages.tsx              Notifications list screen
│   ├── safety.tsx                Safety toolkit screen
│   ├── support.tsx               Contact support / ticket submission
│   ├── settings.tsx              App settings (dark mode, sound, notifications)
│   ├── ratings.tsx               Driver ratings & reviews viewer
│   ├── +not-found.tsx            404 fallback screen
│   ├── (shuttle)/                Shuttle tab group (active service)
│   │   ├── _layout.tsx           Shuttle tab navigator (5 tabs: Home, Lines, Bookings, Wallet, Profile)
│   │   ├── index.tsx             Shuttle Home — online toggle, active trip, bookings, earnings
│   │   ├── lines.tsx             Shuttle Lines — browse routes, book weekly slots
│   │   ├── bookings.tsx          My Bookings — upcoming & past shuttle bookings
│   │   ├── wallet.tsx            Wallet — balance, earnings chart, payout, transactions
│   │   └── profile.tsx           Profile — driver info, settings, language, sign out
│   ├── (tabs)/                   Car/Ride tab group (coming soon / future)
│   │   ├── _layout.tsx           Ride tab navigator (Home, Trips, Earnings, Wallet, Profile)
│   │   ├── index.tsx             Car Home — online toggle, ride offer popup, GPS tracking
│   │   ├── trips.tsx             Trip history list
│   │   ├── earnings.tsx          Earnings breakdown
│   │   ├── wallet.tsx            Car wallet
│   │   └── profile.tsx           Car profile
│   ├── shuttle/                  Full-screen shuttle trip screens (no tab bar)
│   │   ├── trip-active.tsx       Active trip: station progress, navigation, complete trip
│   │   ├── boarding.tsx          Passenger boarding: toggle check-in per passenger
│   │   └── rate-passengers.tsx   Rate passengers after trip completion
│   ├── ride/
│   │   └── [rideId].tsx          Active car ride screen (accept → arrived → start → complete)
│   └── trips/
│       └── [tripId].tsx          Trip detail screen (shuttle or car)
│
├── components/
│   ├── BottomTabBar.tsx          Custom bottom tab bar (car/tabs group)
│   ├── ShuttleTabBar.tsx         Custom bottom tab bar (shuttle group)
│   ├── GlassView.tsx             Glassmorphism card component
│   ├── MapBackdrop.tsx           Platform router → native or web map
│   ├── MapBackdrop.native.tsx    MapLibre GL native map component
│   ├── MapBackdrop.web.tsx       Placeholder map for web
│   ├── ErrorBoundary.tsx         React error boundary wrapper
│   ├── ErrorFallback.tsx         Fallback UI for caught errors
│   ├── KeyboardAwareScrollViewCompat.tsx  Cross-platform keyboard scroll
│   └── ServiceBlockedScreen.tsx  "Coming soon" overlay for blocked services
│
├── hooks/
│   ├── useColors.ts              Theme-aware color hook (light/dark)
│   ├── usePushNotifications.ts   Expo push token registration
│   ├── useRideSocket.ts          Car-ride socket event handler hook
│   ├── useServiceGuard.ts        Guard: blocks screen if service is not active
│   └── useWaitingCharge.ts       Waiting charge state during car rides
│
├── lib/
│   ├── api.ts                    All API endpoints + fetch wrapper + token refresh
│   ├── auth.ts                   SecureStore/AsyncStorage token I/O + JWT decode
│   ├── authContext.tsx            Auth state provider (token, user, login, logout)
│   ├── shuttleContext.tsx         Shuttle data provider (routes, bookings, trips, passengers)
│   ├── serviceContext.tsx         Service type + dark mode persistence
│   ├── serviceControlContext.tsx  Backend-driven service availability controls
│   ├── socketContext.tsx          Shared Socket.IO connection (JWT auth, reconnect)
│   ├── postAuthRouter.ts          Navigate to correct dashboard after login
│   ├── i18nContext.tsx            Bilingual i18n (EN/AR), RTL flag, full translation map
│   └── iconMap.tsx                Feather icon name→component map
│
├── constants/
│   ├── colors.ts                 Static light/dark color palette
│   └── socketEvents.ts           All socket event name constants
│
├── scripts/
│   └── setup.sh                  Dev environment setup script
│
├── .env / .env.example           EXPO_PUBLIC_API_URL configuration
├── app.json                      Expo app config (name: VeeGo Driver, SDK 54)
├── package.json                  Dependencies: expo, tanstack-query, socket.io-client, maplibre-gl, etc.
└── tsconfig.json                 TypeScript config (strict, path aliases)
```

### Navigation Structure

```
/ (index.tsx)
├── Loading: shows splash
├── Not authenticated → /login
│   ├── → /register-info → /register-documents → /selfie → /pending-approval
│   ├── → /forgot-password
│   └── → Login success → navigateAfterAuth()
│       ├── Returning (SHUTTLE stored) → /(shuttle)  [5-tab group]
│       ├── Returning (CAR stored)     → /(tabs)     [5-tab group]
│       └── New driver                → /service-select → /(shuttle) or /(tabs)
└── Authenticated
    ├── /(shuttle)              Shuttle home (index)
    │   ├── → /shuttle/trip-active    Active trip full-screen
    │   │   └── → /shuttle/boarding  Passenger boarding
    │   ├── → /selfie (check-in mode, params: tripId, deadlineMinutes)
    │   ├── → /messages, /safety, /support, /vehicle, /documents
    │   └── [tabs] lines, bookings, wallet, profile
    └── /(tabs)                 Car home (index)
        ├── → /ride/[rideId]    Active car ride
        └── [tabs] trips, earnings, wallet, profile
```

### Entry Point
`app/index.tsx` — checks `AuthContext.isLoading` → then checks token existence → redirects accordingly.

---

## 2. Authentication & Registration

### Login Flow

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Phone/email + password login | ✅ | `POST /driver/auth/login` ✅ | — |
| Returns `accessToken` + `refreshToken` | ✅ | Stored in SecureStore (native) / AsyncStorage (web) | Web uses AsyncStorage (less secure) |
| Auto-login on app restart | ✅ | `authContext.tsx` reads token on mount | — |
| Token refresh on 401 | ✅ | Single-flight refresh via `POST /auth/refresh` | — |
| Logout | ✅ | `POST /driver/auth/logout` + clears tokens | — |
| Forgot password | ✅ | `POST /driver/auth/forgot-password` + `POST /driver/auth/reset-password` | Reset code entry UI exists but is basic |
| Account suspended redirect | ✅ | 403 `account_suspended` intercepted → `/suspended` | — |

### Registration Flow

| Screen / Step | Exists | Connected | Issues |
|---|---|---|---|
| Registration form (name, email, phone, password) | ✅ `register-info.tsx` | `POST /driver/auth/register` ✅ | No OTP step — credential+password only |
| **OTP verification screen** | ❌ | `POST /auth/verify-otp` — NOT IMPLEMENTED | Phone number is not verified with OTP |
| Service selection screen | ✅ `service-select.tsx` | `GET /services/control` ✅ — driven by backend | All 4 services shown; Car/Scooter/Delivery disabled via backend control |
| Shuttle-only enforcement | ✅ | Backend `coming_soon` / `unavailable` mode disables other services | ❌ But driver can technically still select CAR if backend mark it available |
| Personal info (name, national ID) | ⚠️ | `register-info.tsx` collects name + optional `nationalId` | Combined with registration step, not a separate screen |
| **Vehicle info registration (dropdowns)** | ❌ | `GET /vehicles/brands`, `GET /vehicles/brands/:id/models`, `GET /vehicles/models/:id/years`, `GET /vehicles/colors` — NONE CONNECTED | `vehicle.tsx` is READ-ONLY; no vehicle registration form with brand/model/year/color dropdowns exists |
| Document upload — Driving license front | ✅ `register-documents.tsx` | `POST /driver/me/documents` (FormData) ✅ | Camera + gallery allowed (spec says camera-only) |
| Document upload — Driving license back | ✅ | Same endpoint | Camera + gallery |
| Document upload — Vehicle registration front | ✅ | Same endpoint | Camera + gallery |
| Document upload — Vehicle registration back | ✅ | Same endpoint | Camera + gallery |
| Document upload — Personal photo | ✅ | Same endpoint | Camera + gallery |
| Document upload — Vehicle photo | ✅ | Same endpoint | Camera + gallery |
| Document upload — Criminal record | ❓ | Not explicitly separated — all docs use same upload endpoint | Unclear if type discrimination is enforced |
| Face selfie / verification | ✅ `selfie.tsx` | `POST /driver/me/documents` (onboarding) or `POST /driver/checkin` (shuttle) | Camera preferred, falls back to gallery if camera permission denied (❌ spec: camera-only) |
| Pending approval screen | ✅ `pending-approval.tsx` | Shown after registration — no API polling | ❌ Not polling `GET /driver/me/status` to auto-advance when approved |

### Key Auth Issues Summary
1. **No OTP screen** — phone number not verified during registration
2. **No vehicle registration form** with dropdown-linked brand/model/year/color
3. **Document uploads allow gallery** — spec requires camera-only
4. **Pending approval screen** does not poll backend for approval status

---

## 3. Home Screen — Shuttle

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Driver online/offline toggle | ✅ | `PATCH /driver/status/online` + `PATCH /driver/status/offline` ✅ | Status synced from `GET /driver/me/status` on mount |
| Today's trips / upcoming bookings | ✅ | `GET /shuttle/route-bookings` via shuttleContext ✅ | Refetches every 60s |
| Active trip card (in-progress line) | ✅ | `GET /driver/trips` + `GET /driver/trips/:id` ✅ | Shows current + next stop, progress bar, boarded count |
| Earnings summary | ✅ | `GET /driver/earnings/summary` ✅ | Shows total earnings as "DT" (Tunisian Dinar) — may not match backend currency |
| Notifications bell | ✅ | Routes to `/messages` | ❌ Dot always shows red regardless of unread count |
| Weekly renewal banner | ✅ | Renewal deadline computed from `myBookings` data | Countdown timer in-app; `POST /shuttle/route-bookings/:id/confirm-renewal` ✅ |
| Shuttle check-in pending banner | ✅ | Triggered by `shuttle:checkin:required` socket event | Routes to `/selfie` with tripId param |
| Auto-cancelled trip banner | ✅ | Triggered by `notification:new` socket (category="trip") | Shown as dismissable banner |
| Location broadcasting (when online + active/departing) | ✅ | Socket `driver:location:update` every 3s | Only when active line or departure within 20 min; skipped on web |
| Dark/light mode toggle | ✅ | Via `useService().isDarkMode` + `serviceContext` | Persisted in AsyncStorage |
| Driver name from API | ✅ | `GET /driver/me` ✅ | Uses `any` cast on response |

---

## 4. Shuttle Schedule Screen

`(shuttle)/lines.tsx` — Route browsing and weekly slot booking.

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Browse available routes | ✅ | `GET /shuttle/lines` ✅ (60s refetch) | Routes mapped in shuttleContext |
| View timeslots per route | ✅ | `GET /shuttle/timeslots/:routeId` ✅ | Loaded on route selection |
| View available weeks | ✅ | `GET /shuttle/lines/:routeId/available-weeks` ✅ | Week selector in lines screen |
| Available slots filter | ✅ | `GET /shuttle/available-slots?routeId=X&weekStart=Y` ✅ | Returns slots with full-week coverage |
| Book a weekly slot | ✅ | `POST /shuttle/route-bookings` ✅ | Sends routeId, timeSlotId, weekStart |
| View my bookings | ✅ | `GET /shuttle/route-bookings` ✅ (60s refetch) | Shown in both lines and bookings tabs |
| Cancel a booking | ✅ | `DELETE /shuttle/route-bookings/:id` ✅ | — |
| Confirm renewal (Thursday deadline) | ✅ | `POST /shuttle/route-bookings/:id/confirm-renewal` ✅ | Banner + countdown on home screen |
| Renewal socket event | ✅ | `shuttle:renewal:confirmed` → invalidates bookings query | — |

---

## 5. Active Trip Screen — Shuttle

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Start trip button | ✅ `trip-active.tsx` | `PATCH /driver/trips/:id/start` ✅ | — |
| View passengers list | ✅ | `GET /driver/trips/:id` (bookings array) ✅ | Passengers loaded via shuttleContext from trip detail |
| Mark passenger as boarded | ✅ `boarding.tsx` | `POST /shuttle/bookings/:bookingId/board` ✅ | Sends `stationId` to trigger 60s backend timer |
| **Mark passenger as no-show** | ❌ | `PATCH /driver/bookings/:id/no-show` — NOT CONNECTED | No no-show button in boarding UI |
| Complete trip button | ✅ | `PATCH /driver/trips/:id/complete` ✅ | — |
| Station-by-station navigation | ✅ | `GET /driver/trips/:id/stations` ✅ + client-side `nextStop()` | Stop progress tracked locally; `stationArrived` + `stationCompleted` endpoints exist in `api.ts` but not wired to UI buttons |
| Map showing route | ✅ | MapLibre GL (native) / placeholder (web) | Map shows; no turn-by-turn navigation |
| Location update while driving | ✅ | Socket `driver:location:update` via `startShuttleBroadcast()` every 3s | Uses `activeLine.tripId` as context |
| Rate passengers after trip | ✅ `rate-passengers.tsx` | `POST /shuttle/ratings` ✅ (tripId, rateeId, stars) | — |
| Station timeout socket event | ✅ | `shuttle:station:timeout` received in `useRideSocket` (registered but callback not surfaced to shuttle screens) | ❌ Event is defined in `SOCKET_EVENTS` but handler not in shuttleContext or home screen |

---

## 6. Car / Scooter / Delivery Flow (Coming Soon)

### Service Availability Gate
- All services (CAR, MOTOR, DELIVERY) display on `service-select.tsx` with a "Coming Soon" visual state driven by `GET /services/control` → `serviceControlContext`.
- When `displayMode === 'coming_soon'` the card is greyed out and not tappable.
- Driver cannot reach `/(tabs)` without selecting a service AND it being marked available by the backend.

### Car Home Screen (`(tabs)/index.tsx`) — Built but gated

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Online toggle | ✅ | `PATCH /driver/status/online` / `PATCH /driver/status/offline` ✅ | — |
| GPS location tracking (10s interval) | ✅ | `PATCH /driver/location` ✅ | Pauses when app backgrounds |
| Incoming ride offer popup (12s timer) | ✅ | Via `ride:offer` socket ✅ | Shows rider name, rating, pickup, dropoff, price |
| Accept ride | ✅ | `PATCH /driver/rides/:id/accept` ✅ → `/ride/:id` | — |
| Decline ride | ✅ | `PATCH /driver/rides/:id/decline` ✅ | Called on timeout too |
| Surge zone overlay | ✅ | `surge:updated` socket ✅ | Passed to MapBackdrop |
| Safety check-in modal | ✅ | `driver:checkin:required` socket ✅ | 60s countdown → goes offline |
| Check-in approved modal | ✅ | `driver:checkin:approved` socket ✅ | — |
| Reconnecting banner | ✅ | Socket `connected` state | Slides down when offline |
| Push notification registration | ✅ | `POST /users/me/push-token` ✅ | Called on mount if token available |
| Resume active ride on mount | ✅ | `GET /driver/rides/active` → redirect `/ride/:id` ✅ | — |

### Active Ride Screen (`ride/[rideId].tsx`) — Built

- Fetches ride details: `GET /rides/:id` ✅
- "I have arrived" → `PATCH /driver/rides/:id/arrived` ✅
- Start trip → `PATCH /driver/rides/:id/start` ✅
- Complete trip → `PATCH /driver/rides/:id/complete` ✅
- Rate rider → `POST /driver/rides/:id/rate-rider` ✅
- Map with rider location, waiting charge display

**Note:** Full ride flow exists and is real (not mocked), but is inaccessible until backend marks CAR service as available.

---

## 7. Socket / Real-Time

### Connection
- **Initialized:** After login, inside `SocketProvider` in `lib/socketContext.tsx`
- **URL:** `EXPO_PUBLIC_API_URL` with `/api` suffix stripped
- **Path:** `/api/socket.io`
- **JWT:** Sent as `auth: { token }` on connection
- **Reconnection:** 10 attempts, 1s–30s delay with jitter
- **Transports:** polling → websocket upgrade

### Events — Server → Driver (LISTEN)

| Event | Constant | Handler Location | Action | Issues |
|---|---|---|---|---|
| `ride:offer` | `RIDE_OFFER` | `useRideSocket.ts` | Shows ride offer popup | — |
| `ride:new_request` | `RIDE_NEW_REQUEST` | Defined in constants but NOT handled in code | — | ❌ Dead event name |
| `ride:offer_expired` | `RIDE_OFFER_EXPIRED` | `useRideSocket.ts` | Dismisses popup | — |
| `ride:no_longer_available` | `RIDE_NO_LONGER_AVAILABLE` | `useRideSocket.ts` | Dismisses silently + toast | — |
| `ride:waiting:charge:started` | `WAITING_CHARGE_STARTED` | `useWaitingCharge.ts` | Starts charge display | Defined but handler not called in ride screen ❓ |
| `ride:waiting:charge:updated` | `WAITING_CHARGE_UPDATED` | `useRideSocket.ts` | Updates charge amount | — |
| `ride:waiting:charge:capped` | `WAITING_CHARGE_CAPPED` | `useRideSocket.ts` | Shows capped state | — |
| `driver:checkin:required` | `DRIVER_CHECKIN_REQUIRED` | `useRideSocket.ts` | Shows check-in modal | Car flow only |
| `driver:checkin:rejected` | `DRIVER_CHECKIN_REJECTED` | `useRideSocket.ts` | Toast + goes offline | — |
| `driver:checkin:approved` | `DRIVER_CHECKIN_APPROVED` | `useRideSocket.ts` | Shows approved modal | — |
| `shuttle:checkin:required` | `SHUTTLE_CHECKIN_REQUIRED` | `(shuttle)/index.tsx` | Routes to `/selfie` with tripId | — |
| `shuttle:station:timeout` | `SHUTTLE_STATION_TIMEOUT` | Defined in `SOCKET_EVENTS` | ❌ No handler in shuttle screens | ❌ Missing handler |
| `driver:cooldown:cleared` | `DRIVER_COOLDOWN_CLEARED` | `useRideSocket.ts` | Toast + refetch driver | — |
| `service:control:changed` | `SERVICE_CONTROL_CHANGED` | `serviceControlContext.tsx` | Refreshes service control | — |
| `service:settings:changed` | `SERVICE_SETTINGS_CHANGED` | `serviceControlContext.tsx` | Refreshes service control | — |
| `driver:location:ack` | `DRIVER_LOCATION_ACK` | Defined, no handler | — | — |
| `surge:updated` | `SURGE_UPDATED` | `useRideSocket.ts` | Updates surge zones on map | — |
| `sos:triggered` | `SOS_TRIGGERED` | `useRideSocket.ts` | Callback passed but not used in car home | — |
| `shuttle:booking:created` | `SHUTTLE_BOOKING_CREATED` | `shuttleContext.tsx` | — | ❌ No `SHUTTLE_BOOKING_CREATED` handler; only cancelled/reassigned |
| `shuttle:booking:cancelled` | `SHUTTLE_BOOKING_CANCELLED` | `shuttleContext.tsx` | Invalidates bookings queries | — |
| `shuttle:booking:reassigned` | `SHUTTLE_BOOKING_REASSIGNED` | `shuttleContext.tsx` | Invalidates bookings queries | — |
| `shuttle:renewal:confirmed` | `SHUTTLE_RENEWAL_CONFIRMED` | Defined in constants | ❌ No handler | ❌ Missing handler |
| `notification:new` | `NOTIFICATION_NEW` | `shuttleContext.tsx` | Handles trip-cancelled + renewal | Car flow: not handled |
| `error` | `ERROR` | Not handled | — | — |

### Events — Driver → Server (EMIT)

| Event | Where Emitted | Trigger | Issues |
|---|---|---|---|
| `join` | `useRideSocket.ts` | On connect, joins `driver:{id}` room | — |
| `driver:status:online` | **NOT EMITTED** | — | ❌ Defined in constants but never emitted — REST endpoints used instead |
| `driver:status:offline` | **NOT EMITTED** | — | ❌ Same — REST used |
| `driver:location:update` | `(shuttle)/index.tsx` + `(tabs)/index.tsx` | Every 3s (shuttle) / 10s (car) while online | Shuttle: socket emit. Car: REST PATCH. Inconsistent. |
| `driver:trip:start` | **NOT EMITTED** | — | ❌ Defined in constants, never emitted |
| `driver:trip:complete` | **NOT EMITTED** | — | ❌ Defined in constants, never emitted |

### Mock / Fake Socket Events
- None found. All events are real.

---

## 8. Face Verification (Check-in)

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Face verification screen | ✅ `selfie.tsx` | Dual mode: onboarding + shuttle check-in | — |
| Onboarding selfie → upload | ✅ | `POST /driver/me/documents` (FormData, type=selfie) ✅ | — |
| Shuttle check-in → dedicated endpoint | ✅ | `POST /driver/checkin` (FormData, type=selfie, tripId) ✅ | — |
| Camera preferred, gallery fallback | ⚠️ | Camera requested first; gallery offered if camera denied | ❌ Spec requires camera-only — gallery fallback undermines face verification |
| Shuttle check-in deadline countdown | ✅ | Timer from `deadlineMinutes` param | — |
| What happens if check-in times out | ✅ | Button disabled, message shown: "لم تقم بالتحقق في الوقت المحدد" | — |
| What happens if check-in rejected | ⚠️ | Car flow: toast + goes offline (via `driver:checkin:rejected`). Shuttle: no rejection event handled | ❌ `DRIVER_CHECKIN_REJECTED` is only in car home, not shuttle flow |
| Required before each shuttle trip | ✅ | `shuttle:checkin:required` socket event triggers navigation to `/selfie` | — |

---

## 9. Earnings Screen

`(shuttle)/wallet.tsx` and `(tabs)/earnings.tsx`

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Wallet balance | ✅ | `GET /driver/wallet/balance` ✅ | — |
| Weekly earnings bar chart | ✅ | `GET /driver/earnings/weekly?weeks=4` ✅ | Animates bars on load |
| Earnings summary (total/paid/pending/confirmed) | ✅ | `GET /driver/earnings/summary` ✅ | — |
| Transaction history | ✅ | `GET /driver/earnings/history` ✅ | — |
| Payout request | ✅ | `POST /driver/wallet/payout` ✅ | Amount pre-filled from balance |
| Payout methods list | ✅ | `GET /driver/wallet/payout-methods` ✅ | Shows "No payout methods on file" if empty |
| Add payout method | ⚠️ | `POST /driver/wallet/payout-methods` exists in `api.ts` | ❌ No UI to add a method |
| Remove payout method | ⚠️ | `DELETE /driver/wallet/payout-methods/:id` in `api.ts` | ❌ No UI to remove a method |
| Breakdown by type (ride/trip/peak_bonus/etc.) | ❌ | Not shown | Backend may return this in history |
| Currency | ⚠️ | Hard-coded "DT" (Tunisian Dinar) | May not match backend currency — backend uses EGP (Egyptian Pound) based on i18n strings |

---

## 10. Bonus Targets Screen

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Bonus targets screen | ❌ | — | ❌ No screen exists |
| `GET /driver/bonus-targets` | ❌ | Endpoint not called anywhere | ❌ Not implemented |
| Progress per target | ❌ | — | — |
| Bonus amount display | ❌ | — | — |

**Status: ENTIRELY MISSING.** No bonus targets feature exists in any form.

---

## 11. Profile Screen

`(shuttle)/profile.tsx` and `(tabs)/profile.tsx`

| Feature | Shuttle Profile | Car Profile | Connected | Issues |
|---|---|---|---|---|
| Driver info (name, avatar, rating) | ✅ | ✅ | `GET /driver/me` ✅ | `any` cast on response |
| Trip count | ✅ | ✅ | From `GET /driver/me` | — |
| Edit personal info | ✅ → `/personal-info` | ✅ → `/personal-info` | `PATCH /driver/me` ✅ | — |
| View vehicle info | ✅ → `/vehicle` | ✅ → `/vehicle` | `GET /driver/me/vehicle` ✅ | Read-only, no edit |
| Document status | ✅ → `/documents` | ✅ → `/documents` | `GET /driver/me/documents` ✅ | — |
| Ratings | ❌ (no link in shuttle profile) | ⚠️ → `/ratings` | `GET /driver/me/ratings` in api.ts | Shuttle profile doesn't link to ratings |
| Language toggle (AR/EN) | ✅ | ✅ (via `/settings`) | Persisted in i18nContext (AsyncStorage) | — |
| Dark mode | ✅ (in shuttle profile settings item; no direct toggle) | ✅ | AsyncStorage persisted | — |
| Push notifications settings | ⚠️ | ✅ | UI only, no backend call | — |
| Help & support | ✅ → `/support` | ✅ → `/support` | `POST /support/tickets` ✅ | — |
| Safety toolkit | ✅ → `/safety` | ✅ | UI only, hardcoded content | — |
| Sign out | ✅ | ✅ | `POST /driver/auth/logout` + `router.replace('/login')` ✅ | — |
| App version | ✅ | ✅ | `expo-constants` | — |

---

## 12. Notifications Screen

`app/messages.tsx`

| Feature | Exists | Connected | Issues |
|---|---|---|---|
| Notifications list | ✅ | `GET /notifications` ✅ | — |
| Mark individual as read | ✅ | `PATCH /notifications/:id/read` ✅ | — |
| **Mark all as read** | ❌ | `PATCH /notifications/read-all` — NOT CONNECTED | No "mark all" button |
| Real-time new notifications | ✅ | `notification:new` socket event (shuttleContext) | ❌ Car home doesn't listen to `notification:new` — no toast for car notifications |
| Notification badge count | ⚠️ | Bell icon always shows red dot | ❌ Dot is hardcoded, not based on actual unread count |

---

## 13. All API Calls

### Auth Endpoints

| File | Endpoint | Method | Real/Mock | Auth Token | Issues |
|---|---|---|---|---|---|
| `lib/api.ts` | `/driver/auth/login` | POST | Real | No (login) | — |
| `lib/api.ts` | `/driver/auth/register` | POST | Real | No | — |
| `lib/api.ts` | `/driver/auth/logout` | POST | Real | Yes | — |
| `lib/api.ts` | `/driver/auth/forgot-password` | POST | Real | No | — |
| `lib/api.ts` | `/driver/auth/reset-password` | POST | Real | No | — |
| `lib/api.ts` | `/auth/refresh` | POST | Real | No (uses refreshToken) | — |

### Driver Endpoints

| File | Endpoint | Method | Real/Mock | Auth Token | Issues |
|---|---|---|---|---|---|
| `(shuttle)/index.tsx`, `(tabs)/index.tsx` | `/driver/me` | GET | Real | Yes ✅ | `as any` cast |
| `(shuttle)/index.tsx`, `(tabs)/index.tsx` | `/driver/me/status` | GET | Real | Yes ✅ | — |
| `(shuttle)/index.tsx`, `(tabs)/index.tsx` | `/driver/status/online` | PATCH | Real | Yes ✅ | — |
| `(shuttle)/index.tsx`, `(tabs)/index.tsx` | `/driver/status/offline` | PATCH | Real | Yes ✅ | — |
| `(tabs)/index.tsx` | `/driver/location` | PATCH | Real | Yes ✅ | Sent every 10s via REST; shuttle uses socket emit |
| `vehicle.tsx` | `/driver/me/vehicle` | GET | Real | Yes ✅ | Read-only display |
| `documents.tsx` | `/driver/me/documents` | GET | Real | Yes ✅ | — |
| `register-documents.tsx`, `selfie.tsx` | `/driver/me/documents` | POST | Real | Yes ✅ | FormData multipart |
| `selfie.tsx` | `/driver/checkin` | POST | Real | Yes ✅ | Shuttle check-in only |
| `personal-info.tsx` | `/driver/me` | PATCH | Real | Yes ✅ | — |
| `ratings.tsx` | `/driver/me/ratings` | GET | Real | Yes ✅ | — |

### Shuttle Endpoints

| File | Endpoint | Method | Real/Mock | Auth Token | Issues |
|---|---|---|---|---|---|
| `shuttleContext.tsx` | `/shuttle/lines` | GET | Real | Yes ✅ | 60s refetch |
| `(shuttle)/lines.tsx` | `/shuttle/lines/:id` | GET | Real | Yes ✅ | On line detail open |
| `(shuttle)/lines.tsx` | `/shuttle/lines/:id/available-weeks` | GET | Real | Yes ✅ | — |
| `(shuttle)/lines.tsx` | `/shuttle/available-slots` | GET | Real | Yes ✅ | With routeId + weekStart |
| `(shuttle)/lines.tsx` | `/shuttle/timeslots/:routeId` | GET | Real | Yes ✅ | — |
| `shuttleContext.tsx` | `/shuttle/route-bookings` | GET | Real | Yes ✅ | 60s refetch |
| `(shuttle)/lines.tsx` | `/shuttle/route-bookings` | POST | Real | Yes ✅ | Book weekly slot |
| `(shuttle)/bookings.tsx` | `/shuttle/route-bookings/:id` | DELETE | Real | Yes ✅ | Cancel booking |
| `(shuttle)/index.tsx` | `/shuttle/route-bookings/:id/confirm-renewal` | POST | Real | Yes ✅ | — |
| `shuttleContext.tsx` | `/driver/trips` | GET | Real | Yes ✅ | 30s refetch |
| `shuttleContext.tsx` | `/driver/trips/:id` | GET | Real | Yes ✅ | Active trip detail |
| `shuttle/trip-active.tsx` | `/driver/trips/:id/start` | PATCH | Real | Yes ✅ | — |
| `shuttle/trip-active.tsx` | `/driver/trips/:id/complete` | PATCH | Real | Yes ✅ | — |
| `shuttle/boarding.tsx` | `/shuttle/bookings/:id/board` | POST | Real | Yes ✅ | With stationId |
| `shuttle/rate-passengers.tsx` | `/shuttle/ratings` | POST | Real | Yes ✅ | — |
| **`api.ts` (defined only)** | `/driver/trips/:id/stations/:sid/arrived` | PATCH | — | Yes | ❌ Not wired to any UI button |
| **`api.ts` (defined only)** | `/driver/trips/:id/stations/:sid/completed` | PATCH | — | Yes | ❌ Not wired to any UI button |
| **`api.ts` (defined only)** | `/driver/bookings/:id/no-show` | — | — | — | ❌ Not implemented at all |

### Car / Ride Endpoints

| File | Endpoint | Method | Real/Mock | Auth Token | Issues |
|---|---|---|---|---|---|
| `(tabs)/index.tsx` | `/driver/rides/active` | GET | Real | Yes ✅ | Redirects to ride screen if active |
| `(tabs)/index.tsx` | `/driver/rides/:id/accept` | PATCH | Real | Yes ✅ | — |
| `(tabs)/index.tsx` | `/driver/rides/:id/decline` | PATCH | Real | Yes ✅ | — |
| `ride/[rideId].tsx` | `/rides/:id` | GET | Real | Yes ✅ | — |
| `ride/[rideId].tsx` | `/driver/rides/:id/arrived` | PATCH | Real | Yes ✅ | — |
| `ride/[rideId].tsx` | `/driver/rides/:id/start` | PATCH | Real | Yes ✅ | — |
| `ride/[rideId].tsx` | `/driver/rides/:id/complete` | PATCH | Real | Yes ✅ | — |
| `ride/[rideId].tsx` | `/driver/rides/:id/rate-rider` | POST | Real | Yes ✅ | — |

### Earnings / Wallet Endpoints

| File | Endpoint | Method | Real/Mock | Auth Token | Issues |
|---|---|---|---|---|---|
| `(shuttle)/wallet.tsx` | `/driver/wallet/balance` | GET | Real | Yes ✅ | — |
| `(shuttle)/wallet.tsx` | `/driver/earnings/history` | GET | Real | Yes ✅ | — |
| `(shuttle)/wallet.tsx` | `/driver/earnings/weekly` | GET | Real | Yes ✅ | — |
| `(shuttle)/wallet.tsx` | `/driver/earnings/summary` | GET | Real | Yes ✅ | — |
| `(shuttle)/wallet.tsx` | `/driver/wallet/payout-methods` | GET | Real | Yes ✅ | — |
| `(shuttle)/wallet.tsx` | `/driver/wallet/payout` | POST | Real | Yes ✅ | — |

### Notifications / Misc Endpoints

| File | Endpoint | Method | Real/Mock | Auth Token | Issues |
|---|---|---|---|---|---|
| `messages.tsx` | `/notifications` | GET | Real | Yes ✅ | — |
| `messages.tsx` | `/notifications/:id/read` | PATCH | Real | Yes ✅ | — |
| `(tabs)/index.tsx` | `/users/me/push-token` | POST | Real | Yes ✅ | — |
| `service-select.tsx` | `/services/control` | GET | Real | Yes ✅ | — |
| `support.tsx` | `/support/tickets` | POST | Real | Yes ✅ | — |
| `settings.tsx` | `/driver/me/settings` | GET + PATCH | Real | Yes ✅ | — |

### Global API Config
- **Base URL:** `EXPO_PUBLIC_API_URL` env var (throws at startup if missing)
- **Request timeout:** 15 seconds
- **Auth header:** `Authorization: Bearer <token>` on all requests except auth endpoints
- **Error handling:** `ApiError` class with status, statusText, body — all screens show error states

---

## 14. Navigation Structure

### Complete Screen List

| Route | File | Accessible From |
|---|---|---|
| `/` | `index.tsx` | App start (splash/redirect) |
| `/login` | `login.tsx` | index.tsx, all logouts |
| `/register-info` | `register-info.tsx` | login.tsx |
| `/register-documents` | `register-documents.tsx` | register-info.tsx |
| `/selfie` | `selfie.tsx` | register-documents.tsx, shuttle:checkin:required |
| `/pending-approval` | `pending-approval.tsx` | register-documents.tsx |
| `/service-select` | `service-select.tsx` | navigateAfterAuth() (first login) |
| `/onboarding` | `onboarding.tsx` | ❌ Not navigated to from any screen |
| `/language-select` | `language-select.tsx` | ❌ Not navigated to from any screen |
| `/suspended` | `suspended.tsx` | `_layout.tsx` on 403 account_suspended |
| `/vehicle` | `vehicle.tsx` | profile screens |
| `/documents` | `documents.tsx` | profile screens |
| `/personal-info` | `personal-info.tsx` | profile screens |
| `/forgot-password` | `forgot-password.tsx` | login.tsx |
| `/messages` | `messages.tsx` | Bell icon on home + profile |
| `/safety` | `safety.tsx` | profile screens |
| `/support` | `support.tsx` | profile screens |
| `/settings` | `settings.tsx` | car home header |
| `/ratings` | `ratings.tsx` | car profile |
| `/(shuttle)` | `(shuttle)/index.tsx` | navigateAfterAuth (SHUTTLE) |
| `/(shuttle)/lines` | `(shuttle)/lines.tsx` | shuttle tab bar |
| `/(shuttle)/bookings` | `(shuttle)/bookings.tsx` | shuttle tab bar |
| `/(shuttle)/wallet` | `(shuttle)/wallet.tsx` | shuttle tab bar |
| `/(shuttle)/profile` | `(shuttle)/profile.tsx` | shuttle tab bar |
| `/shuttle/trip-active` | `shuttle/trip-active.tsx` | shuttle home (active line card) |
| `/shuttle/boarding` | `shuttle/boarding.tsx` | trip-active.tsx |
| `/shuttle/rate-passengers` | `shuttle/rate-passengers.tsx` | boarding.tsx (after complete) |
| `/(tabs)` | `(tabs)/index.tsx` | navigateAfterAuth (CAR) |
| `/(tabs)/trips` | `(tabs)/trips.tsx` | car tab bar |
| `/(tabs)/earnings` | `(tabs)/earnings.tsx` | car tab bar |
| `/(tabs)/wallet` | `(tabs)/wallet.tsx` | car tab bar |
| `/(tabs)/profile` | `(tabs)/profile.tsx` | car tab bar |
| `/ride/[rideId]` | `ride/[rideId].tsx` | accept ride, active ride resume |
| `/trips/[tripId]` | `trips/[tripId].tsx` | trip history list |
| `/+not-found` | `+not-found.tsx` | Unknown routes |

### Screens Navigated To But Not Found
- None — all referenced routes have corresponding files.

### Screens That Exist But Are Never Navigated To
- `app/onboarding.tsx` — No navigation path found in any screen
- `app/language-select.tsx` — Not linked from any screen (language is changed inline in profile)

---

## 15. State Management

### Pattern: React Context + TanStack Query

| What | Where Stored | Persistence | Notes |
|---|---|---|---|
| Auth token (access) | SecureStore (native) / AsyncStorage (web) | Cross-session ✅ | Key: `auth_token` |
| Refresh token | SecureStore (native) / AsyncStorage (web) | Cross-session ✅ | Key: `refresh_token` |
| Auth state (token, user, isLoading) | `AuthContext` (React Context) | In-memory; hydrated from SecureStore on mount | — |
| Selected service type | AsyncStorage | Cross-session ✅ | Per-user map + device fallback key |
| Dark mode preference | AsyncStorage | Cross-session ✅ | `veego_theme` key |
| Language (EN/AR) | AsyncStorage | Cross-session ✅ | `veego_language` key |
| Driver profile data | TanStack Query cache (`['driver']`) | In-memory; stale after 5min default | — |
| Shuttle routes & bookings | TanStack Query cache (`['shuttle-lines']`, `['shuttle-my-bookings']`) | In-memory; 60s refetch | — |
| Active trip + passengers | TanStack Query + local state in shuttleContext | In-memory | Passengers re-initialised from trip detail fetch |
| Current stop index | Local state in shuttleContext | In-memory | Resets on remount |
| Socket connection | `SocketContext` ref | In-memory; auto-reconnects | — |
| Service control (availability) | `serviceControlContext` + TanStack Query | In-memory; refreshed on mount and socket event | — |

### Key Observations
- No Redux or Zustand — all state is React Context + TanStack Query (appropriate for this app size).
- Token refresh is handled transparently in `lib/api.ts` with single-flight deduplication.
- Service type is persisted using both per-user map (JWT sub) and device-level fallback — handles multi-account and JWTs with no `sub` claim.

---

## 16. Localization (AR/EN)

| Aspect | Status | Notes |
|---|---|---|
| i18n system | ✅ Implemented | `lib/i18nContext.tsx` — full translation map (EN + AR) |
| Translation coverage | ⚠️ Mostly complete | ~380 string keys; both EN and AR defined |
| RTL layout | ✅ | `isRTL` flag; `flexDirection: isRTL ? 'row-reverse' : 'row'`; `textAlign` applied per screen |
| Language persistence | ✅ | AsyncStorage `veego_language` key |
| Language switcher | ✅ | Inline in shuttle profile; also `/language-select.tsx` (unreachable) |
| **Hardcoded strings — Arabic (should be in i18n):** | | |
| `(shuttle)/index.tsx` — "التحقق مطلوب", renewal banner text | ❌ | Hard-coded Arabic in home screen |
| `(shuttle)/index.tsx` — "Upcoming Trips" section title | ❌ | Hard-coded English |
| `(shuttle)/index.tsx` — "No upcoming trips scheduled" | ❌ | Hard-coded English |
| `(shuttle)/index.tsx` — "Renew your weekly slot" | ❌ | Hard-coded English |
| `(shuttle)/index.tsx` — "remaining" in countdown | ❌ | Hard-coded English |
| `selfie.tsx` — Arabic strings in shuttle check-in mode | ❌ | Hard-coded Arabic |
| `selfie.tsx` — "Good lighting", "Face centered", "No glasses" tips | ❌ | Hard-coded English |
| `(shuttle)/wallet.tsx` — "Confirmed", "Pending", "Paid Out", "DT" currency | ❌ | Hard-coded English |
| `service-select.tsx` — "Choose your service type", "Continue" | ❌ | Hard-coded English |
| `app/_layout.tsx` — font loading messages | ❌ | Minor, internal |
| Currency symbol | ⚠️ | "DT" (Tunisian Dinar) hard-coded in wallet; `t.egp` ("ج.م") exists in i18n but unused in wallet | Mismatch between currency strings |

---

## 17. Dead Code & Unnecessary Features

| Item | File(s) | Reason |
|---|---|---|
| `app/onboarding.tsx` | `onboarding.tsx` | Screen exists but is never navigated to |
| `app/language-select.tsx` | `language-select.tsx` | Screen exists; language is changed inline in profile; no nav path |
| `SOCKET_EVENTS.RIDE_NEW_REQUEST` | `constants/socketEvents.ts` | Defined but no handler in any file |
| `SOCKET_EVENTS.DRIVER_TRIP_START` | `constants/socketEvents.ts` | Defined but never emitted |
| `SOCKET_EVENTS.DRIVER_TRIP_COMPLETE` | `constants/socketEvents.ts` | Defined but never emitted |
| `SOCKET_EVENTS.DRIVER_STATUS_ONLINE` | `constants/socketEvents.ts` | Defined; REST used instead — never emitted |
| `SOCKET_EVENTS.DRIVER_STATUS_OFFLINE` | `constants/socketEvents.ts` | Defined; REST used instead — never emitted |
| `SOCKET_EVENTS.DRIVER_STATUS_BUSY` | `constants/socketEvents.ts` | Defined; never referenced anywhere |
| `SOCKET_EVENTS.DRIVER_LOCATION_ACK` | `constants/socketEvents.ts` | Defined; no handler |
| `SOCKET_EVENTS.SHUTTLE_RENEWAL_CONFIRMED` | `constants/socketEvents.ts` | Defined; no handler in shuttleContext or home screen |
| `SOCKET_EVENTS.SHUTTLE_BOOKING_CREATED` | `constants/socketEvents.ts` | Defined; no handler |
| `endpoints.trips.accept` | `lib/api.ts` | `PATCH /driver/trips/:id/accept` defined; not called from any screen |
| `endpoints.trips.reject` | `lib/api.ts` | `PATCH /driver/trips/:id/reject` defined; not called from any screen |
| `endpoints.trips.cancel` | `lib/api.ts` | `PATCH /driver/trips/:id/cancel` defined; not called from any screen |
| `endpoints.trips.stationArrived` | `lib/api.ts` | `PATCH /driver/trips/:id/stations/:sid/arrived` — no UI button |
| `endpoints.trips.stationCompleted` | `lib/api.ts` | `PATCH /driver/trips/:id/stations/:sid/completed` — no UI button |
| `endpoints.shuttle.driverTrips` | `lib/api.ts` | `GET /shuttle/driver/my-trips` defined; bookings screen uses `/shuttle/route-bookings` instead |
| `endpoints.wallet.addPayoutMethod` | `lib/api.ts` | Defined; no UI to trigger it |
| `endpoints.wallet.removePayoutMethod` | `lib/api.ts` | Defined; no UI to trigger it |
| `useWaitingCharge.ts` | `hooks/useWaitingCharge.ts` | Hook defined; not imported in `ride/[rideId].tsx` ❓ |
| Driver no-show functionality | Missing | `PATCH /driver/bookings/:id/no-show` — endpoint in spec; not in api.ts or UI |
| `MapBackdrop.web.tsx` | `components/MapBackdrop.web.tsx` | Likely a placeholder with no real map |
| `(tabs)/trips.tsx` | Trip history | Exists but never reached (CAR service blocked) |
| `(tabs)/earnings.tsx` | Earnings | Exists but never reached (CAR service blocked) |
| `trips/[tripId].tsx` | Trip detail | Exists; not linked from shuttle bookings screen |
| History button in wallet | `(shuttle)/wallet.tsx` | Calls `Alert.alert('Coming soon')` — not implemented |

---

## Summary Table

| # | Feature | Status | Priority |
|---|---------|--------|----------|
| 1 | Project Structure | ✅ Done | — |
| 2a | Login | ✅ Done | — |
| 2b | Registration (basic form) | ✅ Done | — |
| 2c | OTP verification | ❌ Missing | 🔴 High |
| 2d | Vehicle registration form (dropdowns) | ❌ Missing | 🔴 High |
| 2e | Document upload (camera-only) | ⚠️ Partial | 🟡 Medium |
| 2f | Pending approval (auto-advance) | ⚠️ Partial | 🟡 Medium |
| 3 | Home Screen — Shuttle | ✅ Done | — |
| 4 | Shuttle Schedule Screen | ✅ Done | — |
| 5a | Active Trip (start/board/complete) | ✅ Done | — |
| 5b | No-show marking | ❌ Missing | 🔴 High |
| 5c | Station arrived/completed API wired | ❌ Missing | 🟡 Medium |
| 5d | Station timeout socket handler | ❌ Missing | 🟡 Medium |
| 6 | Car/Scooter/Delivery flow | ✅ Built (gated) | — |
| 7a | Socket events — ride | ✅ Done | — |
| 7b | Socket events — shuttle booking created | ❌ Missing | 🟡 Medium |
| 7c | Socket events — renewal confirmed | ❌ Missing | 🟡 Medium |
| 7d | Socket emit — status online/offline | ⚠️ REST used (ok if by design) | — |
| 8 | Face Verification | ⚠️ Partial (gallery fallback issue) | 🟡 Medium |
| 9a | Earnings / Wallet | ✅ Done | — |
| 9b | Payout method add/remove UI | ❌ Missing | 🟡 Medium |
| 10 | Bonus Targets Screen | ❌ Missing | 🟡 Medium |
| 11 | Profile Screen | ✅ Done | — |
| 12a | Notifications list + mark read | ✅ Done | — |
| 12b | Mark all as read | ❌ Missing | 🟢 Low |
| 12c | Unread count badge | ❌ Missing (always red) | 🟢 Low |
| 13 | API Integration | ✅ Done (real, not mocked) | — |
| 14 | Navigation Structure | ✅ Done | — |
| 15 | State Management | ✅ Done | — |
| 16 | Localization (AR/EN) | ⚠️ Partial (hard-coded strings) | 🟡 Medium |
| 17 | Dead Code | 🗑️ Remove | 🟢 Low |

---

## Stats

| Metric | Count |
|---|---|
| Total screens (app files) | 34 screens |
| Screens fully connected to backend | 24 |
| Screens with partial/missing connections | 5 |
| Dead / unreachable screens | 2 (`onboarding.tsx`, `language-select.tsx`) |
| Screens gated (car/future service) | 7 (`(tabs)/*`, `ride/[rideId]`, `trips/[tripId]`) |
| Missing screens | 1 (Bonus Targets) |
| Mock data (instead of real API) | 0 — all data is real |
| Hard-coded strings (should be i18n) | ~20 instances across 4 screens |
| Defined API endpoints never called | 8 |
| Defined socket events never handled | 7 |

---

## Critical Action Items (Prioritised)

### 🔴 High Priority
1. **Add OTP screen** — phone number must be verified (`POST /auth/verify-otp`) during registration
2. **Add vehicle registration form** — brand/model/year/color dropdowns connected to `GET /vehicles/brands`, `GET /vehicles/brands/:id/models`, `GET /vehicles/models/:id/years`, `GET /vehicles/colors`
3. **Add no-show button** in boarding UI — `PATCH /driver/bookings/:id/no-show`

### 🟡 Medium Priority
4. **Camera-only enforcement** in selfie + document upload — remove gallery fallback for face verification
5. **Poll `/driver/me/status`** in pending-approval screen to auto-advance when admin approves
6. **Wire station arrived/completed** buttons in trip-active UI to `stationArrived` / `stationCompleted` endpoints
7. **Handle `shuttle:station:timeout`** socket event (warn driver or advance stop)
8. **Handle `shuttle:renewal:confirmed`** socket event (show confirmation to driver)
9. **Handle `shuttle:booking:created`** socket event (refresh bookings list)
10. **Add payout method add/remove UI** in wallet screen
11. **Build Bonus Targets screen** — `GET /driver/bonus-targets`
12. **Fix currency** — wallet shows "DT" but app is EGP-based (Wadi El Gedid, Egypt)
13. **Move hard-coded Arabic/English strings** in shuttle home, selfie, wallet, service-select to i18n context

### 🟢 Low Priority
14. **Mark all notifications as read** — `PATCH /notifications/read-all`
15. **Dynamic unread count badge** — fetch unread count and show real number on bell
16. **Remove dead screens** — `onboarding.tsx`, `language-select.tsx` (or wire them)
17. **Clean up dead socket event constants** — `RIDE_NEW_REQUEST`, `DRIVER_TRIP_START`, `DRIVER_TRIP_COMPLETE`, `DRIVER_STATUS_ONLINE`, `DRIVER_STATUS_OFFLINE`, `DRIVER_STATUS_BUSY`, `DRIVER_LOCATION_ACK`
18. **Wire `shuttle/driver/my-trips` endpoint** or remove from `api.ts` (currently unused)
19. **Handle `notification:new`** in car home screen (currently only in shuttleContext)
20. **Remove `History` button coming-soon Alert** in wallet — implement or remove
