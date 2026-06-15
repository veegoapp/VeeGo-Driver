# VeeGo Shuttle Driver Backend Contract (FINAL)

> Generated: 2026-06-15
> Based on: verified codebase audit + implemented fixes in this session
> Server: Express 5 + Socket.IO | DB: PostgreSQL (Drizzle ORM / Neon)

---

## 1. FINAL VERIFIED EXISTING SYSTEM

### 1.1 Existing REST APIs (Pre-existing, unchanged)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/driver/auth/register` | Public | Driver self-registration |
| POST | `/driver/auth/login` | Public | Driver login → returns JWT |
| POST | `/driver/auth/refresh` | Public | Refresh access token |
| GET | `/driver/profile` | Driver | Get driver profile |
| PATCH | `/driver/profile` | Driver | Update profile fields |
| PATCH | `/driver/status` | Driver | Set online/offline/busy/suspended |
| PATCH | `/driver/location` | Driver | Update GPS coordinates (REST path) |
| GET | `/driver/trips` | Driver | List assigned trips (paginated, filterable by status) |
| GET | `/driver/trips/:id` | Driver | Get single trip detail |
| PATCH | `/driver/trips/:id/start` | Driver | Start trip → status: `active` |
| PATCH | `/driver/trips/:id/complete` | Driver | Complete trip → status: `completed` |
| PATCH | `/driver/trips/:id/cancel` | Driver | Cancel trip with reason |
| PATCH | `/driver/bookings/:id/board` | Driver | Mark passenger as boarded |
| PATCH | `/driver/bookings/:id/absent` | Driver | Mark passenger as no-show |
| GET | `/shuttle/trips/:id/passengers` | Authenticated | All passengers for a trip |
| GET | `/shuttle/lines` | Authenticated | All active routes with timeslots |
| GET | `/shuttle/lines/:id` | Public | Route detail + stations + active trips |

### 1.2 Existing WebSocket Events (Pre-existing, unchanged)

**Connection:**
```
wss://<host>
Headers: { Authorization: "Bearer <driver_token>" }
```

**Driver sends → Server:**

| Event | Payload | Effect |
|-------|---------|--------|
| `driver:location:update` | `{ latitude, longitude, speed?, heading?, tripId? }` | Updates DB + broadcasts to trip room + admin room |
| `driver:status:online` | — | Sets driver online |
| `driver:status:offline` | — | Sets driver offline |
| `driver:status:busy` | — | Sets driver busy |
| `join` | `{ token: <jwt> }` | Authenticates socket session |
| `join:trip` | `{ tripId: number }` | Join trip room (for tracking) |
| `leave:trip` | `{ tripId: number }` | Leave trip room |

**Server sends → Driver:**

| Event | Room | Payload | Trigger |
|-------|------|---------|---------|
| `driver:location:ack` | socket direct | `{ ok: true }` | After each location update |
| `notification:new` | `driver:{userId}` | `{ id, category, title, body, time, tripId? }` | Any notification |
| `shuttle:booking:created` | `driver:{userId}` | booking data | New passenger books their trip |
| `shuttle:booking:cancelled` | `driver:{userId}` | booking data | Passenger cancels |
| `booking:passenger_updated` | `driver:{userId}` | `{ bookingId, tripId, bookedSeats, totalSeats }` | Any seat count change |
| `shuttle:checkin:required` | `driver:{userId}` | `{ tripId, deadline }` | Goes online ≤20 min before departure |
| `shuttle:station:timeout` | `driver:{userId}` | `{ tripId, stationId }` | 1 min after station arrived, not all passengers marked |
| `shuttle:renewal:confirmed` | `driver:{userId}` | renewal data | After priority renewal confirmed |
| `shuttle:booking:reassigned` | `driver:{userId}` | reassignment data | Admin reassigns a booking |
| `driver:checkin:approved` | `driver:{userId}` | — | Admin approves selfie checkin |
| `driver:checkin:rejected` | `driver:{userId}` | `{ reason }` | Admin rejects selfie checkin |
| `driver:cooldown:cleared` | `driver:{userId}` | — | Admin manually lifts dispatch cooldown |
| `error` | socket direct | `{ message }` | Invalid socket payload |

