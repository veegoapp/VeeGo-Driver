import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';

const BROADCAST_INTERVAL_MS = 5000;

interface Options {
  enabled: boolean;
  tripId?: number | string | null;
}

export function useLocationBroadcast({ enabled, tripId }: Options): void {
  const { socket } = useSocket();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripIdRef = useRef(tripId);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    let cancelled = false;

    const emit = async () => {
      if (!socket?.connected || cancelled) return;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude, speed, heading } = loc.coords;
        // Backend validates: lat ∈ [-90,90], lng ∈ [-180,180]
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;

        const payload: Record<string, unknown> = { latitude, longitude };
        if (speed != null && speed >= 0) payload.speed = Math.round(speed * 3.6); // m/s → km/h
        if (heading != null && heading >= 0) payload.heading = Math.round(heading);
        if (tripIdRef.current != null) payload.tripId = tripIdRef.current;

        socket.emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, payload);
      } catch {
        // best-effort; location or socket temporarily unavailable
      }
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        emit();
        intervalRef.current = setInterval(emit, BROADCAST_INTERVAL_MS);
      } catch {
        // expo-location unavailable (e.g., Expo Go simulator)
      }
    })();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, socket]);
}
