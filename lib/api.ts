import { getToken, getRefreshToken, saveToken, deleteToken, deleteRefreshToken } from './auth';

// ── Language / Accept-Language ─────────────────────────────────────────────────
// Updated by lib/i18nContext whenever the driver switches language.
// Every outgoing request reads this and injects the header so the backend can
// return localized strings (route names, station titles, trip details, etc.)
// without the client needing to perform any post-processing.
//
// TODO: Backend Integration — Accept-Language contract
//   All entity responses that contain user-visible text should honour the
//   Accept-Language request header and return the matching locale.
//
//   LOCALIZED FIELD CONVENTIONS (choose one pattern and apply it consistently):
//
//   Option A — Header-driven single field (preferred):
//     The server returns the already-resolved string in the primary field name.
//     e.g. GET /shuttle/lines  →  { name: "خط القاهرة" }  (when lang = 'ar')
//
//   Option B — Dual-field envelope (fallback-safe):
//     The server always returns both locales; the client picks the right one.
//     e.g. { name_en: "Cairo Line", name_ar: "خط القاهرة" }
//     Client rendering pattern:  station.name_ar ?? station.name_en ?? station.name
//
//   Affected endpoints:
//     GET  /shuttle/lines          → line.name, line.description
//     GET  /shuttle/lines/:id      → same + stations[].name
//     GET  /shuttle/timeslots/:id  → timeslot.label
//     GET  /driver/trips           → trip.routeName, trip.origin, trip.destination
//     GET  /driver/trips/:id       → same + stations[].name, stations[].address
//     GET  /services/control       → service.message, service.eta
let _acceptLanguage = 'en';

/**
 * Called by lib/i18nContext whenever the driver selects a different language.
 * Updates the module-level header value reactively so all subsequent API
 * requests carry the correct Accept-Language without requiring a provider re-mount.
 */
export function setApiLanguage(lang: string): void {
  _acceptLanguage = lang;
}

const _rawApiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!_rawApiUrl) {
  throw new Error(
    '[VeeGo Driver] EXPO_PUBLIC_API_URL is not set. ' +
    'Create a .env file in artifacts/veego-driver/ with:\n' +
    '  EXPO_PUBLIC_API_URL=https://<your-replit-domain>/api'
  );
}
const API_BASE_URL: string = _rawApiUrl.startsWith('http') ? _rawApiUrl : `https://${_rawApiUrl}`;

const REQUEST_TIMEOUT_MS = 15000;

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Typed envelope for POST /shuttle/lines/:id/complete
// Backend has historically returned fields at root level AND nested under data —
// both paths are guarded at the call site. Keep the double-fallback in trip-active.tsx.
export interface ShuttleCompleteResponse {
  earnedAmount?: number;
  walletBalance?: number;
  data?: {
    earnedAmount?: number;
    walletBalance?: number;
  };
}

// Enriched driver profile returned by GET /driver/profile
export interface DriverProfileEnriched {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string | null;
  rating: number;
  trips: number;
  referralCode: string;
  vehicle: { make: string; model: string; plate: string } | null;
  documentStatus: 'accepted' | 'pending' | 'rejected' | null;
  bonusTargets: Array<{
    id: string;
    title: string;
    targetTrips: number;
    currentTrips: number;
    bonusAmount: number;
    completed: boolean;
  }>;
}

// Fix 8: callback invoked when server returns 403 account_suspended
type SuspendedCallback = () => void;
let _onAccountSuspended: SuspendedCallback | null = null;
export function setOnAccountSuspended(cb: SuspendedCallback) {
  _onAccountSuspended = cb;
}