**Server sends → Passenger (via trip room):**

| Event | Room | Payload | Trigger |
|-------|------|---------|---------|
| `shuttle:driver:location` | `trip:{tripId}` | `{ tripId, driverId, lat, lng, heading }` | Every driver GPS update with `tripId` |
| `shuttle:trip:status` | `trip:{tripId}` | `{ tripId, passengerCount }` | Booking cancelled (seat count changes) |
| `booking:boarded` | `passenger:{userId}` | `{ bookingId, tripId, timestamp }` | Driver marks passenger as boarded |

### 1.3 Existing Data Models (Pre-existing, unchanged)

**`routesTable`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `name` | text | English name |
| `nameAr` | text | Arabic name |
| `fromLocation` | text | Origin label |
| `fromLocationAr` | text | Arabic origin |
| `toLocation` | text | Destination label |
| `toLocationAr` | text | Arabic destination |
| `estimatedDuration` | integer | Total route minutes (static, whole route) |
| `basePrice` | numeric(10,2) | |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamptz | |

**`stationsTable`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `routeId` | FK → routes (cascade delete) | |
| `name` | text | English name |
| `nameAr` | text | Arabic name |
| `latitude` | real | GPS latitude |
| `longitude` | real | GPS longitude |
| `order` | integer | Sequence along route (1-based) |
| `direction` | text | `outbound` / `inbound` |
| `segmentPrice` | numeric(10,2) | Per-segment price |
| `createdAt` | timestamptz | |

**`tripsTable`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `routeId` | FK → routes | |
| `scheduleId` | FK → routeSchedules, nullable | |
| `busId` | FK → buses, nullable | |
| `driverId` | FK → drivers, nullable | |
| `departureTime` | timestamptz | |
| `arrivalTime` | timestamptz | |
| `availableSeats` | integer | Live decrement on booking |
| `totalSeats` | integer | |
| `price` | numeric(10,2) | |
| `status` | enum | `scheduled→waiting_driver→driver_assigned→boarding→active→completed/cancelled` |
| `vehicleType` | enum | `hiace` / `minibus` |
| `recurringType` | enum | `one_time/daily/weekdays/weekends/custom` |
| `cancelReason` | text, nullable | |
| `acceptedAt` | timestamptz, nullable | |
| `arrivedAt` | timestamptz, nullable | |
| `startedAt` | timestamptz, nullable | |
| `completedAt` | timestamptz, nullable | |
| `cancelledAt` | timestamptz, nullable | |
| `createdAt` / `updatedAt` | timestamptz | |

**`tripStationProgressTable`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `tripId` | FK → trips (cascade delete) | |
| `stationId` | FK → stations (cascade delete) | |
| `status` | enum | `pending` / `arrived` / `completed` |
| `arrivedAt` | timestamptz, nullable | |
| `completedAt` | timestamptz, nullable | |
| `createdAt` | timestamptz | |
| Unique constraint | `(tripId, stationId)` | |

**`bookingsTable`** (see NEW field in Section 6)

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `userId` | FK → users | |
| `tripId` | FK → trips | |
| `seatCount` | integer | Always 1 for shuttle |
| `totalPrice` | numeric(10,2) | |
| `status` | enum | `pending/confirmed/boarded/absent/cancelled/completed` |
| `paymentStatus` | enum | `pending/paid/refunded` |
| `paymentMethod` | text | `wallet` / `cash` |
| `promoCodeId` | FK → promoCodes, nullable | |
| `boardingStationId` | integer, nullable | **NEW — see Section 2** |
| `createdAt` / `updatedAt` | timestamptz | |

---

## 2. NEWLY ADDED FEATURES (FROM THIS SESSION)

### A. Per-Station ETA Endpoint — NEW

**Endpoint:** `GET /driver/trips/:id/stations/eta`
**Auth:** Driver JWT required

