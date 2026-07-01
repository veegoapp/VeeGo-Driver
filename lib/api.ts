// TODO FIX-12: Add certificate pinning with react-native-ssl-pinning.
// Run: npx expo install react-native-ssl-pinning
// Then replace the fetch() calls in request() with the pinned fetch from that library,
// configured with the SHA-256 hash of the production API certificate.
import { getToken, getRefreshToken, saveToken, deleteToken, deleteRefreshToken } from './auth';

// ── Language / Accept-Language ─────────────────────────────────────────────────
// Updated by lib/i18nContext whenever the driver switches language.
// Injected into every outgoing request so the backend returns localized text.
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
export const API_BASE_URL: string = _rawApiUrl.startsWith('http') ? _rawApiUrl : `https://${_rawApiUrl}`;

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
  vehicle: { make: string; model: string; plate: string; year?: number | string | null; color?: string | null; colorAr?: string | null } | null;
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

// Driver-invites-driver referral program (GET /driver/referral-code).
// Distinct from the shuttle "route handoff" driverCode feature (VGO- prefix,
// endpoints.shuttle.referTrip/acceptReferral) — that is an unrelated backend system.
export interface DriverReferralInfo {
  code: string;
  config: {
    enabled: boolean;
    serviceType: 'ride' | 'scooter' | 'delivery' | 'shuttle';
    requiredTrips: number;
    rewardCommissionRate: number;
    rewardTripsCount: number;
  };
  stats: {
    total: number;
    completed: number;
    pending: number;
    discountedTripsRemaining: number;
  };
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
    'Accept-Language': _acceptLanguage,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // ── DEBUG: log vehicle catalog requests ──────────────────────────────────
  const isVehicleDebug = path.includes('/vehicles/');
  if (isVehicleDebug && __DEV__) {
    console.log('[API DEBUG]', method, `${API_BASE_URL}${path}`);
    console.log('[API DEBUG] Authorization:', token ? `Bearer ${token.slice(0, 20)}...` : 'MISSING — no token in storage');
  }
  // ─────────────────────────────────────────────────────────────────────────

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
    if (isVehicleDebug) console.log('[API DEBUG] Network error:', err);
    throw new ApiError(0, isAbort ? 'Request timed out' : 'Network error', null);
  }
  clearTimeout(timeout);

  // ── DEBUG: log response ───────────────────────────────────────────────────
  if (isVehicleDebug && __DEV__) {
    const cloned = response.clone();
    cloned.text().then(t => {
      console.log('[API DEBUG] Status:', response.status, response.statusText);
      console.log('[API DEBUG] Response body:', t.slice(0, 500));
    }).catch(() => {});
  }
  // ─────────────────────────────────────────────────────────────────────────

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

// ─── Trip payment summary types ───────────────────────────────────────────────

export interface TripRevenueSummary {
  tripId: number;
  totalPassengers: number;
  totalExpected: number;
  cashExpected: number;
  cashCollected: number;
  cashShortfall: number;
  cardTotal: number;
  walletTotal: number;
}

