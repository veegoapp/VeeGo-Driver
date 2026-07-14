# VeeGo Driver App

## 1. Project Overview

VeeGo Driver is the driver-side mobile application of the VeeGo platform, built with **React Native (Expo)** and **Expo Router**. A single codebase serves two driver experiences, selected by the driver's backend-assigned service type:

- **Ride services** (Car / Scooter / Delivery) — go online, receive ride requests over WebSocket, drive an active ride through pickup → dropoff, chat with the passenger, and track earnings.
- **Shuttle service** — book weekly route slots, run scheduled shuttle trips station-by-station, board passengers, and manage weekly bookings and renewals.

The app talks to a separate VeeGo backend over HTTPS (REST) and Socket.IO. This repository contains **only the mobile frontend** — no backend code lives here.

Key product characteristics:

- Bilingual (English / Arabic) with full RTL support.
- Dark UI (`userInterfaceStyle: "dark"`).
- Phone + OTP authentication (WhatsApp/SMS channel picker), with a multi-step driver registration and document-upload flow.
- Background GPS location broadcasting while online / on trip.
- SSL certificate pinning that fails closed in production.

---

## 2. Technology Stack

| Area | Technology |
|---|---|
| Framework | React Native 0.81 + Expo SDK 54 (new architecture enabled, React Compiler experiment on) |
| Routing | Expo Router 6 (file-based, typed routes enabled) |
| Language | TypeScript 5.9 (strict via `tsconfig.base.json`) |
| Server state | TanStack React Query 5 |
| Client state | React Context (no Redux/Zustand) |
| Realtime | socket.io-client 4 |
| Maps | react-native-maps (Google provider on native) |
| Location | expo-location + expo-task-manager (background task) |
| Storage | expo-secure-store (tokens) + @react-native-async-storage/async-storage (preferences) |
| Notifications | expo-notifications (Expo push tokens) |
| Security | react-native-ssl-public-key-pinning |
| Validation | zod + zod-validation-error |
| UI/UX | expo-blur, expo-linear-gradient, lottie-react-native, lucide-react-native, react-native-reanimated, Inter font (@expo-google-fonts/inter) |
| Package manager | pnpm (pnpm workspace; the app itself lives at the repo root) |

---

## 3. Folder Structure

```
.
├── app/                    # Expo Router screens (file-based routing — see §4)
├── components/             # Shared UI components
│   └── ui/                 # Design-system primitives (VeeGoButton, VeeGoCard, ...) + barrel index.ts
├── hooks/                  # Reusable hooks + barrel index.ts
├── lib/                    # Non-UI application logic
│   ├── api/                # API layer (see §6)
│   ├── i18n/               # i18n implementation (translations, provider, utils)
│   ├── shuttle/            # Shuttle context implementation (types, helpers, provider)
│   ├── *Context.tsx        # React Context providers (auth, socket, service, referral, ...)
│   └── *.ts                # Utilities (auth token storage, RTL utils, image compression, ...)
├── constants/              # Design tokens & app constants (colors, spacing, typography,
│                           #   socketEvents, tabBar, vehicleCatalog, mapStyle, ...)
├── assets/                 # Images, fonts, Lottie animations
├── docs/                   # Internal docs (certificate pinning, Google Maps migration plan)
├── scripts/                # setup.sh (Replit bootstrap) and build.js
├── .agents/memory/         # Architecture decision notes kept for AI/dev onboarding
├── app.json / app.config.ts# Expo configuration (app.config.ts injects Google Maps API keys)
└── tsconfig.json           # Extends expo/tsconfig.base + tsconfig.base.json; @/* path alias
```

Two compatibility shims exist on purpose — do not delete them:

- `lib/i18nContext.tsx` → thin re-export of `lib/i18n/`
- `lib/shuttleContext.tsx` → thin re-export of `lib/shuttle/`

