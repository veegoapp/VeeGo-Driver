import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef } from 'react';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';
import { endpoints } from '@/lib/api';
import { DRIVER_LOCATION_TASK } from '@/lib/backgroundLocationTask';
import { useGPS } from './useGPSProvider';

const BROADCAST_INTERVAL_MS = 5000;

interface Options {
  enabled: boolean;
  tripId?: number | string | null;
  // Active-ride mode (Car/Scooter/Delivery): when set, emits the confirmed
  // driver:ride:location contract instead of the shuttle tripId broadcast below.
  rideId?: number | string | null;
}

/**
 * Broadcasts the driver's GPS position to the backend at most every
 * BROADCAST_INTERVAL_MS (5 s). Position is read from the shared GPSProvider
 * instead of independently polling getCurrentPositionAsync.
 *
 * Behavior:
 *   - socket vs REST fallback
 *   - rideId-scoped driver:ride:location (now includes heading) vs general
 *     driver:location:update
 *   - background task suppression for the REST idle path
 *   - tripId inclusion for shuttle trips
 *   - 5 s rate limit
 *
 * A non-null position from GPSProvider implies foreground permission was
 * already granted, so no separate permission check is needed here.
 */
export function useLocationBroadcast({ enabled, tripId, rideId }: Options): void {
  const { socket } = useSocket();
  const { position, subscribe } = useGPS();

  const socketRef = useRef(socket);
  const tripIdRef = useRef(tripId);
  const rideIdRef = useRef(rideId);
  const lastBroadcastAtRef = useRef<number>(0);
  // Cached after the first async check so the broadcast effect doesn't re-query every tick.
  const bgTaskRegisteredRef = useRef(false);

  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { tripIdRef.current = tripId; }, [tripId]);
  useEffect(() => { rideIdRef.current = rideId; }, [rideId]);

  // Register with the GPS provider while enabled.
  useEffect(() => {
    if (!enabled) return;
    return subscribe();
  }, [enabled, subscribe]);

  // Detect whether the OS-level background task is already running once per
  // enabled session. In a native build, startLocationTracking() registers
  // DRIVER_LOCATION_TASK which handles REST updates independently; the
  // setInterval below is still needed for Socket.IO real-time delivery, but
  // the REST fallback inside the broadcast effect is suppressed to avoid
  // double-posting. In Expo Go, TaskManager is unavailable — ref stays false
  // and the REST fallback remains the sole update mechanism when offline.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const registered = await TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK);
        if (!cancelled) bgTaskRegisteredRef.current = registered;
      } catch {
        // Expo Go — TaskManager unavailable; ref stays false
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  // Broadcast on every incoming GPS position, rate-limited to
  // BROADCAST_INTERVAL_MS. The effect fires at ~1 Hz (GPS rate) but skips
  // most ticks via the elapsed-time guard, matching the original 5 s cadence.
  useEffect(() => {
    if (!enabled || !position) return;

    const now = Date.now();
    if (now - lastBroadcastAtRef.current < BROADCAST_INTERVAL_MS) return;
    lastBroadcastAtRef.current = now;

    const { latitude, longitude, speed, heading, accuracy, timestamp } = position;
    const currentRideId = rideIdRef.current ?? undefined;
    const sock = socketRef.current;
    const speedKmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : undefined;
    const headingDeg = heading != null && heading >= 0 ? Math.round(heading) : undefined;
    // Ride-channel enrichment (Phase 1). Raw sensor units — NOT converted:
    //   speedMs    : metres/second straight from GPS (the idle channel below
    //                still sends km/h; the ride channel intentionally differs
    //                because downstream interpolation/dead-reckoning wants m/s).
    //   accuracyM  : horizontal accuracy in metres.
    //   fixTs      : GPS fix capture time as epoch milliseconds.
    // Each is emitted only when valid so the payload stays backward compatible.
    const speedMs = speed != null && speed >= 0 ? speed : undefined;
    const accuracyM = accuracy != null && accuracy >= 0 ? accuracy : undefined;
    const fixTs = timestamp != null ? timestamp : undefined;

    // Active-ride mode: use the confirmed driver:ride:location contract
    // (rideId, latitude, longitude, heading, speed, accuracy, timestamp) —
    // socket-only. No REST fallback exists for this contract;
    // useActiveLocationTracking already covers the disconnected/offline case
    // for rides via its own REST channel.
    // heading is included so the passenger app's driver marker (and, once the
    // backend forwards it, the camera bearing) can track the driver's facing
    // direction instead of always rendering north-up. speed/accuracy/timestamp
    // are additive Phase-1 fields the backend currently strips (non-strict
    // schema) and will forward in a later phase — sending them now is a no-op
    // for existing passenger behavior.
    if (currentRideId != null) {
      if (sock?.connected) {
        const ridePayload: Record<string, unknown> = { rideId: currentRideId, latitude, longitude };
        if (headingDeg !== undefined) ridePayload.heading = headingDeg;
        if (speedMs !== undefined) ridePayload.speed = speedMs;
        if (accuracyM !== undefined) ridePayload.accuracy = accuracyM;
        if (fixTs !== undefined) ridePayload.timestamp = fixTs;
        sock.emit(SOCKET_EVENTS.DRIVER_RIDE_LOCATION, ridePayload);
      }
      return;
    }

    const currentTripId = tripIdRef.current ?? undefined;
    // Backend's driver:location:update schema requires tripId as a positive
    // integer (z.number().int().positive()); shuttle callers can pass it as
    // a string, so normalize here — the one place the socket payload is built.
    const currentTripIdNum = currentTripId != null ? Number(currentTripId) : undefined;
    const isValidTripId = currentTripIdNum !== undefined
      && Number.isInteger(currentTripIdNum) && currentTripIdNum > 0;

    // Try socket first (real-time), fall back to REST when disconnected.
    if (sock?.connected) {
      const payload: Record<string, unknown> = { latitude, longitude };
      if (speedKmh !== undefined) payload.speed = speedKmh;
      if (headingDeg !== undefined) payload.heading = headingDeg;
      if (isValidTripId) payload.tripId = currentTripIdNum;
      sock.emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, payload);
    } else {
      // When the OS-level background task is registered it already sends REST
      // updates — skip the duplicate call unless we carry a tripId that the
      // background task doesn't include.
      if (bgTaskRegisteredRef.current && currentTripId == null) return;
      endpoints.driver.updateLocation({
        latitude,
        longitude,
        ...(speedKmh !== undefined && { speed: speedKmh }),
        ...(headingDeg !== undefined && { heading: headingDeg }),
        ...(currentTripId != null && { tripId: currentTripId }),
      }).catch(() => {
        // REST also failed — will retry on the next GPS tick
      });
    }
  }, [enabled, position]);
}