export interface TripCashSummary {
  tripId: number;
  driverId: number;
  totalCashExpected: number;
  totalCashCollected: number;
  passengers: Array<{
    bookingId: number;
    name: string;
    fareAmount: number;
    cashCollected: boolean;
    amountCollected: number;
  }>;
}

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
      request<{
        accessToken: string;
        refreshToken: string;
        status: 'pending' | 'approved';
        serviceType: 'car' | 'shuttle' | 'scooter' | 'delivery' | null;
        user: Record<string, unknown>;
        driver: Record<string, unknown>;
      }>('POST', '/driver/auth/login', { credential, password }),
    driverRegister: (data: { name: string; email: string; phone: string; password: string; licenseNumber?: string; nationalId?: string }) =>
      request<{ requiresOtp: true; phone: string; maskedPhone: string }>(
        'POST', '/driver/auth/register', data
      ),
    sendOtp: (phone: string) =>
      request<{ success: boolean; message: string }>(
        'POST', '/auth/send-otp', { phone }
      ),
    verifyOtp: (phone: string, otp: string) =>
      request<{ success: boolean; accessToken: string; refreshToken: string; user: Record<string, unknown>; driver: Record<string, unknown> }>(
        'POST', '/auth/verify-otp', { phone, otp }
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

    profile: () => api.get<DriverProfileEnriched>('/driver/profile'),

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
    goOnline: () => api.patch('/driver/status', { status: 'online' }),
    goOffline: () => api.patch('/driver/status', { status: 'offline' }),
    updateStatus: (status: 'online' | 'offline' | 'busy' | 'suspended') =>
      api.patch('/driver/status', { status }),
    updateLocation: (data: { latitude: number; longitude: number; speed?: number; heading?: number; tripId?: string | number }) =>
      api.patch('/driver/location', {
        ...data,
        tripId: data.tripId != null ? Number(data.tripId) : undefined,
      }),
    status: () => api.get('/driver/me/status'),
    onboarding: () => api.get<{
      onboardingStatus: 'pending' | 'pending_review' | 'approved' | 'rejected';
      rejectionReason: string | null;
      serviceType: string | null;
      requiredDocuments: string[];
      missingDocuments: string[];
      documentProgress: { type: string; uploaded: boolean; verificationStatus: string | null; uploadedAt: string | null }[];
      totalRequired: number;
      totalUploaded: number;
      totalApproved: number;
    }>('/driver/me/onboarding'),
    vehicle: () => api.get<{ id?: number | string; plateLetters?: string | null; plateNumbers?: string | null; plateNumber?: string | null; make?: string | null; model?: string | null; year?: number | string | null; color?: string | null; colorAr?: string | null; type?: string | null; vehicleType?: string | null } | null>('/driver/me/vehicle'),
    documents: () => api.get('/driver/me/documents'),
    // Step 1: Upload a file to storage and receive a hosted URL back.
    // POST /driver/upload  (multipart: field "file")
    // Returns: { fileUrl: string }
    uploadFile: async (formData: FormData): Promise<{ fileUrl: string }> => {
      const token = await getToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${API_BASE_URL}/driver/upload`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
          signal: controller.signal,
        });
        if (!response.ok) {
          let body: unknown = null;
          try { body = await response.json(); } catch { body = await response.text(); }
          throw new ApiError(response.status, response.statusText, body);
        }
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    },
    // Step 2: Register an already-uploaded document URL with the backend.
    // POST /driver/me/documents  (JSON body)
    registerDocument: (type: string, fileUrl: string, mimeType = 'image/jpeg') =>
      request<{ id: string; type: string; fileUrl: string }>('POST', '/driver/me/documents', { type, fileUrl, mimeType }),
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
    checkinAcknowledge: () => api.post('/driver/checkin/acknowledge'),
    ratings: () => api.get('/driver/me/ratings'),
    promotions: () => api.get<DriverPromotion[]>('/driver/promotions'),

    // Driver-invites-driver referral program — code + config + live stats.
    // Call as soon as the driver has a JWT (works mid-signup too).
    referralProgram: () => api.get<DriverReferralInfo>('/driver/referral-code'),
  },

  pushTokens: {
    register: (token: string) =>
      api.post('/driver/push-token', { token }),
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
    ratePassenger: (rideId: string, stars: number, comment?: string) =>
      api.post<{ ok: boolean; rideId: number; stars: number; id: number }>(
        `/driver/rides/${rideId}/rate-passenger`, { stars, ...(comment ? { comment } : {}) }
      ),
    messages: (rideId: string) =>
      api.get<{ data: RideMessage[]; total: number }>(`/rides/${rideId}/messages`),
    sendMessage: (rideId: string, text: string) =>
      api.post<RideMessage>(`/rides/${rideId}/messages`, { text }),
    sos: (rideId: string, data: { latitude: number; longitude: number; notes?: string }) =>
      api.post(`/rides/${rideId}/sos`, data),
    history: (page = 1, limit = 20, status?: 'completed' | 'cancelled') => {
      const params = [`page=${page}`, `limit=${limit}`];
      if (status) params.push(`status=${status}`);
      return api.get<{ data: RideHistoryItem[]; total: number; page: number }>(
        `/driver/rides/history?${params.join('&')}`
      );
    },
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
    stationsEta: (tripId: string) => api.get(`/driver/trips/${tripId}/stations/eta`),
    stationArrived: (tripId: string, stationId: string) =>
      api.patch(`/driver/trips/${tripId}/stations/${stationId}/arrived`),
    stationCompleted: (tripId: string, stationId: string) =>
      api.patch(`/driver/trips/${tripId}/stations/${stationId}/completed`),
  },

  earnings: {
    summary: () => api.get('/earnings/summary'),
    weekly: (weeks = 4) => api.get(`/earnings/weekly?weeks=${weeks}`),
  },

  safety: {
    shareTrip: (data: { rideId?: string; contactPhone?: string }) =>
      api.post<{ ok: boolean; message?: string }>('/driver/safety/share-trip', data),
    rideCheck: (data: { rideId?: string; latitude: number; longitude: number }) =>
      api.post<{ ok: boolean; message?: string }>('/driver/safety/ridecheck', data),
    recording: (data: { rideId?: string; action: 'start' | 'stop' }) =>
      api.post<{ recordingId?: string; status: string }>('/driver/safety/recording', data),
  },

  wallet: {
    feature: () => api.get('/config/driver-wallet-feature'),
    balance: () => api.get('/driver/wallet/balance'),
    transactions: (page = 1, limit = 20) => api.get(`/driver/earnings/history?page=${page}&limit=${limit}`),
    payout: (amount: number, method: string) => api.post('/driver/wallet/payout', { amount, method }),
    payoutMethods: () => api.get('/driver/wallet/payout-methods'),
    addPayoutMethod: (data: unknown) => api.post('/driver/wallet/payout-methods', data),
    removePayoutMethod: (id: string) => api.del(`/driver/wallet/payout-methods/${id}`),
  },

  shuttle: {
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

    // POST-RECONNECT STATE SYNC
    // Called immediately when the server emits shuttle:state:sync on connect/reconnect.
    // Returns the driver's active bookings + today's trips in a single round-trip so
    // the driver always sees up-to-date state after any offline period.
    // Response shape: { bookings: RawDriverBooking[]; trips: BackendTrip[] }
    stateSnapshot: () => api.get('/shuttle/driver/state-snapshot'),
    createBooking: (data: { routeId: string | number; timeSlotId: string | number; weekStart: string }) =>
      api.post('/shuttle/route-bookings', data),

    // ── bookWeek ────────────────────────────────────────────────────────────
    // ── WEDNESDAY RETENTION CRON (7:00 AM EET / Cairo = UTC+2) ─────────────
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

    declineRenewal: (id: string) => api.post(`/shuttle/route-bookings/${id}/decline-renewal`),

    bookingLiveDetail: (id: string) =>
      api.get(`/shuttle/route-bookings/${id}/detail`),

    // ── Active Trip Management ───────────────────────────────────────────────
    start: (bookingId: string) =>
      api.post(`/shuttle/route-bookings/${bookingId}/start`),

    complete: (lineId: string) => api.post(`/shuttle/lines/${lineId}/complete`),
    passengers: (tripId: string) => api.get(`/shuttle/trips/${tripId}/passengers`),
    // PATCH /driver/bookings/:id/board — marks passenger as boarded
    boardBooking: (bookingId: string, payload?: { stationId?: string | number; cashCollected?: boolean; amountCollected?: number }) =>
      api.patch(`/driver/bookings/${bookingId}/board`, payload ?? {}),

    driverTrips: (page = 1, limit = 10) =>
      api.get(`/shuttle/driver/my-trips?page=${page}&limit=${limit}`),

    history: (page = 1, limit = 20) =>
      api.get(`/shuttle/driver/my-trips?page=${page}&limit=${limit}`),

    // Fix 7: rate a passenger after a trip
    ratePassenger: (tripId: string, rateeId: string, stars: number) =>
      api.post('/shuttle/ratings', { tripId, rateeId, stars }),

    noShowBooking: (bookingId: string) =>
      api.patch(`/driver/bookings/${bookingId}/absent`),

    cashSummary: (tripId: string) =>
      api.get<TripCashSummary>(`/driver/trips/${tripId}/cash-summary`),

    revenueSummary: (tripId: string) =>
      api.get<TripRevenueSummary>(`/driver/trips/${tripId}/revenue-summary`),

    referTrip: (bookingId: string, driverCode: string) =>
      api.post<{ referralId?: number }>(`/shuttle/route-bookings/${bookingId}/refer`, { driverCode }),

    acceptReferral: (referralId: string) =>
      api.post(`/shuttle/referrals/${referralId}/accept`),

    declineReferral: (referralId: string) =>
      api.post(`/shuttle/referrals/${referralId}/decline`),

    // POST /shuttle/route-bookings/:id/final-cancel
    // Body:     { reason: string }
    // Response: { success: boolean; penaltyAmount?: number; message?: string }
    //   penaltyAmount — amount deducted from driver wallet (0 = no penalty, absent = unknown)
    //   message       — optional human-readable note from backend (e.g. "Penalty waived")
    cancelBookingFinal: (bookingId: string, reason: string) =>
      api.post<{ success: boolean; penaltyAmount?: number; message?: string }>(
        `/shuttle/route-bookings/${bookingId}/final-cancel`,
        { reason }
      ),

    cancelPreview: (bookingId: string) =>
      api.get<{ penaltyAmount: number; minutesUntilDeparture: number; departureDatetime?: string }>(
        `/shuttle/route-bookings/${bookingId}/cancel-preview`
      ),

    tripDetail: (bookingId: string) =>
      api.get<{
        bookingId: number;
        tripDatetime: string;
        routeName: string;
        routeNameAr?: string;
        bookedSeats: number;
        totalSeats: number;
        stations: Array<{ id: number; name: string; order: number; eta: string }>;
      }>(`/shuttle/route-bookings/${bookingId}/trip-detail`),

    myReferralCode: () => api.get<{ code: string }>('/driver/me/referral-code'),

    cancellationReasons: () =>
      api.get<Array<{ key: string; label: string; labelAr?: string }>>('/shuttle/cancellation-reasons'),
  },

  notifications: {
    list: () => api.get('/driver/notifications'),
    markRead: (id: string) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.patch('/notifications/read-all'),
  },

  serviceControl: {
    fetch: () => api.get('/services/control'),
  },

  support: {
    submitTicket: (data: {
      subject: string;
      message: string;
      type: 'driver';
      priority: 'low' | 'medium' | 'high';
      category: 'payment' | 'safety' | 'quality' | 'refund' | 'lost_found' | 'other';
      driverId: string | number;
    }) => api.post<{ id: number | string }>('/support/tickets', data),

    // POST /support/tickets/:id/attachments — multipart, field "file", one image per call.
    uploadAttachment: async (ticketId: string | number, formData: FormData): Promise<{
      id: number; ticketId: number; messageId: number; uploadedBy: number; fileUrl: string; createdAt: string;
    }> => {
      const token = await getToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${API_BASE_URL}/support/tickets/${ticketId}/attachments`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
          signal: controller.signal,
        });
        if (!response.ok) {
          let body: unknown = null;
          try { body = await response.json(); } catch { body = await response.text(); }
          throw new ApiError(response.status, response.statusText, body);
        }
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    },
  },

  registration: {
    // Step 3: POST /driver/register/service-type
    setServiceType: (serviceType: 'car' | 'shuttle' | 'scooter' | 'delivery') =>
      api.post<{ ok: true }>('/driver/register/service-type', { serviceType }),

    // Step 4: POST /driver/register/vehicle-details
    setVehicleDetails: (data: {
      brandId: number;
      modelId: number;
      year: number;
      color: string;
      colorId: number;
    }) => api.post<{ ok: true }>('/driver/register/vehicle-details', data),

    // Step 5: POST /driver/register/plate-number
    setPlateNumber: (plateLetters: string, plateNumbers: string) =>
      api.post<{ ok: true }>('/driver/register/plate-number', { plateLetters, plateNumbers }),

    // Step 6: POST /driver/auth/register-complete — documents + optional referral code.
    // Vehicle + service-type already saved in previous steps. referralCode is fire-and-forget
    // server-side: an invalid/unknown/self code is silently ignored, never blocks signup.
    complete: (data: {
      documents: { type: string; fileUrl: string; mimeType: string }[];
      referralCode?: string;
    }) => api.post<{ ok: true }>('/driver/auth/register-complete', data),
  },

  vehicles: {
    // GET /vehicles/brands?serviceType=
    // Returns brands filtered by the driver's service type.
    // SUCCESS RESPONSE: { data: Array<{ id, name, nameAr, serviceType, isChinese }> }
    brands: (serviceType: string) =>
      api.get<{ data: { id: number; name: string; nameAr: string | null; serviceType: string; isChinese: boolean }[] }>(
        `/vehicles/brands?serviceType=${encodeURIComponent(serviceType)}`
      ),

    // GET /vehicles/brands/:brandId/models
    // Returns models available for the given brand. seatCapacity populated for shuttle models.
    // SUCCESS RESPONSE: { data: Array<{ id, brandId, name, nameAr, minYear, maxYear, seatCapacity }> }
    models: (brandId: string | number) =>
      api.get<{ data: { id: number; brandId: number; name: string; nameAr: string | null; minYear: number; maxYear: number | null; seatCapacity: number | null }[] }>(
        `/vehicles/brands/${brandId}/models`
      ),

    // GET /vehicles/meta — single call to populate all vehicle dropdowns
    // Returns brands with nested models, plus color options.
    meta: () => api.get<{
      brands: { id: number; name: string; models: { id: number; name: string }[] }[];
      colors: { id: number; name: string; nameAr?: string }[];
    }>('/vehicles/meta'),

    // GET /vehicles/models/:id/years
    // Returns available model years wrapped in a data array.
    // SUCCESS RESPONSE: { data: Array<{ id: number | null; year: number; pricingCategory: string | null }> }
    years: (modelId: string | number) =>
      api.get<{ data: { id: number | null; year: number; pricingCategory: string | null }[] }>(`/vehicles/models/${modelId}/years`),

    // GET /vehicles/brands/:brandId/models/:modelId  — PUBLIC (no auth required)
    // Returns model details + its available years in a single request.
    // Use this instead of fetching models list then years separately.
    // SUCCESS RESPONSE: { data: { id, brandId, name, nameAr, seatCapacity, minYear, maxYear, isActive,
    //   years: Array<{ id, year, pricingCategory }> } }
    // If no years in DB, backend auto-generates range from minYear → current year.
    modelWithYears: (brandId: string | number, modelId: string | number) =>
      api.get<{
        data: {
          id: number;
          brandId: number;
          name: string;
          nameAr: string | null;
          seatCapacity: number | null;
          minYear: number;
          maxYear: number | null;
          isActive: boolean;
          years: { id: number | null; year: number; pricingCategory: string | null }[];
        };
      }>(`/vehicles/brands/${brandId}/models/${modelId}`),

    // GET /vehicles/colors
    // Returns the list of supported vehicle colors.
    // SUCCESS RESPONSE: { data: Array<{ id: number; nameEn: string; nameAr: string; hexCode: string | null }> }
    colors: () => api.get<{ data: { id: number; nameEn: string; nameAr: string; hexCode: string | null }[] }>('/vehicles/colors'),
  },

  services: {
    available: () => api.get<{ data: { serviceType: string; isEnabled: boolean; displayMode: string; unavailableMessage: string | null }[] }>('/services/available'),
  },

  settings: {
    get: () => api.get('/driver/me/settings'),
    update: (data: unknown) => api.patch('/driver/me/settings', data),
  },

  bonusTargets: {
    list: () => api.get<BonusTarget[]>('/driver/bonus-targets'),
  },

  financialAnalytics: {
    summary: (range: 'today' | 'week' | 'month') =>
      api.get<FinancialAnalytics>(`/driver/financial-analytics?range=${range}`),
  },

  tracking: {
    sendLocation: (data: LocationSnapshot) =>
      api.post<{ success: boolean }>('/tracking/location', data),
    sendBatch: (locations: LocationSnapshot[]) =>
      api.post<{ success: boolean; inserted: number }>('/tracking/locations/batch', { locations }),
  },

  terms: {
    fetchDriver: () => request<{
      id: number;
      targetApp: string;
      version: number;
      contentAr: string;
      contentEn: string;
      updatedAt: string;
    }>('GET', '/terms/driver'),
    accept: (version: number) =>
      api.post<{ ok: boolean; app: string; version: number; acceptedAt: string }>(
        '/terms/accept', { app: 'driver', version }
      ),
  },
};

export interface LocationSnapshot {
  entityType: 'driver';
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  recordedAt: string;
  tripId?: number | null;
  rideId?: number | null;
  isOfflineSync: boolean;
}

export interface RideMessage {
  id: number;
  rideId: number;
  senderId: number;
  senderRole: 'driver' | 'passenger';
  text: string;
  sentAt: string;
}

export interface RideHistoryItem {
  id: string;
  riderName: string;
  riderAvatar?: string;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  duration?: string;
  distance?: string;
  completedAt: string;
  status: 'completed' | 'cancelled';
  riderRating?: number;
  myRating?: number;
}

export interface DriverPromotion {
  id: string;
  title: string;
  description: string;
  bonusPercentage?: number;
  bonusAmount?: number;
  targetRides?: number;
  validUntil?: string;
  isActive: boolean;
}

// Exported bonus target shape — used by both the profile summary and the dedicated screen
export interface BonusTarget {
  id: string;
  title: string;
  nameAr?: string | null;
  description?: string;
  descriptionAr?: string | null;
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
