# Active Trip Hardening — Feasibility & Contract Audit

**Scope:** `app/shuttle/trip-active.tsx`, `app/(shuttle)/index.tsx`, `lib/api.ts`, `lib/shuttleContext.tsx`, `lib/i18nContext.tsx`, `app/shuttle/boarding.tsx`
**Expo Router version on disk:** `~6.0.17`
**Report type:** Read-only audit. Zero code changes.

---

## Proposal 1 — Active Trip Exit Guard

### Current State on Disk
`trip-active.tsx` renders a raw `<Pressable onPress={() => router.back()}>` as its back button. There is **zero navigation interception** anywhere in this file or anywhere else in the project (`usePreventRemove`, `BackHandler`, `beforeRemove` event listener — none are present across the entire codebase).

### Feasibility Assessment

**Mechanism available:** Expo Router ~6.0.17 is a thin wrapper over React Navigation v6. `useNavigation()` is re-exported directly from `expo-router` and returns the underlying React Navigation object. This object supports the `beforeRemove` event listener:

```ts
const navigation = useNavigation();
navigation.addListener('beforeRemove', (e) => {
  e.preventDefault();
  // show confirmation Alert, then navigation.dispatch(e.data.action) to proceed
});
```

This is the **only safe mechanism** on the current stack. `usePreventRemove` (a React Navigation convenience hook) is not documented as explicitly re-exported by expo-router 6; using the raw `addListener('beforeRemove', ...)` pattern is the safer, version-agnostic path.

**Critical caveat:** The `beforeRemove` event fires for gesture-based swipe-back and hardware back button (Android). However, the current programmatic `router.back()` call on the `<Pressable>` button fires a `router.back()` which resolves to `navigation.goBack()` internally — this WILL trigger `beforeRemove`, so both the hardware back and the on-screen button are interceptable with a single listener.

**Modal / sheet interaction risk:** The `BookingDetailSheet` in `bookings.tsx` uses a `<Modal>` component — this is a React Native Modal, not an Expo Router modal route. It has its own `onRequestClose` that is independent of navigation. The guard on `trip-active.tsx` will not interfere with it. No breakage risk.

### Verdict
✅ **Safe to implement.** No blocking incompatibilities. Use `useNavigation().addListener('beforeRemove', ...)` pattern. The programmatic back button must additionally be replaced with a guarded handler rather than a raw `router.back()` call, since `router.back()` bypasses the listener when called imperatively after `e.preventDefault()`.

### Assumptions Being Made
- The driver enters this screen only from `index.tsx` via `router.push('/shuttle/trip-active')`, which is a push onto the stack — `goBack()` will correctly return to the index.
- No deferred deep-link can land directly on `trip-active` mid-trip in the current routing setup.

---

## Proposal 2 — Explicit No-Show Passenger Reporting

### Current State on Disk

The endpoint **exists and is already wired**:

```ts
// lib/api.ts — line 488
noShowBooking: (bookingId: string) =>
  api.patch(`/driver/bookings/${bookingId}/no-show`),
```

It is **called in `app/shuttle/boarding.tsx`** (Task 1 implementation, lines 74–91), with a full confirmation alert, loading state, and error handling. The boarding screen currently owns the No-Show flow end-to-end.

**It is NOT called anywhere in `trip-active.tsx`.**

### Contract Analysis

| Field | Value |
|---|---|
| HTTP method | `PATCH` |
| Route | `/driver/bookings/:bookingId/no-show` |
| Namespace | `shuttle` in `api.ts` but hits `/driver/bookings/...` path (not `/shuttle/bookings/...`) |
| Request body | None — bookingId is URL-only |
| `stationId` in payload | ❌ Not sent. `boardBooking` accepts an optional `stationId`; `noShowBooking` does not. |
| Response shape | Untyped (`Promise<unknown>`) |
| Backend auto-infer fallback | The backend likely infers no-show from absence of `boardBooking`, but the explicit endpoint exists to fire an immediate signal. |

