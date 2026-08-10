import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface DirectionsResult {
  coords: LatLng[];
  durationSeconds: number | null;
}

export interface DirectionsRawResult {
  polyline: LatLng[];
  durationS: number | null;
  distanceM: number | null;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Shared low-level GET to the backend's /directions proxy (which wraps
 * Google Directions), using the raw-fetch + manual bearer-token convention
 * shared by useNavigationRoute, useRoadPolyline, useRoadEta, and
 * MapBackdrop's auto-route fetch. Callers own their own AbortController/
 * timeout and pass it as `signal` so each keeps its existing throttling and
 * cancellation behavior — this only consolidates URL building, the fetch
 * call, and response parsing.
 *
 * Returns null on a non-OK response so callers can fall through to their
 * existing "no data" handling; network/parse errors still reject so
 * existing .catch() fallbacks (e.g. speed-based ETA estimation) keep firing.
 */
export async function fetchDirectionsRaw(
  origin: LatLng,
  destination: LatLng,
  options: { waypoints?: LatLng[]; signal?: AbortSignal } = {},
): Promise<DirectionsRawResult | null> {
  const base = process.env.EXPO_PUBLIC_API_URL ?? '';
  let url =
    `${base}/directions` +
    `?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}`;
  if (options.waypoints && options.waypoints.length > 0) {
    url += `&waypoints=${options.waypoints.map(p => `${p.latitude},${p.longitude}`).join('|')}`;
  }

  const token = await getToken();
  const res = await fetch(url, {
    signal: options.signal,
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  if (!res.ok) return null;

  const data: unknown = await res.json();
  const typed = data as { polyline?: unknown; durationS?: unknown; distanceM?: unknown } | null;
  return {
    polyline: Array.isArray(typed?.polyline) ? (typed.polyline as LatLng[]) : [],
    durationS: typeof typed?.durationS === 'number' ? typed.durationS : null,
    distanceM: typeof typed?.distanceM === 'number' ? typed.distanceM : null,
  };
}

/**
 * Fetches a road-snapped route from the backend via the shared `api` client
 * (adds the `{data: {...}}` envelope unwrap and auto token-refresh used
 * elsewhere in the app).
 *
 * Backend contract:
 *   GET /api/directions?origin=lat,lng&destination=lat,lng[&waypoints=lat,lng|...]
 *   Response: { polyline: [{latitude, longitude},...], durationS: number, distanceM: number }
 *             (or wrapped as { data: { polyline, durationS, distanceM } })
 *
 * Guarded by an explicit timeout (matching the AbortController + setTimeout
 * convention used by the other /directions consumers) so a stalled request
 * can never hang the caller indefinitely.
 */
export async function fetchGoogleRoute(
  origin: LatLng,
  waypoints: LatLng[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<DirectionsResult | null> {
  if (waypoints.length === 0) return null;

  const destination = waypoints[waypoints.length - 1];
  const middle = waypoints.slice(0, -1);

  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
  });
  if (middle.length > 0) {
    params.set('waypoints', middle.map(p => `${p.latitude},${p.longitude}`).join('|'));
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const timeoutCtrl = new AbortController();
  const onExternalAbort = () => timeoutCtrl.abort();
  signal?.addEventListener('abort', onExternalAbort);
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

  try {
    const raw = await Promise.race([
      api.get<unknown>(`/directions?${params.toString()}`),
      new Promise<never>((_, reject) => {
        timeoutCtrl.signal.addEventListener('abort', () => reject(new Error('directions request timed out')));
      }),
    ]);
    const data = (raw as { data?: unknown } | null)?.data ?? raw;
    const typed = data as { polyline?: unknown[]; durationS?: unknown } | null;

    if (Array.isArray(typed?.polyline) && typed.polyline.length > 0) {
      return {
        coords: (typed.polyline as Array<{ latitude: number; longitude: number }>).map(pt => ({
          latitude: pt.latitude,
          longitude: pt.longitude,
        })),
        durationSeconds: typeof typed.durationS === 'number' ? typed.durationS : null,
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
