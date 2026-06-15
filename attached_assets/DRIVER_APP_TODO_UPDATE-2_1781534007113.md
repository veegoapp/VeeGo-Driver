# VeeGo Driver App — Integration TODO Update 2
> For the mobile app team. Everything here is production-ready and live.
> Base URL: `https://<your-domain>/api`
> All authenticated requests require: `Authorization: Bearer <accessToken>`

---

## What's New in This Update

Two **brand-new** driver endpoints are now available:

1. **`GET /shuttle/driver/my-trips`** — Driver trip history with revenue breakdown
2. **`GET /shuttle/route-bookings/:bookingId/trip-detail`** — Detailed info for a specific booking's trip

One **bug fix**:
- The weekly renewal notification cron was firing at **09:00 UTC** — it now fires at exactly **05:00 UTC** (Wednesday mornings). No app code change needed; this is server-only.

---

## New Endpoint 1 — Driver Trip History

Use this to build the "My Trips" / earnings history screen.

### Request

```
GET /api/shuttle/driver/my-trips?page=1&limit=20
Authorization: Bearer <driverAccessToken>
```

| Query Param | Type | Default | Max | Description |
|-------------|------|---------|-----|-------------|
| `page` | integer | 1 | — | Page number (1-based) |
| `limit` | integer | 20 | 100 | Items per page |

### Response

```json
{
  "trips": [
    {
      "id": 55,
      "routeName": "Maadi → Downtown",
      "completedAt": "2026-06-14T10:00:00.000Z",
      "revenueAmount": 100,
      "earnedAmount": 90,
      "passengerCount": 8
    },
    {
      "id": 54,
      "routeName": "Maadi → Downtown",
      "completedAt": "2026-06-13T10:00:00.000Z",
      "revenueAmount": 100,
      "earnedAmount": 90,
      "passengerCount": 11
    }
  ],
  "total": 45
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `trips` | array | Array of completed trip objects |
| `trips[].id` | integer | Trip ID |
| `trips[].routeName` | string | English route name (e.g. "Maadi → Downtown") |
| `trips[].completedAt` | ISO8601 string | When the trip was marked completed (UTC) |
| `trips[].revenueAmount` | number | Full trip price in EGP |
| `trips[].earnedAmount` | number | Driver's earnings after 10% platform commission |
| `trips[].passengerCount` | integer | Number of confirmed passengers on that trip |
| `total` | integer | Total number of completed trips (for pagination) |

### Pagination Logic

```
totalPages = Math.ceil(total / limit)
hasNextPage = page < totalPages
```

### Error Responses

| Status | Body | Cause |
|--------|------|-------|
| 401 | `{ "error": "Missing or invalid authorization header" }` | No/bad token |
| 403 | `{ "error": "Forbidden" }` | Token is not a driver token |
| 404 | `{ "error": "Driver profile not found" }` | Driver profile doesn't exist yet |

---

## New Endpoint 2 — Trip Detail for a Booking

Use this to build the "Trip Detail" screen when a driver taps on a specific weekly booking.

### Request

```
GET /api/shuttle/route-bookings/:bookingId/trip-detail
Authorization: Bearer <driverAccessToken>
```

| Path Param | Type | Description |
|------------|------|-------------|
| `bookingId` | integer | The driver shuttle booking ID (from `/shuttle/route-bookings` list) |

### Response

```json
{
  "bookingId": 42,
  "tripDatetime": "2026-06-15T05:00:00.000Z",
  "routeName": "Maadi → Downtown",
  "bookedSeats": 8,
  "totalSeats": 14,
  "stations": [
    {
      "id": 1,
      "name": "Maadi Metro",
      "order": 1,
      "eta": "07:00"
    },
    {
      "id": 2,
      "name": "Tahrir Square",
      "order": 2,
      "eta": "07:20"
    },
    {
      "id": 3,
      "name": "Downtown Hub",
      "order": 3,
      "eta": "07:40"
    }
  ]
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `bookingId` | integer | The driver shuttle booking ID |
| `tripDatetime` | ISO8601 string | Full departure datetime of the next/current trip (UTC) |
| `routeName` | string | Route name in English |
| `bookedSeats` | integer | Confirmed passenger count for this trip |
| `totalSeats` | integer | Vehicle capacity (14 for hiace, 28 for minibus) |
| `stations` | array | Ordered list of route stations |
| `stations[].id` | integer | Station ID |
| `stations[].name` | string | Station name |
| `stations[].order` | integer | Stop order (1 = first, ascending) |
| `stations[].eta` | string | Estimated arrival time in "HH:MM" format (Cairo local time) |

### How `tripDatetime` works

- The server finds the **next upcoming trip** within the booking's week (Sunday–Thursday) that is in status `scheduled`, `waiting_driver`, `driver_assigned`, `boarding`, or `active`.
- If no active trip is found, it falls back to the most recent trip from the same booking week.
- The value is the trip's full `departureTime` as a UTC ISO8601 string. Display it in the driver's local timezone.

### How station ETAs are calculated

ETAs are derived by dividing the route's total estimated duration evenly across all stops:
- First station ETA = departure time
- Each subsequent station ETA += `estimatedDuration / (numStations - 1)` minutes

### Error Responses

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Invalid booking ID" }` | Non-numeric bookingId |
| 401 | `{ "error": "Missing or invalid authorization header" }` | No/bad token |
| 403 | `{ "error": "Forbidden" }` | Token is not a driver token |
| 403 | `{ "error": "You do not own this booking" }` | BookingId belongs to a different driver |
| 404 | `{ "error": "Driver profile not found" }` | Driver profile doesn't exist |
| 404 | `{ "error": "Booking not found" }` | BookingId doesn't exist |
| 404 | `{ "error": "No trip found for this booking" }` | No trips linked to this booking yet |

---

## Existing Endpoints — Quick Reference for Driver App

These are already integrated or should be integrated. Included here for completeness.

### Authentication

```
POST /api/driver/auth/login
Content-Type: application/json

{ "phone": "+201234567890", "password": "secret123" }
```

Response:
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": { "id": 5, "name": "Mohamed Ali", "role": "driver" }
}
```

---

### Get Driver Profile

```
GET /api/driver/profile
Authorization: Bearer <token>
```

---

### Go Online / Offline

```
PATCH /api/driver/status/online
Authorization: Bearer <token>

