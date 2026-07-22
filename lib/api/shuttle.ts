import { api } from './_client';
import type { TripCashSummary, TripRevenueSummary, FinancialAnalytics } from './types';

export const shuttleEndpoints = {
  lines: () => api.get('/shuttle/lines'),
  line: (lineId: string) => api.get(`/shuttle/lines/${lineId}`),

  availableWeeks: (routeId: string | number) =>
    api.get(`/shuttle/lines/${routeId}/available-weeks`),

  // GET /shuttle/available-slots — only returns slots with full-week coverage
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

  // PATCH /driver/bookings/:id/board — marks passenger as boarded.
  // Backend's BoardBody requires stationId as a number (no string coercion),
  // but ShuttleStop.id is typed/populated as a string — coerce here so every
  // caller is covered regardless of what it passes in.
  boardBooking: (bookingId: string, payload?: { stationId?: string | number; cashCollected?: boolean; amountCollected?: number }) =>
    api.patch(`/driver/bookings/${bookingId}/board`, payload ? {
      ...payload,
      ...(payload.stationId != null ? { stationId: Number(payload.stationId) } : {}),
    } : {}),

  driverTrips: (page = 1, limit = 10) =>
    api.get(`/shuttle/driver/my-trips?page=${page}&limit=${limit}`),

  history: (page = 1, limit = 20) =>
    api.get(`/shuttle/driver/my-trips?page=${page}&limit=${limit}`),

  // POST /shuttle/ratings — rate a passenger after a trip
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

  // NOTE: `direction` on the top-level response and per-station is optional —
  // not confirmed present on GET /shuttle/route-bookings/:id/trip-detail today.
  // Typed here so callers can read it once the backend adds it, without
  // masking its current absence.
  tripDetail: (bookingId: string) =>
    api.get<{
      bookingId: number;
      tripDatetime: string;
      routeName: string;
      routeNameAr?: string;
      bookedSeats: number;
      totalSeats: number;
      direction?: string;
      stations: Array<{ id: number; name: string; order: number; eta: string; direction?: string }>;
    }>(`/shuttle/route-bookings/${bookingId}/trip-detail`),

  myReferralCode: () => api.get<{ code: string }>('/driver/me/referral-code'),

  cancellationReasons: () =>
    api.get<Array<{ key: string; label: string; labelAr?: string }>>('/shuttle/cancellation-reasons'),
};

export const tripsEndpoints = {
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
  stationsEta: (tripId: string) => api.get(`/driver/trips/${tripId}/stations/eta`),
  stationArrived: (tripId: string, stationId: string) =>
    api.patch(`/driver/trips/${tripId}/stations/${stationId}/arrived`),
  stationCompleted: (tripId: string, stationId: string) =>
    api.patch(`/driver/trips/${tripId}/stations/${stationId}/completed`),
};

export const financialAnalyticsEndpoints = {
  summary: (range: 'today' | 'week' | 'month') =>
    api.get<FinancialAnalytics>(`/driver/financial-analytics?range=${range}`),
};
