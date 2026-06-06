# DRIVER APP — FULL SYSTEM AUDIT REPORT

**Date:** 2026-06-06  
**Scope:** Signup → Login → Service Selection → Navigation → Main Interface → Service Restrictions  
**Method:** Static analysis of actual source code — no assumptions

---

## 1 — AUTH FLOW

### 1.1 Signup

**File:** `app/login.tsx` — `SignUpForm` component

```
User fills name / email / phone / password (license & national ID optional)
        │
        ▼
endpoints.auth.driverRegister({ name, email, phone, password, ... })
POST /driver/auth/register   (lib/api.ts line 142)
        │
        ▼
Server returns { accessToken, refreshToken }
        │
        ▼
handleSignInSuccess(accessToken, refreshToken)
        │
        ├─ await login(accessToken, refreshToken)   [authContext.tsx]
        │     ├─ saveToken(accessToken)       → key: "auth_token"
        │     └─ saveRefreshToken(refreshToken) → key: "refresh_token"
        │
        └─ await navigateAfterAuth()          [lib/postAuthRouter.ts]
```

### 1.2 Sign In

**File:** `app/login.tsx` — `SignInForm` component

```
User enters email/phone + password
        │
        ▼
endpoints.auth.driverLogin(credential, password)
POST /driver/auth/login   (lib/api.ts line 138)
        │
        ▼
Server returns { accessToken, refreshToken }
        │
        ▼
handleSignInSuccess(accessToken, refreshToken)   ← SAME handler as signup
        │
        ├─ await login(accessToken, refreshToken)
        └─ await navigateAfterAuth()
```

> **Critical observation:** Sign In and Sign Up share a single `handleSignInSuccess` callback. There is no code difference between a signup response and a login response. The routing decision is identical for both.

### 1.3 Tokens Stored

| Token | Storage key | Storage backend | Written by | Read by |
|---|---|---|---|---|
| Access token (JWT) | `auth_token` | SecureStore (AsyncStorage fallback on web) | `lib/auth.ts` → `saveToken()` | `lib/auth.ts` → `getToken()` → `authContext` on mount |
| Refresh token | `refresh_token` | SecureStore (AsyncStorage fallback on web) | `lib/auth.ts` → `saveRefreshToken()` | `lib/auth.ts` → `getRefreshToken()` — available but not currently used by any auto-refresh mechanism |

### 1.4 Auth Context Lifecycle

**File:** `lib/authContext.tsx`

- On mount: reads `auth_token` from SecureStore → sets `token` state; sets `isLoading: false`
- `isLoading: true` during the async read window — consumers must wait for this
- `logout()`: deletes both keys, sets `token: null`

---

## 2 — ROUTING FLOW

### 2.1 Responsibility Map

| Routing decision | File | Condition |
|---|---|---|
| Unauthenticated → Login | `app/_layout.tsx` `RootLayoutNav` | `!token && !inAuthScreen` |
| Post-login destination | `lib/postAuthRouter.ts` `navigateAfterAuth()` | checks `veego_service_type` in AsyncStorage |
| App cold-start (fresh open) | `app/index.tsx` | no token check — always renders marketing splash |
| Service-blocked redirect | `hooks/useServiceGuard.ts` | backend service status from `ServiceControlProvider` |

### 2.2 Full Decision Tree — Post-Login

```
login() completes (tokens saved)
        │
        ▼
navigateAfterAuth()   [lib/postAuthRouter.ts]
        │
        ├─ AsyncStorage.getItem('veego_service_type')
        │
        ├─ value EXISTS? ──────────────────────────────────────────────────────┐
        │                                                                       │
        │   value === 'SHUTTLE' → router.replace('/(shuttle)')                 │
        │   anything else       → router.replace('/(tabs)')                    │
        │                                                                       │
        └─ value is NULL ───────────────────────────────────────────────────────┤
                                                                                │
            router.replace('/service-select')                                   │
                                                                                │
                 ↓ user picks a service type                                    │
            setServiceType(selected)                                            │
                 └─ AsyncStorage.setItem('veego_service_type', selected)        │
                                                                                │
            router.replace('/(tabs)') or '/(shuttle)' ──────────────────────────┘
```

