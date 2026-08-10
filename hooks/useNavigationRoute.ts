import { useEffect, useRef, useState } from 'react';
import { haversineMeters } from './useDriverLocation';
import { fetchDirectionsRaw } from '@/lib/utils/googleDirections';

type Coord = { latitude: number; longitude: number };

export type NavigationRouteResult = {
  /** Remaining portion of the route from the driver's closest position onward. */
  remainingPolyline: Coord[] | null;
  /** True when the driver is more than OFF_ROUTE_THRESHOLD_M away from the route. */
  isOffRoute: boolean;
  /** True while a reroute network request is in flight. */
  isRerouting: boolean;
};

/** Distance from the nearest route vertex before declaring "off-route". */
const OFF_ROUTE_THRESHOLD_M = 50;

/** Minimum milliseconds between reroute requests. */
const REROUTE_COOLDOWN_MS = 15_000;

/**
 * Driver must have moved at least this far from the previous reroute origin
 * before another reroute is allowed — debounces GPS jitter/instability.
 */
const REROUTE_MIN_MOVE_M = 20;

/** Network timeout for /directions fetches (both the initial leg fetch and reroutes). */
const FETCH_TIMEOUT_MS = 8_000;

type DirectionsResult = { polyline: Coord[] } | null;

/** Shared /directions fetch used by both the initial leg fetch and reroutes. */
async function fetchDirections(
  origin: Coord,
  destination: Coord,
  signal: AbortSignal,
): Promise<DirectionsResult> {
  const result = await fetchDirectionsRaw(origin, destination, { signal });
  return result && result.polyline.length >= 2 ? { polyline: result.polyline } : null;
}

/**
 * Manages active navigation intelligence for a ride leg — owns the full
 * /directions lifecycle for that leg (this used to be split across this hook
 * and useRoadPolyline, called separately from app/ride/[rideId].tsx; that
 * split caused a duplicate fetcher because useRoadPolyline's waypoint key
 * included the live driver position, refetching on nearly every GPS tick).
 *
 * Responsibilities:
 *  1. Initial route fetch — driverPos → destination, fetched once per leg
 *     (keyed on `destination`, not on every driverPos tick).
 *  2. Route progress — trims the route to the remaining portion ahead of the
 *     driver's closest position on the route.
 *  3. Off-route detection — flags when the driver is > 50 m from the route.
 *  4. Rerouting — when off-route, fetches a new route from the current
 *     driver position to `destination`. Throttled by a 15 s cooldown and a
 *     20 m minimum-movement guard.
 *
 * Parameters:
 *  - `driverPos`     Live driver GPS position.
 *  - `destination`   Fixed endpoint of the current navigation leg.
 *  - `enabled`       False outside navigation phases (arrived, completed, shuttle…).
 *
 * Does NOT modify routing architecture, authentication, trip state, or
 * any backend API. Shuttle behavior is unaffected (pass enabled=false; the
 * shuttle screen still owns its own route fetch via useRoadPolyline).
 */
