# VeeGo Driver App — Full Application Audit Report

**Generated:** June 2026  
**Scope:** Full codebase audit — screens, hooks, contexts, API layer, navigation, mocked data, and critical issues.

---

## 1 — Screen-by-Screen Analysis

---

### Home — `app/(tabs)/index.tsx`

**UI Components**
- `LinearGradient`, `GlassView`, `ActivityIndicator`, `Animated.View`, `Image`, `Pressable`
- Lucide icons: `Bell`, `Settings`, `Star`, `TrendingUp`, `X`, `AlertCircle`
- Custom: `StatItem`, reconnecting banner, surge badge, online toggle, ride offer sheet

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/me` | GET | Driver name, avatar, rating |
| `/earnings/summary` | GET | Today's earnings, trip count |
| `/rides/active` | GET | Resume active ride on mount |
| `/driver/status/online` | PATCH | Go online |
| `/driver/status/offline` | PATCH | Go offline |
| `/driver/location` | PATCH | GPS ping every 10 s |
| `/rides/:id/accept` | PATCH | Accept incoming offer |
| `/rides/:id/decline` | POST | Decline / timeout |
| `/users/me/push-token` | POST | Register push token |

**State Sources**
- **Context:** `useI18n`, `useColors`
- **Socket:** `useRideSocket` — ride offers, surge zones, expiry events
- **Local:** `online`, `request`, `surgeZones`, `countdown`, `locationError`, GPS interval ref

**Navigation Outputs**
- `/ride/[rideId]` — on accept
- `/(tabs)/profile` — avatar press
- `/messages` — bell icon
- `/settings` — gear icon

**Mocked / Static Data**
- `"Lac 2 area is busy — head over for more trips."` — hardcoded demand text, never fetched from API

**Dead / Unused Code**
- None identified

---

### Trips — `app/(tabs)/trips.tsx`

**UI Components**
- `ScrollView`, `Modal` (cancel reason), `TextInput`, `ActivityIndicator`
- Custom: `StatusBadge`, `TripActionBar`, `LinearGradient`

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/trips` | GET | Paginated trip list with status filter |
| `/driver/trips/:id/accept` | PATCH | Accept scheduled trip |
| `/driver/trips/:id/reject` | PATCH | Reject trip |
| `/driver/trips/:id/start` | PATCH | Start trip |
| `/driver/trips/:id/complete` | PATCH | Complete trip |
| `/driver/trips/:id/cancel` | PATCH | Cancel with reason |

**State Sources**
- **Local:** `filter` (`all` / `scheduled` / etc.), `page`, `allTrips`, `cancelTarget`
- **Context:** `useI18n`, `useColors`

**Navigation Outputs**
- `/trips/[tripId]` — trip detail

**Mocked / Static Data**
- None

**Dead / Unused Code**
- Up to 50 `Animated.Value` instances pre-allocated regardless of actual trip count; excess values are never used when list is short

---

### Profile — `app/(tabs)/profile.tsx`

**UI Components**
- `Switch` (dark mode toggle), `Image`, `LinearGradient`, `GlassView`
- Custom: `MenuItem`, `MiniStat`

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/me` | GET | Name, avatar, rating, stats |

**State Sources**
- **Context:** `useAuth` (logout), `useService` (isDarkMode, setServiceType), `useI18n`

**Navigation Outputs**
- `/ratings`, `/vehicle`, `/documents`, `/safety`, `/support`, `/messages`, `/settings`, `/login` (logout)

**Mocked / Static Data**
- App version `v2.4.1` — hardcoded string
- `"1 expiring soon"` — hardcoded document subtext

**Dead / Unused Code**
- None

---

### Login — `app/login.tsx`

**UI Components**
- `KeyboardAvoidingView`, `TextInput`, `TouchableOpacity`, `LinearGradient`
- Custom: `SignInForm`, `SignUpForm`

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/auth/login` | POST | Credential + password auth |
| `/driver/auth/register` | POST | New driver registration |

