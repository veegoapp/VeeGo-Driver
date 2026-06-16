# Backend TODOs — Payment Collection Feature (Driver App)

## Overview

The driver app now shows payment method and fare amount next to each passenger
at each boarding stop. Cash passengers show the amount the driver must collect
(e.g. `💵 45 EGP`), and card/online passengers show `✓ Paid`.

When the driver marks a stop as complete, the app sends cash collection data
back to the backend so financial reports and accounting are accurate.

---

## TODO 1 — Add `paymentMethod` and `fareAmount` to the passengers list

### Endpoint
```
GET /driver/trips/:tripId/stations
```
(or whatever endpoint currently returns the list of passengers per station)

### What needs to change
Each passenger object inside the `passengers` array must include two new fields:

**Current response (example):**
```json
{
  "id": "booking_123",
  "name": "Ahmed Mohamed",
  "phone": "+201001234567",
  "ticket": "TKT-001",
  "luggage": false
}
```

**Required response:**
```json
{
  "id": "booking_123",
  "name": "Ahmed Mohamed",
  "phone": "+201001234567",
  "ticket": "TKT-001",
  "luggage": false,
  "paymentMethod": "cash",
  "fareAmount": 45
}
```

### Accepted values for `paymentMethod`
The app handles all of the following strings (it normalizes them internally):

| Backend sends | App displays |
|---|---|
| `"cash"` | 💵 45 EGP (driver must collect) |
| `"card"` or `"credit"` or `"credit_card"` | ✓ Paid |
| `"online"` or `"wallet"` or `"prepaid"` | ✓ Paid |

### Rules for `fareAmount`
- For `cash` passengers: the exact amount in EGP the driver must collect from this passenger.
- For `card` / `online` passengers: send `0` (the app won't display it anyway).

### Why this is critical
Without this data, the driver has no way to know:
- Who is paying cash vs. who already paid
- How much to collect from each cash passenger

---

## TODO 2 — Accept cash collection data when marking a passenger as boarded

### Endpoint
```
PATCH /driver/bookings/:bookingId/board
```

### What needs to change
The endpoint currently accepts `{ stationId }`. It now needs to also accept
`cashCollected` and `amountCollected` for cash passengers.

**Current request body:**
```json
{
  "stationId": "station_456"
}
```

**New request body (cash passenger):**
```json
{
  "stationId": "station_456",
  "cashCollected": true,
  "amountCollected": 45
}
```

**Request body (card/online passenger — no change):**
```json
{
  "stationId": "station_456"
}
```
> `cashCollected` and `amountCollected` are simply not sent for non-cash passengers.

### What the backend must do with this data
1. Save `cashCollected: true` and `amountCollected: 45` on the booking record.
2. Add to the driver's cash balance for this trip: `driver.tripCashBalance += amountCollected`.
3. This data feeds into the financial reports and end-of-trip cash settlement.

### Why this is critical
Without storing this, there is no record of how much cash the driver physically
collected. Accounting cannot reconcile cash revenue.

---

## TODO 3 — Cash settlement summary per trip

### Suggested endpoint (new)
```
GET /driver/trips/:tripId/cash-summary
```

### Purpose
Gives the driver (and admin) a summary of all cash collected vs. expected for
the entire trip. Useful for end-of-trip cash handover.

### Suggested response
```json
{
  "tripId": "trip_789",
  "driverId": "driver_001",
  "totalCashExpected": 135,
  "totalCashCollected": 90,
  "passengers": [
    {
      "bookingId": "bk_1",
      "name": "Ahmed Mohamed",
      "fareAmount": 45,
      "cashCollected": true,
      "amountCollected": 45
    },
    {
      "bookingId": "bk_2",
      "name": "Sara Ali",
      "fareAmount": 45,
      "cashCollected": false,
      "amountCollected": 0
    },
    {
      "bookingId": "bk_3",
      "name": "Mona Khaled",
      "fareAmount": 45,
      "cashCollected": true,
      "amountCollected": 45
    }
  ]
}
```

### Why this matters
- Driver needs to know total cash to hand over at end of shift.
- Admin dashboard needs per-trip cash reconciliation.
- Detects discrepancies between expected and collected amounts.

---

## TODO 4 — Validate `amountCollected` on the backend

When `PATCH /driver/bookings/:bookingId/board` receives `cashCollected: true`:

1. **Validate** `amountCollected > 0` — reject if zero or missing.
2. **Cross-check** `amountCollected` matches the booking's `fareAmount` stored in the DB.
3. **Log any mismatch** (e.g. driver collected 40 but fare was 45) for accounting review.
4. **Do not block** the boarding if there's a mismatch — just flag it. The driver
   may have given a discount or collected partial payment.

---

## Summary Table

| # | Endpoint | Change | Priority |
|---|---|---|---|
| 1 | `GET /driver/trips/:tripId/stations` | Add `paymentMethod` + `fareAmount` per passenger | 🔴 Critical |
| 2 | `PATCH /driver/bookings/:bookingId/board` | Accept `cashCollected` + `amountCollected` | 🔴 Critical |
| 3 | `GET /driver/trips/:tripId/cash-summary` | New endpoint for cash settlement | 🟡 High |
| 4 | `PATCH /driver/bookings/:bookingId/board` | Validate & log amount mismatches | 🟢 Nice to have |

---

## Data Flow Diagram

```
Backend DB
  └── Booking record
        ├── paymentMethod: "cash"
        └── fareAmount: 45

          ↓ GET /driver/trips/:tripId/stations

Driver App (trip-active screen)
  └── Shows passenger row:
        └── 💵 45 EGP  ← cash badge

          ↓ Driver taps "Mark Arrived" button

Driver App sends:
  PATCH /driver/bookings/:bookingId/board
  {
    stationId: "...",
    cashCollected: true,
    amountCollected: 45
  }

          ↓

Backend DB
  └── Booking record updated:
        ├── status: "boarded"
        ├── cashCollected: true
        └── amountCollected: 45

          ↓

Financial Reports / Admin Dashboard
  └── Trip cash summary, driver settlement, accounting reconciliation
```
