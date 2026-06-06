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

// Silent token refresh — called automatically on 401
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
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
    if (!response.ok) return null;
    const data = await response.json();
    if (data.accessToken) {
      await saveToken(data.accessToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
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
    sendOtp: (phone: string) =>
      request<void>('POST', '/auth/send-otp', { phone }),
    verifyOtp: (phone: string, otp: string) =>
      request<{ accessToken: string; refreshToken: string; user: { role: string } }>(
        'POST', '/auth/verify-otp', { phone, otp }
      ),
    logout: () => request<void>('POST', '/driver/auth/logout'),
    driverLogin: (credential: string, password: string) =>
      request<{ accessToken: string; refreshToken: string; user: Record<string, unknown>; driver: Record<string, unknown> }>(
        'POST', '/driver/auth/login', { credential, password }
      ),
    driverRegister: (data: { name: string; email: string; phone: string; password: string; licenseNumber?: string; nationalId?: string }) =>
      request<{ accessToken: string; refreshToken: string; user: Record<string, unknown>; driver: Record<string, unknown> }>(
        'POST', '/driver/auth/register', data
      ),
  },

  driver: {
    // GET /driver/me — spec §4
    me: () => api.get('/driver/me'),
    updateMe: (data: unknown) => api.patch('/driver/me', data),
    // Separate online/offline endpoints per spec §4
    goOnline: () => api.patch('/driver/status/online'),
    goOffline: () => api.patch('/driver/status/offline'),
    // Location update — spec §4: PATCH /driver/location
    updateLocation: (data: { latitude: number; longitude: number; speed?: number; heading?: number; tripId?: string }) =>
      api.patch('/driver/location', data),
    // Below paths are not in spec but kept as best-effort for screens that reference them
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
    // POST /users/me/push-token — spec §2
    register: (platform: 'ios' | 'android' | 'web', token: string) =>
      api.post('/users/me/push-token', { token, platform }),
  },

  rides: {
    // GET /driver/rides/available — spec §4 + §13
    available: () => api.get('/driver/rides/available'),
    // GET /rides/:id — spec §13
    getById: (rideId: string) => api.get(`/rides/${rideId}`),
    // PATCH /driver/rides/:id/accept — spec §4 + §13
    accept: (rideId: string) => api.patch(`/driver/rides/${rideId}/accept`),
    // PATCH /driver/rides/:id/arrived — spec §4 + §13
    arrived: (rideId: string) => api.patch(`/driver/rides/${rideId}/arrived`),
    // Below ride actions (start/complete/decline/rateRider) are not in the spec
    // but kept for best-effort compatibility
    decline: (rideId: string) => api.post(`/driver/rides/${rideId}/decline`),
    start: (rideId: string) => api.patch(`/driver/rides/${rideId}/start`),
    complete: (rideId: string) => api.patch(`/driver/rides/${rideId}/complete`),
    active: () => api.get('/driver/rides/active'),
    rateRider: (rideId: string, rating: number) =>
      api.post(`/driver/rides/${rideId}/rate-rider`, { rating }),
  },

  trips: {
    // GET /driver/trips — spec §4
    list: (status?: string, page?: number, limit = 20) => {
      const params: string[] = [];
      if (status) params.push(`status=${encodeURIComponent(status)}`);
      if (page) params.push(`page=${page}`);
      params.push(`limit=${limit}`);
      return api.get(`/driver/trips?${params.join('&')}`);
    },
    detail: (tripId: string) => api.get(`/driver/trips/${tripId}`),
    // Trip lifecycle — spec §4
    accept: (tripId: string) => api.patch(`/driver/trips/${tripId}/accept`),
    reject: (tripId: string) => api.patch(`/driver/trips/${tripId}/reject`),
    start: (tripId: string) => api.patch(`/driver/trips/${tripId}/start`),
    complete: (tripId: string) => api.patch(`/driver/trips/${tripId}/complete`),
    cancel: (tripId: string, reason: string) =>
      api.patch(`/driver/trips/${tripId}/cancel`, { reason }),
    // Station lifecycle — spec §4
    stations: (tripId: string) => api.get(`/driver/trips/${tripId}/stations`),
    stationArrived: (tripId: string, stationId: string) =>
      api.patch(`/driver/trips/${tripId}/stations/${stationId}/arrived`),
    stationCompleted: (tripId: string, stationId: string) =>
      api.patch(`/driver/trips/${tripId}/stations/${stationId}/completed`),
  },

  earnings: {
    // GET /earnings/summary — spec §12
    summary: () => api.get('/earnings/summary'),
    // GET /earnings/weekly — spec §12
    weekly: (weeks = 4) => api.get(`/earnings/weekly?weeks=${weeks}`),
  },

  wallet: {
    // GET /driver/wallet/balance — returns { balance, totalPaid, totalPending }
    balance: () => api.get('/driver/wallet/balance'),
    // Driver earnings history — closest equivalent to a wallet transaction list
    transactions: () => api.get('/driver/earnings/history'),
    // Below wallet paths are not in spec but kept for UI functionality
    payout: (amount: number) => api.post('/driver/wallet/payout', { amount }),
    payoutMethods: () => api.get('/driver/wallet/payout-methods'),
    addPayoutMethod: (data: unknown) => api.post('/driver/wallet/payout-methods', data),
    removePayoutMethod: (id: string) => api.del(`/driver/wallet/payout-methods/${id}`),
  },

  shuttle: {
    // GET /shuttle/lines — spec §14
    lines: () => api.get('/shuttle/lines'),
    // GET /shuttle/assignments — spec §14
    assignments: () => api.get('/shuttle/assignments'),
    // Below shuttle paths are not in spec but kept for best-effort
    line: (lineId: string) => api.get(`/shuttle/lines/${lineId}`),
    activate: (lineId: string) => api.post(`/shuttle/lines/${lineId}/activate`),
    complete: (lineId: string) => api.post(`/shuttle/lines/${lineId}/complete`),
    passengers: (tripId: string) => api.get(`/shuttle/trips/${tripId}/passengers`),
    boardBooking: (bookingId: string) =>
      api.post(`/shuttle/bookings/${bookingId}/board`, {}),
    // POST /shuttle/lines/:id/book — driver books a weekly slot
    book: (lineId: string, body: { weekStart: string; weekEnd: string; departureTime: string }) =>
      api.post(`/shuttle/lines/${lineId}/book`, body),
  },

  notifications: {
    // GET /notifications — spec §11
    list: () => api.get('/notifications'),
    // PATCH /notifications/:id/read — spec §11
    markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  },

  serviceControl: {
    // GET /services/control — returns ServiceControl[] or { services: ServiceControl[] }
    fetch: () => api.get('/services/control'),
  },

  support: {
    // POST /support/tickets — spec §16
    // subject (required) + message (required) + type? + priority? + userId? + driverId?
    submitTicket: (data: unknown) => api.post('/support/tickets', data),
  },

  settings: {
    // Not in spec — kept for best-effort
    get: () => api.get('/driver/me/settings'),
    update: (data: unknown) => api.patch('/driver/me/settings', data),
  },
};
