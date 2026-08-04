import * as Location from 'expo-location';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { DriverPosition } from './useDriverLocation';

// ── GPS Context ────────────────────────────────────────────────────────────────

type GPSContextValue = {
  position: DriverPosition | null;
  permissionDenied: boolean;
  /**
   * Register as an active GPS consumer. Returns an unregister callback.
   * The shared watchPositionAsync subscription starts on the first call and
   * stops when the last consumer unregisters.
   */
  subscribe: () => () => void;
  /**
   * Forces an immediate permission re-check and, if now granted, (re)starts
   * the shared subscription — without waiting for an isActive transition or
   * an AppState foreground event. Call this right after a permission request
   * resolves (e.g. from startLocationTracking()) so the subscription starts
   * deterministically instead of relying on indirect signals.
   */
  recheckPermission: () => void;
};

const GPSContext = createContext<GPSContextValue>({
  position: null,
  permissionDenied: false,
  subscribe: () => () => {},
  recheckPermission: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Owns the single foreground watchPositionAsync subscription for the entire
 * Driver App. The subscription starts only when at least one consumer
 * (useDriverLocation, useLocationBroadcast, useActiveLocationTracking) registers
 * itself as active, and stops when the last consumer unregisters. GPS is
 * therefore never running while the driver is offline or no tracking is needed.
 *
 * Mount once at the root of the provider tree (app/_layout.tsx).
 *
 * The OS background location task (lib/backgroundLocationTask.ts) remains
 * completely independent — it must survive JS thread suspension and is
 * unaffected by this provider.
 */
export function GPSProvider({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [activeCount, setActiveCount] = useState(0);

  // isActive collapses the count to a boolean so the subscription effect only
  // re-runs on the 0↔1 boundary, not on every increment/decrement.
  const isActive = activeCount > 0;

  // Bumped by recheckPermission() and by the AppState listener below to force
  // the subscription effect to re-run its permission check even when isActive
  // hasn't changed. Without this, a consumer that mounted (and registered)
  // before permission was ever granted would have its one-time check
  // permanently conclude "denied" — nothing would re-check it after the
  // driver actually answers the OS prompt later, since isActive itself never
  // flips again just because permission changed.
  const [recheckTick, setRecheckTick] = useState(0);
  const recheckPermission = useCallback(() => setRecheckTick((t) => t + 1), []);

  // Passive safety net: re-check whenever the app returns to the foreground.
  // Covers permission changes made outside this component's own request flow
  // (e.g. via the OS Settings app) that recheckPermission() wouldn't catch.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') setRecheckTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  // ── Single watchPositionAsync — starts when any consumer is active ────────
  useEffect(() => {
    if (!isActive) return;

    let sub: Location.LocationSubscription | null = null;
    let mounted = true;

    (async () => {
      try {
        // Check only — never prompt. Permission is requested once by
        // startLocationTracking() when the driver first taps GO, which then
        // calls recheckPermission() to re-run this check immediately.
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        if (status !== 'granted') {
          setPermissionDenied(true);
          return;
        }
        setPermissionDenied(false);
        const s = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 4,
          },
          (loc) => {
            setPosition({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              heading: loc.coords.heading ?? null,
              speed: loc.coords.speed ?? null,
            });
          },
        );
        if (!mounted) {
          s.remove();
          return;
        }
        sub = s;
      } catch {
        // expo-location unavailable (e.g. web preview, Expo Go without permission)
      }
    })();

    return () => {
      mounted = false;
      sub?.remove();
      // Position is intentionally NOT reset here. Consumers that just
      // unregistered may still render briefly with the last known fix;
      // clearing it would cause a momentary null flicker. The value becomes
      // naturally stale but is never actively wrong.
    };
  }, [isActive, recheckTick]);

  // ── Consumer registration ─────────────────────────────────────────────────
  const subscribe = useCallback((): (() => void) => {
    setActiveCount((c) => c + 1);
    return () => setActiveCount((c) => Math.max(0, c - 1));
  }, []);

  const value = useMemo(
    () => ({ position, permissionDenied, subscribe, recheckPermission }),
    [position, permissionDenied, subscribe, recheckPermission],
  );

  return <GPSContext.Provider value={value}>{children}</GPSContext.Provider>;
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Access the shared GPS context. Used internally by useDriverLocation,
 * useLocationBroadcast, and useActiveLocationTracking — not for direct use
 * in screens (use useDriverLocation for that).
 */
export function useGPS(): GPSContextValue {
  return useContext(GPSContext);
}

/**
 * Screen-facing hook exposing only the ability to force a GPS permission
 * re-check — for callers (like home.tsx's startLocationTracking) that need
 * to signal GPSProvider after a permission request resolves, without pulling
 * in the full useGPS() context (position/subscribe are internal concerns).
 */
export function useGPSPermissionRecheck(): () => void {
  return useContext(GPSContext).recheckPermission;
}