PATCH /api/driver/status/offline
Authorization: Bearer <token>
```

---

### Update Location

```
PATCH /api/driver/location
Authorization: Bearer <token>
Content-Type: application/json

{ "latitude": 29.9792, "longitude": 31.1342 }
```

---

### Shuttle — Browse Lines

```
GET /api/shuttle/lines
Authorization: Bearer <token>
```

---

### Shuttle — Get Available Weeks for Booking

```
GET /api/shuttle/lines/:routeId/available-weeks
Authorization: Bearer <token>
```

---

### Shuttle — Get Available Slots for a Week

```
GET /api/shuttle/available-slots?routeId=1&weekStart=2026-06-15
Authorization: Bearer <token>
```

> `weekStart` must be a Sunday in `YYYY-MM-DD` format.

---

### Shuttle — Book a Full Week

```
POST /api/shuttle/lines/:routeId/book-week
Authorization: Bearer <token>
Content-Type: application/json

{
  "slotId": 3,
  "startSundayDate": "2026-06-15",
  "endThursdayDate": "2026-06-19"
}
```

Response:
```json
{
  "bookingId": "42",
  "weekStart": "2026-06-15",
  "weekEnd": "2026-06-19",
  "departure": "07:00",
  "renewalDeadline": "2026-06-17T15:00:00.000Z"
}
```

---

### Shuttle — List My Bookings

```
GET /api/shuttle/route-bookings
Authorization: Bearer <token>
```

---

### Shuttle — Start Today's Trip

```
POST /api/shuttle/route-bookings/:bookingId/start
Authorization: Bearer <token>
```

---

### Shuttle — Complete Today's Trip

```
POST /api/shuttle/route-bookings/:bookingId/complete
Authorization: Bearer <token>
```

---

### Shuttle — Confirm Weekly Renewal

```
POST /api/shuttle/route-bookings/:bookingId/confirm-renewal
Authorization: Bearer <token>
```

---

### Shuttle — Decline Weekly Renewal

```
POST /api/shuttle/route-bookings/:bookingId/decline-renewal
Authorization: Bearer <token>
```

---

### Shuttle — Cancel Booking

First, preview the penalty:

```
GET /api/shuttle/route-bookings/:bookingId/cancel-preview
Authorization: Bearer <token>
```

Response:
```json
{ "penaltyAmount": 50, "minutesUntilDeparture": 90 }
```

Then cancel:

```
POST /api/shuttle/route-bookings/:bookingId/final-cancel
Authorization: Bearer <token>
Content-Type: application/json

