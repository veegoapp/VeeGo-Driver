import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from './api';
import { useSocket } from './socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

// ─── Public types ────────────────────────────────────────────────────────────

export type ShuttleTimeslot = {
  id: string | number;
  departureTime: string;
  availableSeats: number;
  totalSeats: number;
  booked: boolean;
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
  timeSlotId: string | number;
  departureTime: string;
  weekStart: string;
  weekEnd?: string;
  status: string;
  renewalDeadline?: string;
  nextWeekBookingId?: string | null;
};

export type ShuttleStop = {
  id: string;
  name: string;
  address: string;
  eta: string;
  boarded: number;
  expected: number;
  status: 'pending' | 'arrived' | 'completed';
};

export type VehicleType = 'HiAce' | 'Mini Bus' | 'Unknown';

export type ShuttleLine = {
  id: string;
  tripId?: string;
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
};

// ─── Backend raw shapes ───────────────────────────────────────────────────────

type BackendRoute = {
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
  timeslots?: BackendTimeslot[];
};

type BackendTimeslot = {
  id: number | string;
  departureTime: string;
  availableSeats?: number;
  totalSeats?: number;
  booked?: boolean;
};

type BackendTrip = {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(s: string): 'upcoming' | 'in-progress' | 'completed' {
  if (s === 'active') return 'in-progress';
  if (s === 'completed' || s === 'cancelled') return 'completed';
  return 'upcoming';
}

function formatTime(iso: string): string {
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

function extractRoutes(raw: unknown): BackendRoute[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BackendRoute[];
  const r = raw as { data?: BackendRoute[]; routes?: BackendRoute[]; lines?: BackendRoute[] };
  return r.data ?? r.routes ?? r.lines ?? [];
}

function extractTrips(raw: unknown): BackendTrip[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BackendTrip[];
  const r = raw as { data?: BackendTrip[]; trips?: BackendTrip[] };
  return r.data ?? r.trips ?? [];
}

function extractBookings(raw: unknown): ShuttleBooking[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ShuttleBooking[];
  const r = raw as { data?: ShuttleBooking[]; bookings?: ShuttleBooking[] };
  return r.data ?? r.bookings ?? [];
}

function mapRoute(route: BackendRoute): ShuttleRoute {
  return {
    id: route.id,
    name: route.name,
    from: route.fromLocation ?? route.from ?? '—',
    to: route.toLocation ?? route.to ?? '—',
    stationCount: route.stationCount ?? 0,
    estimatedDuration: route.estimatedDuration ?? 0,
    basePrice: route.basePrice ?? 0,
    timeslots: (route.timeslots ?? []).map(ts => ({
      id: ts.id,
      departureTime: ts.departureTime,
      availableSeats: ts.availableSeats ?? 0,
      totalSeats: ts.totalSeats ?? 0,
      booked: ts.booked ?? false,
    })),
  };
}

function deriveVehicleType(totalSeats: number): VehicleType {
  if (totalSeats === 14) return 'HiAce';
  if (totalSeats === 28) return 'Mini Bus';
  return 'Unknown';
}

function buildLine(route: BackendRoute, trip: BackendTrip | undefined): ShuttleLine {
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

// ─── Context type ─────────────────────────────────────────────────────────────

type ShuttleContextType = {
  // New: booking layer
  routes: ShuttleRoute[];
  myBookings: ShuttleBooking[];
  renewalBooking: ShuttleBooking | null;
  // Legacy: trip execution layer (powers boarding / trip-active screens)
  activeLine: ShuttleLine | null;
  allLines: ShuttleLine[];
  stops: ShuttleStop[];
  currentStopIndex: number;
  passengers: BoardingPassenger[];
  loading: boolean;
  error: Error | null;
  nextStop: () => void;
  togglePassenger: (id: string) => void;
  // Auto-cancel notification
  tripCancelledBanner: string | null;
  dismissTripCancelledBanner: () => void;
};

const ShuttleContext = createContext<ShuttleContextType>({
  routes: [],
  myBookings: [],
  renewalBooking: null,
  activeLine: null,
  allLines: [],
  stops: [],
  currentStopIndex: 0,
  passengers: [],
  loading: false,
  error: null,
  nextStop: () => {},
  togglePassenger: () => {},
  tripCancelledBanner: null,
  dismissTripCancelledBanner: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ShuttleProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [passengers, setPassengers] = useState<BoardingPassenger[]>([]);
  const [tripCancelledBanner, setTripCancelledBanner] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: routesRaw,
    isLoading: routesLoading,
    error: routesError,
  } = useQuery({
    queryKey: ['shuttle-lines'],
    queryFn: () => endpoints.shuttle.lines() as Promise<unknown>,
    refetchInterval: 60000,
  });

  const {
    data: bookingsRaw,
    isLoading: bookingsLoading,
    error: bookingsError,
  } = useQuery({
    queryKey: ['shuttle-my-bookings'],
    queryFn: () => endpoints.shuttle.myBookings() as Promise<unknown>,
    refetchInterval: 60000,
  });

  const {
    data: tripsRaw,
    isLoading: tripsLoading,
    error: tripsError,
  } = useQuery({
    queryKey: ['shuttle-driver-trips'],
    queryFn: () => endpoints.trips.list() as Promise<unknown>,
    refetchInterval: 30000,
  });

  // ── Derived data ─────────────────────────────────────────────────────────

  const backendRoutes = extractRoutes(routesRaw);
  const routes: ShuttleRoute[] = backendRoutes.map(mapRoute);

  const myBookings: ShuttleBooking[] = extractBookings(bookingsRaw);

  const renewalBooking: ShuttleBooking | null =
    myBookings.find(b => {
      if (!b.renewalDeadline) return false;
      return new Date(b.renewalDeadline).getTime() > Date.now();
    }) ?? null;

  // Trip execution layer (unchanged logic)
  const driverTrips = extractTrips(tripsRaw);
  const tripByRouteId = new Map<number, BackendTrip>();
  for (const trip of driverTrips) {
    const existing = tripByRouteId.get(trip.routeId);
    if (!existing) {
      tripByRouteId.set(trip.routeId, trip);
    } else {
      const priority = (s: string) => (s === 'active' ? 3 : s === 'scheduled' ? 2 : 1);
      const np = priority(trip.status);
      const ep = priority(existing.status);
      if (np > ep) {
        tripByRouteId.set(trip.routeId, trip);
      } else if (np === ep && trip.status === 'scheduled') {
        if (new Date(trip.departureTime) < new Date(existing.departureTime)) {
          tripByRouteId.set(trip.routeId, trip);
        }
      }
    }
  }

  const allLines: ShuttleLine[] = backendRoutes.map(route =>
    buildLine(route, tripByRouteId.get(route.id))
  );

  const activeLine = allLines.find(l => l.status === 'in-progress') ?? null;

  // Active trip station / passenger loading
  const {
    data: activeLineDetailRaw,
    isLoading: stationsLoading,
    error: stationsError,
  } = useQuery({
    queryKey: ['shuttle-line-detail', activeLine?.id],
    queryFn: () => endpoints.shuttle.line(activeLine!.id) as Promise<unknown>,
    enabled: !!activeLine,
  });

  const activeDetail =
    (activeLineDetailRaw as { data?: { stations?: BackendStation[] } } | undefined)?.data ??
    (activeLineDetailRaw as { stations?: BackendStation[] } | undefined);
  const activeStations: BackendStation[] =
    (activeDetail as { stations?: BackendStation[] } | undefined)?.stations ?? [];

  const stops: ShuttleStop[] = activeStations.map((st, idx) => ({
    id: String(st.id),
    name: st.name,
    address: st.name,
    eta: `Stop ${idx + 1}`,
    boarded: idx === currentStopIndex ? passengers.filter(p => p.checkedIn).length : 0,
    expected: idx === currentStopIndex ? passengers.length : 0,
    status:
      idx < currentStopIndex ? 'completed' : idx === currentStopIndex ? 'arrived' : 'pending',
  }));

  const activeTripId = activeLine?.tripId;
  const { data: tripDetailRaw, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['shuttle-active-trip', activeTripId],
    queryFn: () => endpoints.trips.detail(activeTripId!) as Promise<BackendTrip>,
    enabled: !!activeTripId,
  });

  useEffect(() => {
    const bookings = (tripDetailRaw as BackendTrip | undefined)?.bookings ?? [];
    if (bookings.length > 0) {
      setPassengers(
        bookings.map((b, i) => ({
          id: b.id,
          name: b.passengerName ?? `Passenger ${i + 1}`,
          avatar: b.passengerAvatar ?? '',
          phone: b.passengerPhone ?? '—',
          ticket: b.id.slice(0, 8).toUpperCase(),
          checkedIn: false,
          luggage: false,
        }))
      );
    }
  }, [tripDetailRaw]);

  // ── Socket: shuttle trip events ───────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const handleAutoCancelled = (data?: { tripId?: string | number; routeName?: string }) => {
      const name = data?.routeName ?? 'A trip';
      setTripCancelledBanner(`${name} was automatically cancelled — minimum bookings not reached.`);
      queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
    };

    socket.on(SOCKET_EVENTS.SHUTTLE_TRIP_AUTO_CANCELLED, handleAutoCancelled);

    return () => {
      socket.off(SOCKET_EVENTS.SHUTTLE_TRIP_AUTO_CANCELLED, handleAutoCancelled);
    };
  }, [socket, queryClient]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const nextStop = () => {
    if (currentStopIndex < stops.length - 1) {
      setCurrentStopIndex(i => i + 1);
      setPassengers(prev => prev.map(p => ({ ...p, checkedIn: false })));
    }
  };

  const togglePassenger = (id: string) => {
    setPassengers(prev =>
      prev.map(p => (p.id === id ? { ...p, checkedIn: !p.checkedIn } : p))
    );
  };

  const dismissTripCancelledBanner = () => setTripCancelledBanner(null);

  return (
    <ShuttleContext.Provider
      value={{
        routes,
        myBookings,
        renewalBooking,
        activeLine,
        allLines,
        stops,
        currentStopIndex,
        passengers,
        loading:
          routesLoading || bookingsLoading || tripsLoading || stationsLoading || detailLoading,
        error: (routesError ?? bookingsError) as Error | null,
        nextStop,
        togglePassenger,
        tripCancelledBanner,
        dismissTripCancelledBanner,
      }}
    >
      {children}
    </ShuttleContext.Provider>
  );
}

export function useShuttle() {
  return useContext(ShuttleContext);
}
