# VeeGo Driver — Complete Backend Integration TODO Report

> **Scope:** Full static audit of all `// TODO` / `// FIXME` comments and unresolved API endpoint mappings across `app/`, `lib/`, `components/`, `hooks/`, and `constants/`.
> **Date:** June 14, 2026
> **Purpose:** Backend-team reference — every item maps directly to a controller, route, or cron job that must be built or confirmed before the feature is production-ready.

---

## Table of Contents

| # | Domain | Item |
|---|--------|------|
| A | Global / Infrastructure | [Accept-Language Contract](#a1-accept-language-contract) |
| A | Global / Infrastructure | [Expo Push Token Registration](#a2-expo-push-token-registration) |
| B | Driver Profile & Registration | [GET /driver/profile (Enriched)](#b1-get-driverprofile-enriched) |
| B | Driver Profile & Registration | [POST /driver/profile/avatar-request](#b2-post-driverprofileavatar-request) |
| B | Driver Profile & Registration | [POST /driver/register/service-type](#b3-post-driverregisterservice-type) |
| B | Driver Profile & Registration | [POST /driver/register/vehicle-details](#b4-post-driverregistervehicle-details) |
| B | Driver Profile & Registration | [Vehicle Metadata Endpoints](#b5-vehicle-metadata-endpoints) |
| C | Shuttle Lines | [Localized Route & Station Names](#c1-localized-route--station-names) |
| C | Shuttle Lines | [Taken-By Driver Name on Slots](#c2-taken-by-driver-name-on-slots) |
| D | Shuttle Booking Lifecycle | [POST /shuttle/lines/:id/book-week](#d1-post-shuttlelinesidbook-week) |
| D | Shuttle Booking Lifecycle | [POST /shuttle/route-bookings/:id/start](#d2-post-shuttleroute-bookingsidstart) |
| D | Shuttle Booking Lifecycle | [POST /shuttle/lines/:id/complete](#d3-post-shuttlelinesidcomplete) |
| D | Shuttle Booking Lifecycle | [GET /shuttle/route-bookings/:id/detail](#d4-get-shuttleroute-bookingsiddetail) |
| D | Shuttle Booking Lifecycle | [Socket: booking:passenger_updated](#d5-socket-event-bookingpassenger_updated) |
| E | Weekly Renewal Cron | [Wednesday 7:00 AM Renewal Cron](#e1-wednesday-700-am-renewal-cron) |
| E | Weekly Renewal Cron | [10-Hour Grace Period Enforcement](#e2-10-hour-grace-period-enforcement) |
| E | Weekly Renewal Cron | [POST /shuttle/route-bookings/:id/decline-renewal](#e3-post-shuttleroute-bookingsiddecline-renewal) |
| F | Shuttle Trip History | [GET /shuttle/driver/my-trips (Paginated)](#f1-get-shuttledrivermy-trips-paginated) |
| F | Shuttle Trip History | [earnedAmount & revenueAmount Fields](#f2-earnedamount--revenueamount-fields) |
| G | Peer-to-Peer Trip Referral | [POST /shuttle/route-bookings/:id/refer](#g1-post-shuttleroute-bookingsidrefer) |
| G | Peer-to-Peer Trip Referral | [GET /driver/me/referral-code](#g2-get-drivermereferral-code) |
| G | Peer-to-Peer Trip Referral | [POST /shuttle/referrals/:id/accept](#g3-post-shuttlereferralsidaccept) |
| G | Peer-to-Peer Trip Referral | [POST /shuttle/referrals/:id/decline](#g4-post-shuttlereferralsiddecline) |
| G | Peer-to-Peer Trip Referral | [Socket: shuttle:referral:incoming & shuttle:referral:cancelled](#g5-socket-events-shuttlereferralincoming--shuttlereferralcancelled) |
| G | Peer-to-Peer Trip Referral | [Referral Error Codes](#g6-referral-error-codes) |
| H | Trip Cancellation | [POST /shuttle/route-bookings/:id/final-cancel](#h1-post-shuttleroute-bookingsidfinal-cancel) |
| H | Trip Cancellation | [Cancellation Reasons List from Backend](#h2-cancellation-reasons-list-from-backend) |
| H | Trip Cancellation | [Penalty Rules & Cancellation Error Codes](#h3-penalty-rules--cancellation-error-codes) |
| I | Trip Details Screen | [Full Trip Details Endpoint](#i1-full-trip-details-endpoint) |
| I | Trip Details Screen | [Full ISO Datetime for Start-Eligibility](#i2-full-iso-datetime-for-start-eligibility) |
| I | Trip Details Screen | [Real-Time Passenger Count per Trip Instance](#i3-real-time-passenger-count-per-trip-instance) |
| I | Trip Details Screen | [Station ETAs from Backend](#i4-station-etas-from-backend) |
| J | Bonus Targets | [GET /driver/bonus-targets](#j1-get-driverbonus-targets) |
| K | Financial Analytics | [GET /driver/financial-analytics](#k1-get-driverfinancial-analytics) |
| L | Push Notifications (Cron) | [Wednesday Renewal Prompt Push](#l1-wednesday-renewal-prompt-push-notification) |
| L | Push Notifications (Cron) | [Slot Released Broadcast Push](#l2-slot-released-broadcast-push-notification) |

---

## A — Global / Infrastructure

---

### A1. Accept-Language Contract

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` |
| **Line** | 9–30 |
| **Feature / Flow** | Every screen that renders user-visible strings (route names, station names, trip labels, service messages) |

**Context & Scope**

The module-level variable `_acceptLanguage` is injected as the `Accept-Language` header on every outgoing `fetch()` call. It is updated reactively whenever the driver switches language via `setApiLanguage()` (called by `lib/i18nContext`). The header is already flowing — the backend side is not yet reading it.

**Functional Goal**

All entity responses containing user-visible text must honour the `Accept-Language` header and return the appropriate locale. The client currently performs no post-processing; it trusts the server to resolve the correct string.

**Expected Contract**

Choose one pattern and apply it consistently across all affected endpoints:

- **Option A — Header-driven single field (preferred):** Server resolves and returns the already-localized string in the primary field name.
  ```jsonc
  // Accept-Language: ar
  { "name": "خط القاهرة" }
  ```
- **Option B — Dual-field envelope (fallback-safe):** Server always returns both locales; client picks with the pattern `name_ar ?? name_en ?? name`.
  ```jsonc
  { "name": "Cairo Line", "name_en": "Cairo Line", "name_ar": "خط القاهرة" }
  ```

**Affected Endpoints:**
| Endpoint | Fields to Localize |
|----------|-------------------|
| `GET /shuttle/lines` | `line.name`, `line.description` |
| `GET /shuttle/lines/:id` | same + `stations[].name` |
| `GET /shuttle/timeslots/:id` | `timeslot.label` |
| `GET /driver/trips` | `trip.routeName`, `trip.origin`, `trip.destination` |
| `GET /driver/trips/:id` | same + `stations[].name`, `stations[].address` |
| `GET /services/control` | `service.message`, `service.eta` |

---

### A2. Expo Push Token Registration

| Property | Value |
|----------|-------|
| **File** | `hooks/usePushNotifications.ts` |
| **Lines** | 43–47 (on success callback), 188–192 (inside `registerForPushNotifications`) |
| **Feature / Flow** | All push notification delivery (ride requests, shuttle renewals, slot releases, offence alerts) |

**Context & Scope**

`registerForPushNotifications()` calls `Notifications.getExpoPushTokenAsync()` and returns the Expo push token string. The token is retrieved correctly but never sent to the backend; both call sites contain stub comments.

**Functional Goal**

Persist the Expo push token to the server so that backend cron jobs and event handlers can call Expo's push API (`https://exp.host/--/api/v2/push/send`) to deliver notifications when the app is backgrounded or closed.

**Expected Contract**

```
POST /users/me/push-token
Authorization: Bearer <accessToken>
Content-Type: application/json

Body:
{
  "token":    string,   // Expo push token, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
  "platform": "ios" | "android" | "web"
}

Success Response (200 | 201):
{ "success": true }

Error Responses:
  400 — invalid token format
  401 — expired access token
```

> The client calls `endpoints.pushTokens.register(platform, token)` which maps to this route. The route stub exists in `lib/api.ts` at line 400–402 but the token is never passed into it.

---

## B — Driver Profile & Registration

---

### B1. GET /driver/profile (Enriched)

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 283–315 · `app/(shuttle)/profile.tsx` lines 84–122 |
| **Feature / Flow** | Shuttle Driver Profile screen — shows avatar, ratings, vehicle, document status, referral code, and bonus milestone progress |

**Context & Scope**

`app/(shuttle)/profile.tsx` queries `endpoints.driver.profile()` as its primary data source. If the endpoint returns an error, the screen falls back to `GET /driver/me` and degrades gracefully (bonus & document blocks show skeleton placeholders). A stale `enabled: true` query with `retry: 1` means every profile screen mount hits this endpoint.

**Functional Goal**

Return a single enriched payload that combines identity, vehicle info, document approval state, the driver's unique referral code, and all bonus milestone records — so the profile screen renders fully in one round-trip.

**Expected Contract**

```
GET /driver/profile
Authorization: Bearer <accessToken>

Success Response (200):
{
  "id":           string,
  "name":         string,
  "phone":        string,
  "email":        string,
  "avatar":       string | null,          // HTTPS URL
  "rating":       number,                 // 0–5
  "trips":        number,                 // total lifetime completed trips
  "referralCode": string,                 // e.g. "VGO-A1B2" — unique per driver
  "vehicle": {
    "make":  string,
    "model": string,
    "plate": string
  } | null,
  "documentStatus": "accepted" | "pending" | "rejected" | null,
  "bonusTargets": Array<{
    "id":          string,
    "title":       string,
    "targetTrips": number,
    "currentTrips":number,
    "bonusAmount": number,
    "completed":   boolean
  }>
}

Error Responses:
  401 — token expired
  404 — driver profile not found (fallback to GET /driver/me triggered)
```

---

### B2. POST /driver/profile/avatar-request

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 317–352 · `app/(shuttle)/profile.tsx` lines 178–198 |
| **Feature / Flow** | Profile screen — "Change Photo" modal; driver submits a new headshot for Admin review |

**Context & Scope**

The client sends a `multipart/form-data` request (not JSON) using a raw `fetch()` call (bypassing the standard `request()` helper so the `Content-Type` is auto-set by the browser). Admin must manually approve before the photo goes live.

**Functional Goal**

Accept a new headshot image and a reason string, queue the request for Admin review, and return a pending acknowledgement.

**Expected Contract**

```
POST /driver/profile/avatar-request
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

Fields:
  newAvatarImage  — image file (JPEG/PNG, max 5 MB)
  changeReason    — string (required, min 10 chars)

Success Response (201):
{
  "requestId": string,
  "status":    "pending",
  "message":   string
}

Error Responses:
  400 — missing fields or invalid file type (only JPEG/PNG accepted)
  409 — a pending request already exists for this driver
  413 — file exceeds 5 MB
  401 — expired token
```

---

### B3. POST /driver/register/service-type

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 734–746 · `app/service-select.tsx` lines 120–124 |
| **Feature / Flow** | Onboarding / Registration flow — "Select Service Type" screen |

**Context & Scope**

Called non-blockingly when the driver selects their service type during initial account setup. The app proceeds to the next screen even if the call fails (local `AsyncStorage` cache already stores the value). The endpoint's purpose is to persist the choice server-side so the backend is aware of the driver's service mode independently of local storage.

**Functional Goal**

Persist the chosen service type to the driver's record in the database.

**Expected Contract**

```
POST /driver/register/service-type
Authorization: Bearer <accessToken>
Content-Type: application/json

Body:
{
  "serviceType": "car" | "scooter" | "delivery" | "shuttle"
}

Success Response (200 | 201):
{
  "serviceType": string
}

Error Responses:
  400 — invalid serviceType value
  401 — expired token
```

---

### B4. POST /driver/register/vehicle-details

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 748–764 · `app/auth/vehicle-specs.tsx` lines 331–343 |
| **Feature / Flow** | Onboarding — "Vehicle Specs" setup screen (brand, model, year, color dropdowns) |

**Context & Scope**

Called on the "Continue" button press in `vehicle-specs.tsx`. Currently non-blocking — the app navigates to `/(tabs)` even on failure. The backend should upsert the vehicle record associated with the authenticated driver.

**Functional Goal**

Store brand, model, year, and color from the driver's selected vehicle so it can be associated with their account and displayed on the profile.

**Expected Contract**

```
POST /driver/register/vehicle-details
Authorization: Bearer <accessToken>
Content-Type: application/json

Body:
{
  "brandId": string,   // ID from GET /vehicles/brands
  "modelId": string,   // ID from GET /vehicles/brands/:brandId/models
  "year":    string,   // e.g. "2021"
  "color":   string    // ID from GET /vehicles/colors
}

Success Response (200 | 201):
{
  "vehicleId": string,
  "brandId":   string,
  "modelId":   string,
  "year":      string,
  "color":     string
}

Error Responses:
  400 — missing or invalid fields
  401 — expired token
  404 — brandId or modelId not found in /vehicles/meta
```

---

### B5. Vehicle Metadata Endpoints

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 767–788 |
| **Feature / Flow** | Onboarding — "Vehicle Specs" dropdowns for brand, model, and color selection |

**Context & Scope**

`app/auth/vehicle-specs.tsx` populates three `<Dropdown>` components from hardcoded local arrays (`BRANDS`, `MODELS`, `COLORS` defined in the file). These must be replaced with server-fetched data so the admin can manage the vehicle catalogue without a client release.

**Functional Goal**

Provide the canonical, server-managed list of vehicle brands, models, and colors that populate the registration dropdowns.

**Expected Contracts**

```
GET /vehicles/brands
Success Response (200):
Array<{ "id": string; "name": string }>

---

GET /vehicles/brands/:brandId/models
Success Response (200):
Array<{ "id": string; "name": string; "brandId": string }>

---

GET /vehicles/meta   (optional — fetches both in one call)
Success Response (200):
{
  "brands": Array<{ "id": string; "name": string }>,
  "models": Array<{ "id": string; "name": string; "brandId": string }>
}

---

GET /vehicles/colors
Success Response (200):
Array<{ "id": string; "label": string; "hex"?: string }>
```

---

## C — Shuttle Lines

---

### C1. Localized Route & Station Names

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 461–495 |
| **Feature / Flow** | All shuttle screens — Lines list, Trip Details, Booking Detail Sheet, Referral screens |

**Context & Scope**

The `Accept-Language` header is already injected on every request (see A1). This item specifically documents the required response shape changes for all shuttle line and station objects so every screen can render correctly in both Arabic and English.

**Functional Goal**

Return localized human-readable strings (route names, station names, descriptions) so that Arabic-speaking drivers see Arabic text without any client-side translation logic.

**Expected Contract (Option B — dual-field, fallback-safe):**

```jsonc
// Shuttle Line Object:
{
  "id":             string | number,
  "name":           string,          // resolved by Accept-Language header (Option A)
  "name_en":        string,          // English fallback (Option B)
  "name_ar":        string,          // Arabic fallback  (Option B)
  "description":    string?,
  "description_en": string?,
  "description_ar": string?,
  "origin":         string,
  "destination":    string,
  "stations": Array<{
    "id":       string | number,
    "name":     string,              // resolved by header (Option A)
    "name_en":  string?,             // fallback (Option B)
    "name_ar":  string?,             // fallback (Option B)
    "address":  string?,
    "order":    number
  }>
}
```

**Client rendering pattern (Option B):**
```ts
const lineName    = line.name_ar    ?? line.name_en    ?? line.name    ?? '';
const stationName = station.name_ar ?? station.name_en ?? station.name ?? '';
```

---

### C2. Taken-By Driver Name on Slots

| Property | Value |
|----------|-------|
| **File** | `app/(shuttle)/lines.tsx` lines 40–43 |
| **Feature / Flow** | Lines screen — slot booking grid; shows which slots are already taken |

**Context & Scope**

`BackendSlot` type includes `isTaken: boolean` which the UI currently uses to grey-out a slot. The TODO requests that the driver name of whoever holds the slot also be returned.

**Functional Goal**

Allow the driver browsing available weeks to see a masked name of the driver who already holds a slot, improving trust and clarity.

**Expected Contract Addition to `BackendSlot`:**

```jsonc
{
  "id":               number,
  "isTaken":          boolean,
  "takenByDriverName": string | null   // masked: "Ahmed M." (first name + last initial)
                                        // null if not taken or privacy policy forbids it
}
```

---

## D — Shuttle Booking Lifecycle

---

### D1. POST /shuttle/lines/:id/book-week

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 516–632 |
| **Feature / Flow** | Lines screen — "Book this week" CTA; atomically reserves a 5-day timeslot block for a driver |

**Context & Scope**

This is the central booking mutation. Even though passengers book per-day `DailySchedule` rows, the driver must claim the entire Sun–Thu block simultaneously to prevent partial-week conflicts and race conditions. The `bookWeek()` function in `endpoints.shuttle` calls `POST /shuttle/lines/:routeId/book-week`.

**Functional Goal**

Atomically create a `ShuttleRouteBooking` record spanning all 5 working days of the specified week for the authenticated driver.

**Expected Contract**

```
POST /shuttle/lines/:routeId/book-week
Authorization: Bearer <accessToken>
Content-Type: application/json

Body:
{
  "slotId":          number,     // ID of the BackendSlot (timeslot template)
  "startSundayDate": string,     // "YYYY-MM-DD", always a Sunday
  "endThursdayDate": string,     // "YYYY-MM-DD", always a Thursday
  "daysArray":       string[]    // always ["sunday","monday","tuesday","wednesday","thursday"]
}

Success Response (200 | 201):
{
  "bookingId":       string,   // newly created ShuttleRouteBooking ID
  "weekStart":       string,   // "YYYY-MM-DD" (echoed back)
  "weekEnd":         string,   // "YYYY-MM-DD" (echoed back)
  "departure":       string,   // "HH:MM"
  "renewalDeadline": string    // ISO8601: next Wednesday 17:00 Cairo time
}

Error Responses:
  409 Conflict    — slotId already taken for this week block (race condition); client re-fetches available weeks
  400 Bad Request — invalid slotId, wrong week dates, or route not found
  403 Forbidden   — driver is suspended or exceeded active-booking limits
```

**Backend Implementation Notes:**
1. Wrap all `DailySchedule` upserts in a single DB transaction.
2. Use `SELECT FOR UPDATE` on the slot row to prevent race conditions.
3. After committing, emit `slot_taken` to the `"drivers"` Socket.io room:
   ```js
   socket.to('drivers').emit('slot_taken', { routeId, slotId, weekStart, takenByDriverName })
   ```
4. Schedule the Wednesday 7:00 AM Cairo renewal cron (see [E1](#e1-wednesday-700-am-renewal-cron)).

---

### D2. POST /shuttle/route-bookings/:id/start

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 664–668 · `app/shuttle/trip-details.tsx` lines 297–308 |
| **Feature / Flow** | Trip Details screen — "Start Trip" button (enabled 30 min before departure) |

**Context & Scope**

When the driver taps "Start Trip", the client calls `endpoints.shuttle.start(bookingId)`, expects a `tripId` back, stores it in `ShuttleContext.startedTripId`, triggers a background refetch of active bookings, and navigates to `trip-active.tsx`.

**Functional Goal**

Mark the weekly booking as actively in-progress, create the trip instance on the backend, and return the new trip ID.

**Expected Contract**

```
POST /shuttle/route-bookings/:id/start
Authorization: Bearer <accessToken>

Success Response (200 | 201):
{
  "tripId":       string,
  "earnedAmount": number?,    // optional — may be populated on early completion
  "walletBalance":number?
}

Error Responses:
  404 — booking not found
  409 — booking already started
  403 — driver not checked in (selfie required)
```

---

### D3. POST /shuttle/lines/:id/complete

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 670–673 · `app/shuttle/trip-active.tsx` lines 161–173 |
| **Feature / Flow** | Active trip screen — "Finish Route" button; marks trip as completed |

**Context & Scope**

The client calls `endpoints.shuttle.complete(activeLine.id)`. The response is read with a double-fallback (`result?.earnedAmount ?? result?.data?.earnedAmount`) to handle both flat and nested response shapes. The values are passed as route params to `trip-complete.tsx`.

**Functional Goal**

Mark the active trip as completed, credit the driver's wallet, and return the earned amount and updated balance.

**Expected Contract**

```
POST /shuttle/lines/:id/complete
Authorization: Bearer <accessToken>

Success Response (200):
{
  "earnedAmount": number,    // EGP credited for this trip
  "walletBalance":number     // driver's new running wallet total
}

// OR (nested under data — both shapes are handled by the client):
{
  "data": {
    "earnedAmount": number,
    "walletBalance":number
  }
}
```

---

### D4. GET /shuttle/route-bookings/:id/detail

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 647–661 · `app/(shuttle)/bookings.tsx` lines 42–50, 774–787 |
| **Feature / Flow** | Booking Detail Sheet (bottom drawer) — live passenger count and threshold badge |

**Context & Scope**

The `BookingDetailSheet` component queries this endpoint but the query has `enabled: false` set explicitly (line 785 with a note to remove once the endpoint is live). Until then, the passenger count card is hidden entirely.

**Functional Goal**

Return the live booking state for a specific week booking, including current confirmed passenger count and whether the trip-activation threshold has been reached.

**Expected Contract**

```
GET /shuttle/route-bookings/:id/detail
Authorization: Bearer <accessToken>

Success Response (200):
{
  "id":                    string,
  "bookedSeats":           number,   // confirmed passenger count for this week block
  "totalSeats":            number,   // vehicle capacity (14 = HiAce, 28 = Mini Bus)
  "minRequiredPassengers": number,   // minimum threshold for trip activation
  "thresholdMet":          boolean   // true once bookedSeats >= minRequiredPassengers
}
```

> **After going live:** Remove `enabled: false` from the query in `app/(shuttle)/bookings.tsx` line 785.

---

### D5. Socket Event: booking:passenger_updated

| Property | Value |
|----------|-------|
| **File** | `app/(shuttle)/bookings.tsx` lines 789–803 |
| **Feature / Flow** | Booking Detail Sheet — zero-latency live passenger count update without polling |

**Context & Scope**

The `BookingDetailSheet` already has `socket.on(...)` scaffolding listening for `SLOT_TAKEN` / `SLOT_RELEASED` as proxies, but the actual intent is a dedicated per-booking event. The handler calls `refetchDetail()` on receipt.

**Functional Goal**

Push real-time passenger count changes to the driver's booking detail view without requiring HTTP polling.

**Expected Socket Event**

```
Event name: "booking:passenger_updated"
Room:       "booking:<bookingId>"   (scoped to this specific booking)

Payload:
{
  "bookingId":   string,
  "bookedSeats": number,
  "thresholdMet":boolean
}
```

**Backend trigger:** Emit this event whenever a passenger books or cancels a seat on a `DailySchedule` row that belongs to this driver's `ShuttleRouteBooking` week block.

---

## E — Weekly Renewal Cron & Grace Period

---

### E1. Wednesday 7:00 AM Renewal Cron

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 564–587 |
| **Feature / Flow** | Shuttle weekly lifecycle — retention prompt sent to all drivers with an active upcoming booking |

**Context & Scope**

Every Thursday-ending booking week triggers a renewal window. At 7:00 AM Cairo time every Wednesday, all drivers with a `ShuttleRouteBooking` whose `weekEnd` falls in the next upcoming week must be prompted to confirm or decline renewal. The client (`usePushNotifications.ts` line 121–124) already handles the deep-link from the push notification and navigates to `/(shuttle)/bookings`.

**Functional Goal**

Prompt drivers proactively before the 17:00 Cairo deadline so slots are not held needlessly.

**Implementation Specification**

```
TRIGGER:  Every Wednesday at 05:00 UTC (= 07:00 Cairo / UTC+2)
CRON:     0 5 * * 3

TARGET:   All ShuttleRouteBookings where:
            status = 'active'
            weekEnd is in the upcoming week (i.e., next Sunday–Thursday block)

ACTION per qualifying booking:
  1. SET booking.renewalStatus     = 'pending'
  2. SET booking.renewalDeadline   = that Wednesday at 17:00 Cairo (15:00 UTC)
  3. SEND Expo Push Notification to driver device:
       {
         "to":    "<ExponentPushToken>",
         "title": "تجديد حجز الخط",
         "body":  "هل تحب تجديد حجز هذا الخط للاسبوع القادم؟",
         "data": {
           "type":      "renewal_prompt",
           "bookingId": string,
           "routeId":   number,
           "routeName": string,
           "slotId":    number,
           "weekStart": string,   // start of the NEW upcoming week (YYYY-MM-DD)
           "deadline":  string    // ISO8601 of Wednesday 17:00 Cairo
         }
       }
```

---

### E2. 10-Hour Grace Period Enforcement

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 590–622 |
| **Feature / Flow** | Shuttle weekly lifecycle — enforces the Wednesday 17:00 Cairo slot-release deadline |

**Context & Scope**

The client countdown timer in `bookings.tsx` `RenewalBanner` (`formatCountdown()`) counts down against `booking.renewalDeadline` (ISO8601 from server). The backend must independently enforce the deadline.

**Functional Goal**

At the Wednesday 17:00 Cairo deadline, automatically release any held slots where the driver has not confirmed renewal.

**Implementation Specification**

```
TRIGGER:  Every Wednesday at 15:00 UTC (= 17:00 Cairo / UTC+2)
CRON:     0 15 * * 3

TARGET:   All ShuttleRouteBookings where renewalStatus = 'pending'

ACTION per qualifying booking:
  1. SET renewalStatus = 'expired'
  2. Release the slot for the upcoming week block (isTaken = false on next week's BackendSlot)
  3. SEND Expo Push Notification to ALL drivers:
       {
         "to":    [ ...all driver push tokens... ],
         "title": "خط متاح الآن",
         "body":  "خط [routeName] متاح للحجز الآن!",
         "data": {
           "type":      "slot_released",
           "routeId":   number,
           "routeName": string,
           "slotId":    number,
           "weekStart": string   // YYYY-MM-DD — the newly available week block
         }
       }
  4. EMIT Socket.io event to all connected drivers:
       socket.to('drivers').emit('slot_released', { routeId, slotId, weekStart })
```

**CONFIRM path** (driver taps "Confirm Renewal" before deadline):
```
POST /shuttle/route-bookings/:id/confirm-renewal   (already exists)
→ Atomically books the same slot for the NEXT week block
→ Sets renewalStatus = 'confirmed'
→ Cancels the 17:00 expiry job for this booking
```

---

### E3. POST /shuttle/route-bookings/:id/decline-renewal

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 637–645 · `app/(shuttle)/bookings.tsx` lines 187–200 |
| **Feature / Flow** | Booking Detail Sheet — "Decline Renewal" button in the Wednesday renewal banner |

**Context & Scope**

The driver may proactively opt out before the 17:00 deadline. `declineRenewalMutation` calls `endpoints.shuttle.declineRenewal(id)`. On success it invalidates `shuttle-my-bookings` and `shuttle-available-weeks` query caches.

**Functional Goal**

Allow the driver to voluntarily release their slot before the automatic deadline fires.

**Expected Contract**

```
POST /shuttle/route-bookings/:id/decline-renewal
Authorization: Bearer <accessToken>

Success Response (200):
{ "success": true }

Side-effects (backend must handle):
  1. SET renewalStatus = 'declined'
  2. Release the slot (isTaken = false for next week block)
  3. EMIT socket 'slot_released' to all connected drivers
  4. SEND push to all drivers: "خط [routeName] متاح للحجز الآن!"
```

---

## F — Shuttle Trip History

---

### F1. GET /shuttle/driver/my-trips (Paginated)

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 679–686 · `app/(shuttle)/bookings.tsx` lines 27–39, 147–158 · `app/shuttle/history.tsx` lines 7–12, 117–120 |
| **Feature / Flow** | Bookings screen "Completed" tab and standalone Trip History screen |

**Context & Scope**

Two separate screens consume this endpoint via two separate function aliases (`driverTrips` for bookings.tsx and `history` for history.tsx — both ultimately call `GET /shuttle/driver/my-trips`). The `history.tsx` file contains a `normalizeTrips()` helper that handles three possible response envelope shapes, indicating the response contract was not locked.

**Functional Goal**

Return a paginated list of all past completed shuttle trips for the authenticated driver.

**Expected Contract**

```
GET /shuttle/driver/my-trips?page=1&limit=10
Authorization: Bearer <accessToken>

Query Params:
  page  — integer, 1-based (default: 1)
  limit — integer (default: 10, max: 50)

Success Response (200):
{
  "trips": Array<{
    "id":               string,
    "routeName":        string,       // human-readable route label
    "date":             string?,      // "YYYY-MM-DD" or full ISO8601
    "completedAt":      string?,      // ISO8601 timestamp of trip completion
    "boardedPassengers":number?,      // how many passengers actually boarded
    "totalPassengers":  number?,      // total booked seats for this trip
    "earnings":         number,       // net amount (after platform commission)
    "revenueAmount":    number?,      // gross cash collected from passengers
    "status":           string        // "completed"
  }>,
  "total": number                     // total count across all pages (for pagination)
}
```

> **Note:** `history.tsx`'s `normalizeTrips()` already guards against three envelope shapes (`{ trips: [...] }`, `{ data: { trips: [...] } }`, and a flat array). Standardizing on `{ trips: [...], total: number }` is strongly recommended.

---

### F2. earnedAmount & revenueAmount Fields

| Property | Value |
|----------|-------|
| **File** | `app/(shuttle)/bookings.tsx` lines 35–39, 711–712 |
| **Feature / Flow** | Bookings screen — Completed Trip Card financial display |

**Context & Scope**

The `DriverTrip` type on line 35 notes that both `earnedAmount` (net) and `revenueAmount` (gross) are expected. The `CompletedTripCard` on line 711 currently only shows `earnings` (net) and has a TODO to display both side-by-side when `revenueAmount` is available.

**Functional Goal**

Show the driver both what they earned (net after platform commission) and what they collected (gross cash from passengers) on each completed trip card.

**Expected Fields on each trip object:**

```jsonc
{
  "earnings":      number,   // net payout to driver (gross - platform commission)
  "revenueAmount": number    // gross cash collected from all passengers for this trip
}
```

---

## G — Peer-to-Peer Trip Referral

---

### G1. POST /shuttle/route-bookings/:id/refer

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 695–698 · `app/shuttle/referral-request.tsx` lines 50–58 |
| **Feature / Flow** | Referral Request screen — Driver 1 submits handoff request to Driver 2 by code |

**Context & Scope**

The driver enters Driver 2's unique referral code in a `TextInput`. On submit, `endpoints.shuttle.referTrip(bookingId, driverCode)` is called. After success, the screen enters a "pending" state showing "awaiting response." The flow requires a corresponding socket subscription to detect when Driver 2 responds (accept/decline).

**Functional Goal**

Validate the target driver code, create a referral record, and notify Driver 2 of the incoming trip handoff request.

**Expected Contract**

```
POST /shuttle/route-bookings/:id/refer
Authorization: Bearer <accessToken>
Content-Type: application/json

Body:
{
  "driverCode": string   // Driver 2's unique code, e.g. "VGO-A1B2"
}

Success Response (200 | 201):
{
  "referralId": string,
  "status":     "pending"
}

Side-effects (backend must handle):
  - EMIT Socket.io event "shuttle:referral:incoming" to room "driver:<driver2UserId>":
    Payload: IncomingReferralPayload (see G5 below)
  - SEND Expo push to Driver 2: "طلب تحويل رحلة — [Driver 1 Name] يريد تحويل رحلة إليك"

Error Responses:
  404 — driverCode not found
  409 — Driver 2 already has a booking for this slot/week
  400 — bookingId does not belong to the authenticated driver
  403 — referral feature disabled or driver suspended
```

---

### G2. GET /driver/me/referral-code

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 716–717 · `app/(shuttle)/profile.tsx` lines 120–122 |
| **Feature / Flow** | Profile screen — "Your Referral Code" section with copy-to-clipboard |

**Context & Scope**

Currently the profile screen derives a fake code from the driver's ID (`VGO-${id.slice(0,4).toUpperCase()}`). This is a UI-only placeholder. The real code should be generated by the backend at driver registration and returned persistently.

**Functional Goal**

Return the driver's permanent, unique referral code that other drivers enter on the Referral Request screen.

**Expected Contract**

```
GET /driver/me/referral-code
Authorization: Bearer <accessToken>

Success Response (200):
{
  "code": string   // e.g. "VGO-A1B2" — unique per driver, stable across sessions
}
```

> **Preferred:** Return `referralCode` as part of `GET /driver/profile` (see B1) to avoid a separate round-trip.

---

### G3. POST /shuttle/referrals/:id/accept

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 700–703 · `app/shuttle/referral-incoming.tsx` lines 85–95 |
| **Feature / Flow** | Referral Incoming screen — Driver 2 accepts the handoff |

**Context & Scope**

Driver 2 arrives on `referral-incoming.tsx` either via deep-link from a push notification or via the in-app referral queue badge. On accept, `endpoints.shuttle.acceptReferral(referralId)` is called. The screen transitions to a success state.

**Functional Goal**

Transfer trip ownership from Driver 1 to Driver 2, update both drivers' booking lists, and notify Driver 1 of the acceptance.

**Expected Contract**

```
POST /shuttle/referrals/:id/accept
Authorization: Bearer <accessToken>   // Driver 2's token

Success Response (200):
{
  "success": true,
  "bookingId": string   // the new booking ID on Driver 2's account
}

Side-effects (backend must handle):
  - Transfer ShuttleRouteBooking ownership to Driver 2
  - ADD booking to Driver 2's upcoming bookings (shuttle-my-bookings query invalidated)
  - REMOVE booking from Driver 1's upcoming list
  - NOTIFY Driver 1 via push: "[Driver 2 Name] قبل طلب التحويل"
  - EMIT socket event to Driver 1: "referral:accepted" with { referralId, driverName }

Error Responses:
  404 — referralId not found or already resolved
  409 — Driver 2 already has a conflicting booking for this slot
  403 — referral has expired
```

---

### G4. POST /shuttle/referrals/:id/decline

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 705–708 · `app/shuttle/referral-incoming.tsx` lines 101–109 |
| **Feature / Flow** | Referral Incoming screen — Driver 2 declines the handoff |

**Context & Scope**

On decline, `endpoints.shuttle.declineReferral(referralId)` is called. The screen transitions to a declined state. Driver 1 must be notified so they can either retry with another driver or cancel the trip.

**Functional Goal**

Close the referral request and notify Driver 1 that Driver 2 declined.

**Expected Contract**

```
POST /shuttle/referrals/:id/decline
Authorization: Bearer <accessToken>   // Driver 2's token

Success Response (200):
{ "success": true }

Side-effects (backend must handle):
  - SET referral.status = 'declined'
  - NOTIFY Driver 1 via push: "[Driver 2 Name] رفض طلب التحويل"
  - EMIT socket event to Driver 1: "referral:declined" with { referralId }

Error Responses:
  404 — referralId not found or already resolved
```

---

### G5. Socket Events: shuttle:referral:incoming & shuttle:referral:cancelled

| Property | Value |
|----------|-------|
| **File** | `constants/socketEvents.ts` lines 58–63 · `hooks/useShuttleSocket.ts` lines 11, 39–54 |
| **Feature / Flow** | Real-time referral queue — badge counter and incoming referral banner |

**Context & Scope**

`useShuttleSocket` binds two listeners on mount. The handlers are fully implemented; only the backend side is missing. Both events are scoped to the `driver:<userId>` Socket.io room (not the broadcast `drivers` room).

**Functional Goal**

Deliver real-time referral state changes to the target driver without requiring the app to be in the foreground (push handles background; socket handles foreground).

**Required Socket Events**

```
Event: "shuttle:referral:incoming"
Room:  "driver:<driver2UserId>"

Payload (IncomingReferralPayload — from lib/referralContext.tsx):
{
  "referralId":     string,
  "bookingId":      string,
  "routeName":      string,
  "departureTime":  string,          // "HH:MM"
  "fromStation":    string,
  "toStation":      string,
  "passengerCount": number?,
  "totalSeats":     number?,
  "lineNumber":     string?,
  "vehicleType":    string?,
  "weekStart":      string?          // "YYYY-MM-DD"
}

---

Event: "shuttle:referral:cancelled"
Room:  "driver:<driver2UserId>"
Reason: Driver 1 withdrew the referral OR referral expired

Payload:
{ "referralId": string }
```

---

### G6. Referral Error Codes

| Property | Value |
|----------|-------|
| **File** | `app/shuttle/referral-request.tsx` line 55 |
| **Feature / Flow** | Referral Request screen — user-facing error messages |

**Context & Scope**

The catch block currently shows a generic Arabic error string. Specific HTTP error codes/body codes are needed to surface actionable messages to the driver.

**Expected Error Code Contract**

```jsonc
// POST /shuttle/route-bookings/:id/refer — Error Response Body:
{
  "code":    "DRIVER_NOT_FOUND" | "ALREADY_BOOKED" | "SELF_REFERRAL" | "EXPIRED_BOOKING",
  "message": string   // human-readable (can be in English for logging)
}
```

Client mapping:
| Code | UI Message (Arabic) |
|------|---------------------|
| `DRIVER_NOT_FOUND` | "الكود المدخل غير موجود" |
| `ALREADY_BOOKED` | "هذا السائق لديه حجز لنفس الموعد بالفعل" |
| `SELF_REFERRAL` | "لا يمكنك تحويل الرحلة لنفسك" |
| `EXPIRED_BOOKING` | "انتهى موعد تحويل هذه الرحلة" |

---

## H — Trip Cancellation

---

### H1. POST /shuttle/route-bookings/:id/final-cancel

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 710–714 · `app/shuttle/direct-cancel.tsx` lines 68–81 |
| **Feature / Flow** | Direct Cancel screen — driver cancels an upcoming trip with a reason |

**Context & Scope**

`endpoints.shuttle.cancelBookingFinal(bookingId, reason)` is called after the driver confirms the destructive alert. On success, `shuttle-my-bookings` and `shuttle-driver-trips` query caches are invalidated. The success state message currently hardcodes "Admin will manually re-assign."

**Functional Goal**

Cancel the booking, notify all booked passengers, alert the Admin Dashboard, calculate and apply any applicable penalty, and return the cancellation result.

**Expected Contract**

```
POST /shuttle/route-bookings/:id/final-cancel
Authorization: Bearer <accessToken>
Content-Type: application/json

Body:
{
  "reason": string   // one of: "emergency" | "vehicle" | "illness" | "traffic" | "other"
}

Success Response (200):
{
  "success":       true,
  "penaltyAmount": number | null   // EGP deducted, null if no penalty applies
}

Side-effects (backend must handle):
  1. SET booking.status = 'cancelled'
  2. SEND push notification to ALL booked passengers: "تم إلغاء رحلتك — [routeName]"
  3. TRIGGER Admin Dashboard alert for manual driver re-assignment
  4. CALCULATE and APPLY penalty per backend cancellation policy
  5. DEDUCT penaltyAmount from driver wallet if applicable

Error Responses:
  404 — booking not found or already cancelled
  403 — too late to cancel (within X minutes of departure — threshold TBD)
  400 — missing reason field
```

---

### H2. Cancellation Reasons List from Backend

| Property | Value |
|----------|-------|
| **File** | `app/shuttle/direct-cancel.tsx` lines 27–34 |
| **Feature / Flow** | Direct Cancel screen — radio button list of cancel reasons |

**Context & Scope**

`CANCEL_REASONS` is currently a hardcoded static array of five reason keys mapped to i18n translation keys. The TODO requests that this list be managed server-side so reasons can be added, removed, or localized without a client release.

**Functional Goal**

Allow Admins to manage the cancellation reason list dynamically from the backend.

**Expected Contract (Optional Enhancement)**

```
GET /shuttle/cancel-reasons
Authorization: Bearer <accessToken>

Success Response (200):
Array<{
  "key":      string,   // machine-readable identifier
  "label_ar": string,   // Arabic display text
  "label_en": string    // English display text
}>
```

---

### H3. Penalty Rules & Cancellation Error Codes

| Property | Value |
|----------|-------|
| **File** | `app/shuttle/direct-cancel.tsx` lines 73, 80, 101–102, 139 |
| **Feature / Flow** | Direct Cancel screen — penalty disclosure before confirmation and post-cancel state |

**Context & Scope**

Multiple inline comments note that penalty rules are "applied automatically from the backend." The UI currently shows hardcoded text. After cancellation, the success screen should conditionally show the penalty amount deducted.

**Functional Goal**

Communicate penalty information to the driver before and after cancellation.

**Required:**

1. **Pre-cancel penalty preview** — optionally add a `GET /shuttle/route-bookings/:id/cancel-preview` endpoint that returns the applicable `penaltyAmount` before the driver confirms, allowing the UI to show "A penalty of X EGP will be applied."

2. **Post-cancel penalty display** — the `penaltyAmount` field in the `POST final-cancel` response (see H1) is used directly by the client to update the success screen message.

3. **Error codes for late cancellation:**
```jsonc
// 403 Response Body:
{
  "code":    "TOO_LATE_TO_CANCEL",
  "message": string,
  "minutesUntilDeparture": number
}
```

---

## I — Trip Details Screen

---

### I1. Full Trip Details Endpoint

| Property | Value |
|----------|-------|
| **File** | `app/shuttle/trip-details.tsx` lines 47–58 |
| **Feature / Flow** | Trip Details screen — station timeline, passenger count, trip metadata |

**Context & Scope**

The screen currently fetches `GET /shuttle/lines/:routeId` (the route template) to get stations, but this does not include trip-instance-specific data like real-time passenger count or the exact trip date. A dedicated trip-detail endpoint is needed.

**Functional Goal**

Return the complete trip instance data including all stations in order, current passenger count for this specific week block, and the exact trip datetime.

**Expected Contract**

```
GET /shuttle/route-bookings/:bookingId/trip-detail
Authorization: Bearer <accessToken>

Success Response (200):
{
  "bookingId":      string,
  "routeName":      string,
  "routeName_ar":   string?,
  "fromStation":    string,
  "toStation":      string,
  "departureTime":  string,           // "HH:MM"
  "tripDatetime":   string,           // Full ISO8601: "2026-06-15T07:00:00+02:00"
  "weekStart":      string,           // "YYYY-MM-DD"
  "status":         "confirmed" | "active" | "completed" | "cancelled",
  "bookedSeats":    number,
  "totalSeats":     number,
  "vehicleType":    string,           // e.g. "HiAce"
  "lineNumber":     string,
  "stations": Array<{
    "id":    string | number,
    "name":  string,
    "name_ar": string?,
    "order": number,
    "eta":   string?                  // "HH:MM" estimated arrival at this station
  }>
}
```

---

### I2. Full ISO Datetime for Start-Eligibility

| Property | Value |
|----------|-------|
| **File** | `app/shuttle/trip-details.tsx` lines 71–81 |
| **Feature / Flow** | Trip Details screen — "Start Trip" button enable/disable logic |

**Context & Scope**

The current eligibility check (`isStartEnabled`) parses the departure time string as `HH:MM` and compares it against `new Date()` using only hours and minutes — making it **date-agnostic**. This means the button could become enabled on the wrong day if the driver opens the screen 24 hours early.

**Functional Goal**

Enable the "Start Trip" button only within 30 minutes of the **correct departure datetime**, not just the time-of-day.

**Required Backend Change**

The trip booking or detail response must include a full ISO 8601 departure datetime:
```jsonc
{ "tripDatetime": "2026-06-15T07:00:00+02:00" }
```

The client will replace the HH:MM parse with:
```ts
const diff = (new Date(tripDatetime).getTime() - Date.now()) / 60000;
return diff >= 0 && diff <= 30;
```

---

### I3. Real-Time Passenger Count per Trip Instance

| Property | Value |
|----------|-------|
| **File** | `app/shuttle/trip-details.tsx` line 194 |
| **Feature / Flow** | Trip Details screen — "Passengers" info card |

**Context & Scope**

Currently `bookedSeats` and `totalSeats` come from the route-level `line` object (a static template), not the actual booking instance. This means the count is always the route's total capacity, not the count for this specific week's booking.

**Functional Goal**

Show the driver how many passengers have confirmed their seat for **this specific week's trip instance**.

**Solution:** Return `bookedSeats` on the `GET /shuttle/route-bookings/:bookingId/trip-detail` response (see I1) rather than the route template.

---

### I4. Station ETAs from Backend

| Property | Value |
|----------|-------|
| **File** | `app/shuttle/trip-details.tsx` line 255 |
| **Feature / Flow** | Trip Details screen — route timeline station cards |

**Context & Scope**

Each station row optionally renders an `st.eta` string. The field is typed as `string?` but is never populated in the current data flow (no endpoint returns it). Station ETAs would improve driver planning.

**Functional Goal**

Show per-station estimated arrival times to help drivers plan their route.

**Expected Field** (within the stations array of trip-detail):
```jsonc
{
  "id":    number,
  "name":  string,
  "order": number,
  "eta":   "HH:MM"   // optional — estimated arrival at this station relative to departure
}
```

---

## J — Bonus Targets

---

### J1. GET /driver/bonus-targets

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 796–826 · `app/bonus-targets.tsx` lines 77–88 |
| **Feature / Flow** | Bonus Targets screen — milestone progress cards with earned/pending totals |

**Context & Scope**

`app/bonus-targets.tsx` calls `endpoints.bonusTargets.list()` via `useQuery`. The screen derives `earnedTotal` and `pendingTotal` from the array directly (no separate summary endpoint needed). The screen handles errors and empty states gracefully.

**Functional Goal**

Return the complete list of bonus milestone records configured for the authenticated driver.

**Expected Contract**

```
GET /driver/bonus-targets
Authorization: Bearer <accessToken>

Success Response (200):
Array<{
  "id":           string,
  "title":        string,            // human-readable milestone name
  "description":  string?,
  "targetType":   string,            // "trips" | "distance" | "earnings"
  "targetValue":  number,            // threshold required to earn the bonus
  "progress":     number,            // driver's current progress
  "bonusAmount":  number,            // payout in EGP when milestone is reached
  "completed":    boolean,
  "completedAt":  string?,           // ISO8601
  "startsAt":     string?,           // ISO8601 activation date
  "endsAt":       string?,           // ISO8601 expiry date (null = no expiry)
  "vehicleType":  string?,           // optional filter (e.g. "shuttle")
  "isActive":     boolean,
  "paidOut":      boolean?
}>

Error Responses:
  401 — token expired
  404 — no targets configured → return [] gracefully
  503 — service unavailable → screen shows empty placeholder
```

**Summary derivation (client-side, no extra endpoint):**
```ts
earned  = sum of bonusAmount where completed && (paidOut !== false)
pending = sum of bonusAmount where !completed && isActive
```

---

## K — Financial Analytics

---

### K1. GET /driver/financial-analytics

| Property | Value |
|----------|-------|
| **File** | `lib/api.ts` lines 829–865 |
| **Feature / Flow** | Shuttle Earnings screen — financial dashboard with totalCash, appCommission, netProfit, and transactions list |

**Context & Scope**

`endpoints.financialAnalytics.summary(range)` maps to this endpoint. It is consumed by `app/shuttle/earnings.tsx` to render the driver's cash-based financial breakdown for a selected time window.

**Functional Goal**

Return the driver's cash-based financial summary for `today`, `week`, or `month`, powering the Earnings screen dashboard.

**Expected Contract**

```
GET /driver/financial-analytics?range=today|week|month
Authorization: Bearer <accessToken>

Query Params:
  range — required: "today" | "week" | "month"

Success Response (200):
{
  "totalCash":     number,   // sum of cashReceived in the range (EGP)
  "appCommission": number,   // sum of platform fees in the range (EGP)
  "netProfit":     number,   // totalCash - appCommission (server-computed)
  "transactions":  Array<{
    "id":            string,
    "date":          string,    // ISO8601 timestamp of completed trip
    "cashReceived":  number,    // cash collected from passengers (EGP)
    "appCommission": number,    // platform commission for this run (EGP)
    "routeName":     string?    // optional human-readable route label
  }>
}

Error Responses:
  400 — invalid or missing range param
  401 — token expired
  404 — no completed trips → return { totalCash:0, appCommission:0, netProfit:0, transactions:[] }
  503 — service unavailable → screen degrades to error state with retry button

SECURITY:
  Derive driverId from JWT sub claim only.
  Never accept a driverId query param.
```

---

## L — Push Notifications (Cron-Triggered)

---

### L1. Wednesday Renewal Prompt Push Notification

| Property | Value |
|----------|-------|
| **File** | `hooks/usePushNotifications.ts` lines 114–123 |
| **Feature / Flow** | Wednesday renewal flow — deep-links driver to the Bookings tab when notification is tapped |

**Context & Scope**

The client already handles this push type (`data.type === 'renewal_prompt'`) and navigates to `/(shuttle)/bookings`. Only the backend sending side is missing. This is triggered by the cron described in E1.

**Required Push Payload**

```jsonc
{
  "to":    "<ExponentPushToken>",
  "sound": "default",
  "title": "تجديد حجز الخط",
  "body":  "هل تحب تجديد حجز هذا الخط للاسبوع القادم؟",
  "data": {
    "type":      "renewal_prompt",
    "bookingId": string,
    "routeId":   number,
    "routeName": string,
    "slotId":    number,
    "weekStart": string,    // YYYY-MM-DD — start of the NEW upcoming week
    "deadline":  string     // ISO8601 — Wednesday 17:00 Cairo
  }
}
```

---

### L2. Slot Released Broadcast Push Notification

| Property | Value |
|----------|-------|
| **File** | `hooks/usePushNotifications.ts` lines 127–135 |
| **Feature / Flow** | Slot availability — notifies ALL drivers when a held slot is released; deep-links to Lines screen |

**Context & Scope**

The client handles `data.type === 'slot_released'` and navigates to `/(shuttle)/lines`. This broadcast goes to **all** driver devices. It fires when either the driver declines renewal (E3) or the Wednesday 17:00 grace period expires (E2).

**Required Push Payload**

```jsonc
{
  "to":    [ ...all driver ExponentPushTokens... ],
  "sound": "default",
  "title": "خط متاح الآن",
  "body":  "خط [routeName] متاح للحجز الآن!",
  "data": {
    "type":      "slot_released",
    "routeId":   number,
    "routeName": string,
    "slotId":    number,
    "weekStart": string    // YYYY-MM-DD — the newly available week block
  }
}
```

---

## Summary Table

| # | Method | Endpoint | Priority | Blocks |
|---|--------|----------|----------|--------|
| A1 | ALL | *(header)* `Accept-Language` on all entity endpoints | High | All screens with Arabic text |
| A2 | POST | `/users/me/push-token` | High | All push notifications |
| B1 | GET | `/driver/profile` | High | Profile screen, referral code |
| B2 | POST | `/driver/profile/avatar-request` | Medium | Profile photo change |
| B3 | POST | `/driver/register/service-type` | Medium | Onboarding persistence |
| B4 | POST | `/driver/register/vehicle-details` | Medium | Onboarding persistence |
| B5 | GET | `/vehicles/brands`, `/vehicles/brands/:id/models`, `/vehicles/meta`, `/vehicles/colors` | Medium | Vehicle specs dropdowns |
| C1 | *(schema)* | All shuttle line/station responses | High | All shuttle screens |
| C2 | *(schema)* | `BackendSlot.takenByDriverName` | Low | Lines booking grid |
| D1 | POST | `/shuttle/lines/:id/book-week` | **Critical** | Core booking flow |
| D2 | POST | `/shuttle/route-bookings/:id/start` | **Critical** | Trip start flow |
| D3 | POST | `/shuttle/lines/:id/complete` | **Critical** | Trip completion & wallet |
| D4 | GET | `/shuttle/route-bookings/:id/detail` | High | Live passenger count |
| D5 | *(socket)* | `booking:passenger_updated` | Medium | Real-time passenger counter |
| E1 | *(cron)* | Wednesday 7:00 AM renewal cron | **Critical** | Renewal lifecycle |
| E2 | *(cron)* | Wednesday 17:00 grace period cron | **Critical** | Slot release lifecycle |
| E3 | POST | `/shuttle/route-bookings/:id/decline-renewal` | High | Renewal decline |
| F1 | GET | `/shuttle/driver/my-trips` | High | Bookings completed tab, History screen |
| F2 | *(schema)* | `earnedAmount` + `revenueAmount` on trips | Medium | Completed trip cards |
| G1 | POST | `/shuttle/route-bookings/:id/refer` | High | Peer referral flow |
| G2 | GET | `/driver/me/referral-code` | High | Profile code display |
| G3 | POST | `/shuttle/referrals/:id/accept` | High | Referral accept |
| G4 | POST | `/shuttle/referrals/:id/decline` | High | Referral decline |
| G5 | *(socket)* | `shuttle:referral:incoming`, `shuttle:referral:cancelled` | High | Real-time referral badge |
| G6 | *(schema)* | Referral error codes | Low | Error message surfacing |
| H1 | POST | `/shuttle/route-bookings/:id/final-cancel` | High | Trip cancellation |
| H2 | GET | `/shuttle/cancel-reasons` | Low | Dynamic reasons list |
| H3 | *(schema)* | Penalty error codes + `penaltyAmount` field | Medium | Cancellation UX |
| I1 | GET | `/shuttle/route-bookings/:id/trip-detail` | High | Trip Details screen |
| I2 | *(schema)* | `tripDatetime` ISO8601 field on booking | High | Start-button date accuracy |
| I3 | *(schema)* | Per-booking `bookedSeats` on trip-detail | Medium | Passenger count accuracy |
| I4 | *(schema)* | `eta` field on stations array | Low | Station timeline ETAs |
| J1 | GET | `/driver/bonus-targets` | Medium | Bonus Targets screen |
| K1 | GET | `/driver/financial-analytics?range=` | High | Earnings screen dashboard |
| L1 | *(push)* | `renewal_prompt` push payload | **Critical** | Wednesday cron notification |
| L2 | *(push)* | `slot_released` broadcast push payload | **Critical** | Slot release notification |

---

*End of Report — 37 distinct backend items across 12 domains.*
