# Shuttle Routes Screen — Investigation Report

---

## Screen Files

| Item | Value |
|------|-------|
| Main screen file | `app/(shuttle)/lines.tsx` |
| Screen name in Tabs navigator | `"lines"` (`app/(shuttle)/_layout.tsx` line 122) |
| Layout file | `app/(shuttle)/_layout.tsx` |
| Stack registration | `app/_layout.tsx` line 109: `<Stack.Screen name="(shuttle)" options={{ animation: 'slide_from_right' }} />` |
| Data provider | `lib/shuttleContext.tsx` — `useShuttle()` hook |

**Nesting hierarchy:**
```
app/_layout.tsx  (Root Stack)
  └── (shuttle)  [Stack.Screen]
        └── app/(shuttle)/_layout.tsx  (Tabs)
              └── lines  [Tabs.Screen]  ← THIS SCREEN
```

---

## API Calls

### Authorization & Headers (all requests — `lib/api.ts` lines 154–167)

Every request sent by `api.get()` / `api.post()` attaches:

```
Authorization: Bearer <token>       ← from getToken() (AsyncStorage)
Content-Type: application/json
Accept-Language: <lang>             ← module-level var, updated by setApiLanguage()
```

- Base URL: `process.env.EXPO_PUBLIC_API_URL` → stored as `API_BASE_URL` (`lib/api.ts` line 50)
- Request timeout: 15 000 ms (`lib/api.ts` — `REQUEST_TIMEOUT_MS`)
- On 401: automatic token refresh attempted once, then retries original request

---

### Endpoint 1 — `GET /shuttle/lines`

**Purpose:** Fetch the full list of shuttle routes for the driver.

| Field | Value |
|-------|-------|
| Called from | `lib/shuttleContext.tsx` line 383 |
| React Query key | `['shuttle-lines']` |
| Polling | Every 60 s (`refetchInterval: 60000`) |
| Query params | None |
| Request body | None |

**Expected response shapes** (`extractRoutes()` — `shuttleContext.tsx` lines 184–189):
```
[]                          ← direct array  ✓
{ data:   [...] }           ← data envelope ✓
{ routes: [...] }           ← routes key    ✓
{ lines:  [...] }           ← lines key     ✓
```
Any other shape (e.g. `{ items: [...] }`, `{ payload: [...] }`) → returns `[]` silently.

**Fields READ per route object** (`mapRoute()` — `shuttleContext.tsx` lines 242–267):

| Backend field | App uses as | Fallback |
|---------------|-------------|---------|
| `id` | `route.id` | — |
| `name` | `route.name` | — |
| `fromLocation` or `from` | `route.from` | `'—'` |
| `toLocation` or `to` | `route.to` | `'—'` |
| `stationCount` | `route.stationCount` | `0` |
| `estimatedDuration` | `route.estimatedDuration` | `0` |
| `basePrice` | `route.basePrice` | `0` |
| `timeSlots` or `timeslots` | `route.timeslots[]` | `[]` |
| — `id` | `ts.id` | — |
| — `departureTime` | `ts.departureTime` | — |
| — `availableSeats` | `ts.availableSeats` | `null` |
| — `totalSeats` | `ts.totalSeats` | `null` |
| — `isBooked` or `booked` | `ts.isBooked` | `false` |
| — `isTaken` | `ts.isTaken` | `false` |

**`isActive` field:** Declared in `BackendRoute` type (`shuttleContext.tsx` line 101) but **NEVER used in filtering**. Inactive routes are shown alongside active ones.

---

### Endpoint 2 — `GET /shuttle/lines/:id`

**Purpose:** Fetch stations list for the booking bottom sheet.

| Field | Value |
|-------|-------|
| Called from | `lines.tsx` line 188 |
| React Query key | `['shuttle-line-detail', bookingRoute?.id]` |
| Triggered when | A route card is tapped (`bookingRoute` is set) |
| Stale time | 5 minutes |

**Fields READ** (`parseStations()` — `lines.tsx` lines 63–67):
- `data.stations[]` → `{ id, name, order, latitude?, longitude? }`
- fallback: `stations[]` at root

---

### Endpoint 3 — `GET /shuttle/lines/:id/available-weeks`

**Purpose:** Fetch bookable weeks + time slots for the selected route.

| Field | Value |
|-------|-------|
| Called from | `lines.tsx` line 162 |
| React Query key | `['shuttle-available-weeks', bookingRoute?.id]` |
| Triggered when | Route card tapped |
| Stale time | 30 s |

**Expected response:**
```typescript
{
  routeId: number;
  routeName: string;
  weeks: Array<{
    weekStart: string;   // "YYYY-MM-DD"  (always Sunday)
    weekEnd: string;     // "YYYY-MM-DD"  (always Thursday)
    slots: Array<{
      id: number;
      departureTime: string;   // "HH:MM"
      totalSeats: number | null;
      availableSeats: number | null;
      isBooked: boolean;       // this driver has this slot this week
      isTaken: boolean;        // another driver has this slot
      takenByDriverName?: string | null;
    }>;
  }>;
  total: number;
}
```

