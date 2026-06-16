import React, { useReducer, useEffect, useRef, useState } from 'react';
import { ShuttleContext } from '@/lib/shuttleContext';
import type {
  ShuttleLine,
  ShuttleStop,
  ShuttleBooking,
  ShuttleRoute,
  BoardingPassenger,
} from '@/lib/shuttleContext';
import { haversineMeters } from '@/hooks/useDriverLocation';
import { api } from '@/lib/api';
import {
  DEMO_LINE,
  DEMO_BOOKING,
  DEMO_ROUTE,
  DEMO_STOPS_TEMPLATE,
  DEMO_PASSENGERS_TEMPLATE,
  DEMO_STATION_COORDS,
} from './mockData';
import { demoReducer, DEMO_INITIAL_STATE } from './demoEngine';

// ── Raw backend shapes (minimal, only what we need) ───────────────────────────

type RawStation = {
  id: number | string;
  name: string;
  latitude?: number;
  longitude?: number;
  order?: number;
  address?: string;
  eta?: string;
};

type RawRoute = {
  id: number | string;
  name: string;
  fromLocation?: string;
  from?: string;
  toLocation?: string;
  to?: string;
  stationCount?: number;
  estimatedDuration?: number;
  basePrice?: number;
};

// ── Response parsers ──────────────────────────────────────────────────────────

function parseRoutes(raw: unknown): RawRoute[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as RawRoute[];
  const r = raw as Record<string, unknown>;
  const arr = r.data ?? r.routes ?? r.lines;
  return Array.isArray(arr) ? (arr as RawRoute[]) : [];
}

function parseStations(raw: unknown): RawStation[] {
  if (!raw) return [];
  const r = raw as Record<string, unknown>;
  const detail = (r.data as Record<string, unknown> | undefined) ?? r;
  const stations = (detail as Record<string, unknown>)?.stations;
  return Array.isArray(stations) ? (stations as RawStation[]) : [];
}

// ── Real-data fetch ───────────────────────────────────────────────────────────

type DemoBase = {
  stopsTemplate: Omit<ShuttleStop, 'status' | 'boarded' | 'expected'>[];
  stationCoords: Array<{ latitude: number; longitude: number }>;
  activeLine: ShuttleLine;
  booking: ShuttleBooking;
  route: ShuttleRoute;
};

async function fetchRealDemoBase(): Promise<DemoBase | null> {
  // Step 1: fetch all routes
  const linesRaw = await api.get('/shuttle/lines');
  const routes = parseRoutes(linesRaw);
  if (!routes.length) return null;

  // Step 2: pick first route (prefer an 'in-progress' one if labelled)
  const route = routes[0];

  // Step 3: fetch line detail to get stations with coordinates
  const detailRaw = await api.get(`/shuttle/lines/${route.id}`);
  const stations = parseStations(detailRaw);

  // Need at least 2 stations for a meaningful demo trip
  if (stations.length < 2) return null;

  // Sort by station order, then cap at 6 so the demo always ends at Station 6
  const sorted = [...stations]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 6);

  // Build stop templates (all stations, name + address)
  const stopsTemplate: Omit<ShuttleStop, 'status' | 'boarded' | 'expected'>[] = sorted.map(
    (st, idx) => ({
      id: String(st.id),
      name: st.name,
      address: st.address ?? st.name,
      eta: st.eta ?? `Stop ${idx + 1}`,
    })
  );

  // Only stations that have coordinates contribute to the map polyline
  const stationCoords = sorted
    .filter(st => st.latitude != null && st.longitude != null)
    .map(st => ({ latitude: st.latitude!, longitude: st.longitude! }));

  const from = route.fromLocation ?? route.from ?? sorted[0].name;
  const to = route.toLocation ?? route.to ?? sorted[sorted.length - 1].name;
  const routeId = String(route.id);

  // tripId is intentionally undefined — this prevents trip-active and
  // boarding screens from firing any real API calls during the simulation.
  const activeLine: ShuttleLine = {
    id: routeId,
    tripId: undefined,
    lineNumber: `D${route.id}`,
    name: route.name,
    from,
    to,
    departure: '08:00',
    arrival: '09:15',
    status: 'in-progress',
    passengers: 5,
    capacity: 12,
    bookedSeats: 5,
    totalSeats: 12,
    vehicleType: 'HiAce',
    assigned: true,
    stationCount: sorted.length,
    estimatedDuration: route.estimatedDuration ?? 75,
    basePrice: route.basePrice ?? 85,
  };

  const booking: ShuttleBooking = {
    id: 'demo-booking-1',
    routeId,
    routeName: route.name,
    timeSlotId: 'demo-slot-1',
    departureTime: '08:00',
    weekStart: new Date().toISOString().slice(0, 10),
    status: 'booked',
  };

  const demoRoute: ShuttleRoute = {
    id: route.id,
    name: route.name,
    from,
    to,
    stationCount: sorted.length,
    estimatedDuration: route.estimatedDuration ?? 75,
    basePrice: route.basePrice ?? 85,
    timeslots: [
      {
        id: 'demo-slot-1',
        departureTime: '08:00',
        availableSeats: 1,
        totalSeats: 12,
        isBooked: true,
        isTaken: false,
      },
    ],
  };

  return { stopsTemplate, stationCoords, activeLine, booking, route: demoRoute };
}

