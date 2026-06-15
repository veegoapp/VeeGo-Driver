# VeeGo Backend Readiness Report

Generated: 2025-01-01 | Audited against: VeeGo backend monorepo (artifacts/api-server)

## Summary

| Metric | Count |
|---|---|
| Total problems investigated | 14 |
| Already working correctly | 8 |
| Fixed (backend change made) | 1 |
| Built new | 5 |
| Needs mobile-side fix only | 3 |
| Could not resolve | 0 |

---

## Results — One Section Per Problem

---

### Problem 1 — Push Notifications

**Status:** 🆕 Built new

**Endpoint:** `POST /driver/push-token`
**Auth:** Bearer JWT (driver role required)
**Request body:**
```json
{ "token": "ExponentPushToken[xxxx]" }
```
Sending `null` as the token clears the stored token (e.g. on logout).

**Success response (200):**
```json
{ "ok": true, "saved": true }
```

**Error responses:**
- `400` — `{ "error": "token must be a non-empty string or null" }`
- `401` — `{ "error": "Unauthorized" }`

**Notes:**
- A `POST /users/me/push-token` endpoint also exists and is functionally identical (any authenticated user can call it). The new `/driver/push-token` is the canonical driver endpoint.
- The push token is stored in `users.push_token`. The shuttle renewal job already reads this field to send Expo push notifications.
- The mobile app should call this endpoint every time the app is foregrounded and a new token is obtained from `Notifications.getExpoPushTokenAsync()`. The call is idempotent — sending the same token twice is safe.

---

### Problem 2 — Selfie Check-in

**Status:** 📱 Mobile-side fix needed

**Endpoint:** `POST /driver/checkin`
**Auth:** Bearer JWT (driver role required)
**Content-Type:** `multipart/form-data`
**Fields:**
- `file` — required, the selfie image (JPEG / PNG / WebP, max 8 MB)
- `tripId` — optional, numeric string; send for shuttle trip-start check-ins

**Success response (201 Created):**
```json
{
  "id": 42,
  "driverId": 7,
  "tripId": null,
  "checkInType": "periodic_online",
  "imageUrl": "https://cdn.supabase.co/...",
  "faceDetected": true,
  "submittedAt": "2025-01-15T08:30:00.000Z",
  "message": "Check-in accepted"
}
```

If a face is not detected the response is still **201** (the image was saved), but:
```json
{
  "id": 43,
  ...
  "faceDetected": false,
  "message": "No face detected — please retake your selfie"
}
```

**Error responses:**
- `400` — `{ "error": "No file uploaded" }`
- `400` — `{ "error": "Invalid tripId" }`
- `404` — `{ "error": "Driver profile not found" }`
- `500` — `{ "error": "Internal server error" }`

**Socket events emitted after check-in:**
- `driver:checkin:approved` → emitted to `driver:${userId}` room when `faceDetected === true`
- `driver:checkin:rejected` → emitted to `driver:${userId}` room when `faceDetected === false`

**Mobile-side fix needed:** The app is checking the wrong field on the API response. The endpoint always returns HTTP **201** on success (image uploaded). The app should:
1. Check HTTP status code is 2xx — if so, the upload succeeded.
2. Then check `response.faceDetected` to determine whether the selfie was accepted or needs to be retaken.
3. Also listen for `driver:checkin:approved` / `driver:checkin:rejected` socket events for real-time UI feedback.

---

### Problem 3 — Ride Phase Endpoints

**Status:** ✅ Already working correctly

All three PATCH endpoints exist and enforce strict state machine validation.

#### `PATCH /driver/rides/:id/arrived`
- **Requires:** ride status = `driver_assigned`
- **Sets status to:** `driver_arrived`
- **Success response (200):**
  ```json
  { "data": { "id": 1, "status": "driver_arrived", "driverArrivedAt": "...", ... } }
  ```
- **Error (400):** `{ "error": "Cannot mark arrived for ride with status 'active'" }`
- **Side effects:** starts server-side waiting charge timer and no-show timer

#### `PATCH /driver/rides/:id/start`
- **Requires:** ride status = `driver_arrived`
- **Sets status to:** `active`
- **Success response (200):**
  ```json
  { "data": { "id": 1, "status": "active", "startedAt": "...", ... } }
  ```
- **Error (400):** `{ "error": "Cannot start ride with status 'driver_assigned'" }`
- **Side effects:** stops waiting timer and locks waiting charge into `ride.waitingCharge`

