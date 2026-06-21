# AUDIT_RUNTIME_RELIABILITY.md
## VeeGo Driver — Shuttle App Production Reliability Audit
**Date:** 2026-06-20  
**Scope:** Runtime reliability only — socket lifecycle, React Query cache, memory leaks, background/foreground transitions, offline recovery  
**Methodology:** Static analysis of source code; no runtime profiling  

---

## Legend
| Symbol | Meaning |
|--------|---------|
| ✅ PASS | Correctly implemented, no action needed |
| ⚠️ WARNING | Works but degrades reliability or performance under stress |
| ❌ FAIL | Bug or design flaw that causes incorrect behavior in production |

---

## 1. Socket Lifecycle Audit

### 1.1 Connection Setup (`lib/socketContext.tsx`)

| Check | Status | Detail |
|-------|--------|--------|
| Auth token in handshake | ✅ PASS | `auth: { token: 'Bearer <jwt>' }` — correct |
| Reconnection attempts | ✅ PASS | `reconnectionAttempts: 10` |
| Reconnection backoff | ✅ PASS | Exponential, capped at 30 s |
| Disconnect on logout | ✅ PASS | `socket.disconnect()` called when token clears |
| Socket path | ✅ PASS | `/api/socket.io` matches backend |
| `connect_error` handler | ✅ PASS | Logs auth errors |
| Stale token on reconnect | ⚠️ WARNING | Socket auth object is set at connection time; if the JWT is refreshed mid-session the socket continues with the old token until the next manual disconnect/reconnect. A token-refresh hook should call `socket.auth = { token: ... }; socket.disconnect().connect()`. |

### 1.2 Event Registration — Duplicate Listeners (Critical)

The same socket events are registered in **multiple components simultaneously**. Every duplicate causes the handler to fire twice per server emission.

| Event | Location 1 | Location 2 | Impact |
|-------|-----------|-----------|--------|
| `SHUTTLE_BOOKING_CANCELLED` | `lib/shuttleContext.tsx:625` | `hooks/useShuttleSocket.ts:80` | ❌ FAIL — double invalidation, double toast |
| `SHUTTLE_BOOKING_CREATED` | `lib/shuttleContext.tsx:628` | `hooks/useShuttleSocket.ts:82` | ❌ FAIL — double invalidation, double toast |
| `NOTIFICATION_NEW` | `lib/shuttleContext.tsx:624` | `app/(shuttle)/index.tsx:112` | ❌ FAIL — notification shown twice |
| `SLOT_TAKEN` | `lib/shuttleContext.tsx:629` | `app/(shuttle)/bookings.tsx:841` | ❌ FAIL — duplicate UI update |

**Root cause:** `shuttleContext.tsx` acts as a global event bus but individual screen hooks also subscribe to the same events without checking whether the context already handles them.

### 1.3 Event Coverage

| Event | Handler exists | Cleanup exists | Status |
|-------|---------------|----------------|--------|
| `SHUTTLE_BOOKING_CREATED` | ✅ | ✅ | ❌ FAIL (duplicate — see §1.2) |
| `SHUTTLE_BOOKING_CANCELLED` | ✅ | ✅ | ❌ FAIL (duplicate — see §1.2) |
| `SLOT_TAKEN` | ✅ | ✅ | ❌ FAIL (duplicate — see §1.2) |
| `SLOT_RELEASED` | ✅ `shuttleContext.tsx:630` | ✅ `:641` | ✅ PASS |
| `SHUTTLE_TRIP_STATUS` | ✅ `shuttleContext.tsx:631` | ✅ `:641` | ✅ PASS |
| `NOTIFICATION_NEW` | ✅ | ✅ context; ⚠️ no cleanup in `index.tsx` | ❌ FAIL (duplicate + leak) |
| `connect` / `disconnect` | ✅ | ✅ | ✅ PASS |
| `connect_error` | ✅ | ✅ | ✅ PASS |

### 1.4 Cleanup Discipline

| Location | Registers on | Cleans up on | Status |
|----------|-------------|-------------|--------|
| `lib/shuttleContext.tsx` | mount | unmount (useEffect return) | ✅ PASS |
| `hooks/useShuttleSocket.ts` | mount | unmount | ✅ PASS |
| `app/(shuttle)/index.tsx` (`NOTIFICATION_NEW`) | mount | **missing `socket.off`** | ❌ FAIL — listener leaks every time screen mounts |
| `app/(shuttle)/bookings.tsx` (`SLOT_TAKEN`) | mount | unmount | ✅ PASS |