**What it does:**
Reads the driver's current GPS from `driversTable.currentLatitude / currentLongitude` and computes straight-line ETA from driver position to each non-completed station using haversine distance at 30 km/h.

**Request:**
```http
GET /driver/trips/17/stations/eta
Authorization: Bearer <driver_token>
```

**Response 200:**
```json
{
  "tripId": 17,
  "driverLocation": { "lat": 30.044, "lng": 31.235 },
  "stations": [
    {
      "stationId": 12,
      "name": "Station A",
      "order": 1,
      "latitude": 30.050,
      "longitude": 31.220,
      "status": "completed",
      "etaMinutes": null
    },
    {
      "stationId": 13,
      "name": "Station B",
      "order": 2,
      "latitude": 30.070,
      "longitude": 31.240,
      "status": "arrived",
      "etaMinutes": 4
    },
    {
      "stationId": 14,
      "name": "Station C",
      "order": 3,
      "latitude": 30.095,
      "longitude": 31.260,
      "status": "pending",
      "etaMinutes": 11
    }
  ],
  "nextStation": {
    "stationId": 13,
    "name": "Station B",
    "order": 2,
    "latitude": 30.070,
    "longitude": 31.240,
    "status": "arrived",
    "etaMinutes": 4
  }
}
```

**Response 422** — if driver has not sent a GPS update yet:
```json
{ "error": "Driver GPS location not available" }
```

**ETA formula:**
```
distKm = haversine(driverLat, driverLng, stationLat, stationLng)
etaMinutes = round((distKm / 30) * 60)
```

**Completed stations** return `etaMinutes: null`.
`nextStation` is the first station whose status is not `completed`.

---

### B. Per-Station Passenger Assignment — NEW + UPDATED

#### B1. Database Change — NEW column

**Migration applied:**
```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS boarding_station_id INTEGER REFERENCES stations(id);
```

Column: `boardingStationId` (integer, nullable, FK → stations)

Existing bookings retain `boardingStationId = null` — these are treated as unassigned and surfaced at the first station (`order = 1`) in the driver UI.

#### B2. Booking Creation — UPDATED

**Endpoint:** `POST /bookings`
**Auth:** Passenger JWT

The request body now accepts an optional `boardingStationId` field:

```json
{
  "tripId": 17,
  "seatCount": 1,
  "paymentMethod": "wallet",
  "boardingStationId": 13
}
```

- `boardingStationId` is optional. If omitted or invalid, it is stored as `null`.
- Must be a positive integer. Non-integer and negative values are silently ignored (stored as null).
- No validation that the station belongs to the trip's route is enforced at the API layer — client should send a valid station ID from the same route.

#### B3. Station Listing — UPDATED

**Endpoint:** `GET /driver/trips/:id/stations`

The response no longer contains `expectedPassengers`. It now contains real per-station passenger lists:

```json
{
  "data": [
    {
      "id": 12,
      "routeId": 3,
      "name": "Station A",
      "nameAr": "محطة أ",
      "latitude": 30.050,
      "longitude": 31.220,
      "order": 1,
      "direction": "outbound",
      "segmentPrice": "5.00",
      "progress": null,
      "status": "pending",
      "passengers": [
        {
          "bookingId": 55,
          "userId": 100,
          "seatCount": 1,
          "status": "confirmed",
          "boardingStationId": 12,
          "userName": "Ahmed Hassan",
          "userPhone": "+201001234567"
        }
      ],
      "unassignedPassengers": [
        {
          "bookingId": 60,
          "userId": 105,
          "seatCount": 1,
          "status": "confirmed",
          "boardingStationId": null,
          "userName": "Sara Khalil",
          "userPhone": "+201009876543"
        }
      ]
    },
    {
      "id": 13,
      "routeId": 3,
      "name": "Station B",
      "order": 2,
      "status": "pending",
      "passengers": [
        {
          "bookingId": 56,
          "userId": 101,
          "seatCount": 1,
          "status": "confirmed",
          "boardingStationId": 13,
          "userName": "Omar Saad",
          "userPhone": "+201112345678"
        }
      ],
      "unassignedPassengers": []
    }
  ]
}
```