**No hidden or alternative no-show endpoint exists.** The single `PATCH /driver/bookings/:id/no-show` is the only mechanism defined. There is no shuttle-namespaced equivalent (e.g., no `/shuttle/bookings/:id/no-show`).

### Gap
`noShowBooking` is isolated to the boarding sub-screen. If a driver marks all passengers in the boarding screen and exits without triggering a no-show, the backend relies on inference. The explicit endpoint is available but the decision of where in the flow to call it is a product/UX choice, not a technical blocker.

### Verdict
✅ **Endpoint is implemented and functional.** No-show reporting is NOT inferred-only — an explicit API call exists. Adding it to `trip-active.tsx` (e.g., as a per-passenger swipe action) would be an additive change with no contract risk. The only open question is whether `stationId` should be included in the payload; the current boarding.tsx implementation does not send it.

---

## Proposal 3 — Boarding Failure Visibility & Retry Flow

### Current State on Disk

`handleCompleteStop()` in `trip-active.tsx` (lines 92–102):

```ts
const handleCompleteStop = async () => {
  if (!currentStop) return;
  cardAnim.setValue(0);
  try {
    const checkedIds = passengers.filter(p => p.checkedIn).map(p => p.id);
    await Promise.allSettled(checkedIds.map(id => endpoints.shuttle.boardBooking(id)));
  } catch {
    // best-effort
  }
  nextStop();
};
```

**All boarding confirmations are fire-and-forget.** `Promise.allSettled` never rejects, so the outer `catch` block can never be reached. Individual `boardBooking` failures are structurally impossible to detect with the current code. `nextStop()` always executes regardless of outcome.

### Files Impacted by a Fix

| File | Change required |
|---|---|
| `app/shuttle/trip-active.tsx` | Inspect `allSettled` results, surface failures without blocking `nextStop()` |
| `lib/shuttleContext.tsx` | No changes needed — `nextStop()` is purely local state |
| `lib/api.ts` | No changes needed — `boardBooking` already accepts optional `stationId` |

### Safest Exposure Pattern

Collect the settled results **after** `nextStop()` has already been called, then show a non-blocking `Alert` listing failed passenger IDs. This avoids blocking the driver mid-route. A retry could re-call `boardBooking` for only the rejected IDs without re-advancing the stop index.

### Risk Assessment
**Low risk.** The change is purely additive — current behavior of always advancing is preserved, and error surfacing is bolted on after the advance. The current layout is not affected since the Alert would appear after the card animation resets.

### Verdict
✅ **Safe to implement.** Impact is limited to `trip-active.tsx`. No context changes needed.

---

## Proposal 4 — Separate Loading States for Arrived / Completed Actions

### Current State on Disk

Single shared flag in `trip-active.tsx` (lines 29, 64, 80):

```ts
const [stationActionLoading, setStationActionLoading] = useState(false);
```

Both `handleStationArrived` and `handleStationCompleted` read and write this same boolean. Because only one of them is visible at a time (gated by `stationStatus === 'navigating' | 'arrived'`), the shared flag has not caused visible bugs — but it structurally couples two unrelated operations.

### Context Layer Impact

`stationActionLoading` is **entirely local to `trip-active.tsx`**. It has zero footprint in `ShuttleContext`, `shuttleContext.tsx`, or any hook. Splitting into `arrivedLoading` and `completedLoading` is a pure local component refactor.

### Mutual Exclusivity Confirmation

The two actions are rendered in an `if/else` on `stationStatus`:
- `stationStatus === 'navigating'` → shows "Arrived at station" button (calls `handleStationArrived`)
- `stationStatus === 'arrived'` → shows "Station completed" button (calls `handleStationCompleted`)

They cannot both be visible or in-flight simultaneously under normal flow. Splitting the flag is safe and correct.

### Verdict
✅ **Safe to implement. Zero context risk.** Purely a local state split inside one component. No other file reads `stationActionLoading`. No reactive chain to break.

---

## Proposal 5 — Timeout Auto-Advance Lifecycle Synchronization

### Current State on Disk

Socket handler in `trip-active.tsx` (lines 42–58):