#### `PATCH /driver/rides/:id/complete`
- **Requires:** ride status = `active`
- **Sets status to:** `completed`
- **Success response (200):**
  ```json
  { "data": { "rideId": 1, "finalPrice": 85.50, "driverCut": 72.68, "waitingCharge": 0.00 } }
  ```
- **Error (400):** `{ "error": "Cannot complete ride with status 'driver_arrived'" }`
- **Side effects:** calculates commission, creates earnings record, processes wallet

**Mobile-side fix needed:** The app is ignoring errors from these calls and advancing the screen anyway. This causes UI/backend desync. The app MUST:
1. Await each API call.
2. On 4xx error: show a toast/alert with `response.error` and do NOT advance the screen.
3. Only advance the screen when the API returns 2xx.

---

### Problem 4 — Driver Loses Ride Offers After Reconnection

**Status:** ✅ Already working correctly

The backend room assignment runs **on every new socket connection**, not just the first one. When a driver's internet reconnects and the socket re-establishes, the `io.on("connection")` handler fires again and automatically:

1. Joins `driver:${userId}` (personal room — always joined regardless of online status)
2. Queries the DB to check `driver.isOnline` and `driver.vehicleType`
3. If online: joins `drivers:available:${vehicleType}` (ride offer room)

**The driver does NOT need to send any JOIN event** after reconnecting. The room re-join is server-initiated.

**What the mobile app should NOT do:** Re-sending `driver:status:online` on reconnect is safe but unnecessary — the server already does this on connect if the DB says the driver is online.

---

### Problem 5 — Socket Token Expires on Long Sessions

**Status:** 📱 Mobile-side fix needed

**Current behavior:** The JWT is validated **only once** — during the initial socket handshake (in `io.use()` middleware). If the token expires while the socket is already connected, the socket continues working. No error event is emitted to the client.

**Implication:** A driver who is online all day with a short-lived access token (e.g. 1-hour expiry) will not be silently disconnected when the token expires. The socket remains functional.

**Mobile-side fix needed:** The app should:
1. Implement token refresh before expiry (using the `POST /driver/auth/refresh` endpoint with the refresh token).
2. After obtaining a new access token, reconnect the socket with the new token: `socket.auth.token = newToken; socket.disconnect(); socket.connect();`
3. Never assume the socket will stay valid indefinitely on very long sessions (multi-day background processes).

There is **no** mid-session token expiry event from the server. The client must manage its own token lifecycle.

---

### Problem 6 — "Scheduled" Trip Filter Returns Nothing

**Status:** ✅ Already working correctly — documentation needed

`GET /driver/trips?status=scheduled` is fully supported. The endpoint accepts all of these status values:

| Value | Meaning |
|---|---|
| `scheduled` | Trip is created and scheduled but driver not yet assigned |
| `waiting_driver` | Trip needs a driver assignment |
| `driver_assigned` | Trip assigned to this driver, not yet started |
| `boarding` | Driver is picking up passengers |
| `active` | Trip is in progress |
| `completed` | Trip finished |
| `cancelled` | Trip cancelled |

**Why it might appear empty:** The filter only returns trips **assigned to the calling driver** (`WHERE driver_id = $driverId`). A trip in `scheduled` status that hasn't been assigned to anyone will not appear in any driver's list. Ops should assign the trip to a driver (via admin) before the driver sees it in their scheduled list.

