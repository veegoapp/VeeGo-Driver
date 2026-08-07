/**
 * snapPointToRoute — lateral map-matching for the driver marker.
 *
 * Projects a raw GPS fix onto the nearest segment of the active road route and
 * returns the point ON the road, so the marker glides along the street instead
 * of zig-zagging with GPS multipath noise (the "car jumps left/right / goes to
 * weird places" symptom). Returns null when the nearest point on the route is
 * farther than `maxSnapMeters` — i.e. the driver has genuinely left the route —
 * so the caller keeps the raw fix and the reroute logic (useNavigationRoute,
 * 50 m off-route threshold) can take over cleanly.
 *
 * Math: a local equirectangular metre frame centred on the fix (the point is
 * the origin), which is accurate at city scale and cheap. For each segment we
 * do the standard point→segment projection and keep the closest.
 *
 * Pure and allocation-light: no hooks, no state — safe to call once per GPS
 * tick inside a useMemo.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const M_PER_DEG_LAT = 111_320;

export function snapPointToRoute(
  point: LatLng,
  route: LatLng[] | null | undefined,
  maxSnapMeters: number,
): LatLng | null {
  if (!route || route.length < 2) return null;

  const latRad = (point.latitude * Math.PI) / 180;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(latRad);

  // Vertex → local metre offset from the fix (which sits at the origin).
  const toXY = (c: LatLng): { x: number; y: number } => ({
    x: (c.longitude - point.longitude) * mPerDegLng,
    y: (c.latitude - point.latitude) * M_PER_DEG_LAT,
  });

  let bestX = 0;
  let bestY = 0;
  let bestDistSq = Infinity;
  let found = false;

  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i]);
    const b = toXY(route[i + 1]);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;

    let px: number;
    let py: number;
    if (lenSq === 0) {
      px = a.x;
      py = a.y;
    } else {
      // Fix P is the origin (0,0), so AP = -A. t = dot(AP,AB)/|AB|² clamped.
      let t = -(a.x * abx + a.y * aby) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      px = a.x + t * abx;
      py = a.y + t * aby;
    }

    const distSq = px * px + py * py;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestX = px;
      bestY = py;
      found = true;
    }
  }

  if (!found) return null;
  if (Math.sqrt(bestDistSq) > maxSnapMeters) return null;

  return {
    latitude: point.latitude + bestY / M_PER_DEG_LAT,
    longitude: point.longitude + (mPerDegLng === 0 ? 0 : bestX / mPerDegLng),
  };
}