---

### Endpoint 4 — `GET /shuttle/route-bookings`

**Purpose:** Driver's existing bookings (used for badge coloring on route cards).

| Field | Value |
|-------|-------|
| Called from | `lib/shuttleContext.tsx` line 397 |
| React Query key | `['shuttle-my-bookings']` |
| Polling | Every 60 s |
| Socket-invalidated by | `SHUTTLE_BOOKING_CREATED`, `SHUTTLE_RENEWAL_CONFIRMED`, `SHUTTLE_BOOKING_CANCELLED` |

---

### Endpoint 5 — `POST /shuttle/lines/:id/book-week`

**Purpose:** Commit driver to a 5-day work week slot.

**Request body:**
```json
{
  "slotId": 3,
  "startSundayDate": "2026-06-21",
  "endThursdayDate": "2026-06-25",
  "daysArray": ["sunday","monday","tuesday","wednesday","thursday"]
}
```

**Error handling:**
- `409` → "Slot Taken" alert
- `400` → message from `body.message` or `body.error`
- other → generic "Booking Failed"

---

## Navigation

**Tapping a route card** (`lines.tsx` lines 380–383):
```typescript
onPress={() => {
  setSelectedWeek(null);
  setSelectedSlot(null);
  setBookingRoute(route);   // opens Modal bottom sheet — no router.push
}}
```
No screen navigation happens. The booking UI is a `<Modal>` overlay inside the same screen.

**Deep-link** (`lines.tsx` lines 122–126): `openRouteId` search param (from `useLocalSearchParams`) auto-opens the bottom sheet for a specific route — triggered from the slot-released socket-event toast in `app/(shuttle)/_layout.tsx` line 74.

---

## Empty State Logic

### Loading state

**Condition:** `contextLoading === true` (`routesLoading || bookingsLoading`)

**What shows:** `<ActivityIndicator>` centered (`lines.tsx` lines 341–345)

---

### Error state

**Condition:** `!!contextError && !contextLoading`

**What shows:** "Failed to load routes. Pull down to retry." (`lines.tsx` lines 347–353)

---

### Empty routes state — **"No routes found"**

**Exact condition** (`lines.tsx` line 355):
```typescript
!contextLoading && !contextError && filteredRoutes.length === 0
```

**What shows:**
```
🔍
No routes found
Try a different search term
```

**`filteredRoutes`** is derived from `routes` array via client-side search filter:
```typescript
const filteredRoutes = search.trim()
  ? routes.filter(r =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.from ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.to ?? '').toLowerCase().includes(search.toLowerCase())
    )
  : routes;
```

If `search` is empty and `routes` is empty → `filteredRoutes.length === 0` → empty state.

---

## Suspected Root Cause

### Most likely: Backend database has no routes

**Evidence:** The screen shows "No routes found" (not "Failed to load routes" and not a spinner), meaning:
- The API **responded with 200 OK** ✓
- No network/auth error ✓
- The response parsed correctly ✓
- But the array came back **empty**

**What to check on the backend:**

1. **Is `shuttle_lines` / `routes` table empty?**
   Run on Replit DB: `SELECT COUNT(*) FROM shuttle_lines` (or equivalent)

2. **Does the endpoint filter by driver / fleet / region?**
   If `GET /shuttle/lines` filters by the logged-in driver's assigned fleet or city, and the driver's profile has no assignment, the response is `[]` even if routes exist.

3. **Does the endpoint require `isActive = true`?**
   Routes might exist but all have `isActive = false` — filtered server-side before the response.

---

### Secondary: Response envelope mismatch

If the backend returns a shape like `{ items: [...] }` or `{ payload: [...] }`, `extractRoutes()` at `shuttleContext.tsx` line 184–189 silently returns `[]` — the app shows empty with no error.

**How to confirm:** Add a temporary log in `shuttleContext.tsx` query function:
```typescript
queryFn: async () => {
  const raw = await endpoints.shuttle.lines() as unknown;
  console.log('[shuttle/lines] raw response:', JSON.stringify(raw));
  return raw;
},
```

---

### Summary

| Check | Where to look | Expected fix |
|-------|---------------|--------------|
| DB empty | Backend Replit DB | Seed/create routes |
| Driver not assigned to fleet | Backend auth middleware | Assign driver to fleet |
| `isActive` filter | Backend query | Enable routes or seed with `isActive: true` |
| Wrong envelope key | Console log `routesRaw` | Update `extractRoutes()` to handle new key |
| Wrong `EXPO_PUBLIC_API_URL` | `.env` file | Point to correct Replit URL |
