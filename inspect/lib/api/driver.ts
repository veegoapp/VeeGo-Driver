import { api, request, ApiError, API_BASE_URL, REQUEST_TIMEOUT_MS } from './_client';
import { getToken, getUserIdFromToken } from '../auth';
import type {
  DriverProfileEnriched,
  DriverReferralInfo,
  EmergencyContact,
  BonusTarget,
  DriverPromotion,
} from './types';

// ── MIME type helper ──────────────────────────────────────────────────────────
// Infers a MIME type from a file URI/path extension. Falls back to image/jpeg
// (the most common document photo format) when the extension is unrecognised.
function inferMimeType(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    gif:  'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf:  'application/pdf',
  };
  return (ext && map[ext]) ?? 'image/jpeg';
}

export const driverEndpoints = {
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
        try { errorBody = await response.json(); } catch (e) {
          if (__DEV__) console.warn('[API] Could not parse avatar-request error body as JSON:', e);
        }
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
  registerDocument: (type: string, fileUrl: string, mimeType?: string) =>
    request<{ id: string; type: string; fileUrl: string }>('POST', '/driver/me/documents', { type, fileUrl, mimeType: mimeType ?? inferMimeType(fileUrl) }),

  // POST /driver/checkin with selfie + optional tripId
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

  // POST /driver-documents/upload/:driverId — upload a document file (multipart/form-data: file, type)
  uploadDocument: async (formData: FormData) => {
    const token = await getToken();
    const driverId = getUserIdFromToken(token);
    if (!driverId) throw new Error('uploadDocument: no driver ID in token');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE_URL}/driver-documents/upload/${driverId}`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  },

  // GET /driver/checkin/status — current check-in gate state, for cold start / reconnect.
  checkinStatus: () => api.get<{
    checkInRequired: boolean;
    checkInDeadline: string | null;
    lastCheckInAt: string | null;
    isOnline: boolean;
    onlineSince: string | null;
    recentCheckins: unknown[];
  }>('/driver/checkin/status'),

  ratings: () => api.get('/driver/me/ratings'),
  promotions: () => api.get<DriverPromotion[]>('/driver/promotions'),

  // Driver-invites-driver referral program — code + config + live stats.
  // Call as soon as the driver has a JWT (works mid-signup too).
  referralProgram: () => api.get<DriverReferralInfo>('/driver/referral-code'),
};

export const pushTokensEndpoints = {
  register: (token: string, platform?: 'ios' | 'android' | 'web') =>
    api.post('/driver/push-token', { token, platform }),
};

export const registrationEndpoints = {
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
};

export const vehiclesEndpoints = {
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
};

export const servicesEndpoints = {
  available: () => api.get<{ data: { serviceType: string; isEnabled: boolean; displayMode: string; unavailableMessage: string | null }[] }>('/services/available'),
};

export const settingsEndpoints = {
  get: () => api.get('/driver/me/settings'),
  update: (data: unknown) => api.patch('/driver/me/settings', data),
};

// SOS Phase 1: emergency contact is now stored on the backend (one per
// driver) instead of only on-device. GET returns { name, phone } | null.
export const emergencyContactEndpoints = {
  get: () => api.get<EmergencyContact | null>('/driver/me/emergency-contact'),
  update: (data: EmergencyContact) => api.patch<EmergencyContact>('/driver/me/emergency-contact', data),
};

export const bonusTargetsEndpoints = {
  list: () => api.get<BonusTarget[]>('/driver/bonus-targets'),
};
