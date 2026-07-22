// ─── Public types ─────────────────────────────────────────────────────────────

export type ShuttleTimeslot = {
  id: string | number;
  departureTime: string;
  availableSeats: number | null;
  totalSeats: number | null;
  isBooked: boolean;   // this driver has booked this slot for the selected week
  isTaken: boolean;    // another driver has booked this slot for the selected week
};

export type ShuttleRoute = {
  id: string | number;
  name: string;
  from: string;
  to: string;
  stationCount: number;
  estimatedDuration: number;
  basePrice: number;
  timeslots: ShuttleTimeslot[];
};

export type ShuttleBooking = {
  id: string;
  routeId: string | number;
  routeName: string;
  routeNameAr?: string;
  timeSlotId: string | number;
  departureTime: string;
  weekStart: string;
  weekEnd?: string;
  fromStation?: string;
  toStation?: string;
  status: string;
  renewalDeadline?: string;
  nextWeekBookingId?: string | null;
  // Trip leg this booking runs (e.g. 'outbound' | 'return'). Undefined when
  // the backend response doesn't include it — never guess a value here.
  direction?: string;
  trip?: {
    thresholdMet: boolean;
    bookedSeats: number;
    minRequired: number;
    totalSeats: number | null;
    shuttleStatus: 'open' | 'pending' | 'active';
    tripDatetimes?: string[];
  } | null;
};

export type ShuttleStop = {
  id: string;
  name: string;
  address: string;
  eta: string;
  boarded: number;
  expected: number;
  status: 'pending' | 'arrived' | 'completed';
  // Preserved from the backend station record (see BackendStation) — not
  // used for filtering here, just carried through instead of discarded.
  direction?: string;
};

export type VehicleType = 'HiAce' | 'Mini Bus' | 'Unknown';

export type ShuttleLine = {
  // Unique per line: the trip's id when a trip is assigned, otherwise the
  // route's id (placeholder line for a route with no trip yet). A single
  // routeId can now back more than one ShuttleLine (e.g. an outbound trip
  // and a return trip on the same route) — use `routeId` to find all lines
  // for a route, not `id`.
  id: string;
  routeId: string | number;
  tripId?: string;
  // Trip leg (e.g. 'outbound' | 'return'), sourced from BackendTrip.direction
  // when the backend provides it. Undefined otherwise — not guessed.
  direction?: string;
  lineNumber: string;
  name: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  status: 'upcoming' | 'in-progress' | 'completed';
  passengers: number;
  capacity: number;
  bookedSeats: number;
  totalSeats: number;
  vehicleType: VehicleType;
  assigned: boolean;
  stationCount: number;
  estimatedDuration: number;
  basePrice: number;
  stops?: ShuttleStop[];
  stations?: { id: string; name: string; eta: string }[];
};

export type BoardingPassenger = {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  ticket: string;
  checkedIn: boolean;
  luggage: boolean;
  paymentMethod: 'cash' | 'card' | 'online' | 'unknown';
  fareAmount: number;
};

// ─── Slot-released alert payload ──────────────────────────────────────────────

export type SlotReleasedAlert = {
  routeId: string | number;
  routeName: string;
};

// ─── Booking cancelled / reassigned banner payload ────────────────────────────
// SHUTTLE_BOOKING_CANCELLED and SHUTTLE_BOOKING_REASSIGNED are distinct events
// with distinct meaning — a reassignment must never read as a cancellation.

export type BookingStatusBanner = {
  type: 'cancelled' | 'reassigned';
  message: string;
};
