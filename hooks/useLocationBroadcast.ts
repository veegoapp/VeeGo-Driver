import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';
import { endpoints } from '@/lib/api';

const BROADCAST_INTERVAL_MS = 5000;

interface Options {
  enabled: boolean;
  tripId?: number | string | null;
}

export function useLocationBroadcast({ enabled, tripId }: Options): void {
  const { socket } = useSocket();
  const socketRef = useRef(socket);
  const tripIdRef = useRef(tripId);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const permissionGrantedRef = useRef(false);

  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { tripIdRef.current = tripId; }, [tripId]);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    let cancelled = false;

    const emit = async () => {
      if (cancelled) return;
      if (!permissionGrantedRef.current) return;

      let loc: Location.LocationObject;
      try {
        loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch {
        return;
      }

      const { latitude, longitude, speed, heading } = loc.coords;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;

      const speedKmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : undefined;
      const headingDeg = heading != null && heading >= 0 ? Math.round(heading) : undefined;
      const tripId = tripIdRef.current ?? undefined;

      // Try socket first (real-time), always fall back to REST
      const sock = socketRef.current;
      if (sock?.connected) {
        const payload: Record<string, unknown> = { latitude, longitude };
        if (speedKmh !== undefined) payload.speed = speedKmh;
        if (headingDeg !== undefined) payload.heading = headingDeg;
        if (tripId != null) payload.tripId = tripId;
        sock.emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, payload);
      } else {
        // Socket not connected — use REST endpoint so admin dashboard always gets updates
        try {
          await endpoints.driver.updateLocation({
            latitude,
            longitude,
            ...(speedKmh !== undefined && { speed: speedKmh }),
            ...(headingDeg !== undefined && { heading: headingDeg }),
            ...(tripId != null && { tripId }),
          });
        } catch {
          // REST also failed — will retry on next tick
        }
      }
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        permissionGrantedRef.current = true;
        emit();
        intervalRef.current = setInterval(emit, BROADCAST_INTERVAL_MS);
      } catch {
        // expo-location unavailable
      }
    })();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);
}