**State Sources**
- **Local:** `tab` (`signin`/`signup`), `loading`, `error`, form field values
- **Context:** `useAuth` (stores token), `useI18n`

**Navigation Outputs**
- `navigateAfterAuth(token)` → `/service-select` or `/(tabs)` or `/(shuttle)` depending on stored service type

**Mocked / Static Data**
- None

**Dead / Unused Code**
- OTP endpoints (`/auth/send-otp`, `/auth/verify-otp`) defined in `lib/api.ts` but never called from any screen

---

### Onboarding — `app/onboarding.tsx`

**UI Components**
- `Animated.View`, `ScrollView` (paging), `Dot` indicator
- Custom: `IllustDrive`, `IllustStats`, `IllustSafe` (inline SVG illustrations)

**API Calls**
- None

**State Sources**
- **Local:** `step` (current slide index)

**Navigation Outputs**
- `/login` — Skip button and Get Started button

**Mocked / Static Data**
- All slide titles and body text are hardcoded in `STEPS` array — no CMS or remote config

**Dead / Unused Code**
- Onboarding is never enforced; users with a valid token skip it entirely via `_layout.tsx` redirect

---

### Service Select — `app/service-select.tsx`

**UI Components**
- `TouchableOpacity`, `ActivityIndicator`, `ScrollView`, `LinearGradient`
- Custom: `BlockedOverlay` (dark full-card overlay for blocked services)

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/me` | GET | Driver eligibility snapshot (rating, license, insurance) |
| `/services/control` | GET | Via `useServiceControl` — service availability config |

**State Sources**
- **Context:** `useService` (setServiceType), `useServiceControl` (service status, eligibility engine)
- **Local:** `selected`, `driverSnapshot`, `retrying`

**Navigation Outputs**
- `/(shuttle)` — Shuttle selected and available
- `/(tabs)` — Car / Scooter / Delivery selected and available

**Mocked / Static Data**
- `SERVICES` array — hardcoded list of 4 services with static labels, subtitles, tags
- `BACKEND_TYPE_MAP` — hardcoded frontend→backend type mapping (`MOTOR → scooter`, etc.)

**Dead / Unused Code**
- None

---

### Shuttle Home — `app/(shuttle)/index.tsx`

**UI Components**
- `GlassView`, `LinearGradient`, `Animated.View`, `ScrollView`, `Pressable`
- Custom: `StatItem`, `QuickAction`, progress track, stop timeline

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/me` | GET | Driver name |
| `/earnings/summary` | GET | Today earnings, completed count |
| `/driver/status/online` | PATCH | Go online |
| `/driver/status/offline` | PATCH | Go offline |

**State Sources**
- **Context:** `useShuttle` (activeLine, stops, currentStopIndex, allLines), `useI18n`, `useColors`
- **Local:** `online`, `onlineLoading`, `shiftActive`

**Navigation Outputs**
- `/messages`, `/shuttle/boarding`, `/shuttle/trip-active`, `/support`
- `/(shuttle)/lines` — Browse routes button
- `tel:19500` — Emergency call via `Linking`

**Mocked / Static Data**
- `shiftActive` starts as `true` — never persisted or fetched
- Online status initialises as `true` — not fetched from `/driver/me/status` on mount

**Dead / Unused Code**
- `shiftActive` toggle changes local state only; no API call or persistence

---

### Shuttle Lines — `app/(shuttle)/lines.tsx`