// Single-flight refresh — only one refresh request may exist at a time.
let _refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) {
    return _refreshPromise;
  }

  _refreshPromise = (async (): Promise<string | null> => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return null;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      if (data.accessToken) {
        await saveToken(data.accessToken);
        return data.accessToken;
      }
      return null;
    } catch {
      return null;
    }
  })();

  _refreshPromise.finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Reactive locale header — updated by setApiLanguage() whenever the driver
    // switches language. The backend uses this to return localized entity strings
    // (route names, station titles, trip details). See the Accept-Language TODO
    // block at the top of this file for the full backend integration contract.
    'Accept-Language': _acceptLanguage,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(0, isAbort ? 'Request timed out' : 'Network error', null);
  }
  clearTimeout(timeout);

  // 401 → try silent refresh once
  if (response.status === 401 && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(method, path, body, true);
    }
    await deleteToken();
    await deleteRefreshToken();
    throw new ApiError(401, 'Unauthorized', null);
  }

  if (response.status === 401 && isRetry) {
    await deleteToken();
    await deleteRefreshToken();
    throw new ApiError(401, 'Unauthorized', null);
  }

  // Fix 8: intercept 403 account_suspended
  if (response.status === 403) {
    let errorBody: unknown = null;
    try { errorBody = await response.json(); } catch { /* empty */ }
    const reason = (errorBody as { reason?: string } | null)?.reason;
    if (reason === 'account_suspended') {
      _onAccountSuspended?.();
    }
    throw new ApiError(403, 'Forbidden', errorBody);
  }

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(response.status, response.statusText, errorBody);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export { ApiError };

// ─── Financial Analytics types ────────────────────────────────────────────────
// Used by app/shuttle/earnings.tsx to render the financial dashboard.

export interface FinancialTransaction {
  id: string;
  date: string;         // ISO8601 timestamp of the completed trip
  cashReceived: number; // physical cash the driver collected from passengers (EGP)
  appCommission: number;// platform split-fee deducted from that run (EGP)
  routeName?: string;   // optional human-readable route label
}

export interface FinancialAnalytics {
  totalCash: number;      // sum of cashReceived across all transactions in the range
  appCommission: number;  // sum of appCommission across all transactions in the range
  netProfit: number;      // totalCash - appCommission (server-computed for accuracy)
  transactions: FinancialTransaction[];
}