```ts
const handleStationTimeout = (data: { tripId?: string; stationId?: string }) => {
  const tripId = activeLine?.tripId;
  if (!data.tripId || data.tripId === tripId) {
    setStationTimeoutVisible(true);
    // Auto-advance to next station
    nextStop();
  }
};
```

**What is NOT happening:** The handler calls `nextStop()` (local context state advance) but does **not** call `endpoints.trips.stationCompleted(tripId, stationId)` before advancing.

### Assumptions Being Made

The current implementation assumes:

> The backend emits `SHUTTLE_STATION_TIMEOUT` **after** it has already auto-completed the station in its own database. The client is therefore only expected to advance its local UI state, with no API round-trip needed.

**This assumption is unverified** — there is no documentation in the codebase confirming the backend's behavior on timeout. The opposite case (backend expects the client to fire `stationCompleted` before it records completion) would leave the station perpetually in `arrived` state in the database.

### The Synchronization Gap

| Scenario | Backend owns completion on timeout? | Client must call stationCompleted? | Current behavior correct? |
|---|---|---|---|
| A — Backend auto-completes on emit | ✅ Yes | ❌ No | ✅ Correct |
| B — Backend awaits client PATCH | ❌ No | ✅ Yes | ❌ **Bug** |

Both `endpoints.trips.stationArrived` and `endpoints.trips.stationCompleted` are defined in `lib/api.ts`:
```ts
stationArrived: (tripId, stationId) => api.patch(`/driver/trips/${tripId}/stations/${stationId}/arrived`),
stationCompleted: (tripId, stationId) => api.patch(`/driver/trips/${tripId}/stations/${stationId}/completed`),
```

The `data.stationId` is already present in the socket payload type — the PATCH call is feasible without additional data fetching.

**Secondary gap:** No debounce exists on the timeout handler. If the backend emits the event twice (retry, network flap), `nextStop()` fires twice, advancing the stop index by 2.

### Verdict
⚠️ **Requires backend contract clarification before implementation.** This is the only proposal where a safe implementation cannot be determined purely from client-side evidence. The question to confirm with the backend team: *"When `SHUTTLE_STATION_TIMEOUT` is emitted, has the backend already recorded the station as completed, or does it expect a subsequent PATCH from the client?"* A debounce ref guard can be added safely regardless of the answer.

---

## Proposal 6 — Typed Shuttle Completion Response Contract

### Current State on Disk

**Comment-only contract** in `lib/api.ts` (lines 466–469):
```ts
// TODO: Backend Integration - POST /shuttle/lines/:id/complete
// Marks the active trip as completed.
// Returns: { earnedAmount: number, walletBalance: number }
complete: (lineId: string) => api.post(`/shuttle/lines/${lineId}/complete`),
```

**Actual TypeScript return type:** `Promise<unknown>` — `api.post` is a generic function returning the raw parsed response body with no type parameter applied at the call site.

**Consumption in `trip-active.tsx`** (lines 110–111):
```ts
const earned = (result as any)?.earnedAmount ?? (result as any)?.data?.earnedAmount;
const balance = (result as any)?.walletBalance ?? (result as any)?.data?.walletBalance;
```

The double-fallback (`result.earnedAmount ?? result.data.earnedAmount`) reveals the team has already encountered envelope instability — the backend has historically returned the fields both at the root level and nested under `data`. Both paths are guarded.

**No TypeScript interface exists anywhere in the codebase** for this response shape. There is no `ShuttleCompleteResponse`, `TripCompletePayload`, or similar type definition in `lib/api.ts`, `lib/shuttleContext.tsx`, or any shared types file.

**`start` endpoint** has the same comment-only contract (line 462): `{ tripId: string, earnedAmount?: number, walletBalance?: number }` — also untyped.

### Verdict
⚠️ **Backend contract is comment-defined, not type-enforced.** Safe to add a typed interface:

```ts
interface ShuttleCompleteResponse {
  earnedAmount?: number;
  walletBalance?: number;
  data?: { earnedAmount?: number; walletBalance?: number };
}
```

