import type { ShuttleRoute, ShuttleBooking, ShuttleLine, VehicleType } from './types';

// ─── Backend raw shapes ───────────────────────────────────────────────────────

export type BackendRoute = {
  id: number;
  name: string;
  fromLocation?: string;
  from?: string;
  toLocation?: string;
  to?: string;
  estimatedDuration: number;
  basePrice: number;
  isActive?: boolean;
  stationCount?: number;
  timeSlots?: BackendTimeslot[];
  timeslots?: BackendTimeslot[];
};

type BackendTimeslot = {
  id: number | string;
  departureTime: string;
  availableSeats?: number | null;
  totalSeats?: number | null;
  isBooked?: boolean;
  booked?: boolean;
  isTaken?: boolean;
};

export type BackendTrip = {
  id: number;
  routeId: number;
  departureTime: string;
  arrivalTime: string;
  availableSeats: number;
  totalSeats: number;
  bookedSeats?: number;
  price: number;
  status: string;
  bookings?: { id: string; passengerName?: string; passengerPhone?: string; passengerAvatar?: string }[];
};

type BackendStation = {
  id: number;
  routeId: number;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
  direction: string;
};

type StationPassenger = {
  bookingId: number;
  userId: number;
  seatCount: number;
  status: string;
  boardingStationId: number | null;
  userName: string;
  userPhone: string;
  paymentMethod?: string;
  fareAmount?: number;
  price?: number;
  amount?: number;
  cashCollected?: boolean;
  amountCollected?: number;
};

export type BackendStationWithPassengers = BackendStation & {
  progress: { status: string; arrivedAt?: string; completedAt?: string } | null;
  status: 'pending' | 'arrived' | 'completed';
  passengers: StationPassenger[];
  unassignedPassengers: StationPassenger[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function mapStatus(s: string): 'upcoming' | 'in-progress' | 'completed' {
  if (s === 'active') return 'in-progress';
  if (s === 'completed' || s === 'cancelled') return 'completed';
  return 'upcoming';
}

export function formatTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

export function extractRoutes(raw: unknown): BackendRoute[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BackendRoute[];
  const r = raw as { data?: BackendRoute[]; routes?: BackendRoute[]; lines?: BackendRoute[] };
  return r.data ?? r.routes ?? r.lines ?? [];
}

export function extractTrips(raw: unknown): BackendTrip[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BackendTrip[];
  const r = raw as { data?: BackendTrip[]; trips?: BackendTrip[] };
  return r.data ?? r.trips ?? [];
}

type RawDriverBooking = {
  id: string | number;
  routeId?: string | number;
  timeSlotId?: string | number;
  weekStart?: string;
  weekEnd?: string;
  fromStation?: string;
  toStation?: string;
  fromLocation?: string;
  toLocation?: string;
  trip?: {
    thresholdMet?: boolean;
    bookedSeats?: number;
    minRequired?: number;
    totalSeats?: number | null;
    shuttleStatus?: 'open' | 'pending' | 'active';
    tripDatetimes?: string[];
  } | null;
  status?: string;
  renewalDeadline?: string;
  nextWeekBookingId?: string | null;
  routeName?: string;
  routeNameAr?: string;
  departureTime?: string;
  route?: { id?: string | number; name?: string; nameAr?: string; fromLocation?: string; from?: string; toLocation?: string; to?: string };
  timeSlot?: { id?: string | number; departureTime?: string };
};

function normalizeBooking(b: RawDriverBooking): ShuttleBooking {
  return {
    id: String(b.id),
    routeId: b.routeId ?? b.route?.id ?? 0,
    routeName: b.routeName ?? b.route?.name ?? '—',
    routeNameAr: b.routeNameAr ?? b.route?.nameAr,
    timeSlotId: b.timeSlotId ?? b.timeSlot?.id ?? 0,
    departureTime: b.departureTime ?? b.timeSlot?.departureTime ?? '—',
    weekStart: b.weekStart ?? '',
    weekEnd: b.weekEnd,
    fromStation: b.fromStation ?? b.fromLocation ?? b.route?.fromLocation ?? b.route?.from,
    toStation: b.toStation ?? b.toLocation ?? b.route?.toLocation ?? b.route?.to,
    status: b.status ?? '',
    renewalDeadline: b.renewalDeadline,
    nextWeekBookingId: b.nextWeekBookingId,
    trip: b.trip ? {
      thresholdMet: b.trip.thresholdMet ?? false,
      bookedSeats: b.trip.bookedSeats ?? 0,
      minRequired: b.trip.minRequired ?? 0,
      totalSeats: b.trip.totalSeats ?? null,
      shuttleStatus: b.trip.shuttleStatus ?? 'open',
      tripDatetimes: b.trip.tripDatetimes,
    } : null,
  };
}

export function extractBookings(raw: unknown): ShuttleBooking[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return (raw as RawDriverBooking[]).map(normalizeBooking);
  const r = raw as { data?: RawDriverBooking[]; bookings?: RawDriverBooking[] };
  return (r.data ?? r.bookings ?? []).map(normalizeBooking);
}

export function extractTripStations(raw: unknown): BackendStationWithPassengers[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BackendStationWithPassengers[];
  const r = raw as { data?: BackendStationWithPassengers[] };
  return r.data ?? [];
}

export function mapRoute(route: BackendRoute): ShuttleRoute {
  const rawSlots = route.timeSlots ?? route.timeslots ?? [];
  return {
    id: route.id,
    name: route.name,
    from: route.fromLocation ?? route.from ?? '—',
    to: route.toLocation ?? route.to ?? '—',
    stationCount: route.stationCount ?? 0,
    estimatedDuration: route.estimatedDuration ?? 0,
    basePrice: route.basePrice ?? 0,
    timeslots: rawSlots.map(ts => ({
      id: ts.id,
      departureTime: ts.departureTime,
      availableSeats: ts.availableSeats ?? null,
      totalSeats: ts.totalSeats ?? null,
      isBooked: ts.isBooked ?? ts.booked ?? false,
      isTaken: ts.isTaken ?? false,
    })),
  };
}

export function deriveVehicleType(totalSeats: number): VehicleType {
  if (totalSeats === 14) return 'HiAce';
  if (totalSeats === 28) return 'Mini Bus';
  return 'Unknown';
}

export function buildLine(route: BackendRoute, trip: BackendTrip | undefined): ShuttleLine {
  const total = trip?.totalSeats ?? 0;
  const booked = trip?.bookedSeats ?? (trip ? total - trip.availableSeats : 0);
  return {
    id: String(route.id),
    tripId: trip ? String(trip.id) : undefined,
    lineNumber: `L${route.id}`,
    name: route.name,
    from: route.fromLocation ?? route.from ?? '—',
    to: route.toLocation ?? route.to ?? '—',
    departure: trip ? formatTime(trip.departureTime) : '—',
    arrival: trip ? formatTime(trip.arrivalTime) : '—',
    status: trip ? mapStatus(trip.status) : 'upcoming',
    passengers: booked,
    capacity: total,
    bookedSeats: booked,
    totalSeats: total,
    vehicleType: deriveVehicleType(total),
    assigned: !!trip,
    stationCount: route.stationCount ?? 0,
    estimatedDuration: route.estimatedDuration ?? 0,
    basePrice: route.basePrice ?? 0,
  };
}
