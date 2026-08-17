import { api, ApiError, API_BASE_URL, REQUEST_TIMEOUT_MS } from './_client';
import { getToken } from '../auth';
import type { RideMessage, RideHistoryItem } from './types';

export const ridesEndpoints = {
  available: () => api.get('/driver/rides/available'),
  getById: (rideId: string) => api.get(`/rides/${rideId}`),
  accept: (rideId: string) => api.patch(`/driver/rides/${rideId}/accept`),
  arrived: (rideId: string) => api.patch(`/driver/rides/${rideId}/arrived`),
  decline: (rideId: string) => api.patch(`/driver/rides/${rideId}/decline`),
  cancel: (rideId: string) => api.patch(`/driver/rides/${rideId}/cancel`),
  start: (rideId: string) => api.patch(`/driver/rides/${rideId}/start`),
  // amountReceived: cash actually handed to the driver — only send it when it
  // differs from the fare (driver had no change). The server re-derives and
  // caps the resulting change; this is just transport, not the source of truth.
  complete: (rideId: string, amountReceived?: number) =>
    api.patch<{ data: {
      rideId: number;
      finalPrice: number;
      driverCut: number;
      waitingCharge: number;
      changeAmount: number;
      /** Original trip price before any promo discount. */
      grossFare: number;
      /** EGP amount knocked off by a promo code, 0 when none was used. */
      promoDiscount: number;
      /** Portion of the fare paid from the passenger's wallet, 0 for cash rides. */
      walletDeduction: number;
      /** Cash the passenger still owes in person — the amount to actually collect. */
      netCashPayable: number;
    } }>(
      `/driver/rides/${rideId}/complete`,
      amountReceived !== undefined ? { amountReceived } : undefined
    ),
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
};

// Driver Trip Sharing: a driver-generated, temporary, revocable public
// link (default 24h) so anyone holding it can see live trip status.
// Independent of SOS / emergency-contact — the driver decides when to
// share and can revoke at any time.
export const tripShareEndpoints = {
  create: (data: { rideId?: number; tripId?: number }) =>
    api.post<{ id: number; token: string; url: string; expiresAt: string }>('/driver/trip-share', data),
  revoke: (id: number) =>
    api.patch<{ ok: boolean }>(`/driver/trip-share/${id}/revoke`),
};

export const safetyEndpoints = {
  shareTrip: (data: { rideId?: string; contactPhone?: string }) =>
    api.post<{ ok: boolean; message?: string }>('/driver/safety/share-trip', data),
  rideCheck: (data: { rideId?: string; latitude: number; longitude: number }) =>
    api.post<{ ok: boolean; message?: string }>('/driver/safety/ridecheck', data),
  recording: (data: { rideId?: string; action: 'start' | 'stop' }) =>
    api.post<{ recordingId?: string; status: string }>('/driver/safety/recording', data),
};

export const earningsEndpoints = {
  summary: (period?: string) => api.get(`/earnings/summary${period ? `?period=${period}` : ''}`),
  weekly: (weeks = 4) => api.get(`/earnings/weekly?weeks=${weeks}`),
};

export const walletEndpoints = {
  feature: () => api.get('/config/driver-wallet-feature'),
  balance: () => api.get('/driver/wallet/balance'),
  // Real, admin-confirmed money movements only (paid payouts + approved
  // deposits) — what the Wallet screen's Transactions section shows. Distinct
  // from earningsEndpoints below, which is the full internal ledger dump.
  transactions: (page = 1, limit = 20) => api.get(`/driver/wallet/transactions?page=${page}&limit=${limit}`),
  // Payout now requests against a specific saved payout account and only
  // creates a pending request — see getPayoutAccounts/addPayoutAccount below.
  payout: (amount: number, payoutAccountId: number) => api.post('/driver/wallet/payout', { amount, payoutAccountId }),
  getPayoutAccounts: () => api.get('/driver/payout-accounts'),
  addPayoutAccount: (data: { methodKey: string; accountName: string; accountNumber: string }) =>
    api.post('/driver/payout-accounts', data),
  deletePayoutAccount: (id: number) => api.del(`/driver/payout-accounts/${id}`),
  setDefaultPayoutAccount: (id: number) => api.patch(`/driver/payout-accounts/${id}/default`),
  // The driver's own payout requests (pending/paid/cancelled), newest first.
  getPayoutHistory: () => api.get('/driver/wallet/payouts'),

  // ── Deposits: driver pays back cash commission owed to the platform ──────
  getDepositMethods: () => api.get('/driver/wallet/deposit-methods'),
  // Single multipart request — amount + methodKey fields alongside the proof
  // screenshot (field "proof", JPG only — the backend's multer filter and
  // compressImage re-encode both reject anything else). Mirrors
  // driverEndpoints.uploadFile's manual fetch (not the JSON api.post helper,
  // which can't send FormData) with the same auth/timeout/error handling.
  submitDeposit: async (formData: FormData): Promise<{ id: number; amount: number; methodKey: string; status: string }> => {
    const token = await getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}/driver/wallet/deposits`, {
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
  // The driver's own deposit requests (pending/approved/rejected), newest first.
  getDepositHistory: () => api.get('/driver/wallet/deposits'),
};

export const notificationsEndpoints = {
  list: () => api.get('/driver/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const serviceControlEndpoints = {
  fetch: () => api.get('/services/control'),
};

export const supportEndpoints = {
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
};

export const termsEndpoints = {
  fetchDriver: () => api.get<{
    id: number;
    targetApp: string;
    version: number;
    contentAr: string;
    contentEn: string;
    updatedAt: string;
  }>('/terms/driver'),
  accept: (version: number) =>
    api.post<{ ok: boolean; app: string; version: number; acceptedAt: string }>(
      '/terms/accept', { app: 'driver', version }
    ),
};