---

## 2. React Query Cache Audit

### 2.1 Global Defaults (`app/_layout.tsx`)
```
staleTime : 30 000 ms  (30 s)
gcTime    : 300 000 ms (5 min)
retry     : 2
retryDelay: exponential, capped 30 s
```
Reasonable defaults. No action needed.

### 2.2 Per-Query Configuration

| Query Key | Location | staleTime | refetchInterval | gcTime | Status |
|-----------|----------|-----------|----------------|--------|--------|
| `['shuttle-lines']` | `shuttleContext.tsx` | default (30 s) | 60 000 ms | default | ⚠️ WARNING — polling continues in background (see §3) |
| `['shuttle-my-bookings']` | `shuttleContext.tsx` | default | 20 000 ms | default | ⚠️ WARNING — aggressive 20 s poll; no background pause |
| `['shuttle-trip-stations']` | `shuttleContext.tsx` | default | 30 000 ms | default | ⚠️ WARNING — polling in background |
| `['shuttle-trip']` | `shuttleContext.tsx` | default | none | default | ✅ PASS |
| `['shuttle-earnings']` | profile screen | default | none | default | ✅ PASS |
| `['shuttle-history']` | history screen | default | none | default | ✅ PASS |
| `['driver-ratings']` | ratings screen | default | none | default | ✅ PASS |
| `['driver-profile']` | profile screen | default | none | default | ✅ PASS |

### 2.3 Cache Key Inconsistency — Critical Bug

**`hooks/useShuttleSocket.ts` (lines 57, 62, 64) invalidates:**
```ts
queryClient.invalidateQueries({ queryKey: ['shuttle-bookings'] })
```

**Actual query key registered in `lib/shuttleContext.tsx`:**
```ts
queryKey: ['shuttle-my-bookings']
```

**Result:** Every socket-triggered cache invalidation from `useShuttleSocket.ts` targets a key that does not exist. The booking list is **never refreshed** in response to socket events. The 20-second polling interval is the only mechanism keeping data current, meaning the UI can lag by up to 20 seconds after a real-time booking event.

| Invalidation call | Key used | Actual key | Status |
|-------------------|----------|-----------|--------|
| `useShuttleSocket.ts:57` | `['shuttle-bookings']` | `['shuttle-my-bookings']` | ❌ FAIL |
| `useShuttleSocket.ts:62` | `['shuttle-bookings']` | `['shuttle-my-bookings']` | ❌ FAIL |
| `useShuttleSocket.ts:64` | `['shuttle-bookings']` | `['shuttle-my-bookings']` | ❌ FAIL |

### 2.4 Invalidation Coverage After Socket Events

| Socket event | Should invalidate | Actually invalidates | Status |
|-------------|-------------------|---------------------|--------|
| `SHUTTLE_BOOKING_CREATED` | `shuttle-my-bookings` | `shuttle-bookings` (wrong key) | ❌ FAIL |
| `SHUTTLE_BOOKING_CANCELLED` | `shuttle-my-bookings` | `shuttle-bookings` (wrong key) | ❌ FAIL |
| `SLOT_TAKEN` | `shuttle-lines`, `shuttle-trip-stations` | correct keys in `shuttleContext.tsx` | ✅ PASS |
| `SLOT_RELEASED` | `shuttle-lines`, `shuttle-trip-stations` | correct keys in `shuttleContext.tsx` | ✅ PASS |
| `SHUTTLE_TRIP_STATUS` | `shuttle-trip` | correct key | ✅ PASS |

---

## 3. Background / Foreground Behavior

### 3.1 AppState Usage

| Screen / File | AppState used | Action on background | Action on foreground | Status |
|---------------|--------------|---------------------|---------------------|--------|
| `app/(tabs)/index.tsx` (ride tab) | ✅ Yes | Stops location tracking | Resumes location tracking | ✅ PASS |
| `lib/shuttleContext.tsx` | ❌ No | Polling continues | — | ❌ FAIL |
| `app/(shuttle)/index.tsx` | ❌ No | Socket listeners active | — | ⚠️ WARNING |
| `app/(shuttle)/bookings.tsx` | ❌ No | — | — | ⚠️ WARNING |
| `app/shuttle/trip-active.tsx` | ❌ No | — | — | ⚠️ WARNING |

### 3.2 Background Polling Impact

When the driver puts the app in the background (presses home, receives a call, etc.):

- `['shuttle-my-bookings']` continues to fire every **20 seconds** indefinitely
- `['shuttle-lines']` continues every **60 seconds**
- `['shuttle-trip-stations']` continues every **30 seconds**

