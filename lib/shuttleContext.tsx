import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from './api';

export type ShuttleStop = {
  id: string;
  name: string;
  address: string;
  eta: string;
  boarded: number;
  expected: number;
  status: 'pending' | 'arrived' | 'completed';
};

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

type BackendRoute = {
  id: number;
  name: string;
  fromLocation: string;
  toLocation: string;
  estimatedDuration: number;
  basePrice: number;
  isActive: boolean;
  stationCount?: number;
};

type BackendTrip = {
  id: number;
  routeId: number;
  departureTime: string;
  arrivalTime: string;
  availableSeats: number;
  totalSeats: number;
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

function buildLine(route: BackendRoute, trip: BackendTrip | undefined): ShuttleLine {
  const boarded = trip ? trip.totalSeats - trip.availableSeats : 0;
  return {
    id: String(route.id),
    tripId: trip ? String(trip.id) : undefined,
    lineNumber: `L${route.id}`,
    name: route.name,
    from: route.fromLocation,
    to: route.toLocation,
    departure: trip ? formatTime(trip.departureTime) : '—',
    arrival: trip ? formatTime(trip.arrivalTime) : '—',
    status: trip ? mapStatus(trip.status) : 'upcoming',
    passengers: boarded,
    capacity: trip?.totalSeats ?? 0,
    assigned: !!trip,
    stationCount: route.stationCount ?? 0,
    estimatedDuration: route.estimatedDuration,
    basePrice: route.basePrice,
  };
}

function extractRoutes(raw: unknown): BackendRoute[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BackendRoute[];
  const r = raw as { data?: BackendRoute[]; lines?: BackendRoute[] };
  return r.data ?? r.lines ?? [];
}

function extractTrips(raw: unknown): BackendTrip[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BackendTrip[];
  const r = raw as { data?: BackendTrip[]; trips?: BackendTrip[] };
  return r.data ?? r.trips ?? [];
}

type ShuttleContextType = {
  activeLine: ShuttleLine | null;
  allLines: ShuttleLine[];
  stops: ShuttleStop[];
  currentStopIndex: number;
  passengers: BoardingPassenger[];
  loading: boolean;
  error: Error | null;
  nextStop: () => void;
  togglePassenger: (id: string) => void;
};

const ShuttleContext = createContext<ShuttleContextType>({
  activeLine: null,
  allLines: [],
  stops: [],
  currentStopIndex: 0,
  passengers: [],
  loading: false,
  error: null,
  nextStop: () => {},
  togglePassenger: () => {},
});

export function ShuttleProvider({ children }: { children: React.ReactNode }) {
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [passengers, setPassengers] = useState<BoardingPassenger[]>([]);

  const {
    data: routesRaw,
    isLoading: routesLoading,
    error: routesError,
  } = useQuery({
    queryKey: ['shuttle-routes'],
    queryFn: () => endpoints.shuttle.lines() as Promise<unknown>,
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

  const routes = extractRoutes(routesRaw);
  const driverTrips = extractTrips(tripsRaw);

  // Map routeId → driver's most relevant trip
  // Priority: active > nearest scheduled departure > others
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

  const allLines: ShuttleLine[] = routes.map(route =>
    buildLine(route, tripByRouteId.get(route.id))
  );

  const activeLine = allLines.find(l => l.status === 'in-progress') ?? null;

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
  const {
    data: tripDetailRaw,
    isLoading: detailLoading,
    error: detailError,
  } = useQuery({
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

  return (
    <ShuttleContext.Provider
      value={{
        activeLine,
        allLines,
        stops,
        currentStopIndex,
        passengers,
        loading: routesLoading || tripsLoading || stationsLoading || detailLoading,
        error: (routesError ?? tripsError ?? stationsError ?? detailError) as Error | null,
        nextStop,
        togglePassenger,
      }}
    >
      {children}
    </ShuttleContext.Provider>
  );
}

export function useShuttle() {
  return useContext(ShuttleContext);
}