They keep every historical `@/lib/i18nContext` / `@/lib/shuttleContext` import working after the modules were split into folders.

---

## 4. App Routing

Routing is file-based via Expo Router. `app/_layout.tsx` is the root: it registers the background location task, initializes certificate pinning, mounts the global provider tree (see §5), and declares a root `<Stack>` with every screen. It also contains the auth guard (`RootLayoutNav`) that redirects between the pre-auth zone (`login`, `language-select`, `onboarding`, `index`), the registration/pending zone (`register-*`, `pending-approval`), and the authenticated app, based on the stored JWT.

### `(tabs)` — ride-services tab group

Bottom-tab navigator for Car / Scooter / Delivery drivers, rendered with the custom `BottomTabBar` component. Blocked entirely by `useServiceGuard()` + `ServiceBlockedScreen` when the service is disabled by the backend.

| Tab | File | Purpose |
|---|---|---|
| Drive | `app/(tabs)/home.tsx` | Online/offline toggle, live map, incoming ride requests, surge zones |
| Earnings | `app/(tabs)/earnings.tsx` | Earnings summaries and promotions |
| Trips | `app/(tabs)/trips.tsx` | Trip history |
| Wallet | `app/(tabs)/wallet.tsx` | Balance, transactions, payout requests |
| Profile | `app/(tabs)/profile.tsx` | Driver profile and settings entry points |

### `(shuttle)` — shuttle tab group

Bottom-tab navigator for Shuttle drivers, rendered with `ShuttleTabBar`. `app/(shuttle)/_layout.tsx` wraps everything in `ShuttleProvider` (mandatory — without it every `useShuttle()` call returns empty defaults), plus a nested `ReferralProvider`, a zero-render `ShuttleReferralBridge` that binds shuttle socket events, and a global "slot released" toast.

| Tab | File | Purpose |
|---|---|---|
| Home | `app/(shuttle)/home.tsx` | Shuttle dashboard: today's trips, incoming-referral banner |
| Lines | `app/(shuttle)/lines.tsx` | Browse routes/timeslots and book weekly slots |
| Bookings | `app/(shuttle)/bookings.tsx` | Current/upcoming weekly bookings, renewals |
| Wallet | `app/(shuttle)/wallet.tsx` | Shuttle wallet |
| Profile | `app/(shuttle)/profile.tsx` | Shuttle driver profile |

### Other route groups (root stack)

- `app/shuttle/*` — full-screen shuttle flows pushed **over** the tab bar: `trip-details`, `trip-active`, `boarding`, `trip-complete`, `rate-passengers`, `history*`, `earnings`, `referral-incoming`, `referral-request`, `trip-cancel`, `direct-cancel`, `profile-info`.
- `app/ride/*` — active ride (`[rideId].tsx`), in-ride chat (`chat.tsx`), ride history.
- `app/trips/[tripId].tsx` — trip detail.
- Auth & registration: `login`, `verify-otp`, `forgot-password`, `register-service-type` → `register-vehicle` → `register-plate` → `register-documents` → `register-info` → `pending-approval`, plus `selfie` (backend-triggered check-in) and `suspended`.
- Standalone: `safety`, `support`, `settings`, `documents`, `vehicle`, `messages`, `personal-info`, `payout-accounts`, `bonus-targets`, `driver-referral`, `ratings`, `language-select`, `onboarding`.

Post-auth routing decisions (which zone to land in, resuming an unfinished registration step) live in `lib/postAuthRouter.ts`.

> Note: Expo Router's typed routes are generated at bundle time. Newly created route files need an `as any` cast on `pathname` strings until the next Metro run regenerates the types.

---

## 5. State Management

Server data is cached by **React Query** (global client configured in `app/_layout.tsx`: 30 s stale time, 2 retries with exponential backoff). App-level state lives in **React Contexts**, mounted in this order in `app/_layout.tsx`:

```
AuthProvider → SafeAreaProvider → ErrorBoundary → QueryClientProvider
  → GestureHandlerRootView → KeyboardProvider → I18nProvider
    → ServiceProvider → ReferralProvider → SocketProvider
      → ServiceControlProvider → RootLayoutNav
```

### Contexts (`lib/`)

| Context | File | Owns |
|---|---|---|
| Auth | `lib/authContext.tsx` | JWT/refresh token lifecycle, login/logout (tokens stored via `lib/auth.ts` in secure storage) |
| i18n | `lib/i18n/context.tsx` (via `lib/i18nContext.tsx` shim) | Language (en/ar), translations `t`, RTL flag |
| Service | `lib/serviceContext.tsx` | The driver's service type (CAR/SCOOTER/DELIVERY/SHUTTLE). Backend is the sole source of truth, delivered synchronously through `lib/serviceTypeBridge.ts` to avoid AsyncStorage races on account switch |
| Service control | `lib/serviceControlContext.tsx` | Backend-driven service enable/disable status |
| Socket | `lib/socketContext.tsx` | The single shared Socket.IO connection |
| Referral | `lib/referralContext.tsx` | Pending incoming shuttle referrals + tab badge state |
| Shuttle | `lib/shuttle/ShuttleContext.tsx` (via `lib/shuttleContext.tsx` shim) | Routes, timeslots, bookings, active trip state, station/passenger boarding, shuttle socket events |

Socket event names are centralized in `constants/socketEvents.ts`. Some constants there are intentionally unused (`reserved for future backend compatibility`) — do not remove them.

### Hooks (`hooks/`, barrel-exported from `hooks/index.ts`)

| Hook | Purpose |
|---|---|
| `useRideSocket` | Ride-request/surge socket binding for the ride home screen |
| `useShuttleSocket` | Shuttle referral socket binding (mounted by `ShuttleReferralBridge`) |
| `useDriverLocation` | Foreground GPS position for trip screens (+ `haversineMeters`) |
| `useLocationBroadcast` | Emits driver location to the backend while online |
| `useActiveLocationTracking` | Location tracking during an active ride |
| `usePushNotifications` | Expo push token registration (`POST /driver/push-token`) |
| `useServiceGuard` | Blocks a tab group when the backend disables the service |
| `useWaitingCharge` | Waiting-time charge calculation during rides |
| `useRoadEta` / `useRoadPolyline` | Road-based ETA and polyline fetching |
| `useCodeLockout` | OTP attempt lockout countdown (+ `formatLockoutCountdown`) |
| `useColors` | Theme colors |

Background (killed-app) location updates are handled outside React by `lib/backgroundLocationTask.ts` (expo-task-manager), registered as a side effect at the top of `app/_layout.tsx`.

---

## 6. API Architecture

All backend access goes through `lib/api/` and is consumed as:

```ts
import { endpoints, ApiError } from '@/lib/api';
```

```
lib/api/
├── _client.ts   # Core: API_BASE_URL (from EXPO_PUBLIC_API_URL), request() with
│                #   timeout + AbortController, Bearer token injection, silent
│                #   401 refresh-token retry, 403 account_suspended interception,
│                #   ApiError, api.get/post/patch/del
├── types.ts     # Shared request/response types
├── auth.ts      # authEndpoints — login, register, OTP send/verify, terms
├── driver.ts    # driverEndpoints, registrationEndpoints, vehiclesEndpoints,
│                #   servicesEndpoints, settingsEndpoints, pushTokensEndpoints,
│                #   emergencyContactEndpoints, bonusTargetsEndpoints
├── ride.ts      # ridesEndpoints, walletEndpoints, earningsEndpoints,
│                #   safetyEndpoints, tripShareEndpoints, notificationsEndpoints,
│                #   serviceControlEndpoints, supportEndpoints, termsEndpoints
├── shuttle.ts   # shuttleEndpoints, tripsEndpoints, financialAnalyticsEndpoints
├── tracking.ts  # trackingEndpoints — location reporting
└── index.ts     # Assembles everything into the single `endpoints` object
                 #   and re-exports the client + shared types
```

