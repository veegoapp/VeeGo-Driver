---
name: Service type bridge pattern
description: How the authoritative service type flows from backend to ServiceContext without race conditions on account switch.
---

## The rule
`ServiceContext` must never guess the service type for a logged-in user. The backend is the sole source of truth, delivered via `lib/serviceTypeBridge.ts`.

**Why:** AsyncStorage reads in `ServiceContext.useEffect([userId])` complete before `navigateAfterAuth`'s API call returns. If we use the device-level fallback key (`veego_device_service`) as a guess, a previous user's service type leaks into the new session → wrong interface loads → "Service Unavailable" screen.

## How it works
1. `navigateAfterAuth(token)` in `lib/postAuthRouter.ts` calls `/driver/me/onboarding` → gets `serviceType`.
2. `navigateToHome(serviceType, userId)` is called. It:
   - Calls `emitServiceTypeFromBackend(appType)` from `lib/serviceTypeBridge.ts` **synchronously** before navigation.
   - Writes to `veego_device_service` (cold-start fallback).
   - Writes to `veego_service_map[userId]` (per-user map for returning users).
3. `ServiceContext` has a `useEffect` that subscribes via `onServiceTypeFromBackend`. When the event fires, it updates state and persists to both storage keys.

## How to apply
- Any future code path that determines service type from the backend must call `emitServiceTypeFromBackend` so `ServiceContext` stays in sync.
- Do NOT add new frontend defaults (e.g. 'SHUTTLE' fallback) — if the backend doesn't return a type, the app should stay in an indeterminate state until it does.
- The device-level fallback key (`veego_device_service`) is only used when `userId` is null (JWT with no parseable id claim).