**Rules:**
- `passengers` — bookings where `boardingStationId` matches this station's `id`.
- `unassignedPassengers` — bookings where `boardingStationId IS NULL`, shown **only on the first station** (`order = 1`). Empty array on all other stations.
- Booking statuses included: `pending`, `confirmed`, `boarded`, `absent`.

---

### C. Station Lifecycle WebSocket Events — NEW

Two new events have been added to the socket event registry and are emitted to the `trip:{tripId}` room.

#### `shuttle:station:arrived`

**Emitted by:** `PATCH /driver/trips/:id/stations/:stationId/arrived`
**Room:** `trip:{tripId}` (all passengers and admin subscribed to this trip)

**Payload:**
```json
{
  "tripId": 17,
  "stationId": 13,
  "arrivedAt": "2026-06-15T10:30:00.000Z"
}
```

#### `shuttle:station:completed`

**Emitted by:** `PATCH /driver/trips/:id/stations/:stationId/completed`
**Room:** `trip:{tripId}` (all passengers and admin subscribed to this trip)

**Payload:**
```json
{
  "tripId": 17,
  "stationId": 13,
  "completedAt": "2026-06-15T10:35:00.000Z"
}
```

**To receive these events, passengers must join the trip room:**
```
Client emits: "join:trip"
Payload: { tripId: 17 }
```

---

## 3. COMPLETE DRIVER FLOW

### Phase 0 — Authentication

```http
POST /driver/auth/login
Content-Type: application/json

{ "credential": "phone_or_email", "password": "secure_pass" }
```

**Response:**
```json
{
  "token": "<access_token>",
  "refreshToken": "<refresh_token>",
  "driver": { "id": 5, "name": "Ahmed", "status": "offline", ... }
}
```

Store `token`. All subsequent requests use `Authorization: Bearer <token>`.

---

### Phase 1 — Go Online + Connect Socket

**REST:**
```http
PATCH /driver/status
{ "status": "online" }
```

**Socket:**
```
Connect: wss://<host>  (Header: Authorization: Bearer <token>)
Emit: "join" { token: "<token>" }
```

If a shuttle trip departs within 20 minutes, driver receives:
```json
{ "event": "shuttle:checkin:required", "tripId": 17, "deadline": "2026-06-15T10:45:00Z" }
```

Start sending GPS immediately:
```json
{ "event": "driver:location:update", "latitude": 30.044, "longitude": 31.235, "tripId": 17 }
```

---

### Phase 2 — Load Assigned Trip

```http
GET /driver/trips?status=driver_assigned
```

Get detailed trip view:
```http
GET /driver/trips/17
```

Response includes: `routeId`, `departureTime`, `arrivalTime`, `status`, `totalSeats`, `availableSeats`, `vehicleType`.

---

### Phase 3 — Load Route + Stations

```http
GET /driver/trips/17/stations
```

Returns ordered station list with per-station passenger lists. See Section 2B3 for full shape.

For ETA to each upcoming station:
```http
GET /driver/trips/17/stations/eta
```

---

### Phase 4 — Start Trip

```http
PATCH /driver/trips/17/start
```

Trip status → `active`. `startedAt` is recorded. Driver must now proceed station by station.

---

### Phase 5 — Station-by-Station Loop

For each station in order:

#### 5a. Mark Arrived
```http
PATCH /driver/trips/17/stations/13/arrived
```
- DB: `tripStationProgressTable` → `status: "arrived"`, `arrivedAt: now`
- Broadcasts `shuttle:station:arrived` to `trip:17` room
- Server starts 1-minute timer; if not all passengers marked → `shuttle:station:timeout` sent to driver

#### 5b. Board Each Passenger
```http
PATCH /driver/bookings/55/board
```
- DB: `bookingsTable.status` → `"boarded"`
- Passenger receives `booking:boarded` on `passenger:{userId}`