### 2.3 App Cold-Start Routing (token already present)

**File:** `app/_layout.tsx`

```tsx
if (!token && !inAuthScreen) {
  queryClient.clear();
  router.replace('/login');
}
```

This condition only redirects unauthenticated users. **There is no corresponding redirect for authenticated users.** When an authenticated driver cold-starts the app:

```
App opens
    │
    ▼
Expo Router initialises at route "/"
    │
    ▼
app/index.tsx renders (marketing splash / landing screen)
    │
    ├─ if language is not set → Redirect to /language-select
    └─ if language is set     → renders "Start driving" marketing screen
                                 (no auth check, no redirect to dashboard)
```

**Finding:** A returning, authenticated driver who cold-starts the app sees the marketing splash screen and must press "Start driving" → onboarding → login to reach the dashboard. The auth context's token is never used to short-circuit this flow.

---

## 3 — SERVICE SELECTION FLOW

### 3.1 When service-select IS shown

- `navigateAfterAuth()` reads `veego_service_type` from AsyncStorage
- Value is `null` → route to `/service-select`
- This happens on: first-ever signup on a clean device, or after AsyncStorage is cleared

### 3.2 When service-select IS SKIPPED

- `veego_service_type` exists in AsyncStorage → route directly to `/(tabs)` or `/(shuttle)`

### 3.3 Scenario where new signup BYPASSES service selection

`veego_service_type` is stored in **device-level AsyncStorage, not per-account**. There is no account identifier bound to this key. Consequence:

```
Driver A uses device → selects 'CAR' → veego_service_type = 'CAR' written to device
Driver A logs out
Driver B signs up on the SAME device
    │
    ▼
navigateAfterAuth()
    │
    ▼
AsyncStorage.getItem('veego_service_type') → returns 'CAR'  (Driver A's value)
    │
    ▼
router.replace('/(tabs)')   ← service-select is SKIPPED for brand-new Driver B
```

Additionally, if the app was uninstalled and reinstalled, AsyncStorage may or may not be cleared depending on the OS (Android often preserves it; iOS clears it on uninstall). This creates unpredictable service-select visibility per device.

### 3.4 What triggers service-select completion

**File:** `app/service-select.tsx` — `handleContinue()`

```tsx
setServiceType(selected);   // writes to AsyncStorage + updates ServiceContext
router.replace(selected === 'SHUTTLE' ? '/(shuttle)' : '/(tabs)');
```

There is no "onboarding completed" flag written. The only state is `veego_service_type`. If this key is deleted or never written, service-select appears. If it exists (for any reason), it is skipped.

---

## 4 — DRIVER MAIN INTERFACE ENTRY POINT

### 4.1 File

**`app/(tabs)/_layout.tsx`** — this is the root of the main driver dashboard.

It renders `TabLayoutContent` which hosts tabs: `Drive` / `Earnings` / `Trips` / `Wallet` / `Profile`.

The actual "Drive" screen (map + online button) would be at `app/(tabs)/index.tsx`.

### 4.2 Access Condition

There is **no token guard** inside `/(tabs)/_layout.tsx`. Access is permitted based solely on the router sending the user there. The only protection inside `/(tabs)` is the **service control guard**:

```tsx
// app/(tabs)/_layout.tsx
const { isBlocked, status } = useServiceGuard();

if (isBlocked) {
  return <ServiceBlockedScreen status={status} serviceName={...} />;
}
```

`useServiceGuard` checks the backend service control state — not authentication. An unauthenticated user who somehow reaches `/(tabs)` would see the interface (all API calls would fail with 401, but no route-level auth redirect exists inside `/(tabs)`).

### 4.3 Why it is shown after login

The user arrives at `/(tabs)` because `navigateAfterAuth()` sends them there when `veego_service_type` exists in AsyncStorage. No further condition is checked beyond that key's presence.

---

## 5 — SERVICE CONTROL INTEGRATION

### 5.1 How services are loaded

