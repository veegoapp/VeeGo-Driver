import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type DriverPosition = {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
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

export function useDriverLocation(enabled = true): {
  position: DriverPosition | null;
  permissionDenied: boolean;
} {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setPermissionDenied(true);
          return;
        }
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 10,
          },
          (loc) => {
            setPosition({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              heading: loc.coords.heading ?? null,
              speed: loc.coords.speed ?? null,
            });
          }
        );
      } catch {
        // expo-location may not be available in Expo Go; fail silently
      }
    })();

    return () => {
      sub?.remove();
    };
  }, [enabled]);

  return { position, permissionDenied };
}