#### 5c. Mark Absent Passengers
```http
PATCH /driver/bookings/56/absent
```
- DB: `bookingsTable.status` → `"absent"`
- 1st offence → warning notification to passenger
- 2nd+ offence → ticket price deducted from passenger wallet
- Passenger receives `notification:new`

#### 5d. Mark Station Completed
```http
PATCH /driver/trips/17/stations/13/completed
```
- DB: `tripStationProgressTable` → `status: "completed"`, `completedAt: now`
- Broadcasts `shuttle:station:completed` to `trip:17` room

Repeat 5a–5d for next station.

---

### Phase 6 — Complete Trip

```http
PATCH /driver/trips/17/complete
```

- Trip status → `completed`, `completedAt: now`
- All `boarded` bookings → `completed`
- Driver status → `online`
- Driver and each passenger receive `notification:new` with rating prompt

---

### Phase 7 — Cancel Trip (any phase)

```http
PATCH /driver/trips/17/cancel
Content-Type: application/json

{ "reason": "Mechanical failure" }
```

- Trip status → `cancelled`
- Driver status → `online`

---

## 4. FINAL API CONTRACT

### Authentication Endpoints

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|--------------|----------|
| POST | `/driver/auth/register` | Public | `{ name, email, phone, password, licenseNumber?, nationalId? }` | `{ token, refreshToken, driver }` |
| POST | `/driver/auth/login` | Public | `{ credential, password }` | `{ token, refreshToken, driver }` |
| POST | `/driver/auth/refresh` | Public | `{ refreshToken }` | `{ token, refreshToken }` |

### Driver Profile

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|--------------|----------|
| GET | `/driver/profile` | Driver | — | Driver profile object |
| PATCH | `/driver/profile` | Driver | Profile fields | Updated driver |
| PATCH | `/driver/status` | Driver | `{ status: "online"\|"offline"\|"busy"\|"suspended" }` | Updated driver |

### GPS Location (REST)

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|--------------|----------|
| PATCH | `/driver/location` | Driver | `{ latitude, longitude, speed?, heading?, tripId? }` | Updated driver |

### Trip Management

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/driver/trips` | Driver | `?status=&page=&limit=` |
| GET | `/driver/trips/:id` | Driver | Single trip |
| PATCH | `/driver/trips/:id/start` | Driver | Trip → `active` |
| PATCH | `/driver/trips/:id/complete` | Driver | Trip → `completed` |
| PATCH | `/driver/trips/:id/cancel` | Driver | Body: `{ reason }` |

### Station Management

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/driver/trips/:id/stations` | Driver | Per-station passenger lists (UPDATED) |
| GET | `/driver/trips/:id/stations/eta` | Driver | ETA per station from driver GPS (NEW) |
| PATCH | `/driver/trips/:id/stations/:stationId/arrived` | Driver | Emits `shuttle:station:arrived` (UPDATED) |
| PATCH | `/driver/trips/:id/stations/:stationId/completed` | Driver | Emits `shuttle:station:completed` (UPDATED) |

### Passenger Boarding

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| PATCH | `/driver/bookings/:id/board` | Driver | `booking.status` → `boarded`; emits `booking:boarded` to passenger |
| PATCH | `/driver/bookings/:id/absent` | Driver | `booking.status` → `absent`; offence tracking + wallet deduction on 2nd+ |