Conventions:

- Screens never call `fetch` directly — always `endpoints.<group>.<method>()`.
- Errors are thrown as `ApiError(status, message, body)`; `status === 0` means a network-level failure (timeout/DNS/refused).
- The base URL comes from the `EXPO_PUBLIC_API_URL` env var (baked in by Metro at bundle time — restart with `--clear` after changing it).
- When using an endpoint that takes optional parameters as a React Query `queryFn`, wrap it in an arrow function (`queryFn: () => endpoints.wallet.transactions()`); passing the bare function would make React Query inject its context object as the first argument.
- Certificate pinning (`lib/certificatePinning.ts`, documented in `docs/certificate-pinning.md`) is initialized before any request and fails closed in production builds.

---

## 7. Maps Architecture

The map is a single reusable component, `MapBackdrop`, resolved per platform by React Native's file-extension rules:

- **`components/MapBackdrop.native.tsx` — the real implementation (iOS/Android).** Built on `react-native-maps` with `PROVIDER_GOOGLE` (native Google Maps). Renders driver marker with heading/bearing, pickup/dropoff markers, route + road polylines, surge-zone circles (color-coded by multiplier), shuttle station status markers, a dashed approach circle, and supports a follow-the-driver `navigationMode` plus `focusTarget` camera control. Uses the custom dark style from `constants/mapStyle.ts`.
- **`components/MapBackdrop.tsx` — web / TypeScript-resolution stub.** Renders an empty `View`; it exists only so the module resolves on non-native targets. No map logic lives here.

Both files export the identical `MapBackdropProps` interface and re-export the shared `SurgeZone` type from `lib/types.ts`.

Google Maps API keys are injected at build time by `app.config.ts` from the `GOOGLE_MAPS_API_KEY_IOS` and `GOOGLE_MAPS_API_KEY_ANDROID` environment variables (never hard-coded). Background/foreground location permissions are declared in `app.json` under the `expo-location` plugin. See `docs/google-maps-migration-plan.md` for the migration history.

---

## 8. Shuttle Flow Overview

1. **Booking** — In the `(shuttle)` tabs, the driver browses routes and timeslots in **Lines** and books a weekly slot. Bookings appear in **Bookings**, where weekly renewals are confirmed (`pending_renewal` status). A "slot released" socket alert surfaces as a tap-to-book toast anywhere in the shuttle tabs.
2. **Referrals** — Another driver can refer a booking. The referral arrives over the socket (`shuttle:referral:incoming`), sets a badge on the shuttle Home tab via `ReferralContext`, and is accepted/declined in `app/shuttle/referral-incoming.tsx` (outgoing requests: `referral-request.tsx`).
3. **Check-in** — At trip start the backend can require a selfie check-in (`DRIVER_CHECKIN_REQUIRED` socket event → `app/selfie.tsx`, `POST /driver/checkin` with face detection).
4. **Active trip** — `app/shuttle/trip-active.tsx` is a map-first, three-phase screen (`en_route` / `approaching` / `at_stop`) driven by `ShuttleContext`. Stations are loaded from `GET /driver/trips/:id/stations` with per-station passenger lists; `StationTimeline` renders progress.
5. **Boarding** — `app/shuttle/boarding.tsx` marks passengers boarded/absent per station (server status merged with local optimistic updates).
6. **Completion** — Trip completion goes through the trips endpoints (`PATCH /driver/trips/:id/complete`), showing earned amount and wallet balance in `trip-complete.tsx`, followed by optional passenger rating (`rate-passengers.tsx`).
7. **History & earnings** — `app/shuttle/history*.tsx` (with export) and `app/shuttle/earnings.tsx`; shared date/grouping helpers live in `lib/shuttleHistoryHelpers.ts`.