On a device with a restrictive background task budget (iOS low-power mode, Android Doze), these fetches will either fail silently or keep the network radio active, draining battery.

**Missing:** `useAppState` / `AppState.addEventListener` in `shuttleContext.tsx` to pause `refetchInterval` when `appState !== 'active'`. React Query supports `refetchIntervalInBackground: false` (default) but the interval itself is not paused — network requests are still issued; they simply don't update the UI until foreground.

### 3.3 Socket Behavior on Background

The socket connection is maintained by `lib/socketContext.tsx` and is NOT torn down on background. This is generally correct for real-time apps. However, without AppState awareness, if the OS kills the socket connection while backgrounded, the automatic reconnect will silently fail (reconnection attempts exhaust without any user-visible feedback), and the driver will have stale state when they return to the foreground.

**Missing:** On `AppState` change to `'active'`, explicitly call `socket.connect()` if `!socket.connected`.

---

## 4. Offline / Reconnect Recovery

### Scenario Analysis

| Scenario | Current Behavior | Expected Behavior | Status |
|----------|-----------------|------------------|--------|
| **1. Momentary network blip (<5 s)** | Socket reconnects automatically via exponential backoff. React Query retries failed requests (retry: 2). Data recovers. | Same. | ✅ PASS |
| **2. Extended offline (>30 s)** | Socket exhausts 10 reconnect attempts and gives up. No UI indication. Polling queries show stale data silently. | Socket should show "offline" banner; on reconnect should refetch all active queries. | ❌ FAIL |
| **3. App returns from background after offline** | Socket may be disconnected. No reconnect attempt on foreground. Polling resumes against unreachable server. | Detect `AppState → active`, call `socket.connect()`, invalidate all shuttle queries. | ❌ FAIL |
| **4. JWT expires mid-session** | Socket keeps old token in auth. API calls get 401, React Query retry fires twice then marks query as `error`. Socket events still processed (server may reject). | Token refresh should update socket auth and reconnect. | ⚠️ WARNING |

### 4.1 `ServerStatusBanner` Coverage

`components/ServerStatusBanner.tsx` exists and is mounted in `_layout.tsx`. This catches server-level connectivity issues at the API layer. However:
- It does not observe socket connectivity state
- It does not trigger query refetch on reconnect
- Shuttle-specific offline state is invisible to the banner

---

## 5. Memory Leak Audit

### 5.1 Confirmed Leaks

| Location | Leak Type | Severity |
|----------|-----------|---------|
| `app/(shuttle)/index.tsx` | `socket.on('NOTIFICATION_NEW', ...)` with no `socket.off` in cleanup | **High** — listener accumulates on every screen mount/unmount cycle |
| `hooks/useShuttleSocket.ts` + `lib/shuttleContext.tsx` | Duplicate listeners registered (×2 handlers per event) | **Medium** — doubled memory and handler execution per event |

### 5.2 Interval / Timer Audit

| Location | Timer | Cleared on unmount | Status |
|----------|-------|-------------------|--------|
| `app/pending-approval.tsx` | `setInterval` via `intervalRef` | ✅ Yes (in useEffect return AND socket handler) | ⚠️ WARNING — see §6.1 double-clear |
| `lib/shuttleContext.tsx` | React Query `refetchInterval` (managed by RQ) | ✅ Managed by React Query | ✅ PASS |
| `lib/i18nContext.tsx` | `setTimeout` for language switch overlay | ✅ `switchTimerRef.current` cleared in return | ✅ PASS |

### 5.3 Subscription / Listener Audit

| Component | Subscribes to | Unsubscribes | Status |
|-----------|--------------|-------------|--------|
| `lib/socketContext.tsx` | internal socket events | ✅ socket.disconnect on auth clear | ✅ PASS |
| `lib/shuttleContext.tsx` | 6 socket events | ✅ all off'd in cleanup | ✅ PASS |
| `hooks/useShuttleSocket.ts` | 4 socket events | ✅ all off'd in cleanup | ✅ PASS (but duplicate) |
| `app/(shuttle)/index.tsx` | `NOTIFICATION_NEW` | ❌ **NO cleanup** | ❌ FAIL |
| `app/(shuttle)/bookings.tsx` | `SLOT_TAKEN` | ✅ | ✅ PASS (but duplicate) |
| `app/(tabs)/index.tsx` | AppState, location subscription | ✅ | ✅ PASS |

---

## 6. Race Conditions

### 6.1 `pending-approval.tsx` — Double `clearInterval`