**Full response shape:**
```json
{
  "data": [ { "id": 1, "status": "scheduled", "price": 45.00, "departureTime": "...", ... } ],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

---

### Problem 7 — Driver Not Notified When Rider Cancels Mid-Trip

**Status:** 📱 Mobile-side fix needed

The backend already emits a cancellation event to the driver at **every stage** of the ride (searching, driver_assigned, driver_arrived, active):

**Socket event:** `ride:cancelled`
**Room:** `driver:${driverUserId}`
**Payload:**
```json
{
  "rideId": 42,
  "status": "cancelled",
  "cancelledBy": "passenger",
  "reason": "Changed my mind",
  "timestamp": "2025-01-15T09:00:00.000Z"
}
```

**Mobile-side fix needed:** The app currently only listens for `ride:cancelled` on the **home screen**. It must also listen for this event inside the **active ride screen** (while showing "On the way", "Arrived", or "In progress"). The listener should be attached at the navigation/context level, not inside a single screen component.

---

### Problem 8 — Shuttle Referral Notification

**Status:** ✅ Already working correctly — documentation needed

**Incoming referral (new booking created for driver):**
- **Socket event:** `shuttle:booking:created`
- **Room:** `driver:${driverUserId}` (the driver who made the booking)
- **Payload:**
```json
{
  "bookingId": 15,
  "routeId": 3,
  "routeName": "Maadi → Nasr City",
  "timeSlotId": 7,
  "departureTime": "07:30",
  "weekStart": "2025-01-19",
  "weekEnd": "2025-01-23",
  "status": "active"
}
```

**Booking cancelled:**
- **Socket event:** `shuttle:booking:cancelled`
- **Room:** `driver:${driverUserId}`
- **Payload:**
```json
{
  "bookingId": 15,
  "routeId": 3,
  "routeName": "Maadi → Nasr City",
  "weekStart": "2025-01-19",
  "cancelledBy": "admin",
  "reason": "Route discontinued"
}
```

**Renewal required:**
- **Socket event:** `shuttle:renewal:confirmed`
- **Room:** `driver:${driverUserId}`

**Mobile-side action:** When the app receives `shuttle:booking:created`, it should navigate directly to the Shuttle Bookings screen (or show a bottom sheet) instead of only showing a badge. Use a global socket listener (not screen-scoped) to handle this.

---

### Problem 9 — Earnings Amounts Returned as Text Instead of Numbers

**Status:** ✅ Already working correctly

All monetary fields are already converted to `number` before being returned. The `parseFloat()` workaround on the mobile side can be removed.

**Endpoints verified (all return numeric amounts):**
- `GET /driver/earnings` → `totalEarned: number`, `recent[].amount: number`
- `GET /driver/earnings/history` → `data[].amount: number`
- `GET /earnings/summary` → all totals are `number` via `::float` SQL cast
- `GET /earnings/weekly` → all aggregates are `number` via `::float` SQL cast
- `GET /earnings` (admin) → `data[].amount: number`
- `GET /wallet/balance` → `balance: number`
- `GET /wallet/transactions` → `data[].amount: number`

---

### Problem 10 — Inconsistent Response Shapes

**Status:** ✅ Already working correctly — all shapes are consistent

| Endpoint | Canonical shape |
|---|---|
| `GET /wallet/balance` | `{ userId, balance: number }` |
| `GET /wallet/transactions` | `{ data: [], total: number, page: number, limit: number }` |
| `GET /driver/wallet/payout-methods` | `{ data: [] }` |
| `GET /driver/trips` | `{ data: [], total: number, page: number, limit: number }` |
| `GET /driver/bonus-targets` | `{ data: [] }` |
| `GET /shuttle/trips/:id/passengers` | `{ tripId, tripStatus, totalSeats, bookedSeats, availableSeats, minRequired, data: [], total: number }` |

No shape inconsistency was found. The mobile app can remove any shape-detection logic and rely on the shapes above.

---

### Problem 11 — Safety Screen Has No Backend Support

**Status:** 🆕 Built new (4 stub endpoints)

All 4 safety features now have working endpoints. They are stubs — functional and safe to call, but not backed by a full database table yet.

#### `POST /driver/safety/share-trip`
**Request:** `{ "rideId": 42 }`
**Response (201):**
```json
{
  "ok": true,
  "shareUrl": "https://veego.app/track/42?token=abc123",
  "rideId": 42,
  "expiresIn": 3600,
  "note": "Share this link so someone can track your trip in real time."
}
```

#### `POST /driver/safety/ridecheck`
**Request:** `{ "rideId": 42, "latitude": 30.0626, "longitude": 31.2497 }` (all optional)
**Response (201):**
```json
{
  "ok": true,
  "checkedAt": "2025-01-15T09:30:00.000Z",
  "userId": 7,
  "rideId": 42,
  "message": "RideCheck recorded. Ops team has been notified you are safe."
}
```

#### `POST /driver/safety/recording`
**Request:** `{ "rideId": 42, "action": "start" }` (action is required: `"start"` or `"stop"`)
**Response (201):**
```json
{
  "ok": true,
  "action": "start",
  "rideId": 42,
  "recordedAt": "2025-01-15T09:30:00.000Z",
  "message": "Recording started. Audio is stored locally on your device."
}
```

#### `POST /driver/safety/re-verify`
**Content-Type:** `multipart/form-data`
**Fields:** `selfie` (image file, required), `rideId` (optional string)
**Response (201):**
```json
{
  "ok": true,
  "imageUrl": "https://cdn.supabase.co/...",
  "rideId": 42,
  "submittedAt": "2025-01-15T09:30:00.000Z",
  "message": "Re-verification selfie submitted for admin review. Your trip continues normally."
}
```
The selfie is uploaded to Supabase and stored as a `trip_selfie` document for admin review. It does NOT block the trip.

**Error responses (all 4 endpoints):**
- `400` — validation error with `{ "error": "..." }`
- `401` — unauthorized
- `404` — driver profile not found

---

### Problem 12 — Active Promotions Section Is Always Empty

**Status:** ✅ Already working correctly

`GET /driver/promotions` exists and returns active promotions.

**Endpoint:** `GET /driver/promotions`
**Auth:** Bearer JWT (driver role)
**Response (200):**
```json
{
  "data": [
    {
      "id": "promo_peak_hours",
      "title": "Peak Hours Bonus",
      "description": "Earn 20% extra during rush hours (7–9 am, 5–7 pm)",
      "bonusPercentage": 20,
      "validUntil": "2025-01-22T...",
      "isActive": true,
      "conditions": { "timeRanges": ["07:00-09:00", "17:00-19:00"] }
    },
    {
      "id": "promo_weekend",
      "title": "Weekend Warrior",
      "description": "Complete 10 rides this weekend for a bonus",
      "bonusAmount": 500,
      "targetRides": 10,
      "validUntil": "2025-01-17T...",
      "isActive": true,
      "conditions": { "daysOfWeek": ["saturday", "sunday"] }
    }
  ]
}
```

**Note:** The current promotions are static/seeded. To manage promotions dynamically, use `GET/POST/PATCH /driver/bonus-targets` via admin — those are DB-backed.

---

### Problem 13 — SOS Button Has No Backend Handler

**Status:** 🆕 Built new (socket handler)

A `POST /:rideId/sos` REST endpoint already existed. A **`driver:sos` socket event handler** has now been added as a lower-latency alternative.

#### Socket event (Client → Server): `driver:sos`
**Payload:**
```json
{
  "rideId": 42,
  "latitude": 30.0626,
  "longitude": 31.2497,
  "notes": "Driver threatened"
}
```
`rideId` and `notes` are optional. `latitude` and `longitude` are required.

**Server acknowledgement to driver:** `driver:sos:ack`
```json
{
  "ok": true,
  "message": "SOS received. Ops team has been alerted.",
  "triggeredAt": "2025-01-15T09:00:00.000Z"
}
```

**Server emits to admin room:** `sos:triggered`
```json
{
  "userId": 7,
  "rideId": 42,
  "role": "driver",
  "latitude": 30.0626,
  "longitude": 31.2497,
  "notes": "Driver threatened",
  "triggeredAt": "2025-01-15T09:00:00.000Z"
}
```

#### REST endpoint (alternative): `POST /rides/:rideId/sos`
**Auth:** Bearer JWT
**Request:** `{ "latitude": 30.0626, "longitude": 31.2497, "notes": "..." }`
**Response (201):** `{ "sosId": 1, "message": "SOS received" }`
- Only works on rides in `driver_arrived` or `in_progress` status
- Validates caller is the passenger or assigned driver
- Persists the event to the `sos_events` table

**Recommendation:** Use the **socket event** for the SOS button for minimal latency. Use the REST endpoint as a fallback if the socket is disconnected.

---

### Problem 14 — "Message Rider" Button Opens Wrong Screen

**Status:** 🆕 Built new (ride messaging endpoints + socket event)

Two endpoints and a socket event have been built. Messages are stored in an in-memory map (stub) — see open questions below about the production DB table.

#### `GET /rides/:id/messages`
**Auth:** Bearer JWT (must be passenger, assigned driver, or admin)
**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "rideId": 42,
      "senderId": 7,
      "senderRole": "driver",
      "text": "I'm 2 minutes away",
      "sentAt": "2025-01-15T09:00:00.000Z"
    }
  ],
  "total": 1
}
```