{ "reason": "emergency" }
```

Valid reasons: `emergency`, `vehicle`, `illness`, `traffic`, `other`

---

### Shuttle — Get Trip Detail (NEW) ✅

```
GET /api/shuttle/route-bookings/:bookingId/trip-detail
Authorization: Bearer <token>
```

See full spec above.

---

### Shuttle — Trip History (NEW) ✅

```
GET /api/shuttle/driver/my-trips?page=1&limit=20
Authorization: Bearer <token>
```

See full spec above.

---

### Shuttle — Get Passengers for Today's Trip

```
GET /api/shuttle/trips/:tripId/passengers
Authorization: Bearer <token>
```

---

### Board a Passenger

```
PATCH /api/driver/bookings/:bookingId/board
Authorization: Bearer <token>
```

---

### Mark Passenger as Absent

```
PATCH /api/driver/bookings/:bookingId/absent
Authorization: Bearer <token>
```

---

### Mark Arrived at Station

```
PATCH /api/driver/trips/:tripId/stations/:stationId/arrived
Authorization: Bearer <token>
```

---

### Wallet Balance

```
GET /api/driver/wallet/balance
Authorization: Bearer <token>
```

Response: `{ "balance": "1250.50", "currency": "EGP" }`

---

### Earnings This Week

```
GET /api/earnings/summary
Authorization: Bearer <token>
```

Response:
```json
{
  "totalTrips": 12,
  "totalEarnings": "480.00",
  "weekStart": "2026-06-15",
  "weekEnd": "2026-06-19"
}
```

---

### Driver Notifications

```
GET /api/driver/notifications
Authorization: Bearer <token>
```

---

### Register Push Token

```
POST /api/users/me/push-token
Authorization: Bearer <token>
Content-Type: application/json

