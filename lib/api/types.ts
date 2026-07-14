// ─── Shuttle ──────────────────────────────────────────────────────────────────

// Typed envelope for POST /driver/trips/:id/complete (shuttle trip completion).
// The double-fallback (root-level fields AND nested under .data) is intentional:
// the backend has returned both shapes at different times. Do not remove either
// path until the backend response shape is confirmed stable across all versions.
// See usage in app/shuttle/trip-active.tsx (handleFinishRoute).
export interface ShuttleCompleteResponse {
  earnedAmount?: number;
  walletBalance?: number;
  data?: {
    earnedAmount?: number;
    walletBalance?: number;
  };
}

// ─── Trip payment summary ──────────────────────────────────────────────────────

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

// ─── Financial Analytics ───────────────────────────────────────────────────────
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

// ─── Driver profile ────────────────────────────────────────────────────────────

// Backend-persisted emergency contact (SOS Phase 1) — one per driver.
export interface EmergencyContact {
  name: string;
  phone: string;
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

// ─── Ride ─────────────────────────────────────────────────────────────────────

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

// ─── Tracking ─────────────────────────────────────────────────────────────────

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
