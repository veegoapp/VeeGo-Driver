import React, { useReducer, useEffect, useRef, useState, useMemo } from 'react';
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
import { useDemoMode } from './DemoContext';

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
  const linesRaw = await api.get('/shuttle/lines');
  const routes = parseRoutes(linesRaw);
  if (!routes.length) return null;

  const route = routes[0];

  const detailRaw = await api.get(`/shuttle/lines/${route.id}`);
  const stations = parseStations(detailRaw);

  if (stations.length < 2) return null;

  const sorted = [...stations]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 6);

  const stopsTemplate: Omit<ShuttleStop, 'status' | 'boarded' | 'expected'>[] = sorted.map(
    (st, idx) => ({
      id: String(st.id),
      name: st.name,
      address: st.address ?? st.name,
      eta: st.eta ?? `Stop ${idx + 1}`,
    })
  );

  const stationCoords = sorted
    .filter(st => st.latitude != null && st.longitude != null)
    .map(st => ({ latitude: st.latitude!, longitude: st.longitude! }));

  const from = route.fromLocation ?? route.from ?? sorted[0].name;
  const to = route.toLocation ?? route.to ?? sorted[sorted.length - 1].name;
  const routeId = String(route.id);

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
function passengersForStop(
  stopIndex: number
): Omit<BoardingPassenger, 'checkedIn'>[] {
  return DEMO_PASSENGERS_TEMPLATE[stopIndex] ?? [];
}