**UI Components**
- `Modal` (booking bottom sheet), `TextInput` (search), `ScrollView`, `ActivityIndicator`
- Custom: `LineCard`, week chip picker, time grid picker

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/shuttle/lines` | GET | All lines (via `useShuttle`) |
| `/shuttle/lines/:id` | GET | Line detail + stations |
| `/shuttle/lines/:id/book` | POST | Book weekly slot |

**State Sources**
- **Context:** `useShuttle` (allLines, loading, error), `useI18n`, `useColors`
- **Local:** `search`, `bookingLine`, `selectedWeek`, `selectedTime`

**Navigation Outputs**
- Internal modal only; invalidates `shuttle-lines` and `trips` queries on booking success

**Mocked / Static Data**
- `DEPARTURE_TIMES` — hardcoded array of 8 fixed departure time slots

**Dead / Unused Code**
- None

---

### Shuttle Wallet — `app/(shuttle)/wallet.tsx`

**UI Components**
- `Animated.View` (bar chart), `TextInput` (payout amount), `GlassView`
- Custom: `SummaryRow`

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/wallet/balance` | GET | Current balance |
| `/driver/earnings/history` | GET | Transaction list |
| `/earnings/weekly` | GET | Weekly earnings chart data |
| `/earnings/summary` | GET | Summary totals |
| `/driver/wallet/payout` | POST | Initiate payout |

**State Sources**
- **Local:** `payoutVisible`, `payoutAmount`, `isPayingOut`
- **Context:** `useI18n`, `useColors`

**Navigation Outputs**
- None (self-contained)

**Mocked / Static Data**
- `"BIAT — ****4521"` — hardcoded bank account display; payout methods endpoint (`/driver/wallet/payout-methods`) is defined but not called in this screen

**Dead / Unused Code**
- `GET /driver/wallet/payout-methods` — defined in `lib/api.ts`, only called from `app/(tabs)/wallet.tsx`, not from Shuttle wallet

---

### Shuttle Profile — `app/(shuttle)/profile.tsx`

**UI Components**
- `Switch` (dark mode), language chip selector, `GlassView`
- Custom: `MenuItem`, `ServiceIndicator`

**API Calls**
| Endpoint | Method | Purpose |
|---|---|---|
| `/driver/me` | GET | Name, avatar, rating |

**State Sources**
- **Context:** `useService` (serviceType, isDarkMode, setServiceType), `useI18n`, `useAuth`

**Navigation Outputs**
- `/(tabs)` — Switch to Car service
- `/vehicle`, `/documents`, `/messages`, `/support`, `/safety`, `/login` (logout)

**Mocked / Static Data**
- `"On-time 97%"` — hardcoded stat
- `"12 routes"` — hardcoded stat
- `"3 new"` notifications badge — hardcoded
- `"1 unread message"` — hardcoded

**Dead / Unused Code**
- None

---

## 2 — Backend Connection Map

