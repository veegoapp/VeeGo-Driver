import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/auth';

type Coord = { latitude: number; longitude: number };

export type RoadPolylineResult = {
  coords: Coord[] | null;
  loading: boolean;
};

const TIMEOUT_MS = 8_000;

/**
 * Fetches road-snapped geometry from the backend /directions proxy.
 * Returns null until the request completes; callers should use the
 * raw station coords as a straight-line fallback in the meantime.
 *
 * Only re-fetches when the waypoint set actually changes (content-keyed),
 * so React re-renders never trigger redundant network calls.
 */
export function useRoadPolyline(
  waypoints: Coord[] | null | undefined,
): RoadPolylineResult {
  const [result, setResult] = useState<RoadPolylineResult>({ coords: null, loading: false });
  const abortRef  = useRef<AbortController | null>(null);
  const lastKey   = useRef<string>('');

  // Derive a stable string key from the waypoint content
  const waypointKey = waypoints?.length
    ? waypoints.map(p => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|')
    : '';

  useEffect(() => {
    if (!waypointKey || !waypoints || waypoints.length < 2) {
      setResult({ coords: null, loading: false });
      return;
    }

    // Skip if same stations as last successful fetch
    if (waypointKey === lastKey.current) return;
    lastKey.current = waypointKey;

    abortRef.current?.abort();
    const ctrl  = new AbortController();
    abortRef.current = ctrl;

    setResult({ coords: null, loading: true });

    const origin      = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediates = waypoints.slice(1, -1);
    const waypointParam = intermediates.length > 0
      ? `&waypoints=${intermediates.map(p => `${p.latitude},${p.longitude}`).join('|')}`
      : '';
    const base = process.env.EXPO_PUBLIC_API_URL ?? '';
    const url =
      `${base}/directions` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      waypointParam;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    getToken()
      .then(token =>
        fetch(url, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token ?? ''}` },
        }),
      )
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('non-ok'))))
      .then(data => {
        if (Array.isArray(data?.polyline) && (data.polyline as Coord[]).length >= 2) {
          setResult({ coords: data.polyline as Coord[], loading: false });
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
