# VeeGo Driver App — Full API Integration Report

> **Generated:** 2026-06-20  
> **Source branch:** `claude/nice-lovelace-2k7s0g`  
> **Analysis method:** Full static analysis of source code — no guesswork, only what exists in code.

---

## Table of Contents

1. [REST API Endpoints](#1-rest-api-endpoints)
2. [Socket.IO Events](#2-socketio-events)
3. [AsyncStorage & SecureStore Keys](#3-asyncstorage--securestore-keys)
4. [External API Calls](#4-external-api-calls)
5. [Duplicate APIs](#5-duplicate-apis)
6. [Inconsistent API Usage](#6-inconsistent-api-usage)
7. [Potentially Broken or Incomplete APIs](#7-potentially-broken-or-incomplete-apis)
8. [Dead / Unused API Calls](#8-dead--unused-api-calls)
9. [Driver-Specific Feature Audit](#9-driver-specific-feature-audit)
10. [Summary](#10-summary)

---

## 1. REST API Endpoints

> All endpoints are relative to `EXPO_PUBLIC_API_URL` (e.g. `https://api.veego.app/api`).  
> Auth = `Bearer <access_token>` via `Authorization` header unless noted.  
> Every request also carries `Accept-Language: en|ar` and `Content-Type: application/json`.

---

### 1.1 Authentication

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 1 | POST | `/driver/auth/login` | None | `lib/api.ts:304`, `app/login.tsx` | Driver sign-in with credential + password |
| 2 | POST | `/driver/auth/register` | None | `lib/api.ts:309`, `app/login.tsx` | Driver registration — returns OTP flow |
| 3 | POST | `/auth/send-otp` | None | `lib/api.ts:313`, `app/verify-otp.tsx` | Request OTP SMS |
| 4 | POST | `/auth/verify-otp` | None | `lib/api.ts:317`, `app/verify-otp.tsx` | Verify OTP → returns tokens |
| 5 | POST | `/driver/auth/forgot-password` | None | `lib/api.ts:321`, `app/forgot-password.tsx` | Request password reset code |
| 6 | POST | `/driver/auth/reset-password` | None | `lib/api.ts:325`, `app/forgot-password.tsx` | Submit new password with reset code |
| 7 | POST | `/driver/auth/logout` | JWT | `lib/api.ts:303`, `lib/authContext.tsx` | Invalidate session server-side |
| 8 | POST | `/auth/refresh` | Refresh token | `lib/api.ts:122` | Silent token refresh (internal — not in `endpoints`) |

#### Request / Response Details

**POST `/driver/auth/login`**
```json
// Request
{ "credential": "string (email or phone)", "password": "string" }

// Response 200 — direct login
{ "accessToken": "string", "refreshToken": "string", "user": {}, "driver": {} }

// Response 200 — OTP required
{ "requiresOtp": true, "phone": "string", "maskedPhone": "string", "retryAfter": 60 }
```

**POST `/driver/auth/register`**
```json
// Request
{ "name": "string", "email": "string", "phone": "string", "password": "string" }

// Response 200
{ "requiresOtp": true, "phone": "string", "maskedPhone": "string" }
```

**POST `/auth/verify-otp`**
```json
// Request
{ "phone": "string", "otp": "string" }

// Response 200
{ "success": true, "accessToken": "string", "refreshToken": "string", "user": {}, "driver": {} }
```

**POST `/auth/refresh`**
```json
// Request
{ "refreshToken": "string" }

// Response 200
{ "accessToken": "string" }
```

---

### 1.2 Driver Profile & Status

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 9 | GET | `/driver/me` | JWT | `lib/api.ts:332` | Basic driver profile (name, rating, trips, avatar) |
| 10 | GET | `/driver/profile` | JWT | `lib/api.ts:334` | Enriched profile with vehicle, bonusTargets, referralCode |
| 11 | PATCH | `/driver/me` | JWT | `lib/api.ts:358` | Update profile fields |
| 12 | POST | `/driver/profile/avatar-request` | JWT | `lib/api.ts:336` | Request avatar photo change (multipart FormData) |
| 13 | GET | `/driver/me/status` | JWT | `lib/api.ts:368` | Current online/offline/busy status |
| 14 | PATCH | `/driver/status` | JWT | `lib/api.ts:359-362` | Set status: `online \| offline \| busy \| suspended` |
| 15 | GET | `/driver/me/onboarding` | JWT | `lib/api.ts:369` | Onboarding progress and document status |
| 16 | GET | `/driver/me/vehicle` | JWT | `lib/api.ts:380` | Driver's assigned vehicle details |
| 17 | GET | `/driver/me/documents` | JWT | `lib/api.ts:381` | List of uploaded documents with URLs |
| 18 | GET | `/driver/me/ratings` | JWT | `lib/api.ts:426` | Driver ratings and reviews |
| 19 | GET | `/driver/me/referral-code` | JWT | `lib/api.ts:796` | Driver's referral code |
| 20 | GET | `/driver/promotions` | JWT | `lib/api.ts:427` | Active promotions for the driver |
| 21 | GET | `/driver/me/settings` | JWT | `lib/api.ts:911` | Driver app settings |
| 22 | PATCH | `/driver/me/settings` | JWT | `lib/api.ts:912` | Update driver app settings |

#### Key Response Shapes

**GET `/driver/me`** → `DriverProfile`
```json
{
  "id": "string",
  "name": "string",
  "rating": 4.8,
  "avatar": "string|null",
  "trips": 120,
  "acceptanceRate": 95,
  "cancelRate": 2,
  "level": "string",
  "referralCode": "string",
  "vehicle": { "make": "string", "model": "string", "plate": "string" }
}
```

**GET `/driver/profile`** → `DriverProfileEnriched`
```json
{
  "id": "string", "name": "string", "phone": "string", "email": "string",
  "avatar": "string|null", "rating": 4.8, "trips": 120, "referralCode": "string",
  "vehicle": { "make": "string", "model": "string", "plate": "string", "year": "2020", "color": "white", "colorAr": "أبيض" },
  "documentStatus": "accepted|pending|rejected|null",
  "bonusTargets": [{ "id": "string", "title": "string", "targetTrips": 50, "currentTrips": 30, "bonusAmount": 100, "completed": false }]
}
```

**GET `/driver/me/ratings`**
```json
{
  "rating": 4.85,
  "tripCount": 120,
  "totalEarned": 5000,
  "ratingsCount": 98,
  "ratings": [{
    "id": 1, "raterId": 5, "rideId": 10, "tripId": null,
    "context": "ride|trip", "score": 5, "comment": "string|null",
    "createdAt": "ISO8601"
  }]
}
```

**GET `/driver/me/onboarding`**
```json
{
  "onboardingStatus": "pending|pending_review|approved|rejected",
  "rejectionReason": "string|null",
  "serviceType": "string|null",
  "requiredDocuments": ["string"],
  "missingDocuments": ["string"],
  "documentProgress": [{ "type": "string", "uploaded": true, "verificationStatus": "string|null", "uploadedAt": "string|null" }],
  "totalRequired": 5, "totalUploaded": 4, "totalApproved": 3
}
```

---

### 1.3 Driver Location

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 23 | PATCH | `/driver/location` | JWT | `lib/api.ts:363`, `hooks/useLocationBroadcast.ts` | REST fallback for location update when socket unavailable |
| 24 | POST | `/tracking/location` | JWT | `lib/api.ts:989`, `hooks/useActiveLocationTracking.ts` | Send single location snapshot for tracking |
| 25 | POST | `/tracking/locations/batch` | JWT | `lib/api.ts:991`, `hooks/useActiveLocationTracking.ts` | Bulk-upload offline-buffered location snapshots |

#### Request Bodies

**PATCH `/driver/location`**
```json
{ "latitude": 30.0444, "longitude": 31.2357, "speed": 60.5, "heading": 180, "tripId": 123 }
```

**POST `/tracking/location`** → `LocationSnapshot`
```json
{
  "entityType": "driver",
  "latitude": 30.0444, "longitude": 31.2357,
  "speed": 14.5, "heading": 180,
  "accuracy": 10, "altitude": 50,
  "timestamp": "ISO8601",
  "tripId": "string|null"
}
```

**POST `/tracking/locations/batch`**
```json
{ "locations": [/* array of LocationSnapshot */] }
// Response: { "success": true, "inserted": 47 }
```

---

### 1.4 Driver Uploads & Documents

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 26 | POST | `/driver/upload` | JWT | `lib/api.ts:385` | Upload file to storage, get hosted URL back |
| 27 | POST | `/driver/me/documents` | JWT | `lib/api.ts:408` | Register an uploaded document URL on the profile |
| 28 | POST | `/driver/checkin` | JWT | `lib/api.ts:411` | Submit selfie for identity check-in |

**POST `/driver/upload`** — `multipart/form-data`, field name `"file"`
```json
// Response
{ "fileUrl": "https://..." }
```

**POST `/driver/me/documents`**
```json
// Request
{ "type": "license|national_id|profile_photo|...", "fileUrl": "https://...", "mimeType": "image/jpeg" }
// Response
{ "id": 1, "type": "string", "fileUrl": "https://..." }
```

**POST `/driver/checkin`** — `multipart/form-data` (selfie image + optional `tripId`)

---

### 1.5 On-Demand Rides

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 29 | GET | `/driver/rides/available` | JWT | `lib/api.ts:436` | Pending ride requests near driver |
| 30 | GET | `/rides/{rideId}` | JWT | `lib/api.ts:437` | Ride details by ID |
| 31 | GET | `/driver/rides/active` | JWT | `lib/api.ts:443` | Currently active ride |
| 32 | PATCH | `/driver/rides/{rideId}/accept` | JWT | `lib/api.ts:438` | Accept a ride offer |
| 33 | PATCH | `/driver/rides/{rideId}/decline` | JWT | `lib/api.ts:440` | Decline a ride offer |
| 34 | PATCH | `/driver/rides/{rideId}/arrived` | JWT | `lib/api.ts:439` | Mark arrived at pickup |
| 35 | PATCH | `/driver/rides/{rideId}/start` | JWT | `lib/api.ts:441` | Start the ride |
| 36 | PATCH | `/driver/rides/{rideId}/complete` | JWT | `lib/api.ts:442` | Complete the ride |
| 37 | POST | `/driver/rides/{rideId}/rate-rider` | JWT | `lib/api.ts:444` | Rate the passenger after ride |
| 38 | POST | `/driver/rides/{rideId}/sos` | JWT | `lib/api.ts:450` | Trigger SOS alert |
| 39 | GET | `/driver/rides/history` | JWT | `lib/api.ts:452` | Paginated ride history |
| 40 | GET | `/rides/{rideId}/messages` | JWT | `lib/api.ts:446` | Fetch ride chat messages |
| 41 | POST | `/rides/{rideId}/messages` | JWT | `lib/api.ts:448` | Send in-ride chat message |

#### Key Request/Response Details

**POST `/driver/rides/{rideId}/rate-rider`**
```json
// Request
{ "rating": 5, "comment": "Great passenger!" }
```

**POST `/driver/rides/{rideId}/sos`**
```json
// Request
{ "latitude": 30.0444, "longitude": 31.2357, "notes": "optional string" }
```

**GET `/driver/rides/history`** — Query params: `page`, `limit`, `status` (optional)
```json
// Response
{
  "data": [{ "id": "string", "status": "string", "fare": 50, "distance": 8.5, "duration": 20, "pickup": "string", "dropoff": "string", "createdAt": "ISO8601" }],
  "total": 120, "page": 1
}
```

**GET `/rides/{rideId}/messages`**
```json
// Response
{
  "data": [{ "id": "string", "senderId": "string", "senderType": "driver|passenger", "text": "string", "createdAt": "ISO8601" }],
  "total": 5
}
```

---

### 1.6 Trips (Driver-Assigned Shuttle Trips)

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 42 | GET | `/driver/trips` | JWT | `lib/api.ts:462` | List trips with optional status filter + pagination |
| 43 | GET | `/driver/trips/{tripId}` | JWT | `lib/api.ts:469` | Trip detail |
| 44 | PATCH | `/driver/trips/{tripId}/accept` | JWT | `lib/api.ts:471` | Accept assigned trip |
| 45 | PATCH | `/driver/trips/{tripId}/reject` | JWT | `lib/api.ts:473` | Reject assigned trip |
| 46 | PATCH | `/driver/trips/{tripId}/start` | JWT | `lib/api.ts:474` | Start trip |
| 47 | PATCH | `/driver/trips/{tripId}/complete` | JWT | `lib/api.ts:475` | Complete trip |
| 48 | PATCH | `/driver/trips/{tripId}/cancel` | JWT | `lib/api.ts:477` | Cancel trip with reason |
| 49 | GET | `/driver/trips/{tripId}/stations` | JWT | `lib/api.ts:479` | Trip stations list |
| 50 | GET | `/driver/trips/{tripId}/stations/eta` | JWT | `lib/api.ts:480` | ETA per station |
| 51 | PATCH | `/driver/trips/{tripId}/stations/{stationId}/arrived` | JWT | `lib/api.ts:481` | Mark arrived at station |
| 52 | PATCH | `/driver/trips/{tripId}/stations/{stationId}/completed` | JWT | `lib/api.ts:483` | Mark station service complete |

**GET `/driver/trips`** — Query params: `status`, `page`, `limit`

**PATCH `/driver/trips/{tripId}/cancel`**
```json
// Request
{ "reason": "string" }
```

---

### 1.7 Earnings & Wallet

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 53 | GET | `/earnings/summary` | JWT | `lib/api.ts:488` | Total earnings summary |
| 54 | GET | `/earnings/weekly` | JWT | `lib/api.ts:489` | Weekly earnings breakdown |
| 55 | GET | `/config/driver-wallet-feature` | JWT | `lib/api.ts:502` | Check if wallet feature is enabled for driver |
| 56 | GET | `/driver/wallet/balance` | JWT | `lib/api.ts:503` | Current wallet balance |
| 57 | GET | `/driver/earnings/history` | JWT | `lib/api.ts:504` | Paginated earnings/transaction history |
| 58 | POST | `/driver/wallet/payout` | JWT | `lib/api.ts:505` | Request payout |
| 59 | GET | `/driver/wallet/payout-methods` | JWT | `lib/api.ts:506` | List saved payout methods |
| 60 | POST | `/driver/wallet/payout-methods` | JWT | `lib/api.ts:507` | Add a payout method |
| 61 | DELETE | `/driver/wallet/payout-methods/{id}` | JWT | `lib/api.ts:508` | Remove a payout method |
| 62 | GET | `/driver/financial-analytics` | JWT | `lib/api.ts:984` | Financial analytics with range filter |
| 63 | GET | `/driver/bonus-targets` | JWT | `lib/api.ts:946` | Active bonus/milestone targets |

**GET `/earnings/weekly`** — Query param: `weeks` (integer)

**GET `/driver/earnings/history`** — Query params: `page`, `limit`

**GET `/driver/financial-analytics`** — Query param: `range` (e.g. `week`, `month`)

**POST `/driver/wallet/payout`**
```json
// Request
{ "amount": 500, "method": "string" }
```

---

### 1.8 Safety

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 64 | POST | `/driver/safety/share-trip` | JWT | `lib/api.ts:493` | Share live trip with emergency contact |
| 65 | POST | `/driver/safety/ridecheck` | JWT | `lib/api.ts:495` | Trigger automated ride check call |
| 66 | POST | `/driver/safety/recording` | JWT | `lib/api.ts:497` | Start/stop in-trip audio recording |

**POST `/driver/safety/share-trip`**
```json
{ "rideId": "string", "contactPhone": "string" }
// Response: { "ok": true, "message": "string" }
```

**POST `/driver/safety/ridecheck`**
```json
{ "rideId": "string", "latitude": 30.0, "longitude": 31.0 }
// Response: { "ok": true, "message": "string" }
```

**POST `/driver/safety/recording`**
```json
{ "rideId": "string", "action": "start|stop" }
// Response: { "recordingId": "string", "status": "string" }
```

---

### 1.9 Shuttle Lines & Booking

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 67 | GET | `/shuttle/lines` | JWT | `lib/api.ts:549` | All available shuttle lines |
| 68 | GET | `/shuttle/lines/{lineId}` | JWT | `lib/api.ts:550` | Single shuttle line details |
| 69 | GET | `/shuttle/lines/{routeId}/available-weeks` | JWT | `lib/api.ts:552` | Available booking weeks for a route |
| 70 | GET | `/shuttle/available-slots` | JWT | `lib/api.ts:556` | Available time slots — query: `routeId`, `weekStart` |
| 71 | GET | `/shuttle/timeslots/{routeId}` | JWT | `lib/api.ts:559` | Timeslots for route — query: `weekStart` |
| 72 | GET | `/shuttle/route-bookings` | JWT | `lib/api.ts:563` | Driver's shuttle route bookings |
| 73 | GET | `/shuttle/route-bookings/{id}` | JWT | `lib/api.ts:564` | Single booking detail |
| 74 | POST | `/shuttle/route-bookings` | JWT | `lib/api.ts:565` | Create a new booking |
| 75 | POST | `/shuttle/lines/{routeId}/book-week` | JWT | `lib/api.ts:677` | Book a full week of shuttle trips |
| 76 | DELETE | `/shuttle/route-bookings/{id}` | JWT | `lib/api.ts:687` | Cancel a booking |
| 77 | POST | `/shuttle/route-bookings/{id}/confirm-renewal` | JWT | `lib/api.ts:688` | Confirm booking renewal for next week |
| 78 | POST | `/shuttle/route-bookings/{id}/decline-renewal` | JWT | `lib/api.ts:698` | Decline booking renewal |
| 79 | GET | `/shuttle/route-bookings/{id}/detail` | JWT | `lib/api.ts:713` | Live booking seat count & threshold |
| 80 | GET | `/shuttle/route-bookings/{bookingId}/cancel-preview` | JWT | `lib/api.ts:780` | Preview penalty before cancellation |
| 81 | POST | `/shuttle/route-bookings/{bookingId}/final-cancel` | JWT | `lib/api.ts:774` | Final cancel with reason |
| 82 | GET | `/shuttle/route-bookings/{bookingId}/trip-detail` | JWT | `lib/api.ts:785` | Trip detail for a booking |

**POST `/shuttle/lines/{routeId}/book-week`**
```json
// Request
{ "slotId": 1, "startSundayDate": "2026-06-21", "endThursdayDate": "2026-06-25", "daysArray": [0,1,2,3,4] }
// Response
{ "bookingId": "string", "weekStart": "string", "weekEnd": "string", "departure": "08:00", "renewalDeadline": "ISO8601" }
```

**POST `/shuttle/route-bookings/{bookingId}/final-cancel`**
```json
{ "reason": "string" }
// Response: { "success": true, "penaltyAmount": 50, "message": "string" }
```

---

### 1.10 Shuttle Trip Execution

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 83 | POST | `/shuttle/route-bookings/{bookingId}/start` | JWT | `lib/api.ts:720` | Start a shuttle trip |
| 84 | POST | `/shuttle/lines/{lineId}/complete` | JWT | `lib/api.ts:726` | Complete a shuttle trip |
| 85 | GET | `/shuttle/trips/{tripId}/passengers` | JWT | `lib/api.ts:727` | Passenger list for active trip |
| 86 | PATCH | `/driver/bookings/{bookingId}/board` | JWT | `lib/api.ts:729` | Board a passenger |
| 87 | PATCH | `/driver/bookings/{bookingId}/absent` | JWT | `lib/api.ts:745` | Mark passenger no-show |
| 88 | GET | `/driver/trips/{tripId}/cash-summary` | JWT | `lib/api.ts:748` | Cash collected per trip |
| 89 | GET | `/driver/trips/{tripId}/revenue-summary` | JWT | `lib/api.ts:751` | Revenue breakdown per trip |
| 90 | GET | `/shuttle/driver/my-trips` | JWT | `lib/api.ts:732,738` | Shuttle trip history — query: `page`, `limit` |
| 91 | POST | `/shuttle/ratings` | JWT | `lib/api.ts:742` | Rate a shuttle passenger |

**PATCH `/driver/bookings/{bookingId}/board`**
```json
{ "stationId": 1, "cashCollected": true, "amountCollected": 25.0 }
```

**POST `/shuttle/ratings`**
```json
{ "tripId": "string", "rateeId": "string", "stars": 5 }
```

**POST `/shuttle/route-bookings/{bookingId}/start`**
```json
// Response: { "tripId": "string", "earnedAmount": 0, "walletBalance": 0 }
```

---

### 1.11 Shuttle Referrals

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 92 | POST | `/shuttle/route-bookings/{bookingId}/refer` | JWT | `lib/api.ts:756` | Refer trip to another driver by code |
| 93 | POST | `/shuttle/referrals/{referralId}/accept` | JWT | `lib/api.ts:761` | Accept incoming trip referral |
| 94 | POST | `/shuttle/referrals/{referralId}/decline` | JWT | `lib/api.ts:766` | Decline incoming trip referral |

**POST `/shuttle/route-bookings/{bookingId}/refer`**
```json
{ "driverCode": "DRV-XXXX" }
```

---

### 1.12 Push Notifications & In-App Notifications

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 95 | POST | `/driver/push-token` | JWT | `lib/api.ts:431` | Register Expo push token |
| 96 | GET | `/driver/notifications` | JWT | `lib/api.ts:800` | List in-app notifications |
| 97 | PATCH | `/notifications/{id}/read` | JWT | `lib/api.ts:801` | Mark single notification read |
| 98 | PATCH | `/notifications/read-all` | JWT | `lib/api.ts:802` | Mark all notifications read |

---

### 1.13 Registration Onboarding

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 99 | GET | `/services/available` | JWT | `lib/api.ts:907` | Available service types for the driver to register |
| 100 | POST | `/driver/register/service-type` | JWT | `lib/api.ts:824` | Set service type during onboarding |
| 101 | POST | `/driver/register/plate-number` | JWT | `lib/api.ts:826` | Submit plate number during onboarding |
| 102 | POST | `/driver/register/vehicle-details` | JWT | `lib/api.ts:842` | Submit vehicle details during onboarding |

**POST `/driver/register/plate-number`**
```json
{ "plateLetters": "أبج", "plateNumbers": "12345" }
// Response: { "vehicleId": 1, "plateNumber": "string", "plateLetters": "string", "plateNumbers": "string" }
```

**POST `/driver/register/vehicle-details`**
```json
{ "brandId": 1, "modelId": 5, "year": 2020, "color": "White", "colorId": 3 }
// Response: { "vehicleId": 1 }
```

---

### 1.14 Vehicle Metadata

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 103 | GET | `/vehicles/brands` | JWT | `lib/api.ts:856` | Vehicle brands — query: `serviceType` |
| 104 | GET | `/vehicles/brands/{brandId}/models` | JWT | `lib/api.ts:864` | Models by brand |
| 105 | GET | `/vehicles/meta` | JWT | `lib/api.ts:871` | All brands + models combined |
| 106 | GET | `/vehicles/models/{modelId}/years` | JWT | `lib/api.ts:876` | Available years for model |
| 107 | GET | `/vehicles/brands/{brandId}/models/{modelId}` | JWT | `lib/api.ts:885` | Model detail with years |
| 108 | GET | `/vehicles/colors` | JWT | `lib/api.ts:903` | Available vehicle colors |

---

### 1.15 Service Control & Configuration

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 109 | GET | `/services/control` | JWT | `lib/api.ts:806` | Service on/off status and display config |
| 110 | GET | `/config/driver-wallet-feature` | JWT | `lib/api.ts:502` | Wallet feature toggle |

---

### 1.16 Terms & Legal

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 111 | GET | `/terms/driver` | **None** | `lib/api.ts:996`, `app/login.tsx`, `app/(tabs)/profile.tsx` | Fetch latest driver terms (public) |
| 112 | POST | `/terms/accept` | JWT | `lib/api.ts:1004`, `app/verify-otp.tsx`, `app/(tabs)/profile.tsx` | Accept a terms version |

**GET `/terms/driver`**
```json
// Response 200
{ "id": 1, "targetApp": "driver", "version": 2, "contentAr": "...", "contentEn": "...", "updatedAt": "ISO8601" }
// Response 404: { "error": "No terms found for this app" }
```

**POST `/terms/accept`**
```json
{ "app": "driver", "version": 2 }
// Response 200: { "ok": true, "app": "driver", "version": 2, "acceptedAt": "ISO8601" }
```

---

### 1.17 Support

| # | Method | Path | Auth | File | Purpose |
|---|--------|------|------|------|---------|
| 113 | POST | `/support/tickets` | JWT | `lib/api.ts:810` | Submit a support ticket |

> **Note:** Request body type is `unknown` in the source — no defined schema in the codebase.

---

## 2. Socket.IO Events

### Connection Configuration

- **Source file:** `lib/socketContext.tsx`
- **URL:** Derived from `EXPO_PUBLIC_API_URL` (strips `/api` suffix)
- **Path:** `/api/socket.io`
- **Auth:** `{ token: "Bearer <access_token>" }` in socket handshake
- **Transports:** `['polling', 'websocket']`
- **Reconnection:** 10 attempts, backoff 1s–30s, randomization factor 0.5
- **Events constants file:** `constants/socketEvents.ts`

---

### 2.1 Server → Driver Events (Incoming)

| Event Name | Constant | Payload | Handler File | Purpose |
|-----------|----------|---------|--------------|---------|
| `ride:offer` | `RIDE_OFFER` | `RideRequest` | `hooks/useRideSocket.ts:167` | New ride offer pushed to driver |
| `ride:offer_expired` | `RIDE_OFFER_EXPIRED` | `{rideId?: string} \| string` | `hooks/useRideSocket.ts:168` | Ride offer timed out |
| `ride:no_longer_available` | `RIDE_NO_LONGER_AVAILABLE` | `—` | `hooks/useRideSocket.ts:169` | Ride was taken / cancelled before acceptance |
| `ride:cancelled` | `RIDE_CANCELLED` | `—` | `app/ride/[rideId].tsx:108` | Passenger cancelled mid-ride |
| `ride:message:new` | `RIDE_MESSAGE_NEW` | `—` | `app/ride/chat.tsx:55` | New in-ride chat message |
| `ride:waiting:charge:updated` | `WAITING_CHARGE_UPDATED` | `WaitingCharge` | `hooks/useRideSocket.ts:170`, `hooks/useWaitingCharge.ts:30` | Waiting charge incremented |
| `ride:waiting:charge:capped` | `WAITING_CHARGE_CAPPED` | `WaitingCharge` | `hooks/useRideSocket.ts:171`, `hooks/useWaitingCharge.ts:31` | Waiting charge at maximum |
| `driver:checkin:required` | `DRIVER_CHECKIN_REQUIRED` | `—` | `hooks/useRideSocket.ts:172` | Self-verification selfie required |
| `driver:checkin:rejected` | `DRIVER_CHECKIN_REJECTED` | `—` | `hooks/useRideSocket.ts:173` | Submitted selfie was rejected |
| `driver:checkin:approved` | `DRIVER_CHECKIN_APPROVED` | `—` | `hooks/useRideSocket.ts:174` | Submitted selfie was approved |
| `driver:cooldown:cleared` | `DRIVER_COOLDOWN_CLEARED` | `—` | `hooks/useRideSocket.ts:175` | Cooldown period ended, can receive rides again |
| `surge:updated` | `SURGE_UPDATED` | `SurgeZone[] \| {zones: SurgeZone[]} \| SurgeZone` | `hooks/useRideSocket.ts:176` | Surge pricing zones updated |
| `sos:triggered` | `SOS_TRIGGERED` | `unknown` | `hooks/useRideSocket.ts:177` | SOS alert fired |
| `shuttle:checkin:required` | `SHUTTLE_CHECKIN_REQUIRED` | `—` | `app/(shuttle)/index.tsx:111` | Shuttle check-in required |
| `shuttle:station:timeout` | `SHUTTLE_STATION_TIMEOUT` | `—` | `app/shuttle/trip-active.tsx:254`, `app/shuttle/boarding.tsx:55` | Station wait timed out |
| `shuttle:booking:created` | `SHUTTLE_BOOKING_CREATED` | `{bookingId?, routeId?, routeName?, timeSlotId?, departureTime?, weekStart?, weekEnd?, status?}` | `hooks/useShuttleSocket.ts:79` | New booking assigned to driver |
| `shuttle:booking:cancelled` | `SHUTTLE_BOOKING_CANCELLED` | `{bookingId?: string \| number}` | `hooks/useShuttleSocket.ts:80` | Booking cancelled |
| `shuttle:referral:incoming` | `SHUTTLE_INCOMING_REFERRAL` | `IncomingReferralPayload` | `hooks/useShuttleSocket.ts:81` | Another driver is referring a trip |
| `shuttle:referral:cancelled` | `SHUTTLE_REFERRAL_CANCELLED` | `{referralId?: string} \| string` | `hooks/useShuttleSocket.ts:82` | Referral was withdrawn |
| `slot_taken` | `SLOT_TAKEN` | `{routeId, slotId, weekStart, takenByDriverName}` | `app/(shuttle)/bookings.tsx:841` | Shuttle slot just booked by another driver |
| `slot_released` | `SLOT_RELEASED` | `{routeId, slotId, weekStart}` | `constants/socketEvents.ts` | Slot freed up (renewal declined) |
| `booking:passenger_updated` | `BOOKING_PASSENGER_UPDATED` | `{bookingId: string, bookedSeats: number, thresholdMet: boolean}` | `app/shuttle/trip-active.tsx:236` | Seat count changed in real-time |
| `driver:wallet:feature:changed` | `DRIVER_WALLET_FEATURE` | `—` | `app/(shuttle)/wallet.tsx:124` | Wallet feature toggled by admin |
| `notification:new` | `NOTIFICATION_NEW` | `—` | `app/(tabs)/index.tsx:121`, `app/(shuttle)/index.tsx:112` | New notification pushed |
| `driver:account:activated` | *(no constant)* | `—` | `app/pending-approval.tsx:86` | Account approved |
| `driver:account:rejected` | *(no constant)* | `—` | `app/pending-approval.tsx:87` | Account rejected |
| `driver:changes:requested` | *(no constant)* | `—` | `app/pending-approval.tsx:88` | Admin requested document changes |
| `service:control:changed` | `SERVICE_CONTROL_CHANGED` | `—` | `constants/socketEvents.ts` | Service enabled/disabled |
| `service:settings:changed` | `SERVICE_SETTINGS_CHANGED` | `—` | `constants/socketEvents.ts` | Service settings updated |
| `shuttle:trip:status` | `SHUTTLE_TRIP_STATUS` | `—` | `constants/socketEvents.ts` | Trip status changed |
| `error` | `ERROR` | `—` | `constants/socketEvents.ts` | General socket error |

---

### 2.2 Driver → Server Events (Outgoing)

| Event Name | Constant | Payload | Source File | Purpose |
|-----------|----------|---------|-------------|---------|
| `join` | `JOIN` | `"driver:{driverId}"` | `hooks/useRideSocket.ts:96,101` | Join driver-specific room on connect |
| `driver:location:update` | `DRIVER_LOCATION_UPDATE` | `{latitude, longitude, speed?, heading?, tripId?}` | `hooks/useLocationBroadcast.ts:57` | Broadcast real-time GPS position (every 5s) |
| `driver:sos` | `DRIVER_SOS` | `{rideId, latitude, longitude}` | `app/ride/[rideId].tsx:209` | SOS alert from driver during ride |

---

## 3. AsyncStorage & SecureStore Keys

| Key | Storage | Module | Value Type | Purpose |
|-----|---------|--------|------------|---------|
| `auth_token` | SecureStore → AsyncStorage fallback | `lib/auth.ts` | `string` | JWT access token |
| `refresh_token` | SecureStore → AsyncStorage fallback | `lib/auth.ts` | `string` | JWT refresh token |
| `veego_language` | AsyncStorage | `lib/i18nContext.tsx` | `"en" \| "ar"` | Persisted language preference |
| `veego_theme` | AsyncStorage | `lib/serviceContext.tsx` | `"dark" \| "light"` | Dark/light mode preference |
| `veego_service_map` | AsyncStorage | `lib/serviceContext.tsx` | `JSON: {[userId]: ServiceType}` | Per-account service type (CAR/SCOOTER/SHUTTLE/DELIVERY) |
| `veego_device_service` | AsyncStorage | `lib/serviceContext.tsx` | `"CAR" \| "SCOOTER" \| "SHUTTLE" \| "DELIVERY"` | Device-level fallback service type |
| `veego_pending_locations` | AsyncStorage | `hooks/useActiveLocationTracking.ts` | `JSON: LocationSnapshot[]` | Offline-buffered location records pending sync |
| `driver_terms_pending_version` | AsyncStorage | `app/login.tsx`, `app/verify-otp.tsx` | `string (number)` | Terms version to accept after OTP verification |
| `driver_terms_accepted_version` | AsyncStorage | `app/verify-otp.tsx`, `app/(tabs)/profile.tsx` | `string (number)` | Last accepted terms version for update detection |
| `veego_emergency_contact` | AsyncStorage | `app/safety.tsx` | `JSON object` | Emergency contact info for safety features |

---

## 4. External API Calls

| Service | URL | Method | File | Purpose | Auth |
|---------|-----|--------|------|---------|------|
| OSRM Routing | `https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}` | GET | `hooks/useRoadEta.ts:71` | Road-accurate distance & ETA between two points | None |
| OSRM Routing | `https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson` | GET | `hooks/useRoadPolyline.ts:52` | Road geometry polyline for map rendering | None |

**OSRM Configuration:**
- Throttle interval: 30 seconds between calls
- Movement threshold before re-fetch: 80 meters
- ETA fetch timeout: 6 seconds
- Polyline fetch timeout: 8 seconds
- Fallback speed (if OSRM fails): 8.33 m/s (30 km/h)

---

## 5. Duplicate APIs

| Issue | Endpoints | Files |
|-------|-----------|-------|
| **Shuttle trip history called twice with same path** | `endpoints.shuttle.driverTrips` and `endpoints.shuttle.history` both call `GET /shuttle/driver/my-trips?page=&limit=` | `lib/api.ts:732` vs `lib/api.ts:738` — two separate endpoint definitions for the same URL |
| **`/driver/me` and `/driver/profile` overlap** | Both return driver profile data; `me` is basic, `profile` is enriched — many screens call both unnecessarily | `app/(tabs)/profile.tsx`, `app/vehicle.tsx`, `app/(shuttle)/profile.tsx` |
| **SOS has two mechanisms** | REST: `POST /driver/rides/{rideId}/sos` AND Socket: `emit('driver:sos', {...})` — both called from `app/ride/[rideId].tsx` (lines 205–215) | `app/ride/[rideId].tsx` |
| **Location update has two mechanisms** | REST: `PATCH /driver/location` (fallback) AND Socket: `emit('driver:location:update', ...)` — primary | `hooks/useLocationBroadcast.ts` |

---

## 6. Inconsistent API Usage

| Issue | Detail | Files |
|-------|--------|-------|
| **`/driver/me/vehicle` response shape inconsistency** | Backend returns `{ vehicle: null, vehicleType: "shuttle" }` — nested. The TypeScript type definition in `lib/api.ts:380` does not reflect this nesting; `app/vehicle.tsx` manually unwraps it at runtime with `vehicleData?.vehicle ?? null` | `lib/api.ts:380`, `app/vehicle.tsx:73` |
| **`ShuttleCompleteResponse` double-fallback** | `POST /shuttle/lines/{lineId}/complete` may return `earnedAmount` at root level OR nested under `data.earnedAmount` — both are handled with fallbacks in `app/shuttle/trip-active.tsx` | `lib/api.ts:68–75` |
| **`endpoints.driver.settings` body type `unknown`** | `PATCH /driver/me/settings` has no defined request schema | `lib/api.ts:912` |
| **`endpoints.support.submitTicket` body type `unknown`** | `POST /support/tickets` has no defined request schema | `lib/api.ts:810` |
| **`endpoints.wallet.addPayoutMethod` body type `unknown`** | `POST /driver/wallet/payout-methods` has no defined request schema | `lib/api.ts:507` |
| **Notification paths inconsistency** | List: `GET /driver/notifications` but mark-read: `PATCH /notifications/{id}/read` (missing `/driver/` prefix) | `lib/api.ts:800–802` |
| **`endpoints.rides.sos` vs `endpoints.safety.*`** | Ride-specific SOS goes to `/driver/rides/{rideId}/sos`. General safety endpoints exist at `/driver/safety/*`. No shuttle SOS endpoint defined. | `lib/api.ts:450`, `lib/api.ts:493–498` |
| **Surge payload shape is variable** | `surge:updated` socket event handler accepts 3 different payload formats: `SurgeZone[]`, `{zones: SurgeZone[]}`, or a single `SurgeZone` | `hooks/useRideSocket.ts:176` |
| **`shuttle:referral:cancelled` payload is variable** | Handler accepts `{referralId?: string} \| string` | `hooks/useShuttleSocket.ts:82` |
| **`ride:offer_expired` payload is variable** | Handler accepts `{rideId?: string} \| string` | `hooks/useRideSocket.ts:168` |

---

## 7. Potentially Broken or Incomplete APIs

| Issue | Detail | Risk | File |
|-------|--------|------|------|
| **`driver:account:activated/rejected/changes:requested` have no constants** | These three socket events are listened to by name string only (not via `socketEvents.ts` constants). If backend renames them, the events will silently break. | High | `app/pending-approval.tsx:86–88` |
| **`slot_released` event has no handler** | Event is defined in `constants/socketEvents.ts` but never listened to in any screen or hook | Medium | `constants/socketEvents.ts` |
| **`service:control:changed` and `service:settings:changed` have no runtime handler** | Defined in constants, not handled in any screen | Medium | `constants/socketEvents.ts` |
| **`shuttle:trip:status` has no handler** | Defined in constants, not handled anywhere in the app | Medium | `constants/socketEvents.ts` |
| **`endpoints.driver.updateMe` accepts `unknown`** | `PATCH /driver/me` has no type-safe request body — any malformed payload will be sent without compile-time error | Medium | `lib/api.ts:358` |
| **`driver_terms_accepted_version` key is different in profile vs verify-otp** | `app/(tabs)/profile.tsx` uses a `TERMS_VERSION_KEY` constant defined locally in the file (`const TERMS_VERSION_KEY = 'driver_terms_accepted_version'`). `app/verify-otp.tsx` uses the string `'driver_terms_accepted_version'` inline. If one changes, they fall out of sync. | Low–Medium | `app/(tabs)/profile.tsx:20`, `app/verify-otp.tsx:63` |
| **Onboarding polling without abort** | `app/pending-approval.tsx` polls `GET /driver/me/onboarding` every 15 seconds. No cleanup on unmount visible in socket listener area. | Low | `app/pending-approval.tsx:28` |
| **`POST /driver/checkin` FormData structure undocumented** | The field names for the selfie image and optional `tripId` in the multipart body are not defined in the TypeScript types — constructed ad-hoc in `app/selfie.tsx` | Medium | `lib/api.ts:411`, `app/selfie.tsx` |
| **`endpoints.rides.messages` response wraps data in `{data, total}`** | But `endpoints.rides.sendMessage` returns a single `RideMessage`. Chat screen must handle both shapes. | Low | `lib/api.ts:446–449` |

---

## 8. Dead / Unused API Calls

| Endpoint | Defined In | Issue |
|----------|-----------|-------|
| `endpoints.shuttle.history` (`GET /shuttle/driver/my-trips`) | `lib/api.ts:738` | Duplicate of `endpoints.shuttle.driverTrips` (line 732) with identical URL — one is dead |
| `endpoints.shuttle.myBookings` (`GET /shuttle/route-bookings`) | `lib/api.ts:563` | Superseded by `endpoints.shuttle.driverTrips` — unclear if still called |
| `endpoints.shuttle.createBooking` (`POST /shuttle/route-bookings`) | `lib/api.ts:565` | Superseded by `endpoints.shuttle.bookWeek` which is the actual flow used |
| `endpoints.rides.sos` | `lib/api.ts:450` | Also covered by the socket `driver:sos` emit in the same file — one path may be redundant |
| `endpoints.tracking.sendLocation` | `lib/api.ts:989` | `hooks/useActiveLocationTracking.ts` exists but primary tracking uses `useLocationBroadcast.ts` — unclear if active tracking hook is mounted anywhere |

---

## 9. Driver-Specific Feature Audit

### 9.1 Authentication

**APIs used:**
- `POST /driver/auth/register` → `POST /auth/send-otp` → `POST /auth/verify-otp`
- `POST /driver/auth/login` (returns tokens or triggers OTP)
- `POST /auth/refresh` (internal, silent)
- `POST /driver/auth/logout`
- `GET /terms/driver` + `POST /terms/accept` (during registration)

**Files:** `app/login.tsx`, `app/verify-otp.tsx`, `app/forgot-password.tsx`, `lib/authContext.tsx`, `lib/auth.ts`, `lib/postAuthRouter.ts`

**Missing/suspicious:** Registration flow does not call `POST /terms/accept` immediately — it stores the version in `driver_terms_pending_version` and defers the accept call until OTP is verified. If OTP screen is abandoned, terms are never accepted server-side.

---

### 9.2 Driver Profile

**APIs used:**
- `GET /driver/me` — basic profile
- `GET /driver/profile` — enriched profile
- `PATCH /driver/me` — update fields
- `POST /driver/profile/avatar-request` — request avatar change
- `GET /driver/me/documents` — list documents

**Files:** `app/(tabs)/profile.tsx`, `app/(shuttle)/profile.tsx`, `app/personal-info.tsx`, `app/shuttle/profile-info.tsx`

**Missing/suspicious:** `app/(tabs)/profile.tsx` calls both `/driver/me` and `/driver/me/documents` for the avatar fallback. No dedicated endpoint to GET the current avatar URL — uses the documents list as a workaround.

---

### 9.3 Driver Availability / Online Status

**APIs used:**
- `GET /driver/me/status`
- `PATCH /driver/status` (`online` / `offline` / `busy` / `suspended`)
- Convenience wrappers: `endpoints.driver.goOnline()` and `endpoints.driver.goOffline()`

**Files:** `app/(tabs)/index.tsx`, `app/(shuttle)/index.tsx`

**Missing/suspicious:** `goOnline` and `goOffline` are wrappers around `updateStatus` — three methods for the same endpoint. No socket event acknowledges the status change back to the driver.

---

### 9.4 Active Trip Management (On-Demand Rides)

**APIs used:**
- `GET /driver/rides/active` — check for in-progress ride on load
- `PATCH /driver/rides/{rideId}/arrived`
- `PATCH /driver/rides/{rideId}/start`
- `PATCH /driver/rides/{rideId}/complete`
- Socket `ride:cancelled` — handle passenger cancellation

**Files:** `app/ride/[rideId].tsx`, `app/(tabs)/index.tsx`

**Missing/suspicious:** No API to re-fetch the active ride if the driver closes and reopens the app mid-ride. The app relies on `GET /driver/rides/active` but doesn't auto-navigate to the ride screen on re-open.

---

### 9.5 Assigned Trips (Shuttle)

**APIs used:**
- `GET /driver/trips?status=&page=&limit=`
- `GET /driver/trips/{tripId}` — detail
- `PATCH /driver/trips/{tripId}/accept`
- `PATCH /driver/trips/{tripId}/reject`
- Socket `shuttle:booking:created` — incoming booking notification

**Files:** `app/(tabs)/trips.tsx`, `app/trips/[tripId].tsx`, `hooks/useShuttleSocket.ts`

---

### 9.6 Trip Start

**APIs used (shuttle):**
- `POST /shuttle/route-bookings/{bookingId}/start` → returns `tripId`

**APIs used (on-demand):**
- `PATCH /driver/rides/{rideId}/start`

**Files:** `app/shuttle/trip-details.tsx`, `app/ride/[rideId].tsx`

---

### 9.7 Trip Completion

**APIs used (shuttle):**
- `POST /shuttle/lines/{lineId}/complete` → `ShuttleCompleteResponse`
- `GET /driver/trips/{tripId}/revenue-summary`
- `GET /driver/trips/{tripId}/cash-summary`

**APIs used (on-demand):**
- `PATCH /driver/rides/{rideId}/complete`

**Files:** `app/shuttle/trip-active.tsx`, `app/shuttle/trip-complete.tsx`, `app/ride/[rideId].tsx`

**Missing/suspicious:** `ShuttleCompleteResponse` returns `earnedAmount` at root level OR under `data` — dual-fallback required. Response shape should be standardized.

---

### 9.8 Passenger Check-in / Boarding

**APIs used:**
- `PATCH /driver/bookings/{bookingId}/board` — board a passenger (with optional cash data)
- `PATCH /driver/bookings/{bookingId}/absent` — mark no-show

**Files:** `app/shuttle/boarding.tsx`, `app/shuttle/trip-active.tsx`

**Socket events:** `shuttle:station:timeout` — station wait timed out

---

### 9.9 Route Stops

**APIs used:**
- `GET /driver/trips/{tripId}/stations`
- `GET /driver/trips/{tripId}/stations/eta`
- `PATCH /driver/trips/{tripId}/stations/{stationId}/arrived`
- `PATCH /driver/trips/{tripId}/stations/{stationId}/completed`

**Files:** `app/shuttle/trip-active.tsx`, `app/trips/[tripId].tsx`

**External:** OSRM called for road-accurate ETA per station (`hooks/useRoadEta.ts`)

---

### 9.10 Live Location Updates

**Primary (socket):**
- `emit('driver:location:update', {latitude, longitude, speed, heading, tripId})` every 5 seconds
- Source: `hooks/useLocationBroadcast.ts`, mounted in `app/(shuttle)/index.tsx` and `app/(tabs)/index.tsx`

**Fallback (REST):**
- `PATCH /driver/location` — called when socket is not connected

**Background tracking:**
- `POST /tracking/location` — single snapshot
- `POST /tracking/locations/batch` — bulk upload when back online
- Source: `hooks/useActiveLocationTracking.ts`
- Interval: every 5 minutes; batch chunk: 500 records

---

### 9.11 GPS Tracking

**Libraries used:**
- `expo-location` — `requestForegroundPermissionsAsync()`, `getCurrentPositionAsync()`

**Config:** Permission requested once on first broadcast attempt; location accuracy BALANCED.

**Speed conversion:** Raw `m/s` → `km/h` (multiply by 3.6) before sending.

---

### 9.12 Socket Events

See full list in **Section 2**. Summary of critical paths:

| Flow | Event |
|------|-------|
| New ride | `ride:offer` → driver accepts/declines |
| Ride expired | `ride:offer_expired` → UI resets |
| Passenger cancelled | `ride:cancelled` → show cancellation screen |
| Self-check required | `driver:checkin:required` → open selfie modal |
| Shuttle booking | `shuttle:booking:created` → refresh bookings |
| Referral | `shuttle:referral:incoming` → prompt accept/decline |
| Account approved | `driver:account:activated` → navigate to home |
| Location | `emit driver:location:update` every 5 seconds |

---

### 9.13 Notifications

**APIs used:**
- `GET /driver/notifications`
- `PATCH /notifications/{id}/read`
- `PATCH /notifications/read-all`
- `POST /driver/push-token` — register Expo push token

**Socket event:** `notification:new` — triggers UI badge update

**Files:** `app/messages.tsx`, `hooks/usePushNotifications.ts`, `app/(tabs)/index.tsx`, `app/(shuttle)/index.tsx`

**Missing/suspicious:** The notification mark-read paths omit `/driver/` prefix while the list endpoint includes it — possible 404 risk on production.

---

### 9.14 Earnings

**APIs used:**
- `GET /earnings/summary`
- `GET /earnings/weekly?weeks={n}`
- `GET /driver/earnings/history?page=&limit=`
- `GET /driver/financial-analytics?range={range}`
- `GET /driver/bonus-targets`
- `GET /driver/promotions`

**Files:** `app/(tabs)/earnings.tsx`, `app/(shuttle)/wallet.tsx`, `app/shuttle/earnings.tsx`, `app/bonus-targets.tsx`

---

### 9.15 Documents & Verification

**APIs used:**
- `GET /driver/me/documents`
- `POST /driver/upload` (multipart, field: `file`) → `{fileUrl}`
- `POST /driver/me/documents` (register URL on profile)
- `POST /driver/checkin` (selfie check-in, multipart)
- `GET /driver/me/onboarding` (polled every 15s in pending screen)

**Files:** `app/register-documents.tsx`, `app/documents.tsx`, `app/selfie.tsx`, `app/pending-approval.tsx`

**Missing/suspicious:** `POST /driver/checkin` FormData field names are not typed. The `pendingApproval` screen polls every 15 seconds indefinitely — no maximum poll count.

---

### 9.16 Emergency / SOS

**Mechanisms:**

1. **REST (ride-specific):** `POST /driver/rides/{rideId}/sos` with `{latitude, longitude, notes?}`
2. **Socket:** `emit('driver:sos', {rideId, latitude, longitude})`
3. **REST (general):** `POST /driver/safety/share-trip`, `POST /driver/safety/ridecheck`, `POST /driver/safety/recording`
4. **Local only:** Emergency contact stored in AsyncStorage (`veego_emergency_contact`) — no sync to server

**Files:** `app/ride/[rideId].tsx`, `app/safety.tsx`, `app/shuttle/trip-active.tsx`

**Missing/suspicious:** Shuttle trips use `endpoints.rides.sos` (from the rides namespace) for SOS — no shuttle-specific SOS endpoint defined.

---

### 9.17 Settings

**APIs used:**
- `GET /driver/me/settings`
- `PATCH /driver/me/settings` (body: `unknown` — no defined type)

**Local settings (AsyncStorage only, no API sync):**
- Dark mode (`veego_theme`)
- Language (`veego_language`)
- Service type (`veego_service_map`, `veego_device_service`)

---

## 10. Summary

### Total Counts

| Category | Count |
|----------|-------|
| REST API endpoints | **113** |
| HTTP GET | 58 |
| HTTP POST | 32 |
| HTTP PATCH | 21 |
| HTTP DELETE | 2 |
| Socket events (Server → Driver) | **30** |
| Socket events (Driver → Server) | **3** |
| External API calls (OSRM) | **2** |
| AsyncStorage / SecureStore keys | **10** |
| App screens with API integration | **40+** |
| Hooks with API/Socket logic | **7** |

---

### Most API-Heavy Modules / Screens

| Rank | Screen / File | API Calls |
|------|--------------|-----------|
| 1 | `lib/api.ts` | All 113 definitions |
| 2 | `app/shuttle/trip-active.tsx` | 8+ endpoints + 3 socket events |
| 3 | `app/(tabs)/index.tsx` | 7 endpoints + 4 socket events |
| 4 | `app/(shuttle)/index.tsx` | 6 endpoints + 5 socket events |
| 5 | `app/ride/[rideId].tsx` | 7 endpoints + 3 socket events |
| 6 | `app/(shuttle)/wallet.tsx` | 7 endpoints + 1 socket event |
| 7 | `app/register-documents.tsx` | 4 endpoints |
| 8 | `app/documents.tsx` | 4 endpoints |

---

### Socket Events Discovered

**30 total:** 27 server→driver, 3 driver→server  
**Critical unhandled:** `slot_released`, `service:control:changed`, `service:settings:changed`, `shuttle:trip:status`  
**No constant defined:** `driver:account:activated`, `driver:account:rejected`, `driver:changes:requested`

---

### Features with Missing Backend Dependencies

| Feature | Missing |
|---------|---------|
| Shuttle SOS | No shuttle-specific SOS endpoint — reuses ride SOS |
| Terms acceptance | Deferred until OTP — abandoned flows leave terms unaccepted server-side |
| Emergency contact | Stored locally only — no server sync endpoint |
| Driver settings | `PATCH /driver/me/settings` body is untyped `unknown` |
| Support tickets | `POST /support/tickets` body is untyped `unknown` |
| Service control changes | Socket events defined but no runtime handler in any screen |

---

### Key Issues in API Integration

| Priority | Issue |
|----------|-------|
| 🔴 High | `driver:account:activated/rejected/changes:requested` listened by string literal — no constants; silent break if renamed |
| 🔴 High | Notification mark-read path missing `/driver/` prefix — potential 404 |
| 🔴 High | `slot_released`, `service:control:changed`, `service:settings:changed`, `shuttle:trip:status` events defined but never handled |
| 🟠 Medium | Two identical endpoint definitions for `GET /shuttle/driver/my-trips` (lines 732 and 738) |
| 🟠 Medium | `ShuttleCompleteResponse` has dual root/nested shape requiring runtime fallback |
| 🟠 Medium | `PATCH /driver/me/vehicle` endpoint does not exist — vehicle data is read-only after approval |
| 🟠 Medium | `TERMS_VERSION_KEY` constant defined in two files separately — risk of key name divergence |
| 🟡 Low | Three methods for online status (`goOnline`, `goOffline`, `updateStatus`) all hit same endpoint |
| 🟡 Low | Onboarding polls every 15s with no maximum — will run indefinitely if backend never approves |
| 🟡 Low | OSRM is a third-party public service — no fallback if it goes down; affects ETA display and polyline rendering |
