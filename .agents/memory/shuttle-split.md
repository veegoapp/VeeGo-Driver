---
name: shuttleContext split
description: lib/shuttleContext.tsx (823 lines) was split into lib/shuttle/ without changing any consumer imports.
---

## Rule
`lib/shuttleContext.tsx` is now a 1-line thin re-export (`export * from './shuttle/index'`).
Implementation lives in `lib/shuttle/`.

## Structure
```
lib/shuttle/
  types.ts           — 9 exported public types (ShuttleTimeslot, ShuttleRoute,
                       ShuttleBooking, ShuttleStop, VehicleType, ShuttleLine,
                       BoardingPassenger, SlotReleasedAlert, BookingStatusBanner)
  helpers.ts         — Private backend shapes (BackendRoute, BackendTrip,
                       BackendStationWithPassengers exported; BackendTimeslot,
                       BackendStation, StationPassenger, RawDriverBooking private)
                       + all pure helper fns (mapStatus, formatTime, extractRoutes,
                       extractTrips, normalizeBooking, extractBookings,
                       extractTripStations, mapRoute, deriveVehicleType, buildLine)
  ShuttleContext.tsx — ShuttleContextType (private), ShuttleContext, ShuttleProvider,
                       useShuttle — ALL state/queries/socket/actions stay here
  index.ts           — Barrel re-export of public API only
```

**Why:** Zero consumer import changes — all 12 existing exports still resolve through
the thin wrapper. Socket handlers, queries, derived data, and actions were NOT extracted
because they are too tightly coupled to state setters and query invalidation.

**How to apply:** When adding translation-like shuttle types, edit `types.ts` + `helpers.ts`.
Never move socket event logic or query calls out of `ShuttleContext.tsx` — the coupling
is intentional.

## What was deliberately NOT extracted
- `useEffect` socket block (11 events) — reads 3 state setters, queryClient, endpoints, Alert
- `useQuery` calls — feed derived computations in same render scope
- Actions (nextStop, togglePassenger, resetTrip, dismiss*) — close over local state setters
- `ShuttleContextType` — private, only used for createContext call