### Passenger Data

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/shuttle/trips/:id/passengers` | Authenticated | All passengers for trip (flat list) |

### Booking Creation (Passenger-facing, relevant for `boardingStationId`)

| Method | Endpoint | Auth | Request Body |
|--------|----------|------|--------------|
| POST | `/bookings` | Passenger | `{ tripId, seatCount: 1, paymentMethod, promoCode?, boardingStationId? }` (UPDATED) |

---

## 5. FINAL WEBSOCKET EVENT MAP

### Client → Server

| Event | Auth Required | Payload | Effect |
|-------|---------------|---------|--------|
| `join` | Yes | `{ token }` | Authenticate socket |
| `driver:location:update` | Driver | `{ latitude, longitude, speed?, heading?, tripId? }` | Update DB + broadcast |
| `driver:ride:location` | Driver | `{ rideId, latitude, longitude }` | Per-ride location for ride-share |
| `driver:status:online` | Driver | — | Set online |
| `driver:status:offline` | Driver | — | Set offline |
| `driver:status:busy` | Driver | — | Set busy |
| `join:trip` | Yes | `{ tripId }` | Join trip room (receive tracking) |
| `leave:trip` | Yes | `{ tripId }` | Leave trip room |
| `passenger:join:trip` | Yes | `{ tripId }` | Alias for `join:trip` |
| `driver:sos` | Driver | `{ rideId, latitude, longitude, notes? }` | Trigger SOS |

### Server → Driver

| Event | Room | Payload | Trigger |
|-------|------|---------|---------|
| `driver:location:ack` | socket | `{ ok: true }` | After `driver:location:update` |
| `notification:new` | `driver:{userId}` | `{ id, category, title, body, time, tripId? }` | Any notification |
| `shuttle:checkin:required` | `driver:{userId}` | `{ tripId, deadline }` | Online ≤20 min before departure |
| `shuttle:station:timeout` | `driver:{userId}` | `{ tripId, stationId }` | 1 min after arrived, passengers not all marked |
| `shuttle:booking:created` | `driver:{userId}` | booking data | New passenger books |
| `shuttle:booking:cancelled` | `driver:{userId}` | booking data | Passenger cancels |
| `booking:passenger_updated` | `driver:{userId}` | `{ bookingId, tripId, bookedSeats, totalSeats }` | Seat count changes |
| `shuttle:renewal:confirmed` | `driver:{userId}` | renewal data | Priority renewal confirmed |
| `shuttle:booking:reassigned` | `driver:{userId}` | `{ oldDriverId, newDriverId, bookingId }` | Admin reassigns |
| `driver:checkin:approved` | `driver:{userId}` | — | Selfie approved |
| `driver:checkin:rejected` | `driver:{userId}` | `{ reason }` | Selfie rejected |
| `driver:cooldown:cleared` | `driver:{userId}` | — | Dispatch cooldown lifted |
| `error` | socket | `{ message }` | Invalid payload |

### Server → Trip Room (passengers + admin subscribe via `join:trip`)

| Event | Room | Payload | Trigger |
|-------|------|---------|---------|
| `shuttle:driver:location` | `trip:{tripId}` | `{ tripId, driverId, lat, lng, heading }` | Every driver GPS update |
| `shuttle:trip:status` | `trip:{tripId}` | `{ tripId, passengerCount }` | Booking cancelled |
| `shuttle:station:arrived` | `trip:{tripId}` | `{ tripId, stationId, arrivedAt }` | **NEW** — driver marks station arrived |
| `shuttle:station:completed` | `trip:{tripId}` | `{ tripId, stationId, completedAt }` | **NEW** — driver marks station completed |

### Server → Passenger (personal room)

| Event | Room | Payload | Trigger |
|-------|------|---------|---------|
| `booking:boarded` | `passenger:{userId}` | `{ bookingId, tripId, timestamp }` | Driver boards passenger |
| `notification:new` | `passenger:{userId}` | `{ id, category, title, body, time }` | Any notification |

---

## 6. DATA MODEL (FINAL STATE)

### `bookings` table — UPDATED

```
id                  serial PRIMARY KEY
user_id             integer NOT NULL REFERENCES users(id)
trip_id             integer NOT NULL REFERENCES trips(id)
seat_count          integer NOT NULL
total_price         numeric(10,2) NOT NULL
status              booking_status NOT NULL DEFAULT 'confirmed'
                    → enum: pending | confirmed | boarded | absent | cancelled | completed
payment_status      payment_status NOT NULL DEFAULT 'paid'
                    → enum: pending | paid | refunded
