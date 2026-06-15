---
name: Backend Contract v2 Alignment
description: Changes applied to the mobile app based on the FINAL VeeGo Shuttle Driver Backend Contract (2026-06-15)
---

## Key API path fixes

| Old | New |
|-----|-----|
| `api.patch('/driver/status/online')` | `api.patch('/driver/status', { status: 'online' })` |
| `api.patch('/driver/status/offline')` | `api.patch('/driver/status', { status: 'offline' })` |
| `api.post('/shuttle/bookings/:id/board')` | `api.patch('/driver/bookings/:id/board')` |
| `endpoints.shuttle.complete(lineId)` — `POST /shuttle/lines/:id/complete` | `endpoints.trips.complete(tripId)` — `PATCH /driver/trips/:id/complete` |
| `endpoints.shuttle.start(bookingId)` — `POST /shuttle/route-bookings/:id/start` | `endpoints.trips.start(tripId)` — `PATCH /driver/trips/:id/start` |

## Login response field
Backend returns `token` (not `accessToken`). App now reads `result.accessToken ?? result.token` in login.tsx.

## New endpoints added
- `endpoints.trips.stationsEta(tripId)` → `GET /driver/trips/:id/stations/eta`
- `endpoints.driver.updateStatus(status)` → `PATCH /driver/status`

## New socket events
- `SHUTTLE_STATION_ARRIVED = "shuttle:station:arrived"` — Server → `trip:{tripId}` room
- `SHUTTLE_STATION_COMPLETED = "shuttle:station:completed"` — Server → `trip:{tripId}` room

## shuttleContext.tsx major change
Station loading changed from `GET /shuttle/lines/:routeId` (no passengers) to `GET /driver/trips/:id/stations` (per-station passenger lists).

New types: `BackendStationWithPassengers` (extends BackendStation with `status`, `progress`, `passengers[]`, `unassignedPassengers[]`) and `StationPassenger` (`bookingId`, `userId`, `userName`, `userPhone`, `status`, `boardingStationId`).

Passenger loading now: station.passengers + (if first station: station.unassignedPassengers). Merges server status (boarded/absent) with local optimistic updates using a prevMap merge.

**Why:** The contract changed `GET /driver/trips/:id/stations` response to include real per-station passenger assignment via `boardingStationId` column added to bookings table.