// ── Interpolation helper: returns N intermediate points between two coords ────
// This makes the movement look smooth and realistic on the map
function interpolatePath(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  steps: number
): Array<{ latitude: number; longitude: number }> {
  const pts: Array<{ latitude: number; longitude: number }> = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      latitude: from.latitude + (to.latitude - from.latitude) * t,
      longitude: from.longitude + (to.longitude - from.longitude) * t,
    });
  }
  return pts;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function DemoShuttleProvider({ children }: { children: React.ReactNode }) {
  const { demoSpeed } = useDemoMode();
  const [state, dispatch] = useReducer(demoReducer, DEMO_INITIAL_STATE);

  const [demoBase, setDemoBase] = useState<DemoBase | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchRealDemoBase()
      .then(base => {
        if (!cancelled) setDemoBase(base);
      })
      .catch(() => {
        if (!cancelled) setDemoBase(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const stopsTemplate = useMemo(() => demoBase?.stopsTemplate ?? DEMO_STOPS_TEMPLATE, [demoBase]);
  const stationCoords = useMemo(() => demoBase?.stationCoords ?? DEMO_STATION_COORDS, [demoBase]);
  const activeLine = useMemo(() => demoBase?.activeLine ?? DEMO_LINE, [demoBase]);
  const demoBooking = useMemo(() => demoBase?.booking ?? DEMO_BOOKING, [demoBase]);
  const demoRoute = useMemo(() => demoBase?.route ?? DEMO_ROUTE, [demoBase]);

  // ── Simulated GPS ──────────────────────────────────────────────────────────
  // الإصلاح الأول: العربية تبدأ من المحطة السابقة بالظبط (مش من مكان بعيد)
  // وبتتحرك بخطوات صغيرة كتير عشان الحركة تبقى سلسة زي جوجل ماب
  const simPosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const pathQueueRef = useRef<Array<{ latitude: number; longitude: number }>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [demoDriverPosition, setDemoDriverPosition] = useState<{
    latitude: number; longitude: number; heading: number | null; speed: number | null;
  } | null>(null);

  useEffect(() => {
    // مسح الإنتيرفال القديم
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const target = stationCoords[state.currentStopIndex];
    if (!target) {
      simPosRef.current = null;
      setDemoDriverPosition(null);
      return;
    }

    // الإصلاح الأساسي: ابدأ من المحطة السابقة بالظبط
    // لو أول محطة → ابدأ من نقطة قريبة (600 متر) قبل المحطة على نفس المسار
    const prev = stationCoords[state.currentStopIndex - 1];
    let startPoint: { latitude: number; longitude: number };

    if (prev) {
      // ابدأ من المحطة السابقة بالظبط
      startPoint = { latitude: prev.latitude, longitude: prev.longitude };
    } else {
      // أول محطة: احسب نقطة 600 متر قبلها في نفس اتجاه المسار
      // لو في محطة تانية، احسب الاتجاه عكسها؛ غير كده افترض اتجاه جنوب
      const next = stationCoords[state.currentStopIndex + 1];
      if (next) {
        // الاتجاه من target لـ next ← اعكسه عشان نيجي من ورا
        const dLat = target.latitude - next.latitude;
        const dLng = target.longitude - next.longitude;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        const ratio = 0.006 / (dist || 0.001); // تقريباً 600 متر
        startPoint = {
          latitude: target.latitude + dLat * ratio,
          longitude: target.longitude + dLng * ratio,
        };
      } else {
        startPoint = {
          latitude: target.latitude + 0.006,
          longitude: target.longitude,
        };
      }
    }

    // Estimate a realistic initial speed based on demo speed setting
    // Base speed is ~8.33 m/s (30 km/h) scaled by demoSpeed
    const initialSpeedMps = 8.33 * demoSpeed;
    simPosRef.current = startPoint;
    setDemoDriverPosition({ ...startPoint, heading: null, speed: initialSpeedMps });

    // بناء مسار مقسّم لخطوات صغيرة جداً (50 خطوة) عشان الحركة تبقى سلسة
    // الإصلاح التاني: بدل الـ easing الأسي (اللي بيبطّي في الآخر)، خطوات ثابتة الحجم
    const APPROACH_STOP_M = 350; // وقف قبل المحطة بـ 350 متر
    const totalDist = haversineMeters(
      startPoint.latitude, startPoint.longitude,
      target.latitude, target.longitude
    );

    // احسب عدد الخطوات بحيث كل خطوة ≈ 15-30 متر
    const stepCount = Math.max(20, Math.min(80, Math.round(totalDist / 20)));
    const allPoints = interpolatePath(startPoint, target, stepCount);

    // اقطع النقاط اللي بعد نقطة الـ 350 متر
    let cutoffIdx = allPoints.length;
    for (let i = 0; i < allPoints.length; i++) {
      const d = haversineMeters(
        allPoints[i].latitude, allPoints[i].longitude,
        target.latitude, target.longitude
      );
      if (d <= APPROACH_STOP_M) { cutoffIdx = i; break; }
    }
    pathQueueRef.current = allPoints.slice(0, cutoffIdx);

    // كل tick = خطوة واحدة من الـ queue
    // السرعة: في الـ 1× → 1500ms بين كل خطوة. 2× → 750ms. 5× → 300ms
    const tickMs = Math.round(1500 / demoSpeed);

    intervalRef.current = setInterval(() => {
      const queue = pathQueueRef.current;
      if (!queue.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      const next = queue.shift()!;
      const cur = simPosRef.current;
      const movedM = cur
        ? haversineMeters(cur.latitude, cur.longitude, next.latitude, next.longitude)
        : 0;
      const speedMps = movedM / (tickMs / 1000);
      simPosRef.current = next;
      setDemoDriverPosition({ ...next, heading: null, speed: speedMps });
    }, tickMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStopIndex, stationCoords, demoSpeed]);

  // ── Passengers ────────────────────────────────────────────────────────────
  const checkedInMap = state.checkedInByStop[state.currentStopIndex] ?? {};
  const passengers: BoardingPassenger[] = passengersForStop(state.currentStopIndex).map(p => ({
    ...p,
    checkedIn: checkedInMap[p.id] ?? false,
  }));

  // ── Stops ─────────────────────────────────────────────────────────────────
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
