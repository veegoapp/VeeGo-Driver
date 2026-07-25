import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef } from 'react';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';
import { endpoints } from '@/lib/api';
import { DRIVER_LOCATION_TASK } from '@/lib/backgroundLocationTask';

const BROADCAST_INTERVAL_MS = 5000;

interface Options {
  enabled: boolean;
  tripId?: number | string | null;
  // Active-ride mode (Car/Scooter/Delivery): when set, emits the confirmed
  // driver:ride:location contract instead of the shuttle tripId broadcast below.
  rideId?: number | string | null;
}

export function useLocationBroadcast({ enabled, tripId, rideId }: Options): void {
  const { socket } = useSocket();
  const socketRef = useRef(socket);
  const tripIdRef = useRef(tripId);
  const rideIdRef = useRef(rideId);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const permissionGrantedRef = useRef(false);
  // Cached after the first async check so emit() doesn't re-query every 5 s.
  const bgTaskRegisteredRef = useRef(false);

  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { tripIdRef.current = tripId; }, [tripId]);
  useEffect(() => { rideIdRef.current = rideId; }, [rideId]);

  useEffect(() => {
    if (!enabled) return;

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

      const currentRideId = rideIdRef.current ?? undefined;
      const sock = socketRef.current;

      // Active-ride mode: use the confirmed driver:ride:location contract
      // exactly (rideId, latitude, longitude) — socket-only. No REST fallback
      // exists for this contract; useActiveLocationTracking already covers
      // the disconnected/offline case for rides via its own REST channel.
      if (currentRideId != null) {
        if (sock?.connected) {
          sock.emit(SOCKET_EVENTS.DRIVER_RIDE_LOCATION, { rideId: currentRideId, latitude, longitude });
        }
        return;
      }

      const speedKmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : undefined;
      const headingDeg = heading != null && heading >= 0 ? Math.round(heading) : undefined;
      const currentTripId = tripIdRef.current ?? undefined;

      // Try socket first (real-time), always fall back to REST
      if (sock?.connected) {
        const payload: Record<string, unknown> = { latitude, longitude };
        if (speedKmh !== undefined) payload.speed = speedKmh;
        if (headingDeg !== undefined) payload.heading = headingDeg;
        if (currentTripId != null) payload.tripId = currentTripId;
        sock.emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, payload);
      } else {
        // Socket not connected.
        // When the OS-level background task is registered it already sends REST
        // updates via endpoints.driver.updateLocation — skip the duplicate call
        // unless we carry a tripId that the background task doesn't include.
        if (bgTaskRegisteredRef.current && currentTripId == null) return;
        try {
          await endpoints.driver.updateLocation({
            latitude,
            longitude,
            ...(speedKmh !== undefined && { speed: speedKmh }),
            ...(headingDeg !== undefined && { heading: headingDeg }),
            ...(currentTripId != null && { tripId: currentTripId }),
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

        // Detect whether the OS-level background task is already running.
        // In a native build startLocationTracking() registers DRIVER_LOCATION_TASK
        // which handles REST updates at 10 s / 50 m intervals. The setInterval
        // below is still needed for Socket.IO real-time delivery, but the REST
        // fallback inside emit() is suppressed to avoid double-posting.
        // In Expo Go, TaskManager is unavailable — bgTaskRegisteredRef stays false
        // and the REST fallback remains active as the sole update mechanism.
        try {
          bgTaskRegisteredRef.current = await TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK);
        } catch {
          // Expo Go — task manager not available
        }

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
