---
name: Backend readiness fixes
description: Mobile-side fixes applied after backend readiness report. Patterns and decisions worth preserving.
---

## Key decisions

**Push token registration**
- Endpoint is `POST /driver/push-token` with body `{ token }` (not `/users/me/push-token`, not platform field).
- `hooks/usePushNotifications.ts` now calls `endpoints.pushTokens.register(t)` after getting the Expo token.

**Selfie / check-in (app/selfie.tsx)**
- `driver.checkin()` returns a raw `Response` (not parsed JSON) — `response.ok` is correct for HTTP status.
- Must also call `response.json()` and check `result.faceDetected === false` to show a retake prompt.
- Selfie is NOT user-initiated mid-trip. It's backend-controlled: shuttle triggers at trip start via `DRIVER_CHECKIN_REQUIRED` socket event; car/scooter/delivery every 10-12 hours (backend config).

**Phase advance guard (app/ride/[rideId].tsx)**
- `setPhase(p.next)` must be inside the `try` block (after `await`), NOT in `finally`.
- On catch: show `Alert.alert('Action Failed', ...)` — do not silently advance.

**Ride cancelled event**
- Listen for `RIDE_CANCELLED` (`ride:cancelled`) in the active ride screen, not globally.
- Payload: `{ rideId }` — filter by rideId to avoid responding to other rides' cancellations.

**SOS button**
- SOS is only in the active ride screen (phase !== 'completed'), NOT the safety screen or home.
- Uses socket emit `driver:sos` with `{ rideId, latitude, longitude }` when socket is connected.
- Falls back to `POST /rides/:rideId/sos` when socket is disconnected.
- expo-location is dynamically imported (`await import('expo-location')`) with try/catch so it degrades gracefully.

**Shuttle socket events**
- Backend uses `shuttle:booking:created` (not `shuttle:referral:incoming`) when a driver's booking is created (including via referral).
- On `shuttle:booking:created`: invalidate `['shuttle-bookings']` query + navigate to `/(shuttle)/bookings`.
- Legacy `shuttle:referral:incoming` listener is kept as a fallback.

**Ride chat screen**
- New screen at `app/ride/chat.tsx` (static segment takes priority over `[rideId]` dynamic segment in Expo Router).
- Navigate from ride screen: `router.push({ pathname: '/ride/chat', params: { rideId } } as any)`.
- Loads `GET /rides/:rideId/messages`, sends `POST /rides/:rideId/messages`, listens for `RIDE_MESSAGE_NEW` socket event.
- Messages are persistent (stored in DB), not session-only.

**Safety screen (app/safety.tsx)**
- "Driver verification" item removed — selfie is always backend-initiated, never user-initiated.
- Real API calls: Share trip → `POST /driver/safety/share-trip`, RideCheck → `POST /driver/safety/ridecheck` (with location), Audio → `POST /driver/safety/recording` with `action: 'start' | 'stop'`.
- `activeRideId` fetched via `endpoints.rides.active()` and passed as optional `rideId` to each endpoint.

**Promotions in earnings (app/(tabs)/earnings.tsx)**
- `GET /driver/promotions` returns `DriverPromotion[]` — uses query key `['driver-promotions']`.
- Falls back to "No active promotions" when the array is empty or the query fails.

**Why:**
These patterns were confirmed correct by the backend readiness report (BACKEND_READINESS_REPORT_1781523990377.md). Apply them consistently in any future ride-flow or safety-flow work.
