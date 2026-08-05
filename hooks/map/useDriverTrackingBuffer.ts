/**
 * useDriverTrackingBuffer  (Driver D1 — unified interpolated position)
 *
 * One interpolation source for BOTH the driver marker and the follow camera.
 * Mirrors the passenger app's useTrackingBuffer concept, adapted to the driver
 * map. A single clock computes one interpolated frame per tick and commits it
 * to both:
 *   - animatedCoord  → the MarkerAnimated coordinate
 *   - positionRef    → read by the camera controller
 * so the marker and camera can never diverge, and the camera stops following
 * raw GPS.
 *
 * Behavior:
 *   - Interpolates between fixes using the REAL arrival interval (clamped),
 *     not a fixed animation duration → no freeze between updates, no overlap.
 *   - Retargets from the CURRENT rendered position on each new fix, so a late
 *     or bursty fix glides instead of snapping.
 *   - Holds at the newest fix when a segment completes (gap handling).
 *
 * Lightweight GPS safety (D1): a fix is ignored (marker/camera keep gliding
 * toward the last good target) when it is non-finite, out of range, or an
 * impossible jump from the last accepted fix. Intentionally minimal — it does
 * not smooth or average, only rejects clearly bad points.
 */

import { useEffect, useRef, type MutableRefObject } from 'react';
import { AnimatedRegion } from 'react-native-maps';
import { haversineMeters } from '@/hooks/useDriverLocation';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface DriverPoint extends LatLng {
  heading?: number | null;
  speed?: number | null;
}

// ~1 Hz GPS; clamp segment length so a fast burst still eases and a long stall
// doesn't produce an absurdly slow glide.
const MIN_SEGMENT_MS = 300;
const MAX_SEGMENT_MS = 4000;
const FRAME_MS = 1000 / 30;
// A single fix that jumps more than this from the last accepted position is
// treated as a GPS glitch and ignored.
const MAX_JUMP_M = 500;

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function useDriverTrackingBuffer(point: DriverPoint | null | undefined): {
  animatedCoord: AnimatedRegion;
  positionRef: MutableRefObject<LatLng | null>;
} {
  const seedValid = point && inRange(point.latitude, point.longitude);
  const initLat = seedValid ? point!.latitude : 0;
  const initLng = seedValid ? point!.longitude : 0;

  const animatedCoord = useRef(
    new AnimatedRegion({
      latitude: initLat,
      longitude: initLng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  // The single interpolated position, written alongside animatedCoord. Null
  // until the first valid fix — the camera must not follow a seed coordinate.
  const positionRef = useRef<LatLng | null>(null);

  const fromRef = useRef<LatLng>({ latitude: initLat, longitude: initLng });
  const toRef = useRef<LatLng>({ latitude: initLat, longitude: initLng });
  const segStartRef = useRef(0);
  const segDurRef = useRef(0);
  const lastArrivalRef = useRef(0);
  const seededRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Last ACCEPTED position — used for the impossible-jump gate.
  const lastAcceptedRef = useRef<LatLng | null>(null);

  // One place that commits a computed frame to both outputs.
  const commitFrame = (latitude: number, longitude: number) => {
    animatedCoord.setValue({ latitude, longitude, latitudeDelta: 0, longitudeDelta: 0 });
    positionRef.current = { latitude, longitude };
  };

  useEffect(() => {
    if (!point) return;

    // ── GPS safety (D1) ────────────────────────────────────────────────────
    if (!inRange(point.latitude, point.longitude)) return; // invalid numbers / out of range
    const prevAccepted = lastAcceptedRef.current;
    if (
      prevAccepted &&
      haversineMeters(prevAccepted.latitude, prevAccepted.longitude, point.latitude, point.longitude) >
        MAX_JUMP_M
    ) {
      return; // impossible jump — ignore this fix
    }

    const now = Date.now();

    if (!seededRef.current) {
      // First valid fix → instant seed, no glide.
      fromRef.current = { latitude: point.latitude, longitude: point.longitude };
      toRef.current = { latitude: point.latitude, longitude: point.longitude };
      segStartRef.current = now;
      segDurRef.current = 0;
      seededRef.current = true;
      commitFrame(point.latitude, point.longitude);
    } else {
      // Retarget from the CURRENT interpolated position so nothing snaps.
      const dur = segDurRef.current;
      const f = dur <= 0 ? 1 : Math.min(1, Math.max(0, (now - segStartRef.current) / dur));
      fromRef.current = {
        latitude: fromRef.current.latitude + (toRef.current.latitude - fromRef.current.latitude) * f,
        longitude:
          fromRef.current.longitude + (toRef.current.longitude - fromRef.current.longitude) * f,
      };
      toRef.current = { latitude: point.latitude, longitude: point.longitude };
      segStartRef.current = now;
      // Pace on real arrival interval (clamped) — not a fixed duration.
      const dt = now - lastArrivalRef.current;
      segDurRef.current = Math.min(MAX_SEGMENT_MS, Math.max(MIN_SEGMENT_MS, dt));

      if (timerRef.current == null) {
        timerRef.current = setInterval(() => {
          const t = Date.now();
          const d = segDurRef.current;
          const frac = d <= 0 ? 1 : Math.min(1, Math.max(0, (t - segStartRef.current) / d));
          const lat =
            fromRef.current.latitude + (toRef.current.latitude - fromRef.current.latitude) * frac;
          const lng =
            fromRef.current.longitude + (toRef.current.longitude - fromRef.current.longitude) * frac;
          commitFrame(lat, lng);
          if (frac >= 1 && timerRef.current != null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }, FRAME_MS);
      }
    }

    lastArrivalRef.current = now;
    lastAcceptedRef.current = { latitude: point.latitude, longitude: point.longitude };
    // point.heading / point.speed are intentionally ignored here — handled by
    // useDriverSmoothedHeading. This hook owns position only.
  }, [point?.latitude, point?.longitude]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { animatedCoord, positionRef };
}