| Status | Endpoint | Method | Used In | Purpose |
|---|---|---|---|---|
| 🟢 LIVE | `/driver/auth/login` | POST | `login.tsx` | Credential login |
| 🟢 LIVE | `/driver/auth/register` | POST | `login.tsx` | New driver signup |
| 🟢 LIVE | `/driver/auth/logout` | POST | `authContext.tsx` | Clear session |
| 🟢 LIVE | `/driver/me` | GET | 6 screens | Driver profile |
| 🟢 LIVE | `/driver/status/online` | PATCH | `(tabs)/index`, `(shuttle)/index` | Go online |
| 🟢 LIVE | `/driver/status/offline` | PATCH | `(tabs)/index`, `(shuttle)/index` | Go offline |
| 🟢 LIVE | `/driver/location` | PATCH | `(tabs)/index` | GPS ping |
| 🟢 LIVE | `/driver/me/vehicle` | GET | `vehicle.tsx` | Vehicle info |
| 🟢 LIVE | `/driver/me/documents` | GET | `documents.tsx` | Document list |
| 🟢 LIVE | `/driver/me/documents` | POST | `documents.tsx`, `selfie.tsx` | Upload docs |
| 🟢 LIVE | `/driver/me/ratings` | GET | `ratings.tsx` | Rating history |
| 🟢 LIVE | `/rides/:id` | GET | `ride/[rideId].tsx` | Ride detail |
| 🟢 LIVE | `/rides/:id/accept` | PATCH | `(tabs)/index` | Accept offer |
| 🟢 LIVE | `/rides/:id/decline` | POST | `(tabs)/index` | Decline offer |
| 🟢 LIVE | `/rides/:id/arrived` | PATCH | `ride/[rideId].tsx` | Arrived at pickup |
| 🟢 LIVE | `/rides/:id/start` | PATCH | `ride/[rideId].tsx` | Start ride |
| 🟢 LIVE | `/rides/:id/complete` | PATCH | `ride/[rideId].tsx` | Complete ride |
| 🟢 LIVE | `/rides/:id/rate-rider` | POST | `ride/[rideId].tsx` | Rate rider |
| 🟢 LIVE | `/driver/rides/active` | GET | `(tabs)/index` | Resume active ride |
| 🟢 LIVE | `/driver/trips` | GET | `trips.tsx`, `shuttleContext` | Trip list |
| 🟢 LIVE | `/driver/trips/:id` | GET | `trips/[tripId].tsx`, `shuttleContext` | Trip detail |
| 🟢 LIVE | `/driver/trips/:id/accept` | PATCH | `trips.tsx`, `trips/[tripId].tsx` | Accept trip |
| 🟢 LIVE | `/driver/trips/:id/reject` | PATCH | `trips.tsx`, `trips/[tripId].tsx` | Reject trip |
| 🟢 LIVE | `/driver/trips/:id/start` | PATCH | `trips.tsx`, `trips/[tripId].tsx` | Start trip |
| 🟢 LIVE | `/driver/trips/:id/complete` | PATCH | `trips.tsx`, `trips/[tripId].tsx` | Complete trip |
| 🟢 LIVE | `/driver/trips/:id/cancel` | PATCH | `trips.tsx`, `trips/[tripId].tsx` | Cancel trip |
| 🟢 LIVE | `/driver/trips/:id/stations` | GET | `trips/[tripId].tsx` | Station list |
| 🟢 LIVE | `/driver/trips/:id/stations/:sid/arrived` | PATCH | `trips/[tripId].tsx` | Mark station arrived |
| 🟢 LIVE | `/driver/trips/:id/stations/:sid/completed` | PATCH | `trips/[tripId].tsx` | Mark station done |
| 🟢 LIVE | `/earnings/summary` | GET | 4 screens | Earnings summary |
| 🟢 LIVE | `/earnings/weekly` | GET | `earnings.tsx`, `wallet.tsx` | Weekly chart |
| 🟢 LIVE | `/driver/wallet/balance` | GET | both `wallet.tsx` files | Balance |
| 🟢 LIVE | `/driver/earnings/history` | GET | both `wallet.tsx` files | Transaction history |
| 🟢 LIVE | `/driver/wallet/payout` | POST | both `wallet.tsx` files | Initiate payout |
| 🟢 LIVE | `/driver/wallet/payout-methods` | GET | `(tabs)/wallet.tsx` only | Saved payout methods |
| 🟢 LIVE | `/shuttle/lines` | GET | `shuttleContext.tsx` | All shuttle lines |
| 🟢 LIVE | `/shuttle/lines/:id` | GET | `shuttleContext.tsx`, `lines.tsx` | Line detail |
| 🟢 LIVE | `/shuttle/lines/:id/book` | POST | `lines.tsx` | Book weekly slot |
| 🟢 LIVE | `/shuttle/lines/:id/complete` | POST | `shuttle/trip-active.tsx` | Complete line |
| 🟢 LIVE | `/shuttle/bookings/:id/board` | POST | `boarding.tsx`, `trip-active.tsx` | Board passenger |
| 🟢 LIVE | `/services/control` | GET | `serviceControlContext.tsx` | Service config |
| 🟢 LIVE | `/notifications` | GET | `messages.tsx` | Notification list |
| 🟢 LIVE | `/notifications/:id/read` | PATCH | `messages.tsx` | Mark read |
| 🟢 LIVE | `/support/tickets` | POST | `support.tsx` | Submit ticket |
| 🟢 LIVE | `/driver/me/settings` | GET | `settings.tsx` | Driver settings |
| 🟢 LIVE | `/driver/me/settings` | PATCH | `settings.tsx` | Update settings |
| 🟢 LIVE | `/users/me/push-token` | POST | `(tabs)/index` | Register push token |
| 🟡 PARTIAL | `/driver/me` | PATCH | `register-info.tsx` | Profile update — only called during registration flow |
| 🟡 PARTIAL | `/shuttle/trips/:id/passengers` | GET | Defined in `api.ts` | Passenger list — defined but only used if boarding.tsx fetches it directly |
| 🔴 DEAD | `/auth/send-otp` | POST | Nowhere | OTP flow — defined, never called |
| 🔴 DEAD | `/auth/verify-otp` | POST | Nowhere | OTP flow — defined, never called |
| 🔴 DEAD | `/driver/me/status` | GET | Nowhere | Online status check — defined, never called |
| 🔴 DEAD | `/driver/rides/available` | GET | Nowhere | Available rides poll — defined, never called |
| 🔴 DEAD | `/shuttle/assignments` | GET | Nowhere | Driver assignments — defined, never called |
| 🔴 DEAD | `/shuttle/lines/:id/activate` | POST | Nowhere | Line activation — defined, never called |
| 🔴 DEAD | `/driver/wallet/payout-methods` | POST | Nowhere | Add payout method — defined, never called |
| 🔴 DEAD | `/driver/wallet/payout-methods/:id` | DELETE | Nowhere | Remove method — defined, never called |

