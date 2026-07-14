---
name: api module split
description: lib/api.ts (1,027 lines) was split into lib/api/ without changing any consumer imports.
---

## Rule
Consumers import from `@/lib/api` — this resolves to `lib/api/index.ts` (directory index), so no consumer import changes were needed.

## Structure
```
lib/api/
  _client.ts   — API_BASE_URL, token storage, refresh flow, ApiError, request(), api.get/post/patch/del
  types.ts     — all shared response/request types (WalletBalance, DriverPromotion, ...)
  auth.ts      — authEndpoints (login, register, OTP, terms)
  driver.ts    — driverEndpoints, onboarding, profile, documents, promotions
  ride.ts      — ridesEndpoints, walletEndpoints, notificationsEndpoints, safetyEndpoints
  shuttle.ts   — shuttleEndpoints, trips endpoints
  tracking.ts  — location tracking endpoints
  index.ts     — `endpoints` aggregate object + re-exports of ApiError and all types
```

**How to apply:** New endpoints go in the domain file that matches their path prefix; register them on the `endpoints` object in `index.ts`. Never add endpoint definitions to `_client.ts`.

## queryFn gotcha
Endpoints with optional params (e.g. `wallet.transactions(page = 1, limit = 20)`) must be wrapped when used as a React Query `queryFn`: `queryFn: () => endpoints.wallet.transactions()`. Passing the bare function makes React Query inject its context object as the first param → `?page=[object Object]`.
