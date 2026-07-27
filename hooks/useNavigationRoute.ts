import { useEffect, useRef, useState } from 'react';
import { haversineMeters } from './useDriverLocation';
import { getToken } from '@/lib/auth';

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

/** Network timeout for reroute fetches. */
const FETCH_TIMEOUT_MS = 8_000;

/**
 * After a successful internal reroute, external polyline updates (from
 * useRoadPolyline) are suppressed for this duration so the freshly
 * computed route is not immediately overwritten by the old result.
 */
const REROUTE_LOCK_MS = 12_000;

/**
 * Manages active navigation intelligence on top of a road-snapped route.
 *
 * Responsibilities:
 *  1. Route progress — trims `fullPolyline` to the remaining portion ahead
 *     of the driver's closest position on the route.
 *  2. Off-route detection — flags when the driver is > 50 m from the route.
 *  3. Rerouting — when off-route, fetches a new route from the current
 *     driver position to `destination` via the existing /directions endpoint.
 *     Throttled by a 15 s cooldown and a 20 m minimum-movement guard.
 *
 * Parameters:
 *  - `fullPolyline`  Road-snapped route coordinates (from useRoadPolyline).
 *  - `driverPos`     Live driver GPS position.
 *  - `destination`   Fixed endpoint of the current navigation leg.
 *  - `enabled`       False outside navigation phases (arrived, completed, shuttle…).
 *
 * Does NOT modify routing architecture, authentication, trip state, or
 * any backend API. Shuttle behavior is unaffected (pass enabled=false).
 */
export function useNavigationRoute(
  fullPolyline: Coord[] | null | undefined,
  driverPos: { latitude: number; longitude: number } | null,
  destination: { latitude: number; longitude: number } | null,
  enabled: boolean,
): NavigationRouteResult {
  // Internal "current route" — seeded by fullPolyline, replaced on reroute.
  const [currentRoute, setCurrentRoute] = useState<Coord[] | null>(null);
  const [remainingPolyline, setRemainingPolyline] = useState<Coord[] | null>(null);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);

  // Refs for reroute throttling (avoid repeated state reads in async callbacks)
  const isReroutingRef = useRef(false);
  const lastReroutedAt = useRef<number>(0);
  const rerouteOriginRef = useRef<Coord | null>(null);
  const rerouteLockUntil = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  // ── Accept external polyline updates unless a reroute just completed ────
  // After an internal reroute we lock external updates for REROUTE_LOCK_MS so
  // the freshly computed route isn't immediately overwritten by the old hook.
  useEffect(() => {
    if (!fullPolyline?.length) return;
    if (Date.now() < rerouteLockUntil.current) return;
    setCurrentRoute(fullPolyline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullPolyline]);

  // ── Reset when navigation is disabled (phase change, completed, etc.) ───
  useEffect(() => {
    if (enabled) return;
    setCurrentRoute(null);
    setRemainingPolyline(null);
    setIsOffRoute(false);
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

    const base = process.env.EXPO_PUBLIC_API_URL ?? '';
    const url =
      `${base}/directions` +
      `?origin=${driverPos.latitude},${driverPos.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}`;

    getToken()
      .then(token =>
        fetch(url, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token ?? ''}` },
        }),
      )
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('non-ok'))))
      .then((data: unknown) => {
        const poly =
          data != null &&
          typeof data === 'object' &&
          'polyline' in data &&
          Array.isArray((data as { polyline: unknown }).polyline)
            ? ((data as { polyline: Coord[] }).polyline)
            : null;
        if (poly && poly.length >= 2) {
          // Suppress external polyline updates for REROUTE_LOCK_MS
          rerouteLockUntil.current = Date.now() + REROUTE_LOCK_MS;
          setCurrentRoute(poly);
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