**File:** `lib/serviceControlContext.tsx` — `ServiceControlProvider`

Sequence (current state, after auth fix applied):

```
AuthProvider resolves (authIsLoading: false)
        │
        ├─ token is null → services stay [] (no fetch)
        │
        └─ token exists →
              GET /api/services/control
                    │
                    ├─ success → services[] populated
                    └─ failure → error state; services remain []
              +
              socket.io connects to SOCKET_URL
              listens for SOCKET_EVENTS.SERVICE_CONTROL_CHANGED
              listens for SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED
```

### 5.2 Whether backend restrictions are respected

**Partially.** The guard is in `useServiceGuard` (`hooks/useServiceGuard.ts`) and is only applied inside `/(tabs)/_layout.tsx`:

```tsx
const { isBlocked, status } = useServiceGuard();
if (isBlocked) return <ServiceBlockedScreen ... />;
```

The `ServiceBlockedScreen` is shown **in-place** within the `/(tabs)` stack. The driver is already inside the main interface; the service screen overlays it. This means:

- The map, online button, and all other tabs render behind the blocked screen
- No route-level enforcement exists — only a render-layer replacement

### 5.3 Why disabled services are accessible in some states

**`getServiceStatus()` default behaviour:**

```tsx
// lib/serviceControlContext.tsx
const OPEN: ServiceStatus = { visible: true, available: true, displayMode: 'live' };

const getServiceStatus = (serviceType, driver) => {
  const ctrl = services.find(s => s.serviceType === serviceType);
  if (!ctrl) return OPEN;   // ← no backend config found → defaults to OPEN
  ...
```

If `services` is empty (fetch failed, or `ServiceControlProvider` is still loading), **all services default to `OPEN` (available)**. This means:

1. Fetch fails → error state → `services = []` → `getServiceStatus()` returns `OPEN` for everything
2. `isBlocked` = `false` → no `ServiceBlockedScreen` → driver sees the full dashboard

Additionally, `isLoading` starts as `false` (correct, after the auth fix). However, during the brief window between auth resolving and the API response arriving, `services` is `[]` and all services appear open.

---

## 6 — STORAGE ANALYSIS

| Key | Type | Written by | Read by | Used for routing? | Notes |
|---|---|---|---|---|---|
| `auth_token` | SecureStore | `lib/auth.ts saveToken()` | `lib/auth.ts getToken()` → `authContext` | **Yes** — `_layout.tsx` redirects to login if missing | JWT; cleared on logout |
| `refresh_token` | SecureStore | `lib/auth.ts saveRefreshToken()` | `lib/auth.ts getRefreshToken()` | No | Stored but no auto-refresh logic present |
| `veego_service_type` | AsyncStorage | `lib/serviceContext.tsx setServiceType()` | `lib/postAuthRouter.ts navigateAfterAuth()` + `serviceContext` on mount | **Yes** — sole condition for skipping service-select | Device-level, not account-scoped |
| `veego_theme` | AsyncStorage | `lib/serviceContext.tsx setIsDarkMode()` | `lib/serviceContext.tsx` on mount | No | Light/dark preference only |

**Flags that do NOT exist:**

| Flag | Present? |
|---|---|
| `isFirstLogin` | ❌ |
| `isNewUser` | ❌ |
| `onboardingCompleted` | ❌ |
| `serviceSelected` (explicit boolean) | ❌ |
| Any per-account onboarding marker | ❌ |

---

## 7 — EXPECTED vs ACTUAL FLOW

### Expected

```
First signup
    → Service Select (mandatory, once per account)
    → Driver selects service type
    → Main Interface (Drive tab)

Returning login
    → Main Interface (Drive tab) directly
```

### Actual (current code behaviour)

#### 7.1 Cold-start (returning authenticated driver)

```
App opens
    → app/index.tsx (marketing splash — "Start driving" / "Drive. Earn.")
    → driver must press "Start driving"
    → /onboarding (3-slide walkthrough)
    → /login
    → navigateAfterAuth() checks AsyncStorage
        → veego_service_type exists → /(tabs) [correct]
        → veego_service_type null   → /service-select [correct]
```