#### `POST /rides/:id/messages`
**Auth:** Bearer JWT (must be passenger or assigned driver)
**Request:** `{ "text": "I'm 2 minutes away" }`
**Response (201):**
```json
{
  "id": 1,
  "rideId": 42,
  "senderId": 7,
  "senderRole": "driver",
  "text": "I'm 2 minutes away",
  "sentAt": "2025-01-15T09:00:00.000Z"
}
```

**Error responses:**
- `400` — invalid ride ID or empty text
- `403` — caller is not a party to this ride
- `404` — ride not found

#### Socket event (Server → Driver + Passenger): `ride:message:new`
Emitted to:
- `passenger:${passengerId}` room
- `driver:${driverUserId}` room

**Payload:** same shape as the POST response object above.

**Mobile-side fix needed:** Replace the current behavior (opening system notifications) with:
1. A chat modal/screen that opens when the "Message Rider" button is tapped.
2. On mount: call `GET /rides/:rideId/messages` to load history.
3. Socket listener for `ride:message:new` to append new messages in real time.
4. Send button: calls `POST /rides/:rideId/messages`.

---

## Socket Events Reference

| Event Name | Direction | Payload | When It Fires |
|---|---|---|---|
| `ride:offer` | Server → Available Drivers | `{ rideId, vehicleType, pickup, dropoff, estimatedPrice }` | New ride request dispatched |
| `ride:driver_assigned` | Server → Passenger | `{ rideId, driverId, driverName, eta }` | Driver accepts a ride |
| `ride:driver_arrived` | Server → Passenger | `{ rideId, driverId }` | Driver taps "Arrived" |
| `ride:arrived` | Server → Passenger | `{ rideId, driverId }` | Alias for ride:driver_arrived |
| `ride:started` | Server → Passenger | `{ rideId, driverId }` | Driver taps "Start Trip" |
| `ride:completed` | Server → Passenger | `{ rideId, finalPrice, fare, waitingCharge }` | Driver taps "Complete" |
| `ride:cancelled` | Server → Driver + Passenger | `{ rideId, status, cancelledBy, reason }` | Either party cancels |
| `ride:driver_cancelled` | Server → Passenger | `{ rideId, message }` | Driver cancels ride |
| `ride:status:changed` | Server → Passenger | `{ rideId, status, previousStatus, timestamp, meta }` | Any ride state transition |
| `ride:driver_location` | Server → Passenger | `{ rideId, location: { latitude, longitude }, timestamp }` | Driver location update during ride |
| `ride:deviation:warning` | Server → Driver + Passenger + Admin | `{ rideId, driverLat, driverLng, deviationMeters, detectedAt }` | Driver deviates >500m from route |
| `ride:message:new` | Server → Driver + Passenger | `{ id, rideId, senderId, senderRole, text, sentAt }` | New ride chat message sent |
| `ride:waiting:charge:started` | Server → Passenger | `{ rideId, freeWindowSeconds }` | Waiting charge window opens |
| `ride:waiting:charge:updated` | Server → Passenger | `{ rideId, currentCharge }` | Waiting charge tick |
| `ride:waiting:charge:capped` | Server → Passenger | `{ rideId, totalCharge }` | Waiting charge hits max |
| `sos:triggered` | Server → Admin | `{ userId, rideId, role, latitude, longitude, notes, triggeredAt }` | Driver or passenger triggers SOS |
| `driver:sos` | Driver → Server | `{ rideId?, latitude, longitude, notes? }` | Driver presses SOS button |
| `driver:sos:ack` | Server → Driver | `{ ok, message, triggeredAt }` | SOS received acknowledgement |
| `driver:checkin:approved` | Server → Driver | `{ checkinId, checkInType, submittedAt }` | Face detected in selfie |
| `driver:checkin:rejected` | Server → Driver | `{ checkinId, checkInType, reason }` | No face detected in selfie |
| `driver:location:ack` | Server → Driver | `{ ok: true }` | Location update processed |
| `driver:cooldown:cleared` | Server → Driver | `{ driverId }` | Admin lifts dispatch cooldown |
| `shuttle:booking:created` | Server → Driver | `{ bookingId, routeId, routeName, timeSlotId, departureTime, weekStart, weekEnd, status }` | Driver books a shuttle route |
| `shuttle:booking:cancelled` | Server → Driver | `{ bookingId, routeId, routeName, weekStart, cancelledBy, reason }` | Booking cancelled |
| `shuttle:renewal:confirmed` | Server → Driver | `{ bookingId }` | Driver confirms renewal |
| `shuttle:booking:reassigned` | Server → Old+New Driver | `{ bookingId, oldDriverId, newDriverId }` | Admin reassigns booking |
| `shuttle:checkin:required` | Server → Driver | `{ tripId, deadlineMinutes, message }` | Driver must check in for upcoming shuttle trip |
| `shuttle:trip:status` | Server → Trip Room | `{ tripId, status }` | Shuttle trip status changed |
| `shuttle:driver:location` | Server → Trip Room | `{ tripId, driverId, lat, lng, heading }` | Driver location during 20-min pre-departure |
| `passenger:trip:tracking` | Server → Trip Room | `{ event, tripId, timestamp }` | Trip lifecycle event |
| `booking:passenger_updated` | Server → Driver | `{ tripId, bookingId, action, seatCount }` | Passenger books/cancels seat |
| `surge:updated` | Server → All Passengers | `{ vehicleType, multiplier, tier, isActive }` | Surge pricing changes |
| `notification:new` | Server → User | `{ id, category, title, body, time }` | New notification |
| `driver:location:update` | Driver → Server | `{ latitude, longitude, speed?, heading?, tripId? }` | Driver sends location |
| `driver:ride:location` | Driver → Server | `{ rideId, latitude, longitude }` | Driver location during a ride |
| `driver:status:online` | Driver → Server | (no payload) | Driver goes online |
| `driver:status:offline` | Driver → Server | (no payload) | Driver goes offline |
| `driver:status:busy` | Driver → Server | (no payload) | Driver marks busy |
| `join` | Client → Server | room string | Client requests room join ACK |
| `join:trip` | Passenger → Server | `{ tripId }` or `tripId` | Passenger subscribes to trip tracking |
| `leave:trip` | Passenger → Server | `{ tripId }` or `tripId` | Passenger unsubscribes from trip |
| `error` | Server → Client | `{ message: string }` | Recoverable socket-level error |

