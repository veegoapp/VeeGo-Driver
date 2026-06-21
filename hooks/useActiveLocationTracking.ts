import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { endpoints, type LocationSnapshot } from '@/lib/api';

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

async function clearPending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

async function syncPending(): Promise<void> {
  const pending = await readPending();
  if (pending.length === 0) return;

  // Purge from storage immediately before upload to minimise retention window
  await AsyncStorage.removeItem(PENDING_KEY);

  for (let i = 0; i < pending.length; i += BATCH_CHUNK) {
    const chunk = pending.slice(i, i + BATCH_CHUNK);
    await endpoints.tracking.sendBatch(chunk);
  }
}

async function captureSnapshot(
  tripId: number | null | undefined,
  rideId: number | null | undefined,
  isOfflineSync: boolean,
): Promise<LocationSnapshot | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      entityType: 'driver',
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      speed: pos.coords.speed ?? undefined,
      heading: pos.coords.heading ?? undefined,
      accuracy: pos.coords.accuracy ?? undefined,
      recordedAt: new Date(pos.timestamp).toISOString(),
      tripId: tripId ?? null,
      rideId: rideId ?? null,
      isOfflineSync,
    };
  } catch {
    return null;
  }
}

export function useActiveLocationTracking({ enabled, tripId, rideId }: Options): void {
  const tripIdRef = useRef(tripId);
  const rideIdRef = useRef(rideId);

  useEffect(() => {
    tripIdRef.current = tripId;
    rideIdRef.current = rideId;
  }, [tripId, rideId]);

  useEffect(() => {
    if (!enabled) return;

    async function tick() {
      const snapshot = await captureSnapshot(tripIdRef.current, rideIdRef.current, false);
      if (!snapshot) return;

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