---

## 3 — Mock / Hardcoded Data Detection

| Location | What Is Mocked | Reason | Impact |
|---|---|---|---|
| `app/(tabs)/index.tsx:398` | `"Lac 2 area is busy — head over for more trips."` | Static demand hint | Low — cosmetic only, never updates |
| `app/(tabs)/profile.tsx` | App version `v2.4.1` | Hardcoded string | Low — should read from `expo-constants` |
| `app/(tabs)/profile.tsx` | `"1 expiring soon"` document badge | Hardcoded | Medium — misleading if documents are not expiring |
| `app/(shuttle)/profile.tsx:94–95` | `"On-time 97%"`, `"12 routes"` | Static stats | High — shows wrong data to every driver |
| `app/(shuttle)/profile.tsx:116–117` | `"3 new"` / `"1 unread message"` | Static counts | High — badge is never real |
| `app/(shuttle)/index.tsx` | `online` initialised `true`, `shiftActive` initialised `true` | Never fetched | Medium — driver UI shows online even if offline |
| `app/(shuttle)/wallet.tsx` | `"BIAT — ****4521"` bank display | Hardcoded | High — shows wrong bank to all drivers |
| `app/(shuttle)/lines.tsx` | `DEPARTURE_TIMES` array | 8 hardcoded slots | Medium — should come from API / line config |
| `app/service-select.tsx` | `SERVICES` array — 4 entries with labels and tags | Hardcoded list | Medium — labels/tags not driven by backend |
| `app/safety.tsx` | `SAFETY_ITEMS` — all items route to `/support` | Placeholder | High — features not implemented |
| `app/onboarding.tsx` | `STEPS` array — all slide text | Static | Low — acceptable for onboarding |
| `lib/shuttleContext.tsx` | `boarded`/`expected` counts derived from local state | Partially mocked | Medium — passenger counts may not reflect reality |

---

## 4 — Service System Analysis

### Data Origin

```
GET /services/control
    └─► ServiceControlProvider (lib/serviceControlContext.tsx)
           ├─ REST fetch on: token available + auth resolved
           ├─ Socket: SERVICE_CONTROL_CHANGED → patches services[]
           └─ Socket: SERVICE_SETTINGS_CHANGED → patches eligibilityRules[]
```

### State Mutation Points