payment_method      text NOT NULL DEFAULT 'wallet'
promo_code_id       integer REFERENCES promo_codes(id)
boarding_station_id integer REFERENCES stations(id)   ← NEW
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
```

### `stations` table — UNCHANGED

```
id              serial PRIMARY KEY
route_id        integer NOT NULL REFERENCES routes(id) ON DELETE CASCADE
name            text NOT NULL
name_ar         text
latitude        real NOT NULL
longitude       real NOT NULL
order           integer NOT NULL
direction       text NOT NULL DEFAULT 'outbound'
segment_price   numeric(10,2)
created_at      timestamptz NOT NULL DEFAULT now()
```

### `trip_station_progress` table — UNCHANGED

```
id            serial PRIMARY KEY
trip_id       integer NOT NULL REFERENCES trips(id) ON DELETE CASCADE
station_id    integer NOT NULL REFERENCES stations(id) ON DELETE CASCADE
status        station_progress_status NOT NULL DEFAULT 'pending'
              → enum: pending | arrived | completed
arrived_at    timestamptz
completed_at  timestamptz
created_at    timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id, station_id)
```

### `trips` table — UNCHANGED

```
id               serial PRIMARY KEY
route_id         integer NOT NULL REFERENCES routes(id)
schedule_id      integer REFERENCES route_schedules(id)
bus_id           integer REFERENCES buses(id)
driver_id        integer REFERENCES drivers(id)
departure_time   timestamptz NOT NULL
arrival_time     timestamptz NOT NULL
available_seats  integer NOT NULL
total_seats      integer NOT NULL
price            numeric(10,2) NOT NULL
status           trip_status NOT NULL DEFAULT 'scheduled'
                 → enum: scheduled | waiting_driver | driver_assigned | boarding | active | completed | cancelled
vehicle_type     shuttle_vehicle_type NOT NULL DEFAULT 'hiace'
                 → enum: hiace | minibus
recurring_type   recurring_type NOT NULL DEFAULT 'one_time'
cancel_reason    text
accepted_at      timestamptz
arrived_at       timestamptz
started_at       timestamptz
completed_at     timestamptz
cancelled_at     timestamptz
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()
```

### `routes` table — UNCHANGED

```
id                  serial PRIMARY KEY
name                text NOT NULL
name_ar             text
from_location       text NOT NULL
from_location_ar    text
to_location         text NOT NULL
to_location_ar      text
estimated_duration  integer NOT NULL   (total minutes, whole route, static)
base_price          numeric(10,2) NOT NULL
is_active           boolean NOT NULL DEFAULT true
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
```

---

## 7. TRUTH SOURCE RULE

| Concern | Source of Truth | Notes |
|---------|----------------|-------|
| **Route definition** | `routesTable` | Admin-managed. Name, origin, destination, estimated duration, base price. Never modified by driver or passenger. |
| **Station coordinates & order** | `stationsTable` | Admin-managed. `latitude`, `longitude`, `order` are the authoritative stop positions. Never derived or approximated. |
| **Passenger assignment to station** | `bookingsTable.boardingStationId` | Set at booking creation time by the passenger app. `null` means unassigned — displayed at station `order = 1` as fallback. No equal-split or approximation logic exists. |
| **Trip state** | `tripsTable.status` | Mutated only by the state machine in the API. Valid transitions enforced server-side. Driver calls trigger transitions; no client-side status writing. |
| **Station progress state** | `tripStationProgressTable` | Written by driver REST calls only (`/arrived`, `/completed`). Unique per `(tripId, stationId)`. Uses upsert — safe to call multiple times. |
| **Driver GPS** | `driversTable.currentLatitude / currentLongitude` | Overwritten on every location update (REST or WebSocket). `locationUpdatedAt` tracks freshness. Stale threshold: 10 minutes. |
| **Seat availability** | `tripsTable.availableSeats` | Decremented atomically on booking, incremented atomically on cancellation. `FOR UPDATE` row lock prevents overbooking. |
| **Booking status** | `bookingsTable.status` | Driver transitions: `confirmed → boarded` or `confirmed → absent`. System transitions: `boarded → completed` on trip complete. |
