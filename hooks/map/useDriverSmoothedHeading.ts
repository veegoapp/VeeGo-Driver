/**
 * useDriverSmoothedHeading  (Driver D2 — one heading source)
 *
 * Single smoothed heading for BOTH the marker rotation and the camera course.
 * Replaces the two independent bearing calculations that previously lived in
 * AnimatedDriverMarker and MapBackdrop.
 *
 * Behavior:
 *   - Circular shortest-path rotation (359°→1° rotates forward, never a long
 *     backspin) via a continuous unwrapped accumulator.
 *   - Smooth slew with Animated.timing (no snapping).
 *   - Speed-gated freeze: below SPEED_FREEZE_MS the heading is held, so a
 *     stationary/crawling vehicle doesn't spin on GPS noise.
 *   - Bearing source: positional bearing between consecutive fixes when the
 *     vehicle has actually moved a meaningful distance; otherwise the device
 *     heading; speed comes from point.speed when present, else derived from
 *     distance/time.
 *
 * Outputs:
 *   - rotation   : Animated.Value (continuous degrees) for <MarkerAnimated rotation={…}/>
 *   - headingRef : latest smoothed heading in [0,360) for the camera controller
 */

import { useEffect, useRef, type MutableRefObject } from 'react';
import { Animated } from 'react-native';
import { haversineMeters } from '@/hooks/useDriverLocation';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface DriverPoint extends LatLng {
  heading?: number | null;
  speed?: number | null;
}

const SPEED_FREEZE_MS = 1.5; // ~5.4 km/h
const ROTATION_MS = 400;
// Only trust a positional bearing once the vehicle has moved at least this far
// since the last bearing fix — below it, GPS jitter dominates the direction.
const MIN_MOVE_FOR_BEARING_M = 2;
const MAX_JUMP_M = 500;

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

function calcBearing(from: LatLng, to: LatLng): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function shortestDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function useDriverSmoothedHeading(point: DriverPoint | null | undefined): {
  rotation: Animated.Value;
  headingRef: MutableRefObject<number>;
} {
  const rotation = useRef(new Animated.Value(0)).current;
  const headingRef = useRef<number>(0);

  const lastStableRef = useRef<number>(0);
  const continuousRef = useRef<number>(0);
  const prevPosRef = useRef<LatLng | null>(null);
  const prevTimeRef = useRef<number>(0);
  const seededRef = useRef<boolean>(false);
  const lastAcceptedRef = useRef<LatLng | null>(null);

  // Keep a plain-number mirror of the animated rotation for the camera.
  useEffect(() => {
    const id = rotation.addListener(({ value }) => {
      headingRef.current = norm360(value);
    });
    return () => rotation.removeListener(id);
  }, [rotation]);

  useEffect(() => {
    if (!point) return;
    if (!inRange(point.latitude, point.longitude)) return;
    const prevAccepted = lastAcceptedRef.current;
    if (
      prevAccepted &&
      haversineMeters(prevAccepted.latitude, prevAccepted.longitude, point.latitude, point.longitude) >
        MAX_JUMP_M
    ) {
      return; // same impossible-jump gate as the buffer, keeps the two in step
    }

    const now = Date.now();
    const cur: LatLng = { latitude: point.latitude, longitude: point.longitude };
    const prev = prevPosRef.current;
    const movedM = prev ? haversineMeters(prev.latitude, prev.longitude, cur.latitude, cur.longitude) : 0;

    // ── Effective speed (m/s) ──────────────────────────────────────────────
    let speed = typeof point.speed === 'number' && point.speed >= 0 ? point.speed : null;
    if (speed == null && prev && prevTimeRef.current > 0) {
      const dtSec = (now - prevTimeRef.current) / 1000;
      if (dtSec > 0) speed = movedM / dtSec;
    }
    prevPosRef.current = cur;
    prevTimeRef.current = now;
    lastAcceptedRef.current = cur;

    const moving = speed == null || speed >= SPEED_FREEZE_MS;
    if (!moving) return; // low speed → freeze (hold last stable heading)

    // ── Choose a bearing ───────────────────────────────────────────────────
    let target: number | null = null;
    if (prev && movedM >= MIN_MOVE_FOR_BEARING_M) {
      target = calcBearing(prev, cur); // course of travel — most reliable while moving
    } else if (typeof point.heading === 'number' && Number.isFinite(point.heading)) {
      target = norm360(point.heading);
    }
    if (target == null) return;
    target = norm360(target);

    // ── Seed instantly, then slew along the shortest arc ───────────────────
    if (!seededRef.current) {
      seededRef.current = true;
      lastStableRef.current = target;
      continuousRef.current = target;
      headingRef.current = target;
      rotation.setValue(target);
      return;
    }

    const delta = shortestDelta(lastStableRef.current, target);
    if (delta === 0) return;
    lastStableRef.current = target;
    continuousRef.current += delta;
    Animated.timing(rotation, {
      toValue: continuousRef.current,
      duration: ROTATION_MS,
      useNativeDriver: false,
    }).start();
  }, [point?.latitude, point?.longitude, point?.heading, point?.speed, rotation]);

  return { rotation, headingRef };
}