The double-fallback in `trip-active.tsx` is a valid defensive pattern given the observed envelope inconsistency and should be preserved even after typing. No functional change needed — this is a type-safety addition only. Risk: none.

---

## Proposal 7 — Dynamic Currency Configuration

### Current State on Disk

**`lib/i18nContext.tsx` already exposes a currency key:**

| Language | Key | Value |
|---|---|---|
| English | `t.egp` | `'EGP'` |
| Arabic | `t.egp` | `'ج.م'` |

This key is available via `useI18n()` throughout the app.

**Hardcoded `جنيه` occurrences on disk (6 total):**

| File | Line | Context |
|---|---|---|
| `app/(shuttle)/index.tsx` | 435 | Stats card net earnings |
| `app/(shuttle)/bookings.tsx` | 102 | `formatCurrency()` helper function |
| `app/shuttle/history.tsx` | 172 | Summary currency label |
| `app/shuttle/history.tsx` | 299 | History earned label |
| `app/shuttle/trip-complete.tsx` | 110 | Earned amount card |
| `app/shuttle/trip-complete.tsx` | 129 | Wallet balance card |

**Critical mismatch:** `جنيه` (the word "pound" in Arabic, used in all 6 hardcoded sites) is **not the same string** as `ج.م` (the abbreviation stored in `t.egp` for Arabic). They are different representations of the same currency. Replacing hardcoded `جنيه` with `t.egp` would change the displayed text.

**No tenant config module exists.** There is no `config.ts`, `tenantConfig.ts`, `remoteConfig`, or environment-driven currency setting anywhere in the project. The `EXPO_PUBLIC_API_URL` is the only env variable consumed by `lib/api.ts`. Currency is entirely static.

**`formatCurrency()` in `bookings.tsx`** is a module-level helper function, not a hook — it cannot call `useI18n()` directly. It would need to accept the currency symbol as a parameter, or be converted to a hook-based formatter.

### Verdict
✅ **The i18n infrastructure already exists but is unused for currency.** The `t.egp` key is live and accessible. However, the string value `'ج.م'` diverges from the current `جنيه` usage — a product decision is needed on which representation is correct before switching. No tenant config infrastructure exists; adding one would require a new module. For a safe incremental fix, replacing the 6 hardcoded literals with `t.egp` (after resolving the `جنيه` vs `ج.م` discrepancy) is low-risk and confined to 4 files.

---

## Summary Matrix

| # | Proposal | Backend Endpoint Implemented? | Payload Contract Defined? | Safe to Implement? | Key Assumption / Blocker |
|---|---|---|---|---|---|
| 1 | Active Trip Exit Guard | N/A (client-only) | N/A | ✅ Yes | `beforeRemove` is supported by expo-router ~6.0.17 via `useNavigation()` |
| 2 | Explicit No-Show Reporting | ✅ `PATCH /driver/bookings/:id/no-show` | Partial — no `stationId`, response untyped | ✅ Yes | No-show is already wired in `boarding.tsx`; adding to `trip-active.tsx` is additive |
| 3 | Boarding Failure Visibility | ✅ `boardBooking` exists | Partially — `stationId` optional, response untyped | ✅ Yes | Fix is additive after `nextStop()` — no blocking risk |
| 4 | Separate Loading States | N/A (client-only) | N/A | ✅ Yes | Local state only; zero context impact |
| 5 | Timeout Auto-Advance Sync | ✅ `stationCompleted` PATCH exists | ✅ `tripId` + `stationId` in socket payload | ⚠️ Needs clarification | **Backend must confirm: does it auto-complete on timeout emit or await a client PATCH?** |
| 6 | Typed Completion Response | ✅ `POST /shuttle/lines/:id/complete` | Comment-only: `{ earnedAmount, walletBalance }` | ✅ Yes (type-safety only) | Envelope inconsistency already handled by double-fallback — preserve it |
| 7 | Dynamic Currency | N/A | `t.egp` key exists but `جنيه` ≠ `ج.م` | ✅ Yes (after string resolution) | Product must decide: `جنيه` vs `ج.م` before switching literals |

---

*Report generated from static analysis of disk contents. No runtime observations were made.*
