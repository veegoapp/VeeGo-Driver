/**
 * Shared entity types used across multiple modules.
 *
 * RULES:
 * - Only types that are truly shared (same shape, used in 2+ files) live here.
 * - Screen-local or module-local types stay in their own files.
 * - Do not add business logic here.
 */

// ─── Ride / Map ───────────────────────────────────────────────────────────────

/** A geographic surge pricing zone broadcast by the backend over the socket. */
export interface SurgeZone {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  multiplier: number;
}

/** A live waiting-charge update pushed via socket during an active ride. */
export interface WaitingCharge {
  rideId: string;
  amount: number;
  minutes: number;
  capped?: boolean;
}

// ─── Shuttle ──────────────────────────────────────────────────────────────────

/** A completed or upcoming shuttle driver trip, as returned by the trips list endpoint. */
export interface DriverTrip {
  id: string;
  routeName?: string;
  date?: string;
  boardedPassengers?: number;
  totalPassengers?: number;
  earnings?: number | string;
  revenueAmount?: number | string;
  status?: string;
  /** Trip leg (e.g. 'outbound' | 'return'). Optional — GET /shuttle/driver/my-trips
   *  has not been confirmed to send this field; do not assume it is present. */
  direction?: string;
}

// ─── Auth / Legal ─────────────────────────────────────────────────────────────

/** Terms-and-conditions document returned by the backend. */
export interface TermsData {
  id: number;
  version: number;
  contentAr: string;
  contentEn: string;
  updatedAt: string;
}
