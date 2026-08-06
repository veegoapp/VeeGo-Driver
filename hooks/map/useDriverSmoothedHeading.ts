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
// *from the last bearing anchor* — below it, GPS jitter dominates the direction
// and produces the constant left/right map shimmy (amplified by the camera's
// look-ahead). The anchor accumulates distance across fixes, so the heading
// still updates at slow speeds; it just won't be recomputed from ~1 m of noise.
const MIN_MOVE_FOR_BEARING_M = 5;
// Hysteresis: ignore target changes smaller than this so sub-threshold GPS
// noise never re-animates the rotation (which the camera follows). Real turns
// accumulate well past it and still slew smoothly, in coarse-but-steady steps.
const HEADING_DEADBAND_DEG = 6;
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
  // Position the last accepted bearing was measured from. Unlike prevPosRef
  // (which advances every fix, for speed), this only advances when a bearing is
  // actually taken — so distance accrues across slow-crawl fixes instead of
  // resetting each tick, and the heading neither goes stale nor jitters.
  const bearingAnchorRef = useRef<LatLng | null>(null);

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
    // Course of travel (positional bearing) is the only ongoing source — the
    // device compass (point.heading) is used ONLY to seed the very first
    // orientation, never for updates: its magnetometer noise is the primary
    // cause of the "sensor-game" left/right map spin.
    const anchor = bearingAnchorRef.current;
    let target: number | null = null;
    if (anchor) {
      const movedFromAnchor = haversineMeters(anchor.latitude, anchor.longitude, cur.latitude, cur.longitude);
      if (movedFromAnchor >= MIN_MOVE_FOR_BEARING_M) {
        target = calcBearing(anchor, cur);
        bearingAnchorRef.current = cur; // advance only when a bearing is taken
      }
    } else {
      // First fix while moving — set the anchor and, if we have a device
      // course, use it once so the car isn't stuck pointing north until it has
      // travelled the first few metres.
      bearingAnchorRef.current = cur;
      if (!seededRef.current && typeof point.heading === 'number' && Number.isFinite(point.heading)) {
        target = norm360(point.heading);
      }
    }
    if (target == null) return; // not enough movement yet → hold last stable heading
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
    // Dead-band: ignore sub-threshold wobble so the camera-followed rotation
    // isn't perpetually re-animated by GPS noise.
    if (Math.abs(delta) < HEADING_DEADBAND_DEG) return;
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
