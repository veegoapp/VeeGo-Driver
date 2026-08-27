import { useEffect, useRef, useState } from 'react';
import { haversineMeters } from './useDriverLocation';
import { fetchDirectionsRaw } from '@/lib/utils/googleDirections';

type Coord = { latitude: number; longitude: number };

export type NavigationRouteResult = {
  /**
   * The current leg's full route geometry (untrimmed), replaced only on a
   * genuine leg change or a successful reroute — NOT on every GPS tick.
   * Visual trimming to the driver's live position is MapBackdrop's job
   * (remainingRouteFromPoint, glued to the snapped marker); this hook used to
   * also expose its own nearest-vertex trim as `remainingPolyline`, computed
   * and re-rendered on every single GPS tick purely to be immediately
   * re-trimmed (and superseded) by MapBackdrop's better trim — pure wasted
   * work on the JS thread at 1 Hz. Off-route detection below still needs its
   * own distance scan, but no longer needs to slice/expose a polyline for it.
   */
  routeCoords: Coord[] | null;
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

/** Delay before retrying the initial leg fetch after a failed or empty /directions call. */
const LEG_RETRY_MS = 5_000;

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
 *  2. Off-route detection — flags when the driver is > 50 m from the route.
 *  3. Rerouting — when off-route, fetches a new route from the current
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
  // Also the hook's public routeCoords output — see NavigationRouteResult.
  const [currentRoute, setCurrentRoute] = useState<Coord[] | null>(null);
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

  // Retry plumbing for the initial leg fetch below. A single failed /directions
  // call (timeout, transient network/API error, or a <2-point result) used to
  // blank the route line for the ENTIRE leg: the destination key was marked
  // "done" before the fetch resolved, so the effect never re-ran, and because
  // off-route rerouting requires a non-null route it stayed disabled too — the
  // driver's navigation line simply vanished and never came back. retryTick
  // re-fires the effect after LEG_RETRY_MS on every failed fetch until one
  // succeeds.
  const [retryTick, setRetryTick] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial leg fetch — driverPos → destination, once per leg ───────────
  // Folds in what useRoadPolyline used to do from the ride screen. Keyed on
  // destination (not driverPos), plus a one-shot retry once driverPos becomes
  // available if it wasn't yet when the destination first appeared.
  useEffect(() => {
    if (!enabled || !destination || !driverPos) return;

    // Cancel any pending retry from a previous run before (re)deciding below.
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const destKey = `${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
    if (destKey === lastLegDestKeyRef.current) return;
    lastLegDestKeyRef.current = destKey;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const origin = { latitude: driverPos.latitude, longitude: driverPos.longitude };

    // Clear the "done" key and schedule a delayed re-fire so the same leg is
    // retried instead of being permanently left without a route line.
    const scheduleLegRetry = () => {
      lastLegDestKeyRef.current = null;
      retryTimerRef.current = setTimeout(() => setRetryTick((t) => t + 1), LEG_RETRY_MS);
    };

    fetchDirections(origin, destination, ctrl.signal)
      .then((result) => {
        if (result) setCurrentRoute(result.polyline);
        else scheduleLegRetry();
      })
      .catch(() => {
        // Leg fetch failed (network/timeout) — retry shortly so the line
        // reappears; the off-route reroute logic below cannot recover on its
        // own while the route is still null.
        scheduleLegRetry();
      })
      .finally(() => clearTimeout(timer));

    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  // driverPos's lat/lng are intentionally excluded — only whether a position
  // exists yet matters here (one-shot retry), not its continuous value.
  // retryTick re-fires this effect after a failed fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destination?.latitude, destination?.longitude, driverPos != null, retryTick]);

  // ── Reset when navigation is disabled (phase change, completed, etc.) ───
  useEffect(() => {
    if (enabled) return;
    setCurrentRoute(null);
    setIsOffRoute(false);
    lastLegDestKeyRef.current = null;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    abortRef.current?.abort();
  }, [enabled]);

  // ── Off-route detection + reroute trigger ────────────────────────────────
  // Visual route trimming is no longer done here (see routeCoords doc above)
  // — this effect now only computes the one number it actually needs.
  useEffect(() => {
    if (!enabled || !driverPos || !currentRoute || currentRoute.length < 2) {
      setIsOffRoute(false);
      return;
    }

    // O(n) scan — find the closest distance from the driver to the route.
    // For typical routes (100–500 points) this is negligible at 1 Hz.
    let minDist = Infinity;
    for (let i = 0; i < currentRoute.length; i++) {
      const d = haversineMeters(
        driverPos.latitude, driverPos.longitude,
        currentRoute[i].latitude, currentRoute[i].longitude,
      );
      if (d < minDist) {
        minDist = d;
      }
    }

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

  return { routeCoords: currentRoute, isOffRoute, isRerouting };
}