export function useNavigationRoute(
  driverPos: { latitude: number; longitude: number } | null,
  destination: { latitude: number; longitude: number } | null,
  enabled: boolean,
): NavigationRouteResult {
  // Internal "current route" — set by the initial leg fetch, replaced on reroute.
  const [currentRoute, setCurrentRoute] = useState<Coord[] | null>(null);
  const [remainingPolyline, setRemainingPolyline] = useState<Coord[] | null>(null);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);

  // Refs for reroute throttling (avoid repeated state reads in async callbacks)
  const isReroutingRef = useRef(false);
  const lastReroutedAt = useRef<number>(0);
  const rerouteOriginRef = useRef<Coord | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Key of the destination the initial leg fetch below last ran for — guards
  // against refetching on every driverPos tick; only a genuine destination
  // change (new leg) triggers another initial fetch.
  const lastLegDestKeyRef = useRef<string | null>(null);

  // ── Initial leg fetch — driverPos → destination, once per leg ───────────
  // Folds in what useRoadPolyline used to do from the ride screen. Keyed on
  // destination (not driverPos), plus a one-shot retry once driverPos becomes
  // available if it wasn't yet when the destination first appeared.
  useEffect(() => {
    if (!enabled || !destination || !driverPos) return;

    const destKey = `${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
    if (destKey === lastLegDestKeyRef.current) return;
    lastLegDestKeyRef.current = destKey;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const origin = { latitude: driverPos.latitude, longitude: driverPos.longitude };

    fetchDirections(origin, destination, ctrl.signal)
      .then((result) => {
        if (result) setCurrentRoute(result.polyline);
      })
      .catch(() => {
        // Leg fetch failed — remainingPolyline stays null; off-route reroute
        // logic below will pick it up once a driver position is off-route,
        // and this effect will retry on the next genuine destination change.
      })
      .finally(() => clearTimeout(timer));

    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  // driverPos's lat/lng are intentionally excluded — only whether a position
  // exists yet matters here (one-shot retry), not its continuous value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destination?.latitude, destination?.longitude, driverPos != null]);

  // ── Reset when navigation is disabled (phase change, completed, etc.) ───
  useEffect(() => {
    if (enabled) return;
    setCurrentRoute(null);
    setRemainingPolyline(null);
    setIsOffRoute(false);
    lastLegDestKeyRef.current = null;
    abortRef.current?.abort();
  }, [enabled]);

  // ── Route progress trimming + off-route detection + reroute trigger ─────
  useEffect(() => {
    if (!enabled || !driverPos || !currentRoute || currentRoute.length < 2) {
      setRemainingPolyline(currentRoute ?? null);
      return;
    }

    // O(n) scan — find the closest route vertex to the driver's position.
    // For typical routes (100–500 points) this is negligible at 1 Hz.
    let minDist = Infinity;
    let minIdx = 0;
    for (let i = 0; i < currentRoute.length; i++) {
      const d = haversineMeters(
        driverPos.latitude, driverPos.longitude,
        currentRoute[i].latitude, currentRoute[i].longitude,
      );
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }

    // Trim to the remaining portion; keep ≥ 2 points so Polyline renders.
    const sliced = currentRoute.slice(minIdx);
    setRemainingPolyline(sliced.length >= 2 ? sliced : currentRoute.slice(-2));

    const offRoute = minDist > OFF_ROUTE_THRESHOLD_M;
    setIsOffRoute(offRoute);

    // ── Early-exit: on-route, already rerouting, or no destination ──────
    if (!offRoute || isReroutingRef.current || !destination) return;

    // ── Reroute throttle guards ──────────────────────────────────────────
    const now = Date.now();
    const cooldownOk = now - lastReroutedAt.current > REROUTE_COOLDOWN_MS;
    const movedSinceReroute = rerouteOriginRef.current
      ? haversineMeters(
          driverPos.latitude, driverPos.longitude,
          rerouteOriginRef.current.latitude, rerouteOriginRef.current.longitude,
        )
      : Infinity;
    const movedOk = movedSinceReroute > REROUTE_MIN_MOVE_M;
    if (!cooldownOk || !movedOk) return;

    // ── Fire reroute request ─────────────────────────────────────────────
    isReroutingRef.current = true;
    setIsRerouting(true);
    lastReroutedAt.current = now;
    rerouteOriginRef.current = { latitude: driverPos.latitude, longitude: driverPos.longitude };

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    fetchDirections(
      { latitude: driverPos.latitude, longitude: driverPos.longitude },
      destination,
      ctrl.signal,
    )
      .then((result) => {
        if (result) {
          setCurrentRoute(result.polyline);
          setIsOffRoute(false);
        }
      })
      .catch(() => {
        // Reroute failed — keep displaying the existing route
      })
      .finally(() => {
        clearTimeout(timer);
        isReroutingRef.current = false;
        setIsRerouting(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    driverPos?.latitude,
    driverPos?.longitude,
    currentRoute,
    enabled,
    destination?.latitude,
    destination?.longitude,
  ]);

  // ── Abort any in-flight reroute on unmount ───────────────────────────────
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { remainingPolyline, isOffRoute, isRerouting };
}
