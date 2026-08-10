import { useEffect, useRef, useState } from 'react';
import { fetchDirectionsRaw } from '@/lib/utils/googleDirections';
import { haversineMeters } from './useDriverLocation';

type Coord = { latitude: number; longitude: number };

export type RoadPolylineResult = {
  coords: Coord[] | null;
  loading: boolean;
};

const TIMEOUT_MS = 8_000;

// Throttle for re-fetches triggered only by the origin (waypoints[0]) moving
// — e.g. a live driver position — while the rest of the waypoint set (the
// destination/intermediates) is unchanged. A genuine change to that portion
// (a new leg/segment) always bypasses this and refetches immediately.
const ORIGIN_REFRESH_INTERVAL_MS = 15_000;
const ORIGIN_SIGNIFICANT_MOVE_M = 30;

/**
 * Fetches road-snapped geometry from the backend /directions proxy.
 * Returns null until the request completes; callers should use the
 * raw station coords as a straight-line fallback in the meantime.
 *
 * Only re-fetches when the waypoint set actually changes (content-keyed).
 * When only the origin (waypoints[0]) has moved — e.g. a live driver
 * position feeding this hook every GPS tick — refetches are throttled to at
 * most once per ORIGIN_REFRESH_INTERVAL_MS or ORIGIN_SIGNIFICANT_MOVE_M of
 * origin movement, whichever comes first; a change to the destination or
 * intermediate waypoints always refetches immediately.
 */
export function useRoadPolyline(
  waypoints: Coord[] | null | undefined,
): RoadPolylineResult {
  const [result, setResult] = useState<RoadPolylineResult>({ coords: null, loading: false });
  const abortRef  = useRef<AbortController | null>(null);
  const lastKey   = useRef<string>('');
  // Key of the destination/intermediate waypoints (everything except the
  // origin) from the last successful fetch — used to detect a genuine leg
  // change vs. just the origin drifting.
  const lastNonOriginKeyRef = useRef<string>('');
  const lastFetchOriginRef  = useRef<Coord | null>(null);
  const lastFetchAtRef      = useRef<number>(0);

  // Derive a stable string key from the waypoint content
  const originKey = waypoints?.[0]
    ? `${waypoints[0].latitude.toFixed(5)},${waypoints[0].longitude.toFixed(5)}`
    : '';
  const nonOriginKey = waypoints && waypoints.length > 1
    ? waypoints.slice(1).map(p => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|')
    : '';
  const waypointKey = originKey && nonOriginKey ? `${originKey}|${nonOriginKey}` : '';

  useEffect(() => {
    if (!waypointKey || !waypoints || waypoints.length < 2) {
      setResult({ coords: null, loading: false });
      lastKey.current = '';
      lastNonOriginKeyRef.current = '';
      lastFetchOriginRef.current = null;
      lastFetchAtRef.current = 0;
      return;
    }

    // Skip if identical to the last successful fetch's waypoints
    if (waypointKey === lastKey.current) return;

    const origin = waypoints[0];
    const destinationChanged = nonOriginKey !== lastNonOriginKeyRef.current;

    if (!destinationChanged) {
      // Same leg — only the origin moved (e.g. a live driver position tick).
      // Throttle: refetch only after ORIGIN_REFRESH_INTERVAL_MS has elapsed
      // or the origin has moved ORIGIN_SIGNIFICANT_MOVE_M since the last fetch.
      const now = Date.now();
      const elapsed = now - lastFetchAtRef.current;
      const movedM = lastFetchOriginRef.current
        ? haversineMeters(
            lastFetchOriginRef.current.latitude, lastFetchOriginRef.current.longitude,
            origin.latitude, origin.longitude,
          )
        : Infinity;
      if (elapsed < ORIGIN_REFRESH_INTERVAL_MS && movedM < ORIGIN_SIGNIFICANT_MOVE_M) {
        return; // too soon and hasn't moved enough — keep the current route
      }
    }

    lastKey.current = waypointKey;
    lastNonOriginKeyRef.current = nonOriginKey;
    lastFetchOriginRef.current = origin;
    lastFetchAtRef.current = Date.now();

    abortRef.current?.abort();
    const ctrl  = new AbortController();
    abortRef.current = ctrl;

    setResult({ coords: null, loading: true });

    const destination = waypoints[waypoints.length - 1];
    const intermediates = waypoints.slice(1, -1);
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    fetchDirectionsRaw(origin, destination, { waypoints: intermediates, signal: ctrl.signal })
      .then(result => {
        if (result && result.polyline.length >= 2) {
          setResult({ coords: result.polyline, loading: false });
        } else {
          setResult({ coords: null, loading: false });
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setResult({ coords: null, loading: false });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointKey]);

  return result;
}
