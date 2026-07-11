# Driver App Cleanup Report

---

## Files Changed

| File | Tasks |
|---|---|
| `lib/certificatePinning.ts` | Task 1, Task 5 |
| `app/_layout.tsx` | Task 1, Task 5 |
| `lib/socketContext.tsx` | Task 4 |
| `constants/socketEvents.ts` | Task 2, Task 5 |
| `lib/api.ts` | Task 3, Task 4, Task 5 |
| `app/(tabs)/home.tsx` | Task 5 |

---

## What Changed and Why

### Task 1 — Certificate Pinning Error Handling

**`lib/certificatePinning.ts`**

The `addSslPinningErrorListener` callback previously only called `console.error`. The native library (`react-native-ssl-public-key-pinning`) already blocks the connection at the TLS layer — the listener is observability-only and does not control pass/fail. The improvement adds a `__DEV__` warning with actionable guidance (three likely causes: certificate rotation, MITM/proxy, misconfigured hash) so developers can diagnose the issue when it occurs during testing. Production behavior is unchanged: `console.error` still fires so the event surfaces in crash reporters and log aggregation. No fake security behavior was added.

Removed the `(TODO #8)` label from the file header — the feature is implemented.

**`app/_layout.tsx`**

Removed the `(TODO #8)` label from the cert pinning initialization comment.

---

### Task 2 — Unused Socket Event Constants

**`constants/socketEvents.ts`**

Confirmed by searching the entire repository: `DRIVER_LOCATION_ACK`, `DRIVER_STATUS_ONLINE`, `DRIVER_TRIP_START`, `DRIVER_STATUS_OFFLINE`, `DRIVER_STATUS_BUSY`, and `DRIVER_TRIP_COMPLETE` are defined in `constants/socketEvents.ts` and are not referenced anywhere else in the codebase (no `socket.on`, `socket.emit`, or import usages found).

They were not deleted. The existing `/* unused — reserved for future */` comments were updated to `/* unused — reserved for future backend compatibility: do not remove */` to make the intent explicit and prevent future developers from removing them thinking they are dead code.

---

### Task 3 — ShuttleCompleteResponse Fallback

**`lib/api.ts`**

`ShuttleCompleteResponse` is defined in `lib/api.ts` and used in exactly one place: `app/shuttle/trip-active.tsx` (`handleFinishRoute`, line 344), which accesses both `result?.earnedAmount ?? result?.data?.earnedAmount` and `result?.walletBalance ?? result?.data?.walletBalance`.

Since the call site actively uses both the root-level and `.data`-nested paths, the double-fallback is still required. The interface was not changed. The comment was improved to:
- Document the specific endpoint it covers (`POST /driver/trips/:id/complete`)
- Explain clearly why both paths exist and that neither should be removed until the backend response shape is confirmed stable
- Point to the consuming call site for traceability

---

### Task 4 — Silent Error Handling

**`lib/socketContext.tsx`**

The `connect_error` handler was an empty callback with only a comment. Added a `__DEV__` log: `console.warn('[Socket] connect_error:', err?.message ?? err)`. This surfaces connection failures during development without adding any user-facing output in production.

**`lib/api.ts` — `requestAvatarChange`**

The JSON parse failure in the avatar-change error path had `catch { /* empty */ }`. Updated to `catch (e) { if (__DEV__) console.warn('[API] Could not parse avatar-request error body as JSON:', e); }`, consistent with the same pattern already applied to the 403 error body parser in the previous task. The fallback behavior (null error body, `ApiError` thrown) is unchanged.

**Other silent catches reviewed and left unchanged:**

| Location | Reason left as-is |
|---|---|
| `lib/authContext.tsx` logout catch | Well-commented: server logout failure must not block local logout |
| `app/safety.tsx` contact load catch | Initial AsyncStorage read — silent fail is correct; UI starts with empty state |
| `hooks/useLocationBroadcast.ts` location/emit catches | All have inline comments explaining the fallback logic |
| `hooks/useActiveLocationTracking.ts` catches | Best-effort location snapshots — already improved in previous task |
| `lib/backgroundLocationTask.ts` catches | Best-effort background task — a single missed update is acceptable by design |

---

### Task 5 — Remove Misleading Comments

All of the following were development tracking labels (`Fix N:`, `Task N:`, `FIX #N:`, `🚀 FIX:`, `TODO #N`) that referred to already-completed work. Each was replaced with a plain description of what the code does.

**`lib/api.ts`**

| Old | New |
|---|---|
| `// Fix 8: callback invoked when server returns 403 account_suspended` | `// Global callback invoked when the server returns 403 account_suspended` |
| `// Fix 8: intercept 403 account_suspended` | `// Intercept 403 account_suspended — invoke global callback before throwing` |
| `// Fix 2: shuttle check-in — POST /driver/checkin with selfie + optional tripId` | `// POST /driver/checkin with selfie + optional tripId` |
| `// Fix 5: correct available-slots endpoint — only returns slots with full-week coverage` | `// GET /shuttle/available-slots — only returns slots with full-week coverage` |
| `// Fix 7: rate a passenger after a trip` | `// POST /shuttle/ratings — rate a passenger after a trip` |

**`constants/socketEvents.ts`**

| Old | New |
|---|---|
| `// Server → Driver: shuttle check-in (Fix 2)` | `// Server → Driver: shuttle check-in` |
| `// Server → Driver: shuttle station timeout (Fix 3)` | `// Server → Driver: shuttle station timeout` |

**`app/_layout.tsx`**

| Old | New |
|---|---|
| `// 🚀 FIX: removed verify-otp from pre-auth screens` | `// verify-otp is excluded: the token does not exist yet during the sign-up OTP flow.` |
| `// 🚀 FIX: block ALL auto navigation during OTP flow` | `// Block auto navigation during OTP flow — token does not exist yet` |

**`app/(tabs)/home.tsx`**

Removed `Task 1:` prefix from 6 comments (location tracking state, refs, start, stop, clean up on unmount, banner) and replaced inline with plain descriptions. Replaced `FIX #3:`, `FIX #4:` (×2), `FIX #6:` labels with plain explanations of the current behavior. Removed the trailing `// Task 1: GPS tracking` comment from the `expo-location` import line.

---

## Not Changed

| Area | Status |
|---|---|
| **Backend** | Untouched — no backend files in this repository |
| **API contracts** | Untouched — no endpoint paths, methods, request/response shapes changed |
| **Database** | Untouched |
| **Authentication logic** | Untouched |
| **Payment logic** | Untouched |
| **Socket event names/payloads** | Untouched — only comments updated; all event string values unchanged |

---

## Verification

```
pnpm run typecheck
```

**Result: 17 errors — all pre-existing. 0 new errors introduced by this task.**

None of the 6 modified files (`lib/certificatePinning.ts`, `app/_layout.tsx`, `lib/socketContext.tsx`, `constants/socketEvents.ts`, `lib/api.ts`, `app/(tabs)/home.tsx`) appear in the error list. All 17 errors are in the same 11 files that were already failing before this task.