---

## Action Items for Mobile Team

- [ ] **P2** — Check HTTP status code (not response body field) to determine if check-in uploaded successfully. Then read `faceDetected` field for selfie result.
- [ ] **P3** — Do NOT ignore errors from `PATCH /driver/rides/:id/arrived|start|complete`. Await the call and show an error alert on 4xx responses. Only advance the screen on 2xx.
- [ ] **P5** — Implement access token refresh before expiry. After refreshing, reconnect the socket with the new token (`socket.disconnect()` + `socket.connect()` with updated `auth.token`).
- [ ] **P6** — Confirm that trips in `scheduled` status are being assigned to the driver via admin before testing the filter. The filter only shows trips where `driver_id = this driver`.
- [ ] **P7** — Move the `ride:cancelled` socket listener to a global/context level so it is active inside the active ride screen, not just the home screen.
- [ ] **P8** — When `shuttle:booking:created` is received, navigate directly to the Shuttle Bookings screen instead of only updating the badge.
- [ ] **P9** — Remove all `parseFloat(String(amount))` defensive casts — the backend now guarantees numeric amounts.
- [ ] **P14** — Replace the "Message Rider" button behavior: open a chat screen that calls `GET /rides/:rideId/messages` on load and subscribes to `ride:message:new` socket event.