| Location | What Is Mutated | Trigger |
|---|---|---|
| `ServiceControlProvider` (initial effect) | `services[]` replaced | Token becomes available |
| `ServiceControlProvider` (socket handler) | `services[]` patched by serviceType | `SERVICE_CONTROL_CHANGED` event |
| `ServiceControlProvider` (socket handler) | `eligibilityRules[]` patched | `SERVICE_SETTINGS_CHANGED` event |
| `ServiceControlProvider.refresh()` | `services[]` replaced | Called by `useServiceGuard` on mount and by retry button |

### State Consumption Points

| Consumer | What It Uses |
|---|---|
| `app/service-select.tsx` | `getServiceStatus()`, `isLoading`, `error`, `refresh`, `services` |
| `hooks/useServiceGuard.ts` | `getServiceStatus()`, `refresh` |
| `app/(shuttle)/_layout.tsx` | `useServiceGuard('SHUTTLE')` |
| `app/(tabs)/_layout.tsx` | `useServiceGuard()` (uses contextType from `serviceContext`) |

### `getServiceStatus` Eligibility Engine (Layers)

1. **Loading lock** — returns `LOADING_BLOCKED` if still fetching
2. **Error lock** — returns `ERROR_BLOCKED` if fetch failed
3. **Config check** — normalizes type (`MOTOR → scooter`, others lowercase), finds backend entry; returns `CONFIG_BLOCKED` if missing
4. **isEnabled check** — returns `visible: false` if disabled
5. **displayMode check** — `coming_soon`, `unavailable`, `maintenance` block availability
6. **Driver eligibility** — checks `minimumRating`, `requiresLicense`, `requiresInsurance`
7. **Explicit approval** — only reachable if all layers pass → `available: true`

### `useServiceGuard` — Guard Logic

- On mount: calls `refresh()` for fresh data
- Reactively: recomputes `isHardBlocked(status)` on every status change
- Hard blocks on: `!status.visible`, `unavailable`, `maintenance`
- Does NOT block: `coming_soon`, `live` (with or without eligibility)
- On block: shows `ServiceBlockedScreen`, redirects to `/service-select` after 2.8 s

### Duplicate / Conflicting Logic

| Issue | Severity |
|---|---|
| Two separate Socket.IO connections: one in `ServiceControlProvider`, one in `useRideSocket` | ⚠️ Overhead — both connect to the same server with the same JWT |
| `useRideSocket` also receives `SERVICE_CONTROL_CHANGED` but only logs it (does not update state) | ℹ️ Inconsistency — could cause confusion if the log is treated as authoritative |
| `serviceContext` stores serviceType in AsyncStorage; `serviceControlContext` validates against backend — these are independent and can diverge if backend config changes between sessions | ⚠️ State desync risk |

---

## 5 — Navigation Graph

```
App Launch
│
├─ No token ─────────────────────────► /onboarding → /login
│
└─ Token exists
       │
       ├─ navigateAfterAuth(token)
       │      │
       │      ├─ veego_service_map[userId] === 'SHUTTLE' ──► /(shuttle)
       │      ├─ veego_service_map[userId] === other ──────► /(tabs)
       │      └─ no stored service type ────────────────────► /service-select
       │
       ├─ /service-select
       │      ├─ SHUTTLE selected + live ──────────────────► /(shuttle)
       │      └─ CAR/MOTOR/DELIVERY selected + live ───────► /(tabs)
       │
       ├─ /(tabs) — Car / Scooter / Delivery dashboard
       │      ├─ Home → /ride/[id] (accept), /messages, /settings, /(tabs)/profile
       │      ├─ Trips → /trips/[id]
       │      ├─ Earnings → self-contained
       │      ├─ Wallet → self-contained
       │      └─ Profile → /ratings, /vehicle, /documents, /safety, /support, /login
       │
       ├─ /(shuttle) — Shuttle dashboard
       │      ├─ Home → /shuttle/boarding, /shuttle/trip-active, /support, /(shuttle)/lines
       │      ├─ Lines → modal (booking) — no route change
       │      ├─ Wallet → self-contained
       │      └─ Profile → /(tabs) [service switch], /vehicle, /documents, /login
       │
       └─ Ride lifecycle
              ├─ /ride/[rideId] → back to /(tabs) on complete
              └─ /shuttle/trip-active → back to /(shuttle) on complete
```

