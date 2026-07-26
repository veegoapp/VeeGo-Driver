/**
 * ActiveSession type definitions for the Driver App.
 *
 * Verbatim from the Backend ActiveSession Integration Contract.
 * Source of truth: artifacts/api-server/src/services/session/activeSessionManager.ts
 *
 * Do NOT add fields that are not in the contract.
 * Timestamps arrive as ISO strings over JSON even though the backend types them as Date.
 */

// ─── Ride session ──────────────────────────────────────────────────────────────

export type DriverRideSession = {
  sessionType: 'ride';
  vehicleType: 'car' | 'scooter' | 'delivery';
  rideId: number;
  status: 'driver_assigned' | 'driver_arrived' | 'active';
  requestedCategory: string | null;
  pickup: {
    latitude: number;
    longitude: number;
    address: string;
  };
  dropoff: {
    latitude: number;
    longitude: number;
    address: string;
  };
  /** Delivery only — null for car/scooter. */
  recipient: {
    name: string;
    phone: string;
  } | null;
  distanceKm: number | null;
  estimatedDurationMinutes: number | null;
  estimatedPrice: number | null;
  finalPrice: number | null;
  /** 0 if no waiting charge is active. */
  waitingCharge: number;
  paymentMethod: string;
  passenger: {
    id: number;
    name: string;
    phone: string;
  } | null;
  /** ISO timestamp string. */
  requestedAt: string;
  /** ISO timestamp string, or null if not yet assigned. */
  driverAssignedAt: string | null;
  /** ISO timestamp string, or null if driver has not yet arrived. */
  driverArrivedAt: string | null;
  /** ISO timestamp string, or null if trip not yet started. */
  startedAt: string | null;
};

// ─── Shuttle trip session ──────────────────────────────────────────────────────

export type DriverShuttleStationProgress = 'pending' | 'arrived' | 'completed' | null;

export type DriverShuttleStation = {
  stationId: number;
  name: string;
  nameAr: string | null;
  latitude: number;
  longitude: number;
  /** Stop sequence — ascending order. */
  order: number;
  /** null = no progress row yet (pre-trip). */
  progress: DriverShuttleStationProgress;
  /** ISO timestamp string, or null. */
  arrivedAt: string | null;
  /** ISO timestamp string, or null. */
  completedAt: string | null;
};

export type DriverShuttlePassenger = {
  bookingId: number;
  userId: number;
  name: string | null;
  phone: string | null;
  seatCount: number;
  /** "pending" | "confirmed" | "boarded" | "absent" */
  status: string;
  paymentMethod: string;
  boardingStationId: number | null;
  cashCollected: boolean;
  amountCollected: number;
};

export type DriverShuttleWeeklyBooking = {
  id: number;
  routeId: number;
  timeSlotId: number;
  direction: string;
  weekStart: string;
  weekEnd: string;
  /** "active" | "pending_renewal" */
  status: string;
  /** ISO timestamp string, or null. */
  renewalDeadline: string | null;
  departureTime: string | null;
};

export type DriverShuttleSession = {
  sessionType: 'shuttle_trip';
  tripId: number;
  status: 'driver_assigned' | 'boarding' | 'active';
  vehicleType: string;
  direction: string;
  /** ISO timestamp string. */
  departureTime: string;
  /** ISO timestamp string. */
  arrivalTime: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
  minRequired: number;
  route: {
    id: number;
    name: string;
    nameAr: string | null;
    fromLocation: string;
    toLocation: string;
  };
  stations: DriverShuttleStation[];
  passengers: DriverShuttlePassenger[];
  /** The driver's active weekly route contract, if any. */
  weeklyBooking: DriverShuttleWeeklyBooking | null;
  /** ISO timestamp string, or null. */
  acceptedAt: string | null;
  /** ISO timestamp string, or null. */
  startedAt: string | null;
};

// ─── Union ────────────────────────────────────────────────────────────────────

/**
 * Discriminated union — use `sessionType` to narrow:
 *   session.sessionType === 'ride'         → DriverRideSession
 *   session.sessionType === 'shuttle_trip' → DriverShuttleSession
 */
export type DriverActiveSession = DriverRideSession | DriverShuttleSession;