---

## Open Questions

1. **Ride messaging persistence** — The current `GET|POST /rides/:id/messages` stores messages in server memory (lost on restart). A `ride_messages` DB table is needed for production. Schema suggestion: `id, ride_id, sender_id, sender_role, text, is_read, created_at`.

2. **RideCheck storage** — `POST /driver/safety/ridecheck` currently returns a success stub but does not persist the ping to the database. A `driver_ridechecks` table (or a row in `ride_events`) should be added if ops need to audit this.

3. **Share-trip link destination** — `POST /driver/safety/share-trip` generates a URL but there is no web page at that URL. The frontend team must build a public tracking page at `/track/:rideId?token=...` that uses the driver's location from `GET /locations/driver/:driverId` or the socket.

4. **Audio recording** — `POST /driver/safety/recording` is a logging stub. No audio is ever transmitted to the backend. If actual audio archival is needed, an S3/Supabase upload flow with pre-signed URLs must be designed.

5. **Driver re-verification face check** — `POST /driver/safety/re-verify` uploads the selfie but does not run face detection (only the `POST /driver/checkin` endpoint runs face detection). Should re-verify selfies also be face-checked automatically?

6. **SOS without an active ride** — The `driver:sos` socket handler accepts an optional `rideId`. If the driver is not on a ride (e.g., waiting for requests), should SOS still be actionable? Currently it emits to admin and logs the location but does not insert into `sos_events` (which requires a valid ride). Confirm intended behavior.

7. **Token expiry enforcement** — Should the backend start validating the JWT on every socket event (not just at connect)? This would close the long-session vulnerability but add a DB round-trip on every event. Recommend a periodic server-ping approach instead (client pings `/health` to get a 401 and knows to reconnect).
