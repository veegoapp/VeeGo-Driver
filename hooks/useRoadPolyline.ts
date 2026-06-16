import { useEffect, useRef, useState } from 'react';

type Coord = { latitude: number; longitude: number };

export type RoadPolylineResult = {
  coords: Coord[] | null;
  loading: boolean;
};

const TIMEOUT_MS = 8_000;

/**
 * Fetches road-snapped geometry from OSRM for the given waypoints.
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

    const coordStr = waypoints.map(p => `${p.longitude},${p.latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    fetch(url, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('non-ok'))))
      .then(data => {
        if (data?.code === 'Ok' && Array.isArray(data.routes?.[0]?.geometry?.coordinates)) {
          const coords: Coord[] = (data.routes[0].geometry.coordinates as [number, number][]).map(
            ([lng, lat]) => ({ latitude: lat, longitude: lng }),
          );
          setResult({ coords, loading: false });
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