### Broken / Problematic Routes

| Route | Issue | Severity |
|---|---|---|
| `app/safety.tsx` all items | Every item navigates to `/support` — feature routes don't exist | ⚠️ HIGH |
| `/(shuttle)/profile` switch service | `setServiceType('CAR')` + `router.replace('/(tabs)')` — no guard re-evaluation; layout guard may block | ⚠️ HIGH |
| `/onboarding` skip button | Routes to `/login`; if stale token exists, `_layout.tsx` redirects away before login renders | ℹ️ LOW |
| `tel:19500` | Hardcoded support number — not localised or configurable | ℹ️ LOW |

---

## 6 — Critical Issues

### 🔥 CRITICAL

**C1 — Shuttle profile stats are entirely hardcoded**
- `app/(shuttle)/profile.tsx` shows `"On-time 97%"`, `"12 routes"`, `"3 new"`, `"1 unread"` for every single driver regardless of their real data.
- **Impact:** Drivers see completely wrong information about their performance.

**C2 — Shuttle online status initialises as `true` without fetching**
- `app/(shuttle)/index.tsx` sets `const [online, setOnline] = useState(true)`.
- The server's actual driver status is never fetched on mount (`/driver/me/status` exists but is never called).
- **Impact:** Drivers may appear online to the system even when they're not, and the UI shows incorrect state on first load.

**C3 — Hardcoded bank account in Shuttle Wallet**
- `"BIAT — ****4521"` is rendered for every driver.
- The `GET /driver/wallet/payout-methods` endpoint exists but is not called in the Shuttle wallet screen.
- **Impact:** All shuttle drivers see a bank account that isn't theirs.

---

### ⚠️ HIGH

**H1 — Safety screen is entirely placeholder**
- All `SAFETY_ITEMS` (Share trip status, RideCheck, Audio recording, Driver verification) navigate to `/support`.
- None of the features are implemented; the screen creates false expectations.

**H2 — Service switch from Shuttle Profile may cause state desync**
- `setServiceType('CAR')` writes to `AsyncStorage` then immediately calls `router.replace('/(tabs)')`.
- The `(tabs)/_layout.tsx` guard calls `useServiceGuard()` which fires `refresh()` — if that fetch hasn't resolved yet, the guard may see a stale `LOADING_BLOCKED` state and redirect back to `/service-select`.

**H3 — Two Socket.IO connections active simultaneously**
- `ServiceControlProvider` and `useRideSocket` each create their own `io()` connection with the same JWT and server URL.
- On the Home screen both are active at the same time. Neither is aware of the other.
- **Impact:** Double connection overhead; `SERVICE_CONTROL_CHANGED` events arrive in both but only `ServiceControlProvider` acts on them.

**H4 — Token refresh race condition**
- `lib/api.ts` intercepts 401s and attempts a silent token refresh.
- If multiple requests fail simultaneously, multiple refresh attempts fire in parallel. Whichever completes last invalidates the others' refresh tokens, causing silent logout loops.

**H5 — OTP endpoints defined but never connected**
- `/auth/send-otp` and `/auth/verify-otp` are fully implemented in `lib/api.ts`.
- No UI calls them. Phone-based auth is silently unavailable even though the backend supports it.

---

### ℹ️ LOW

**L1 — Dead API endpoints (8 total)**
- `/driver/me/status`, `/driver/rides/available`, `/shuttle/assignments`, `/shuttle/lines/:id/activate`, `/driver/wallet/payout-methods` (POST + DELETE), `/auth/send-otp`, `/auth/verify-otp`
- These accumulate dead code in `lib/api.ts` and imply unmaintained backend features.

