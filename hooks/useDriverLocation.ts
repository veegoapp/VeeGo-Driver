import { useEffect } from 'react';
import { useGPS } from './useGPSProvider';

export type DriverPosition = {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  /** Horizontal accuracy in meters (expo-location coords.accuracy). Null when
   *  the platform doesn't report it. Additive/optional — consumers that don't
   *  read it are unaffected. */
  accuracy: number | null;
  /** GPS fix capture time as epoch milliseconds (expo-location LocationObject
   *  .timestamp). Null when unavailable. */
  timestamp: number | null;
};

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns the live driver GPS position from the shared GPS provider.
 *
 * Public API is unchanged — all existing callers (home.tsx, ride/[rideId].tsx,
 * shuttle/trip-active.tsx) work without modification.
 *
 * Internally this hook no longer owns a watchPositionAsync subscription.
 * It registers as a consumer with GPSProvider (starting the shared subscription
 * if not already running) and reads the resulting position from context.
 * When `enabled` is false the hook unregisters and returns null, so GPS is
 * not running for screens that are off or in a non-tracking state.
 */
export function useDriverLocation(enabled = true): {
  position: DriverPosition | null;
  permissionDenied: boolean;
} {
  const { position, permissionDenied, subscribe } = useGPS();

  useEffect(() => {
    if (!enabled) return;
    // subscribe() returns the unregister fn; React calls it on cleanup.
    return subscribe();
  }, [enabled, subscribe]);

  return { position: enabled ? position : null, permissionDenied };
}
