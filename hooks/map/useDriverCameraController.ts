/**
 * useDriverCameraController  (Driver D3 — continuous follow)
 *
 * Replaces the stepped per-GPS-tick animateCamera nav-follow with a single rAF
 * setCamera loop that reads the shared interpolated position + smoothed heading
 * (from useDriverTrackingBuffer / useDriverSmoothedHeading). The camera no
 * longer follows raw GPS.
 *
 * Preserves the existing navigation style:
 *   - look-ahead offset (camera centre placed `lookAheadM` ahead of the driver
 *     along the smoothed heading — the Uber/Careem look)
 *   - course-up heading, pitch, zoom, altitude
 *   - pan suspension (userPannedRef), focusTarget priority
 *
 * setCamera (instant) is used for the follow loop because the source is already
 * smoothed — no per-call easing means no competing animations (no shake).
 * Discrete moves (recenter, focusTarget, initial fit) stay on animateCamera in
 * the component.
 *
 * Performance:
 *   - effective writes throttled to ~18 fps
 *   - dead-band: skip when the offset centre moved < MIN_MOVE_M AND the heading
 *     changed < MIN_HEADING_DEG → a stationary vehicle issues ~zero native calls
 */

import { useEffect, useRef } from 'react';
import type MapView from 'react-native-maps';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface Options {
  mapRef: React.RefObject<MapView | null>;
  positionRef: React.MutableRefObject<LatLng | null>;
  headingRef: React.MutableRefObject<number>;
  /** Follow runs only while true (navigationMode && mapReady). */
  enabled: boolean;
  /** User has grabbed the map — follow yields (existing pan suspension). */
  userPannedRef: React.MutableRefObject<boolean>;
  /** A focusTarget owns the camera — follow yields. */
  focusActive: boolean;
  pitch?: number;
  zoom?: number;
  altitude?: number;
  lookAheadM?: number;
}

const WRITE_INTERVAL_MS = 1000 / 18;
const MIN_MOVE_M = 1;
const MIN_HEADING_DEG = 0.5;
const EARTH_R = 6_371_000;

function offsetCoord(origin: LatLng, bearingDeg: number, distanceM: number): LatLng {
  const d = distanceM / EARTH_R;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lng1 = (origin.longitude * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { latitude: (lat2 * 180) / Math.PI, longitude: (lng2 * 180) / Math.PI };
}

function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = (b.latitude - a.latitude) * 111320;
  const dLng = (b.longitude - a.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function headingDiff(a: number, b: number): number {
  return Math.abs(((b - a + 540) % 360) - 180);
}

export function useDriverCameraController({
  mapRef,
  positionRef,
  headingRef,
  enabled,
  userPannedRef,
  focusActive,
  pitch = 25,
  zoom = 18,
  altitude = 160,
  lookAheadM = 100,
}: Options): void {
  const focusActiveRef = useRef(focusActive);
  useEffect(() => { focusActiveRef.current = focusActive; }, [focusActive]);

  const lastWriteAtRef = useRef(0);
  const lastCenterRef = useRef<LatLng | null>(null);
  const lastHeadingRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastCenterRef.current = null;
      return;
    }

    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      rafRef.current = requestAnimationFrame(tick);

      // Yield to the user (pan suspension) or a focusTarget.
      if (userPannedRef.current || focusActiveRef.current) return;
      const pos = positionRef.current;
      if (!pos) return;

      const now = Date.now();
      if (now - lastWriteAtRef.current < WRITE_INTERVAL_MS) return;

      const heading = headingRef.current;
      const center = offsetCoord(pos, heading, lookAheadM);

      const last = lastCenterRef.current;
      if (
        last &&
        metersBetween(last, center) < MIN_MOVE_M &&
        headingDiff(lastHeadingRef.current, heading) < MIN_HEADING_DEG
      ) {
        return; // dead-band — nothing meaningful changed
      }

      mapRef.current?.setCamera({ center, heading, pitch, zoom, altitude });
      lastWriteAtRef.current = now;
      lastCenterRef.current = center;
      lastHeadingRef.current = heading;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, mapRef, positionRef, headingRef, userPannedRef, pitch, zoom, altitude, lookAheadM]);
}
