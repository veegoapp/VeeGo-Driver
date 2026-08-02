import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { endpoints, type LocationSnapshot } from '@/lib/api';
import { useGPS } from './useGPSProvider';

const PENDING_KEY = 'veego_pending_locations';
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_CHUNK = 500;
const MAX_PENDING = 50;

interface Options {
  enabled: boolean;
  tripId?: number | null;
  rideId?: number | null;
}

async function readPending(): Promise<LocationSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as LocationSnapshot[]) : [];
  } catch {
    return [];
  }
}

async function appendPending(snapshot: LocationSnapshot): Promise<void> {
  try {
    const existing = await readPending();
    if (existing.length >= MAX_PENDING) {
      // Cap reached — flush before appending (best-effort, fire and forget)
      syncPending().catch(() => {});
      return;
    }
    existing.push(snapshot);
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(existing));
  } catch {
    // storage write failed — snapshot is lost; prefer not crashing
  }
}

async function syncPending(): Promise<void> {
  const pending = await readPending();
  if (pending.length === 0) return;

  // Upload chunk by chunk; only remove each chunk from storage after the
  // server confirms receipt. If a batch fails, re-queue the failed chunk
  // and all remaining items so they are retried on the next sync cycle.
  const failed: LocationSnapshot[] = [];

  for (let i = 0; i < pending.length; i += BATCH_CHUNK) {
    const chunk = pending.slice(i, i + BATCH_CHUNK);
    try {
      await endpoints.tracking.sendBatch(chunk);
    } catch {
      // Upload failed — keep this chunk and everything after it for retry
      failed.push(...pending.slice(i));
      break;
    }
  }

  if (failed.length === 0) {
    await AsyncStorage.removeItem(PENDING_KEY);
  } else {
    try {
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(failed));
    } catch {
      // Storage write failed — data may be lost, but prefer not crashing
    }
  }
}

/**
 * Persists driver location at 5-minute intervals for auditing and offline
 * recovery. Position is read from the shared GPSProvider instead of calling
 * getCurrentPositionAsync independently.
 *
 * All existing behavior is preserved:
 *   - 5-minute persistence interval
 *   - offline queue (AsyncStorage) with chunked batch sync
 *   - NetInfo reconnect flush
 *   - all existing API contracts (sendLocation / sendBatch)
 *   - payload fixes: recordedAt uses new Date().toISOString(),
 *     rideId/tripId omitted unless valid positive integers
 */
export function useActiveLocationTracking({ enabled, tripId, rideId }: Options): void {
  const { position, subscribe } = useGPS();

  const tripIdRef = useRef(tripId);
  const rideIdRef = useRef(rideId);
  // Mirror position into a ref so the setInterval tick closure always reads
  // the latest fix without needing to be recreated on every GPS update.
  const positionRef = useRef(position);

  useEffect(() => {
    tripIdRef.current = tripId;
    rideIdRef.current = rideId;
  }, [tripId, rideId]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Register with the GPS provider while enabled.
  useEffect(() => {
    if (!enabled) return;
    return subscribe();
  }, [enabled, subscribe]);

  useEffect(() => {
    if (!enabled) return;

    async function tick() {
      const pos = positionRef.current;
      if (!pos) return; // no GPS fix available yet

      const snapshot: LocationSnapshot = {
        entityType: 'driver',
        latitude: pos.latitude,
        longitude: pos.longitude,
        speed: pos.speed != null && pos.speed >= 0 ? pos.speed : undefined,
        heading: pos.heading != null && pos.heading >= 0 ? pos.heading : undefined,
        // Wall-clock time — not the GPS hardware timestamp — for consistent
        // ISO strings that always pass backend validation.
        recordedAt: new Date().toISOString(),
        // Only include tripId / rideId when they are valid positive integers.
        // Sending null, undefined, or 0 fails backend payload validation.
        ...(tripIdRef.current != null && tripIdRef.current > 0
          ? { tripId: tripIdRef.current }
          : {}),
        ...(rideIdRef.current != null && rideIdRef.current > 0
          ? { rideId: rideIdRef.current }
          : {}),
        isOfflineSync: false,
      };

      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;

      if (isOnline) {
        try {
          await syncPending();
          await endpoints.tracking.sendLocation(snapshot);
        } catch {
          await appendPending({ ...snapshot, isOfflineSync: true });
        }
      } else {
        await appendPending({ ...snapshot, isOfflineSync: true });
      }
    }

    tick();
    const intervalId = setInterval(tick, INTERVAL_MS);

    const unsubscribeNetInfo = NetInfo.addEventListener(async (state) => {
      const nowOnline = state.isConnected && state.isInternetReachable !== false;
      if (nowOnline) {
        const pending = await readPending();
        if (pending.length > 0) {
          try {
            await syncPending();
          } catch {
            // sync failed — will retry on next tick or reconnect
          }
        }
      }
    });

    return () => {
      clearInterval(intervalId);
      unsubscribeNetInfo();
    };
  }, [enabled]);

  // Flush remaining snapshots when the trip ends
  useEffect(() => {
    if (enabled) return;
    readPending().then(async (pending) => {
      if (pending.length === 0) return;
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;
      if (isOnline) {
        try {
          await syncPending();
        } catch {
          // best-effort flush; snapshots remain in storage for next session
        }
      }
    });
  }, [enabled]);
}