{ "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }
```

> Register this token on every app launch after login. Required for renewal prompts and slot-released notifications.

---

### Referral Code

```
GET /api/driver/me/referral-code
Authorization: Bearer <token>
```

---

### Refer Another Driver to a Booking

```
POST /api/shuttle/route-bookings/:bookingId/refer
Authorization: Bearer <token>
Content-Type: application/json

{ "driverCode": "VGO-1A2B" }
```

> `driverCode` is the referred driver's unique VeeGo code (format `VGO-XXXX`). Obtain it via `GET /api/driver/me/referral-code` from the referred driver's own session, or display it on the driver's profile screen for them to share manually.

**Success response — 201:**
```json
{ "referralId": "7", "status": "pending" }
```

**Structured error codes:**

| HTTP | `code` | `error` | What to show the user |
|------|--------|---------|-----------------------|
| 400 | `EXPIRED_BOOKING` | "Invalid booking ID" | Invalid link — try again |
| 400 | `EXPIRED_BOOKING` | "Booking not found or does not belong to you" | Booking not found |
| 400 | `EXPIRED_BOOKING` | "Cannot refer a `<status>` booking" | This booking is no longer active |
| 400 | `SELF_REFERRAL` | "You cannot refer a trip to yourself" | You can't refer yourself |
| 404 | `DRIVER_NOT_FOUND` | "driverCode is required" | Enter a driver code |
| 404 | `DRIVER_NOT_FOUND` | "Invalid driver code format" | Code format must be VGO-XXXX |
| 404 | `DRIVER_NOT_FOUND` | "الكود المدخل غير موجود" | Driver code not found |
| 409 | `ALREADY_BOOKED` | "هذا السائق لديه حجز لنفس الموعد بالفعل" | That driver already has a booking for this slot |

> When `code` is present in the response body, use it to drive UI logic. The `error` string is for logging — it may be in Arabic or English depending on the failure path.

---

### Accept a Referral

```
POST /api/shuttle/referrals/:referralId/accept
Authorization: Bearer <token>
```

**Success response — 200:**
```json
{ "success": true, "bookingId": "42" }
```

**Error responses:**

| HTTP | `error` | What to show the user |
|------|---------|----------------------|
| 400 | "Invalid referral ID" | Invalid referral link |
| 403 | "Referral has expired" | This referral has expired |
| 404 | "Driver profile not found" | Driver profile missing — contact support |
| 404 | "Referral not found or already resolved" | Referral no longer available |
| 404 | "Original booking not found" | Booking no longer exists |
| 409 | "You already have a conflicting booking for this slot" | You have a booking that conflicts with this slot |

> These endpoints do **not** use a structured `code` field — match on the `error` string or HTTP status.

---

### Decline a Referral

```
POST /api/shuttle/referrals/:referralId/decline
Authorization: Bearer <token>
```

**Success response — 200:**
```json
{ "success": true }
```

**Error responses:**

| HTTP | `error` | What to show the user |
|------|---------|----------------------|
| 400 | "Invalid referral ID" | Invalid referral link |
| 404 | "Driver profile not found" | Driver profile missing — contact support |
| 404 | "Referral not found or already resolved" | Referral no longer available |

---

## Real-Time Socket Events — Driver App

The driver app must maintain a persistent Socket.IO connection after login. Connect to the API base URL and join the driver's personal room immediately after authentication.

### Joining your room

```javascript
socket.emit("join", { userId: <driverUserId>, role: "driver" });
```

> `driverUserId` is the `id` field of the `user` object returned at login — **not** the driver-table ID.

---

### Event: `booking:passenger_updated`

**Direction:** Server → Driver  
**Room:** `driver:<driverUserId>`

Emitted every time a passenger **books** or **cancels** a seat on one of your shuttle trips. Use this to keep the seat-count display on the active-trip screen up to date in real time without polling.

**Payload:**

```json
{
  "bookingId": 42,
  "tripId": 7,
  "bookedSeats": 9,
  "totalSeats": 14
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bookingId` | integer | The passenger booking that was just created or cancelled |
| `tripId` | integer | The trip the booking belongs to |
| `bookedSeats` | integer | Current confirmed passenger count for this trip (already reflects the change) |
| `totalSeats` | integer | Vehicle capacity (14 for hiace, 28 for minibus) |

**When it fires:**
- A passenger successfully calls `POST /api/bookings` for a trip you are assigned to
- A passenger successfully calls `PATCH /api/bookings/:id/cancel` for a booking on your trip

**How to handle it:**

```javascript
socket.on("booking:passenger_updated", (payload) => {
  const { tripId, bookedSeats, totalSeats } = payload;
  // Update the seat counter on the active-trip screen for tripId.
  // bookedSeats and totalSeats are the authoritative values — no further fetch needed.
  updateSeatDisplay(tripId, bookedSeats, totalSeats);
});
```

**Notes:**
- The event is emitted **after** the booking transaction commits, so `bookedSeats` always reflects the final persisted state.
- If the driver is not connected when the event fires, no event is queued — the next call to `GET /shuttle/route-bookings/:bookingId/trip-detail` will return the current counts.
- The driver app should treat this event as a hint to refresh, not as the only update path. Always fall back to polling if the socket connection drops.

---

## Renewal Flow Summary

The server runs a job every Wednesday at **05:00 UTC** (07:00 Cairo time). Here's what happens and what the app must handle:

1. **Server** — Sends push notification (`type: "renewal_prompt"`) to each driver with an active booking.
2. **App** — Shows renewal prompt when push is received.
3. **Driver confirms** → `POST /shuttle/route-bookings/:id/confirm-renewal`
4. **Driver declines** → `POST /shuttle/route-bookings/:id/decline-renewal`
5. **Driver does nothing** → Booking auto-expires at `renewalDeadline` (10 hours after Wednesday 05:00 UTC).

Push payload shape:
```json
{
  "type": "renewal_prompt",
  "bookingId": "42",
  "routeId": 1,
  "routeName": "Maadi → Downtown",
  "slotId": 3,
  "weekStart": "2026-06-22",
  "deadline": "2026-06-18T15:00:00.000Z"
}
```

---

## Important Notes for All Driver Requests

1. **Token expiry** — Access tokens expire. Use `POST /api/auth/refresh` with the refresh token to get a new one. Store both tokens securely.
2. **Role check** — All `/shuttle/driver/*` and `/shuttle/route-bookings/*` endpoints return `403` if the token is not a driver token.
3. **Booking ownership** — The trip-detail endpoint enforces that you can only view your own bookings. Do not share booking IDs in the UI without ownership checks.
4. **Dates & Timezones** — All `tripDatetime` and `completedAt` values are in **UTC**. Display them in **Africa/Cairo** timezone (UTC+2 in winter, UTC+3 in summer — Egypt does not observe DST since 2011, so always UTC+2).
5. **Station ETAs** — Station ETA strings are pre-formatted in Cairo local time (`"HH:MM"`) by the server. Display them as-is without conversion.