export const endpoints = {
  auth: {
    logout: () => request<void>('POST', '/driver/auth/logout'),
    driverLogin: (credential: string, password: string) =>
      request<{ accessToken: string; refreshToken: string; user: Record<string, unknown>; driver: Record<string, unknown> }>(
        'POST', '/driver/auth/login', { credential, password }
      ),
    driverRegister: (data: { name: string; email: string; phone: string; password: string; licenseNumber?: string; nationalId?: string }) =>
      request<{ accessToken: string; refreshToken: string; user: Record<string, unknown>; driver: Record<string, unknown> }>(
        'POST', '/driver/auth/register', data
      ),
    forgotPassword: (credential: string) =>
      request<{ message: string }>(
        'POST', '/driver/auth/forgot-password', { credential }
      ),
    resetPassword: (credential: string, code: string, newPassword: string) =>
      request<{ message: string }>(
        'POST', '/driver/auth/reset-password', { credential, code, newPassword }
      ),
  },

  driver: {
    me: () => api.get('/driver/me'),

    // TODO: Backend Integration — GET /driver/profile
    // Returns an enriched driver profile combining identity, vehicle, documents, referral code,
    // and bonus milestone progress in a single response.
    //
    // EXPECTED RESPONSE:
    //   {
    //     id:           string,
    //     name:         string,
    //     phone:        string,
    //     email:        string,
    //     avatar:       string | null,
    //     rating:       number,
    //     trips:        number,
    //     referralCode: string,           — unique peer-to-peer trip-referral code (e.g. "VGO-A1B2")
    //     vehicle: {
    //       make:   string,
    //       model:  string,
    //       plate:  string,
    //     } | null,
    //     documentStatus: 'accepted' | 'pending' | 'rejected' | null,
    //     bonusTargets: Array<{
    //       id:          string,
    //       title:       string,
    //       targetTrips: number,
    //       currentTrips:number,
    //       bonusAmount: number,
    //       completed:   boolean,
    //     }>,
    //   }
    //
    // FALLBACK: If this endpoint is unavailable the profile screen falls back to GET /driver/me
    // and degrades gracefully — bonus and doc-status blocks show skeleton placeholders.
    profile: () => api.get<DriverProfileEnriched>('/driver/profile'),

    // TODO: Backend Integration — POST /driver/profile/avatar-request
    // Sends a multipart form-data payload to request a profile photo change.
    // An Admin must manually approve the new photo before it goes live.
    //
    // MULTIPART FIELDS:
    //   newAvatarImage  — image file (JPEG/PNG, max 5 MB)
    //   changeReason    — string (required, min 10 chars)
    //
    // SUCCESS RESPONSE (201):
    //   { requestId: string, status: 'pending', message: string }
    //
    // ERROR RESPONSES:
    //   400 — missing fields or invalid file type
    //   409 — a pending request already exists for this driver
    //   413 — file exceeds the 5 MB limit
    requestAvatarChange: async (formData: FormData) => {
      const token = await getToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${API_BASE_URL}/driver/profile/avatar-request`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
          signal: controller.signal,
        });
        if (!response.ok) {
          let errorBody: unknown = null;
          try { errorBody = await response.json(); } catch { /* empty */ }
          throw new ApiError(response.status, response.statusText, errorBody);
        }
        return response.json();
      } finally {
        clearTimeout(timeout);
      }
    },

    updateMe: (data: unknown) => api.patch('/driver/me', data),
    goOnline: () => api.patch('/driver/status/online'),
    goOffline: () => api.patch('/driver/status/offline'),
    updateLocation: (data: { latitude: number; longitude: number; speed?: number; heading?: number; tripId?: string | number }) =>
      api.patch('/driver/location', {
        ...data,
        tripId: data.tripId != null ? Number(data.tripId) : undefined,
      }),
    status: () => api.get('/driver/me/status'),
    vehicle: () => api.get('/driver/me/vehicle'),
    documents: () => api.get('/driver/me/documents'),
    uploadDocument: async (formData: FormData) => {
      const token = await getToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(`${API_BASE_URL}/driver/me/documents`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
    // Fix 2: shuttle check-in — POST /driver/checkin with selfie + optional tripId
    checkin: async (formData: FormData) => {
      const token = await getToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(`${API_BASE_URL}/driver/checkin`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
    ratings: () => api.get('/driver/me/ratings'),
  },

  pushTokens: {
    register: (platform: 'ios' | 'android' | 'web', token: string) =>
      api.post('/users/me/push-token', { token, platform }),
  },

  rides: {
    available: () => api.get('/driver/rides/available'),
    getById: (rideId: string) => api.get(`/rides/${rideId}`),
    accept: (rideId: string) => api.patch(`/driver/rides/${rideId}/accept`),
    arrived: (rideId: string) => api.patch(`/driver/rides/${rideId}/arrived`),
    decline: (rideId: string) => api.patch(`/driver/rides/${rideId}/decline`),
    start: (rideId: string) => api.patch(`/driver/rides/${rideId}/start`),
    complete: (rideId: string) => api.patch(`/driver/rides/${rideId}/complete`),
    active: () => api.get('/driver/rides/active'),
    rateRider: (rideId: string, rating: number) =>
      api.post(`/driver/rides/${rideId}/rate-rider`, { rating }),
  },

  trips: {
    list: (status?: string, page?: number, limit = 20) => {
      const params: string[] = [];
      if (status) params.push(`status=${encodeURIComponent(status)}`);
      if (page) params.push(`page=${page}`);
      params.push(`limit=${limit}`);
      return api.get(`/driver/trips?${params.join('&')}`);
    },
    detail: (tripId: string) => api.get(`/driver/trips/${tripId}`),
    /* defined — not yet connected to UI */
    accept: (tripId: string) => api.patch(`/driver/trips/${tripId}/accept`),
    /* defined — not yet connected to UI */
    reject: (tripId: string) => api.patch(`/driver/trips/${tripId}/reject`),
    start: (tripId: string) => api.patch(`/driver/trips/${tripId}/start`),
    complete: (tripId: string) => api.patch(`/driver/trips/${tripId}/complete`),
    /* defined — not yet connected to UI */
    cancel: (tripId: string, reason: string) =>
      api.patch(`/driver/trips/${tripId}/cancel`, { reason }),
    stations: (tripId: string) => api.get(`/driver/trips/${tripId}/stations`),
    stationArrived: (tripId: string, stationId: string) =>
      api.patch(`/driver/trips/${tripId}/stations/${stationId}/arrived`),
    stationCompleted: (tripId: string, stationId: string) =>
      api.patch(`/driver/trips/${tripId}/stations/${stationId}/completed`),
  },

  earnings: {
    summary: () => api.get('/earnings/summary'),
    weekly: (weeks = 4) => api.get(`/earnings/weekly?weeks=${weeks}`),
  },

  wallet: {
    balance: () => api.get('/driver/wallet/balance'),
    transactions: () => api.get('/driver/earnings/history'),
    payout: (amount: number) => api.post('/driver/wallet/payout', { amount }),
    payoutMethods: () => api.get('/driver/wallet/payout-methods'),
    /* defined — not yet connected to UI */
    addPayoutMethod: (data: unknown) => api.post('/driver/wallet/payout-methods', data),
    /* defined — not yet connected to UI */
    removePayoutMethod: (id: string) => api.del(`/driver/wallet/payout-methods/${id}`),
  },

  shuttle: {
    // ── Routes ──────────────────────────────────────────────────────────────
    //
    // TODO: Backend Integration — Localized route & station names
    //
    // All shuttle line and station responses contain user-visible text that must
    // be localized. The global request() function already injects the
    // Accept-Language header on every call (see top of file). The backend should:
    //
    //   1. Read the Accept-Language header ('ar' | 'en') on each request.
    //   2. Return the resolved locale string in the primary field (Option A), OR
    //      return both locales and let the client pick (Option B — shown below).
    //
    // SHUTTLE LINE RESPONSE SHAPE (Option B — dual-field, fallback-safe):
    //   {
    //     id:           string | number,
    //     name:         string,          ← resolved by header (Option A)
    //     name_en?:     string,          ← English fallback  (Option B)
    //     name_ar?:     string,          ← Arabic  fallback  (Option B)
    //     description?: string,
    //     description_en?: string,
    //     description_ar?: string,
    //     origin:       string,
    //     destination:  string,
    //     stations: Array<{
    //       id:       string | number,
    //       name:     string,            ← resolved by header (Option A)
    //       name_en?: string,            ← fallback (Option B)
    //       name_ar?: string,            ← fallback (Option B)
    //       address?: string,
    //       order:    number,
    //     }>,
    //   }
    //
    // CLIENT RENDERING PATTERN (Option B dual-field):
    //   const lineName    = line.name_ar    ?? line.name_en    ?? line.name    ?? '';
    //   const stationName = station.name_ar ?? station.name_en ?? station.name ?? '';
    //   (swap name_ar / name_en based on active locale from useI18n())
    lines: () => api.get('/shuttle/lines'),
    line: (lineId: string) => api.get(`/shuttle/lines/${lineId}`),

    availableWeeks: (routeId: string | number) =>
      api.get(`/shuttle/lines/${routeId}/available-weeks`),

    // Fix 5: correct available-slots endpoint — only returns slots with full-week coverage
    availableSlots: (routeId: string | number, weekStart: string) =>
      api.get(`/shuttle/available-slots?routeId=${routeId}&weekStart=${weekStart}`),

    timeslots: (routeId: string | number, weekStart?: string) =>
      api.get(`/shuttle/timeslots/${routeId}${weekStart ? `?weekStart=${weekStart}` : ''}`),

    // ── Route Bookings ───────────────────────────────────────────────────────
    myBookings: () => api.get('/shuttle/route-bookings'),
    bookingDetail: (id: string) => api.get(`/shuttle/route-bookings/${id}`),
    createBooking: (data: { routeId: string | number; timeSlotId: string | number; weekStart: string }) =>
      api.post('/shuttle/route-bookings', data),

    // ── bookWeek ────────────────────────────────────────────────────────────
    // TODO: Backend Integration — implement POST /shuttle/lines/:id/book-week
    //
    // PURPOSE:
    //   Atomically reserves a timeslot across all 5 working days (Sun–Thu) of a
    //   given work week for a single driver. Even though the passenger-facing
    //   backend stores individual DailySchedule rows (so passengers can book 1–5
    //   days), the driver booking must cover the entire block simultaneously to
    //   prevent partial-week conflicts and race conditions.
    //
    // ROUTE:   POST /shuttle/lines/:routeId/book-week
    //
    // PAYLOAD:
    //   {
    //     slotId:          number   — ID of the BackendSlot (timeslot template)
    //     startSundayDate: string   — "YYYY-MM-DD", always a Sunday (from server)
    //     endThursdayDate: string   — "YYYY-MM-DD", always a Thursday (from server)
    //     daysArray:       string[] — always ["sunday","monday","tuesday","wednesday","thursday"]
    //                                 Explicit array so the backend can map the
    //                                 driver's ID across every DailySchedule row
    //                                 in one transaction.
    //   }
    //
    // SUCCESS RESPONSE (200 / 201):
    //   {
    //     bookingId:   string   — newly created ShuttleRouteBooking ID
    //     weekStart:   string   — "YYYY-MM-DD" (echoed back)
    //     weekEnd:     string   — "YYYY-MM-DD" (echoed back)
    //     departure:   string   — "HH:MM"
    //     renewalDeadline: string — ISO8601 — next Wednesday 17:00 Cairo time;
    //                               the deadline by which the driver must confirm
    //                               or reject renewal before the slot is released.
    //   }
    //
    // ERROR RESPONSES:
    //   409 Conflict  — slotId is already taken for this week block (race condition).
    //                   Frontend shows "Slot Taken" alert and re-fetches available weeks.
    //   400 Bad Request — invalid slotId, wrong week dates, or route not found.
    //   403 Forbidden   — driver is suspended or has exceeded active-booking limits.
    //
    // BACKEND IMPLEMENTATION NOTES:
    //   1. Wrap all DailySchedule upserts in a single DB transaction.
    //   2. Use a SELECT FOR UPDATE lock on the slot row to prevent race conditions.
    //   3. After committing, emit the socket event `slot_taken` to ALL connected
    //      drivers so their open booking sheets update in real-time:
    //        socket.to('drivers').emit('slot_taken', { routeId, slotId, weekStart, takenByDriverName })
    //   4. Schedule the Wednesday 7:00 AM Cairo renewal cron (see below).
    //
    // ── WEDNESDAY RETENTION CRON (7:00 AM EET / Cairo = UTC+2) ─────────────
    // TODO: Backend Integration — implement the weekly renewal cron job
    //
    //   TRIGGER:  Every Wednesday at 05:00 UTC (= 07:00 Cairo / EET, UTC+2)
    //   TARGET:   All drivers with an active ShuttleRouteBooking whose weekEnd
    //             falls in the upcoming week (i.e., the booking is for next week).
    //
    //   ACTION:
    //     For each qualifying booking:
    //     1. Set booking.renewalStatus = 'pending' on the DB record.
    //     2. Set booking.renewalDeadline = that Wednesday at 17:00 Cairo time.
    //     3. Send a high-priority Expo push notification to the driver's device:
    //          title:  "تجديد حجز الخط"
    //          body:   "هل تحب تجديد حجز هذا الخط للاسبوع القادم؟"
    //          data: {
    //            type:      "renewal_prompt",
    //            bookingId: string,
    //            routeId:   number,
    //            routeName: string,
    //            slotId:    number,
    //            weekStart: string,   — start of the NEW upcoming week
    //            deadline:  string,   — ISO8601 of Wednesday 17:00 Cairo
    //          }
    //     The driver app handles this in usePushNotifications.ts and navigates
    //     to the bookings tab where the renewal banner is shown.
    //
    // ── 10-HOUR GRACE PERIOD (Deadline: Wednesday 17:00 Cairo) ──────────────
    // TODO: Backend Integration — implement grace period enforcement
    //
    //   CONFIRM path (driver taps "Confirm Renewal"):
    //     POST /shuttle/route-bookings/:id/confirm-renewal (already exists)
    //     Backend atomically books the same slot for the NEXT week block,
    //     sets renewalStatus = 'confirmed', and cancels the expiry job.
    //
    //   DECLINE / TIMEOUT path:
    //     - If driver POSTs to /shuttle/route-bookings/:id/decline-renewal, OR
    //     - If the cron fires at Wednesday 17:00 UTC+2 and renewalStatus is
    //       still 'pending':
    //       1. Set renewalStatus = 'declined' / 'expired'.
    //       2. Release the slot (isTaken = false for next week block).
    //       3. Broadcast to ALL drivers via Expo push:
    //            title: "خط متاح الآن"
    //            body:  "خط [routeName] متاح للحجز الآن!"
    //            data: {
    //              type:    "slot_released",
    //              routeId: number,
    //              routeName: string,
    //              slotId:  number,
    //              weekStart: string,  — newly available week block
    //            }
    //          The driver app deep-links into the route's booking sheet on tap
    //          (handled in usePushNotifications.ts → router.push lines screen
    //           and opens the booking sheet for that routeId).
    //       4. Emit socket event `slot_released` to all connected drivers:
    //            socket.to('drivers').emit('slot_released', { routeId, slotId, weekStart })
    //
    // ── SOCKET EVENTS SUMMARY (driver app must listen for these) ────────────
    //   slot_taken    → another driver booked a slot; refresh available-weeks cache
    //   slot_released → a slot opened up; show in-app toast + refresh cache
    //   renewal_prompt → Wednesday morning reminder (also sent as push notification)
    // ─────────────────────────────────────────────────────────────────────────
    bookWeek: (
      routeId: string | number,
      data: {
        slotId: string | number;
        startSundayDate: string;
        endThursdayDate: string;
        daysArray: string[];
      }
    ) => api.post(`/shuttle/lines/${routeId}/book-week`, data),

    cancelBooking: (id: string) => api.del(`/shuttle/route-bookings/${id}`),
    confirmRenewal: (id: string) => api.post(`/shuttle/route-bookings/${id}/confirm-renewal`),

    // TODO: Backend Integration - POST /shuttle/route-bookings/:id/decline-renewal
    // Driver proactively opts out of renewal before the Wednesday 17:00 Cairo deadline.
    // Backend should:
    //   1. Set renewalStatus = 'declined' on the booking record.
    //   2. Release the slot for the upcoming week (isTaken = false for next week block).
    //   3. Broadcast `slot_released` to all connected drivers via socket.
    //   4. Send a push notification to all waiting drivers: "خط [routeName] متاح للحجز الآن!"
    // Returns: { success: true }
    declineRenewal: (id: string) => api.post(`/shuttle/route-bookings/${id}/decline-renewal`),

    // TODO: Backend Integration - GET /shuttle/route-bookings/:id/detail
    // Returns live booking state including current passenger count and threshold status.
    // Expected response shape:
    //   {
    //     id:                    string,
    //     bookedSeats:           number,   — current confirmed passenger count for this week block
    //     totalSeats:            number,   — bus capacity (14 = HiAce, 28 = Mini Bus)
    //     minRequiredPassengers: number,   — minimum threshold for trip activation (set per route)
    //     thresholdMet:          boolean,  — true once bookedSeats >= minRequiredPassengers
    //   }
    // Used by BookingDetailSheet for live passenger counter + threshold badge.
    // Socket channel: listen for `booking:passenger_updated` event (scoped to booking room)
    //   payload: { bookingId: string, bookedSeats: number, thresholdMet: boolean }
    bookingDetail: (id: string) =>
      api.get(`/shuttle/route-bookings/${id}/detail`),

    // ── Active Trip Management ───────────────────────────────────────────────
    // TODO: Backend Integration - POST /shuttle/route-bookings/:id/start
    // Marks the weekly booking as active, creates the trip instance on the backend.
    // Returns: { tripId: string, earnedAmount?: number, walletBalance?: number }
    start: (bookingId: string) =>
      api.post(`/shuttle/route-bookings/${bookingId}/start`),

    // TODO: Backend Integration - POST /shuttle/lines/:id/complete
    // Marks the active trip as completed.
    // Returns: { earnedAmount: number, walletBalance: number }
    complete: (lineId: string) => api.post(`/shuttle/lines/${lineId}/complete`),
    passengers: (tripId: string) => api.get(`/shuttle/trips/${tripId}/passengers`),
    // Fix 4: include stationId to trigger the 60-second timer on the backend
    boardBooking: (bookingId: string, stationId?: string | number) =>
      api.post(`/shuttle/bookings/${bookingId}/board`, stationId != null ? { stationId } : {}),

    driverTrips: (page = 1, limit = 10) =>
      api.get(`/shuttle/driver/my-trips?page=${page}&limit=${limit}`),

    // TODO: Backend Integration - GET /shuttle/driver/my-trips — fetches paginated list of past completed trips
    // Expected response: { trips: Array<{ id, routeName, completedAt, earnedAmount }> }
    // or: { data: { trips: [...] } }
    history: (page = 1, limit = 20) =>
      api.get(`/shuttle/driver/my-trips?page=${page}&limit=${limit}`),

    // Fix 7: rate a passenger after a trip
    ratePassenger: (tripId: string, rateeId: string, stars: number) =>
      api.post('/shuttle/ratings', { tripId, rateeId, stars }),

    noShowBooking: (bookingId: string) =>
      api.patch(`/driver/bookings/${bookingId}/no-show`),

    // TODO: Backend Integration - POST /shuttle/route-bookings/:id/refer
    // Body: { driverCode: string } — submits a trip referral to another driver by their unique code
    referTrip: (bookingId: string, driverCode: string) =>
      api.post(`/shuttle/route-bookings/${bookingId}/refer`, { driverCode }),

    // TODO: Backend Integration - POST /shuttle/referrals/:id/accept
    // Second driver accepts the incoming referral; backend shifts trip ownership and notifies Driver 1
    acceptReferral: (referralId: string) =>
      api.post(`/shuttle/referrals/${referralId}/accept`),

    // TODO: Backend Integration - POST /shuttle/referrals/:id/decline
    // Second driver declines; backend notifies Driver 1 of the rejection
    declineReferral: (referralId: string) =>
      api.post(`/shuttle/referrals/${referralId}/decline`),

    // TODO: Backend Integration - POST /shuttle/route-bookings/:id/final-cancel
    // Body: { reason: string } — triggers passenger push notifications + Admin Dashboard alert for manual re-assignment
    // NOTE: Penalty rules are calculated and applied automatically from the backend
    cancelBookingFinal: (bookingId: string, reason: string) =>
      api.post(`/shuttle/route-bookings/${bookingId}/final-cancel`, { reason }),

    // TODO: Backend Integration - GET /driver/me/referral-code — fetches this driver's unique referral code
    myReferralCode: () => api.get<{ code: string }>('/driver/me/referral-code'),
  },

  notifications: {
    list: () => api.get('/notifications'),
    markRead: (id: string) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.patch('/notifications/read-all'),
  },

  serviceControl: {
    fetch: () => api.get('/services/control'),
  },

  support: {
    submitTicket: (data: unknown) => api.post('/support/tickets', data),
  },

  // TODO: Backend Integration — Registration setup endpoints (initial account flow)
  registration: {
    // POST /driver/register/service-type
    // Persists the driver's chosen service type on the backend so the server is aware
    // of it independently of the local AsyncStorage cache.
    //
    // PAYLOAD:  { serviceType: 'car' | 'scooter' | 'delivery' | 'shuttle' }
    // SUCCESS RESPONSE (200 | 201):  { serviceType: string }
    // ERROR RESPONSES:
    //   400 — invalid serviceType value
    //   401 — token expired
    setServiceType: (serviceType: string) =>
      api.post<{ serviceType: string }>('/driver/register/service-type', { serviceType }),

    // POST /driver/register/vehicle-details
    // Stores brand, model, year, and color chosen in the vehicle-specs setup step.
    // The backend should upsert the vehicle record associated with this driver.
    //
    // PAYLOAD:  { brandId: string, modelId: string, year: string, color: string }
    // SUCCESS RESPONSE (200 | 201):
    //   { vehicleId: string, brandId: string, modelId: string, year: string, color: string }
    // ERROR RESPONSES:
    //   400 — missing or invalid fields
    //   401 — token expired
    //   404 — brandId or modelId not found in /vehicles/meta
    setVehicleDetails: (data: {
      brandId: string;
      modelId: string;
      year: string;
      color: string;
    }) => api.post<{ vehicleId: string }>('/driver/register/vehicle-details', data),
  },

  // TODO: Backend Integration — Vehicle metadata endpoints
  vehicles: {
    // GET /vehicles/brands
    // Returns the full list of supported vehicle manufacturers.
    // SUCCESS RESPONSE: Array<{ id: string; name: string }>
    brands: () => api.get<{ id: string; name: string }[]>('/vehicles/brands'),

    // GET /vehicles/brands/:brandId/models
    // Returns models available for the given brand.
    // Filtered on the server by brandId so large model lists are only fetched on demand.
    // SUCCESS RESPONSE: Array<{ id: string; name: string; brandId: string }>
    models: (brandId: string) => api.get<{ id: string; name: string }[]>(`/vehicles/brands/${brandId}/models`),

    // GET /vehicles/meta  (alternative: fetch brands + models in a single request)
    // Returns { brands: Brand[], models: Model[] } to populate both dropdowns in one call.
    meta: () => api.get<{ brands: { id: string; name: string }[]; models: { id: string; name: string; brandId: string }[] }>('/vehicles/meta'),

    // GET /vehicles/colors
    // Returns the list of supported vehicle colors (id + label + optional hex code).
    // SUCCESS RESPONSE: Array<{ id: string; label: string; hex?: string }>
    colors: () => api.get<{ id: string; label: string; hex?: string }[]>('/vehicles/colors'),
  },

  settings: {
    get: () => api.get('/driver/me/settings'),
    update: (data: unknown) => api.patch('/driver/me/settings', data),
  },

  bonusTargets: {
    // TODO: Backend Integration — GET /driver/bonus-targets
    //
    // Returns the full list of bonus milestone records for the authenticated driver.
    //
    // EXPECTED RESPONSE — array at root OR nested under `data` / `bonusTargets`:
    //   Array<{
    //     id:           string,
    //     title:        string,             — human-readable milestone name
    //     description?: string,             — optional supporting detail
    //     targetType:   string,             — e.g. "trips", "distance", "earnings"
    //     targetValue:  number,             — threshold required to earn the bonus
    //     progress:     number,             — driver's current progress toward targetValue
    //     bonusAmount:  number,             — payout in EGP when milestone is reached
    //     completed:    boolean,            — true once progress >= targetValue
    //     completedAt?: string,             — ISO8601 date the milestone was completed
    //     startsAt?:    string,             — ISO8601 activation date
    //     endsAt?:      string,             — ISO8601 expiry date (null = no expiry)
    //     vehicleType?: string,             — optional vehicle-type filter
    //     isActive:     boolean,            — false if expired or suspended
    //     paidOut?:     boolean,            — true once the bonus has been disbursed
    //   }>
    //
    // SUMMARY DERIVATION (no separate endpoint required):
    //   earned  = sum of bonusAmount where completed === true  && (paidOut === true || paidOut is absent)
    //   pending = sum of bonusAmount where completed === false && isActive === true
    //
    // ERROR RESPONSES:
    //   401 — token expired (auto-refreshed by request())
    //   404 — driver has no targets configured yet → return [] gracefully
    //   503 — service unavailable → screen degrades to empty placeholder
    list: () => api.get<BonusTarget[]>('/driver/bonus-targets'),
  },

  // TODO: Backend Integration — Financial Analytics endpoint
  //
  // GET /driver/financial-analytics?range=today|week|month
  //
  // PURPOSE:
  //   Returns the driver's cash-based financial summary for the requested
  //   time window, powering the Earnings screen dashboard.
  //
  // QUERY PARAMS:
  //   range — required — one of: 'today' | 'week' | 'month'
  //
  // EXPECTED RESPONSE (200):
  //   {
  //     totalCash:    number,   — sum of all cashReceived in the range (EGP)
  //     appCommission:number,   — sum of all platform split-fees in the range (EGP)
  //     netProfit:    number,   — totalCash - appCommission (server-computed)
  //     transactions: Array<{
  //       id:           string,
  //       date:         string,  — ISO8601 timestamp of completed trip
  //       cashReceived: number,  — cash the driver collected from passengers (EGP)
  //       appCommission:number,  — platform commission deducted from that run (EGP)
  //       routeName?:   string,  — optional human-readable route label
  //     }>,
  //   }
  //
  // ERROR RESPONSES:
  //   400 — invalid or missing range param
  //   401 — token expired (auto-refreshed by request())
  //   404 — driver has no completed trips yet → return { totalCash:0, appCommission:0, netProfit:0, transactions:[] }
  //   503 — service unavailable → screen degrades to error state with retry button
  //
  // SECURITY NOTE:
  //   Only return data for the authenticated driver (derived from JWT sub claim).
  //   Never accept a driverId in the query string.
  financialAnalytics: {
    summary: (range: 'today' | 'week' | 'month') =>
      api.get<FinancialAnalytics>(`/driver/financial-analytics?range=${range}`),
  },
};

// Exported bonus target shape — used by both the profile summary and the dedicated screen
export interface BonusTarget {
  id: string;
  title: string;
  description?: string;
  targetType: string;
  targetValue: number;
  progress: number;
  bonusAmount: number;
  completed: boolean;
  completedAt?: string;
  startsAt?: string;
  endsAt?: string;
  vehicleType?: string;
  isActive: boolean;
  paidOut?: boolean;
}