**L2 — App version is hardcoded**
- `"v2.4.1"` in `app/(tabs)/profile.tsx` should read from `expo-constants` (`Constants.expoConfig?.version`).

**L3 — Demand hint text is static**
- `"Lac 2 area is busy"` never changes. Should either be removed or driven by surge zone data already available in state.

**L4 — Onboarding not gated**
- A user with a valid stored token who lands on `/` will be redirected past onboarding without ever seeing it. First-time experience is skipped for returning sessions even after reinstall if token is cached.

**L5 — `DEPARTURE_TIMES` hardcoded**
- The 8 fixed departure times in `app/(shuttle)/lines.tsx` should be part of the line configuration returned by the API, as different lines likely have different schedules.

---

## 7 — Final Summary

### Backend Connected vs. Mock

| Category | Count |
|---|---|
| 🟢 Fully live endpoints | 45 |
| 🟡 Partially live endpoints | 2 |
| 🔴 Dead endpoints | 8 |
| **Total defined** | **55** |
| **Live coverage** | **~85%** |

Core ride, trip, wallet, earnings, and shuttle flows are fully connected. Dead endpoints cluster around OTP auth, driver status polling, and payout method management.

---

### Dead Systems

| System | File | Status |
|---|---|---|
| OTP Authentication | `lib/api.ts` | Defined, no UI |
| Driver status poll on mount | `api.ts` → `(shuttle)/index.tsx` | Never called |
| Available rides poll | `lib/api.ts` | Defined, no UI |
| Shuttle line activation | `lib/api.ts` | Defined, no UI |
| Add/remove payout methods | `lib/api.ts` | Defined, no UI |
| Safety feature screens | `app/safety.tsx` | Routes to `/support` only |
| `shiftActive` toggle | `(shuttle)/index.tsx` | Local state, no API, no persistence |

---

### Duplicate Logic

| Duplication | Files | Recommendation |
|---|---|---|
| Two Socket.IO connections | `serviceControlContext.tsx` + `useRideSocket.ts` | Merge into a single shared socket instance |
| `isDarkMode` toggle | `(tabs)/profile.tsx` + `(shuttle)/profile.tsx` | Extract to a shared `ProfileMenuItem` component |
| `GET /driver/me` called in 6+ screens independently | Multiple screens | Already cached via `react-query` — acceptable, no action needed |
| Online/offline toggle button | `(tabs)/index.tsx` + `(shuttle)/index.tsx` | Extract to shared `OnlineToggle` component |

---

### Architectural Recommendations

1. **Fetch real driver status on shuttle home mount** — call `/driver/me/status` to initialise `online` state correctly instead of defaulting to `true`.

2. **Connect shuttle profile stats to real data** — the on-time rate, route count, and notification badges must come from API responses, not hardcoded values.

3. **Fix shuttle wallet payout methods** — call `GET /driver/wallet/payout-methods` in `app/(shuttle)/wallet.tsx` to show the driver's actual bank account.

4. **Merge Socket.IO connections** — create a single `SocketProvider` that all hooks subscribe to. This eliminates the double connection and ensures `SERVICE_CONTROL_CHANGED` and ride events share one connection lifecycle.

5. **Implement or remove dead endpoints** — either build the OTP login UI, driver status polling, and payout method management, or remove the dead endpoint definitions from `lib/api.ts` to reduce confusion.

6. **Implement safety features** — the `SAFETY_ITEMS` list creates expectations; build or explicitly mark as `coming_soon` with a proper placeholder screen rather than routing to support.

7. **Drive `DEPARTURE_TIMES` from the API** — line booking times should come from the line detail response, not a hardcoded array.

8. **Add token refresh deduplication** — use a single in-flight promise for token refresh in `lib/api.ts` so concurrent 401s don't race to refresh simultaneously.
