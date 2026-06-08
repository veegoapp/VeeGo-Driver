import { getToken, getRefreshToken, saveToken, deleteToken, deleteRefreshToken } from './auth';

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

// Single-flight refresh — only one refresh request may exist at a time.
// Concurrent 401s await the same promise; prevents token refresh storms.
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

  // Clear the single-flight slot once settled so future refreshes can start fresh
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
    accept: (tripId: string) => api.patch(`/driver/trips/${tripId}/accept`),
    reject: (tripId: string) => api.patch(`/driver/trips/${tripId}/reject`),
    start: (tripId: string) => api.patch(`/driver/trips/${tripId}/start`),
    complete: (tripId: string) => api.patch(`/driver/trips/${tripId}/complete`),
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
    addPayoutMethod: (data: unknown) => api.post('/driver/wallet/payout-methods', data),
    removePayoutMethod: (id: string) => api.del(`/driver/wallet/payout-methods/${id}`),
  },

  shuttle: {
    // ── Routes ──────────────────────────────────────────────────────────────
    lines: () => api.get('/shuttle/lines'),
    line: (lineId: string) => api.get(`/shuttle/lines/${lineId}`),

    // NEW: جيب الأسابيع والمواعيد من الباك اند مباشرة — مفيش حاجة تتولد client-side
    // Response: { routeId, routeName, weeks: [{ weekStart, weekEnd, slots: [...] }], total }
    availableWeeks: (routeId: string | number) =>
      api.get(`/shuttle/lines/${routeId}/available-weeks`),

    // مازال موجود للـ fallback لو محتاج تجيب أسبوع بعينه
    timeslots: (routeId: string | number, weekStart?: string) =>
      api.get(`/shuttle/timeslots/${routeId}${weekStart ? `?weekStart=${weekStart}` : ''}`),

    // ── Route Bookings ───────────────────────────────────────────────────────
    myBookings: () => api.get('/shuttle/route-bookings'),
    bookingDetail: (id: string) => api.get(`/shuttle/route-bookings/${id}`),
    createBooking: (data: { routeId: string | number; timeSlotId: string | number; weekStart: string }) =>
      api.post('/shuttle/route-bookings', data),
    cancelBooking: (id: string) => api.del(`/shuttle/route-bookings/${id}`),
    confirmRenewal: (id: string) => api.post(`/shuttle/route-bookings/${id}/confirm-renewal`),

    // ── Active Trip Management ───────────────────────────────────────────────
    complete: (lineId: string) => api.post(`/shuttle/lines/${lineId}/complete`),
    passengers: (tripId: string) => api.get(`/shuttle/trips/${tripId}/passengers`),
    boardBooking: (bookingId: string) =>
      api.post(`/shuttle/bookings/${bookingId}/board`, {}),
  },

  notifications: {
    list: () => api.get('/notifications'),
    markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  },

  serviceControl: {
    fetch: () => api.get('/services/control'),
  },

  support: {
    submitTicket: (data: unknown) => api.post('/support/tickets', data),
  },

  settings: {
    get: () => api.get('/driver/me/settings'),
    update: (data: unknown) => api.patch('/driver/me/settings', data),
  },
};