State/queries/socket handling for all of this is centralized in `lib/shuttle/ShuttleContext.tsx`; pure mapping helpers are in `lib/shuttle/helpers.ts`, public types in `lib/shuttle/types.ts`.

---

## 9. Development Setup

Requirements: **Node.js**, **pnpm** (the repo is a pnpm workspace — versions come from the root `pnpm-workspace.yaml` catalog).

### Install

```bash
pnpm install
```

### Environment

Create a `.env` at the repo root (or let `scripts/setup.sh` write it):

```
EXPO_PUBLIC_API_URL=<backend base URL, e.g. https://your-backend/api>
```

For native map builds, also export `GOOGLE_MAPS_API_KEY_IOS` / `GOOGLE_MAPS_API_KEY_ANDROID` (read by `app.config.ts`).

> `EXPO_PUBLIC_*` values are baked into the JS bundle when Metro starts — after changing them, restart with `--clear`.

### Run

| Command | What it does |
|---|---|
| `bash scripts/setup.sh` | Full bootstrap: checks `BACKEND_URL`, pings `/health`, writes `.env`, installs deps, starts Expo with `--tunnel --clear` |
| `pnpm dev` | Starts Expo dev server (Replit-flavored env vars, `--localhost --port $PORT`) |
| `pnpm exec expo start --tunnel --clear` | Plain Expo start (always `pnpm exec`, not `npx` — avoids CLI version mismatch) |
| `pnpm typecheck` | `tsc --noEmit` — keep this at **0 errors** |
| `pnpm build` | `node scripts/build.js` (web export used by the Replit deployment) |

Open the app with **Expo Go** (scan the QR code) or a dev client. There is no test suite in this repository at present.

---

## 10. Guidelines for Future Developers

### Where to add a new API endpoint

1. Pick the domain file in `lib/api/` that matches the path (`auth.ts`, `driver.ts`, `ride.ts`, `shuttle.ts`, `tracking.ts`) and add the method to the relevant `*Endpoints` object.
2. If it's a new group, create the file and register it on the `endpoints` object in `lib/api/index.ts`.
3. Request/response types shared by more than one file go in `lib/api/types.ts` (and re-export them from `lib/api/index.ts` if consumers need them).
4. Never add endpoint definitions to `_client.ts` — it is transport only.

### Where to add components

- **Design-system primitives** (buttons, cards, inputs, chips, badges): `components/ui/` — and export them from `components/ui/index.ts`.
- **Feature/shared components** (cards, banners, tab bars, map): `components/`.
- **Screen-local pieces** used by a single screen can stay inside that screen file until a second consumer appears.

### Where to add types

- **Shared entity types** (same shape used in 2+ files): `lib/types.ts` — no business logic there.
- **API request/response types**: `lib/api/types.ts`.
- **Shuttle domain types**: `lib/shuttle/types.ts` (public) / `lib/shuttle/helpers.ts` (private backend shapes).
- **Screen- or module-local types**: keep them next to their only consumer.

### Other conventions worth knowing

- **Translations**: add every new key to both `lib/i18n/translations/en.ts` and `ar.ts`. Provider logic lives in `lib/i18n/context.tsx`; the missing-key safety proxy in `lib/i18n/utils.ts`. RTL helpers: `lib/rtlUtils.ts`.
- **Socket events**: always add event name constants to `constants/socketEvents.ts`; never inline event strings in new code.
- **Design tokens**: colors/spacing/typography/radius/shadows come from `constants/` — don't hard-code values that already exist there.
- **Service type**: never guess or default it on the frontend; it must flow from the backend through `lib/serviceTypeBridge.ts` (see `.agents/memory/service-type-bridge.md`).
- **Architecture notes**: `.agents/memory/` contains short decision records (module splits, backend contract alignment, known gotchas). Read `MEMORY.md` first when onboarding, and add a note when you make a decision the next developer would otherwise have to rediscover.