// ── Passenger helper ──────────────────────────────────────────────────────────
// Passengers are simulated locally — the demo never fetches real passenger data
// to avoid requiring auth and to keep boarding actions fully offline.
function passengersForStop(
  stopIndex: number
): Omit<BoardingPassenger, 'checkedIn'>[] {
  return DEMO_PASSENGERS_TEMPLATE[stopIndex] ?? [];
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function DemoShuttleProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, DEMO_INITIAL_STATE);

  // Real base data (null while loading or if fetch failed → uses mockData)
  const [demoBase, setDemoBase] = useState<DemoBase | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch real route + stations once on mount; fall back silently to mockData
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchRealDemoBase()
      .then(base => {
        if (!cancelled) setDemoBase(base);
      })
      .catch(() => {
        if (!cancelled) setDemoBase(null); // null → fallback to mockData below
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Resolved data: real if fetch succeeded, mockData fallback otherwise ────
  const stopsTemplate = demoBase?.stopsTemplate ?? DEMO_STOPS_TEMPLATE;
  const stationCoords = demoBase?.stationCoords ?? DEMO_STATION_COORDS;
  const activeLine = demoBase?.activeLine ?? DEMO_LINE;
  const demoBooking = demoBase?.booking ?? DEMO_BOOKING;
  const demoRoute = demoBase?.route ?? DEMO_ROUTE;

  // ── Simulated GPS: moves from previous station toward the current target ──
  // Stops within ~350 m so the "approaching" banner triggers in trip-active.
  const simPosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [demoDriverPosition, setDemoDriverPosition] = useState<{
    latitude: number; longitude: number; heading: number | null; speed: number | null;
  } | null>(null);

  useEffect(() => {
    const target = stationCoords[state.currentStopIndex];
    if (!target) {
      simPosRef.current = null;
      setDemoDriverPosition(null);
      return;
    }

    // Start from the previous station, or ~2.5 km before the first stop
    const prev = stationCoords[state.currentStopIndex - 1];
    const start = {
      latitude: prev?.latitude ?? (target.latitude + 0.022),
      longitude: prev?.longitude ?? target.longitude,
    };
    simPosRef.current = start;
    setDemoDriverPosition({ ...start, heading: null, speed: null });

    // Move 7 % of remaining distance every 1.5 s; halt when ≤ 350 m away
    const interval = setInterval(() => {
      const cur = simPosRef.current;
      if (!cur) { clearInterval(interval); return; }
      const dist = haversineMeters(cur.latitude, cur.longitude, target.latitude, target.longitude);
      if (dist <= 350) { clearInterval(interval); return; }
      const next = {
        latitude:  cur.latitude  + (target.latitude  - cur.latitude)  * 0.07,
        longitude: cur.longitude + (target.longitude - cur.longitude) * 0.07,
      };
      const movedM = haversineMeters(cur.latitude, cur.longitude, next.latitude, next.longitude);
      const speedMps = movedM / 1.5; // interval is 1.5 s
      simPosRef.current = next;
      setDemoDriverPosition({ ...next, heading: null, speed: speedMps });
    }, 1500);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStopIndex, stationCoords]);

  // ── Passengers for the current stop (checkedIn driven by demo reducer) ──────
  const checkedInMap = state.checkedInByStop[state.currentStopIndex] ?? {};
  const passengers: BoardingPassenger[] = passengersForStop(state.currentStopIndex).map(p => ({
    ...p,
    checkedIn: checkedInMap[p.id] ?? false,
  }));

  // ── Stops derived from the template + live reducer state ──────────────────
  const stops: ShuttleStop[] = stopsTemplate.map((template, idx) => ({
    ...template,
    boarded:
      idx === state.currentStopIndex
        ? passengers.filter(p => p.checkedIn).length
        : 0,
    expected:
      idx === state.currentStopIndex ? passengers.length : 0,
    status:
      idx < state.currentStopIndex
        ? 'completed'
        : idx === state.currentStopIndex
        ? 'arrived'
        : 'pending',
  }));

  return (
    <ShuttleContext.Provider
      value={{
        routes: [demoRoute],
        myBookings: [demoBooking],
        renewalBooking: null,
        activeLine,
        allLines: [activeLine],
        stops,
        currentStopIndex: state.currentStopIndex,
        passengers,
        loading: isLoading,
        listLoading: false,
        error: null,
        refetch: () => {},
        nextStop: () => dispatch({ type: 'NEXT_STOP' }),
        togglePassenger: (id: string) =>
          dispatch({
            type: 'TOGGLE_PASSENGER',
            id,
            stopIndex: state.currentStopIndex,
          }),
        tripCancelledBanner: null,
        dismissTripCancelledBanner: () => {},
        startedTripId: null,
        setStartedTripId: () => {},
        stationCoords,
        resetTrip: () => dispatch({ type: 'RESET' }),
        slotReleasedAlert: null,
        dismissSlotReleasedAlert: () => {},
        demoDriverPosition,
      }}
    >
      {children}
    </ShuttleContext.Provider>
  );
}