**Problem:** Authenticated drivers are never auto-redirected to the dashboard on cold-start. They traverse the full marketing → onboarding → login path every time they open the app fresh.

#### 7.2 Post-login (all cases, current code)

```
Login or Signup completes
    → navigateAfterAuth()
    → veego_service_type in AsyncStorage?
        YES → /(tabs) or /(shuttle)    ← bypasses service-select
        NO  → /service-select          ← correct for true first-timers
```

**Problem:** `veego_service_type` is device-level. A new account on a previously-used device inherits the prior selection and skips service-select.

---

## 8 — ROOT CAUSE SUMMARY

### Routing issues

- **No authenticated-user redirect on app startup.** `_layout.tsx` only redirects unauthenticated users to `/login`. Authenticated users always land on `app/index.tsx` (marketing splash) on cold-start, not the dashboard.
- **`veego_service_type` is not account-scoped.** The key is stored device-wide in AsyncStorage with no user ID binding. A new account on a previously-used device inherits the prior driver's service selection.
- **No explicit "onboarding completed" flag.** The system infers first-time state from the presence or absence of `veego_service_type`. This is fragile — the key can exist for the wrong reasons.

### Service control issues

- **Default-open fallback on fetch failure.** When `GET /api/services/control` fails, `services = []` and `getServiceStatus()` returns `OPEN` for every service type. Disabled services become accessible during any network error.
- **Service guard is render-layer only, not route-level.** `isBlocked` triggers a `ServiceBlockedScreen` overlay inside `/(tabs)`, not a redirect out of the stack.
- **Race window on login.** Between auth resolving and the `/services/control` response arriving, `services = []` briefly, making all services appear open to the UI.

### Missing state checks

- No token-based auto-redirect to dashboard from `app/index.tsx`
- No account ID bound to `veego_service_type`
- No `onboardingCompleted` per-account marker
- `refresh_token` stored but no refresh mechanism implemented

---

## 9 — DIAGRAM

### Current actual flow (cold-start, returning driver)

```
App opens
    │
    ▼
app/index.tsx
(marketing splash)
    │ user taps "Start driving"
    ▼
/onboarding
(3 slides, skippable)
    │ user taps "Get started" or "Skip"
    ▼
/login
    │ user submits credentials
    ▼
navigateAfterAuth()
    │
    ├─ veego_service_type EXISTS ────────────────────────────── /(tabs)
    │                                                              │
    │                                                    useServiceGuard()
    │                                                         │
    │                                         ┌───────────────┴───────────────┐
    │                                   service OPEN                   service BLOCKED
    │                                         │                               │
    │                                  Drive screen                  ServiceBlockedScreen
    │                                  (map + online)                (overlay, same route)
    │
    └─ veego_service_type NULL ─────────────── /service-select
                                                    │ user picks & confirms
                                                    ▼
                                         AsyncStorage.setItem('veego_service_type', ...)
                                                    │
                                                    ▼
                                              /(tabs) or /(shuttle)
```

### Expected correct flow (not yet implemented)

```
App opens
    │
    ├─ token EXISTS ──────────────────────────────────────────────────────────────┐
    │                                                                              │
    │   veego_service_type exists? ──── YES ──────────────── /(tabs)              │
    │                                                                              │
    │   veego_service_type null?   ──── NO  ──────────────── /service-select      │
    │                                                                              │
    └─ token NULL ─────────────────────────── /login ─────────────────────────────┘
                                                 │
                                         navigateAfterAuth()
                                                 │
                                      (same branching as above)
```

---

*Report generated from static analysis of: `app/login.tsx`, `app/_layout.tsx`, `app/index.tsx`, `app/service-select.tsx`, `app/onboarding.tsx`, `app/(tabs)/_layout.tsx`, `lib/authContext.tsx`, `lib/auth.ts`, `lib/serviceContext.tsx`, `lib/serviceControlContext.tsx`, `lib/postAuthRouter.ts`, `hooks/useServiceGuard.ts`, `lib/api.ts`*