```ts
// Inside fetchStatus():
clearInterval(intervalRef.current!)   // line ~60

// Inside socket 'approval' handler:
clearInterval(intervalRef.current!)   // line ~80
```

If the socket fires the approval event while `fetchStatus` is in flight, both code paths clear the same interval handle. While `clearInterval` on an already-cleared handle is safe in JavaScript, the pattern indicates that both paths can race to cancel the same timer, and the socket handler may also cancel a **new** interval that was restarted by `fetchStatus`'s success branch before the socket handler runs.

**Severity:** Medium — can result in the polling stopping prematurely, leaving the driver on the pending screen after approval.

### 6.2 `lib/socketContext.tsx` — Token Update Race

If `useAuth` refreshes the token while a socket reconnect is in progress, the new token may not be injected before the reconnect handshake completes, leaving the socket authenticated with the stale token.

**Severity:** Low — only observable if token refresh and socket reconnect happen within the same ~100ms window.

### 6.3 `verify-otp.tsx` — Terms Accept Race

After OTP verification, the code:
1. Calls `login(token, refreshToken)`
2. Reads `driver_terms_pending_version` from AsyncStorage
3. Calls `endpoints.terms.accept(version)`

If step 1 triggers a navigation redirect (via `navigateAfterAuth`) before step 3 completes, the terms acceptance may never fire because the component unmounts mid-await.

**Severity:** Medium — driver may need to re-accept terms on next login. Easily fixed by awaiting the full sequence before calling `login()`.

---

## 7. Production Readiness Score

### Scoring Breakdown

| Category | Weight | Raw Score | Weighted |
|----------|--------|-----------|---------|
| Socket lifecycle correctness | 20% | 45 / 100 | 9.0 |
| React Query cache correctness | 20% | 40 / 100 | 8.0 |
| Background/foreground handling | 15% | 20 / 100 | 3.0 |
| Offline/reconnect recovery | 15% | 35 / 100 | 5.25 |
| Memory leak discipline | 15% | 60 / 100 | 9.0 |
| Race condition safety | 15% | 55 / 100 | 8.25 |

### **Overall Score: 43 / 100**

---

## 8. Priority Fix List

### P0 — Must fix before next release

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 1 | `useShuttleSocket.ts` invalidates wrong cache key `['shuttle-bookings']` | `hooks/useShuttleSocket.ts:57,62,64` | Change to `['shuttle-my-bookings']` |
| 2 | `NOTIFICATION_NEW` listener in `(shuttle)/index.tsx` has no cleanup | `app/(shuttle)/index.tsx:112` | Add `return () => socket.off('NOTIFICATION_NEW', handler)` |
| 3 | Duplicate `SHUTTLE_BOOKING_CANCELLED` / `CREATED` handlers | `hooks/useShuttleSocket.ts:80,82` + `shuttleContext.tsx:625,628` | Remove duplicates from one location (prefer keeping in `shuttleContext.tsx`, remove from hook) |
| 4 | Duplicate `NOTIFICATION_NEW` — context + screen | `shuttleContext.tsx:624` + `(shuttle)/index.tsx:112` | Handle in one place only |

### P1 — Fix in next sprint

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 5 | No AppState-aware poll pausing in shuttle | `lib/shuttleContext.tsx` | Add `AppState` listener; set `enabled: appState === 'active'` on queries with `refetchInterval` |
| 6 | Socket not reconnected on foreground resume | `lib/socketContext.tsx` | On `AppState → active`, call `if (!socket.connected) socket.connect()` |
| 7 | Socket exhausts reconnects with no UI feedback | `lib/socketContext.tsx` | Expose `isSocketDead` state; show banner after `reconnect_failed` event |
| 8 | `pending-approval.tsx` double-clear race | `app/pending-approval.tsx` | Use a single `stopPolling()` guard function; null-check `intervalRef.current` before clearing |

### P2 — Technical debt

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 9 | Stale socket token after JWT refresh | `lib/socketContext.tsx` | Subscribe to token changes; update `socket.auth` and reconnect |
| 10 | `verify-otp.tsx` terms accept may not complete if navigation fires first | `app/verify-otp.tsx` | Await `endpoints.terms.accept()` before calling `login()` |
| 11 | No explicit foreground refetch on return from background | `lib/shuttleContext.tsx` | Call `queryClient.invalidateQueries()` on `AppState → active` transition |

---

*End of audit report. All findings are based on static code analysis. Runtime profiling (heap snapshots, network trace replay) may surface additional issues.*
