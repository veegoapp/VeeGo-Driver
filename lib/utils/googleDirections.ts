import { api } from '@/lib/api';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface DirectionsResult {
  coords: LatLng[];
  durationSeconds: number | null;
}

function decodePolyline(encoded: string): LatLng[] {
  const result: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, value = 0;
    do { b = encoded.charCodeAt(index++) - 63; value |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += value & 1 ? ~(value >> 1) : value >> 1;
    shift = 0; value = 0;
    do { b = encoded.charCodeAt(index++) - 63; value |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += value & 1 ? ~(value >> 1) : value >> 1;
    result.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return result;
}

/**
 * Fetches a road-snapped route from the backend.
 * The backend proxies Google Directions so no API key is needed in the app.
 *
 * Backend contract:
 *   GET /api/directions?origin=lat,lng&destination=lat,lng[&waypoints=lat,lng|...]
 *   Response: { polyline: [{latitude, longitude},...], durationS: number, distanceM: number }
 *             (or wrapped as { data: { polyline, durationS, distanceM } })
 */
export async function fetchGoogleRoute(
  origin: LatLng,
  waypoints: LatLng[],
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

  try {
    const raw = await api.get<unknown>(`/directions?${params.toString()}`);
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
  }
}
