import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '@/constants/mapStyle';
import { getToken } from '@/lib/auth';
import { haversineMeters } from '@/hooks/useDriverLocation';
import { useService } from '@/lib/serviceContext';


import type { SurgeZone } from '@/lib/types';
export type { SurgeZone } from '@/lib/types';

export interface MapBackdropProps {
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  driverLocation?: { latitude: number; longitude: number; heading?: number | null; speed?: number | null };
  surgeZones?: SurgeZone[];
  routePolyline?: Array<{ latitude: number; longitude: number }>;
  roadPolyline?: Array<{ latitude: number; longitude: number }>;
  stationStatuses?: ('pending' | 'current' | 'completed')[];
  approachCircle?: { latitude: number; longitude: number; radius: number } | null;
  focusTarget?: { latitude: number; longitude: number; zoom?: number } | null;
  navigationMode?: boolean;
  animDurationMs?: number;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function calcBearing(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * EMA-style angular smoothing. Blends `next` toward `prev` along the
 * shortest arc so jumps across 0°/360° are handled correctly.
 * alpha ∈ (0,1]: higher = more responsive, lower = smoother.
 */
function smoothAngle(prev: number | null, next: number, alpha: number): number {
  if (prev === null) return next;
  const diff = ((next - prev + 540) % 360) - 180; // shortest arc, −180..+180
  return (prev + alpha * diff + 360) % 360;
}

/**
 * Returns a coordinate shifted from `origin` by `distanceM` metres in the
 * direction of `bearingDeg` (0 = north, clockwise). Used to move the camera
 * centre ahead of the driver so more road is visible in front of the vehicle.
 */
function offsetCoord(
  origin: { latitude: number; longitude: number },
  bearingDeg: number,
  distanceM: number,
): { latitude: number; longitude: number } {
  const R = 6_371_000;
  const d = distanceM / R;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lng1 = (origin.longitude * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { latitude: (lat2 * 180) / Math.PI, longitude: (lng2 * 180) / Math.PI };
}

function surgeColor(multiplier: number): string {
  if (multiplier >= 2.0) return 'rgba(239,68,68,0.14)';
  if (multiplier >= 1.5) return 'rgba(249,115,22,0.14)';
  return 'rgba(213,178,61,0.13)';
}

function surgeStrokeColor(multiplier: number): string {
  if (multiplier >= 2.0) return 'rgba(239,68,68,0.6)';
  if (multiplier >= 1.5) return 'rgba(249,115,22,0.6)';
  return 'rgba(213,178,61,0.6)';
}

// Generates lat/lng ring for a dashed approach circle (Polyline-based, works on both platforms).
function circleCoords(
  center: { latitude: number; longitude: number },
  radiusM: number,
  steps = 64,
): Array<{ latitude: number; longitude: number }> {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusM * Math.cos(angle);
    const dy = radiusM * Math.sin(angle);
    const dLat = dy / 111320;
    const dLng = dx / (111320 * Math.cos((center.latitude * Math.PI) / 180));
    return { latitude: center.latitude + dLat, longitude: center.longitude + dLng };
  });
}

const DEFAULT_CENTER = { latitude: 30.0444, longitude: 31.2357 }; // Cairo fallback

// Custom Marker children that contain an <Svg> take an extra frame to paint on
// Android before react-native-maps can snapshot them into a bitmap. With
// tracksViewChanges locked to false from the very first render, that snapshot
// can be taken before the Svg has painted, leaving the marker permanently
// blank — no further re-render ever comes along to retake it. Keeping
// tracksViewChanges true until the double-rAF after onLayout guarantees at
// least one snapshot is taken after the Svg has actually painted, then it's
// switched off for normal performance. State lives in its own component so a
// fresh mount (navigationMode toggling the parent Marker in/out) always
// starts with a fresh, unpainted flag instead of a stale "already painted".
function DriverNavCarMarker({
  coordinate,
  rotation,
}: {
  coordinate: { latitude: number; longitude: number };
  rotation: number;
}) {
  const [painted, setPainted] = useState(false);

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={rotation}
      tracksViewChanges={!painted}
    >
      <View
        style={styles.driverNavOuter}
        onLayout={() => {
          requestAnimationFrame(() => requestAnimationFrame(() => setPainted(true)));
        }}
      >
        {/* Car marker image — nose points up; the Marker's own
            `rotation={currentBearing}` (flat) handles actual heading. */}
        <Image
          source={require('@/assets/images/car-marker.png')}
          style={styles.carMarkerImage}
          resizeMode="contain"
        />
      </View>
    </Marker>
  );
}

// ── AnimatedDriverMarker ────────────────────────────────────────────────────────
//
// Isolated in its own component so that the setState calls driven by the
// Animated.ValueXY listener (≈60 fps × 350 ms ≈ 21 frames per GPS tick)
// only cause THIS component to re-render — not the entire MapBackdrop
// (MapView + all polylines, circles, and station markers). Without this
// isolation, every animation frame forced a full MapView re-render, which
// is the primary source of map jank on mid-range devices.
const AnimatedDriverMarker = React.memo(function AnimatedDriverMarker({
  driverLocation,
  navigationMode,
  currentBearing,
  animDurationMs,
}: {
  driverLocation: { latitude: number; longitude: number };
  navigationMode: boolean;
  currentBearing: number;
  animDurationMs: number;
}) {
  const animRef = useRef<Animated.ValueXY | null>(null);
  const [coord, setCoord] = useState<{ latitude: number; longitude: number }>({
    latitude: driverLocation.latitude,
    longitude: driverLocation.longitude,
  });

  // Initialise ValueXY once on mount and wire the JS-side listener.
  // The listener updates coord state each animation frame so the Marker
  // re-renders smoothly — but only this small component, not MapBackdrop.
  useEffect(() => {
    const av = new Animated.ValueXY({
      x: driverLocation.latitude,
      y: driverLocation.longitude,
    });
    av.addListener(({ x, y }) => setCoord({ latitude: x, longitude: y }));
    animRef.current = av;
    return () => { av.removeAllListeners(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tween to each new GPS fix.
  useEffect(() => {
    if (!animRef.current) return;
    Animated.timing(animRef.current, {
      toValue: { x: driverLocation.latitude, y: driverLocation.longitude },
      duration: animDurationMs,
      useNativeDriver: false, // coordinate values cannot use the native driver
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation.latitude, driverLocation.longitude]);

  if (navigationMode) {
    return <DriverNavCarMarker coordinate={coord} rotation={currentBearing} />;
  }
  return (
    <Marker coordinate={coord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
      <View style={styles.driverIdleMarker}>
        <View style={styles.driverIdleInner} />
      </View>
    </Marker>
  );
});

// ── Component ──────────────────────────────────────────────────────────────────

// Wrapped in React.memo: this component re-renders on every driver GPS tick
// via its own driverLocation prop (expected — the map needs the live fix),
// but without memo it also fully re-renders whenever the parent screen
// re-renders for unrelated reasons (button busy-states, timers, etc.) even
// though none of its props changed.
export const MapBackdrop = React.memo(function MapBackdrop({
  pickup,
  dropoff,
  driverLocation,
  surgeZones = [],
  routePolyline,
  roadPolyline,
  stationStatuses,
  approachCircle,
  focusTarget,
  navigationMode = false,
  animDurationMs = 700,
}: MapBackdropProps) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userPanned, setUserPanned] = useState(false);
  const [currentBearing, setCurrentBearing] = useState(0);
  const [autoPolyline, setAutoPolyline] = useState<Array<{ latitude: number; longitude: number }> | null>(null);

  const prevPosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const userPannedRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  // Bearing smoothing — persists smoothed value across renders
  const smoothedBearingRef = useRef<number | null>(null);
  // Last driver position from which a navigation-follow animateCamera was fired.
  // Used to gate camera updates behind a minimum-movement threshold so that
  // stationary GPS noise and back-to-back 1 Hz ticks don't queue overlapping
  // animations. Reset to null whenever navigation mode is entered.
  const prevCameraPositionRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Ref mirror of the navigationMode prop — lets callbacks read current value without closure capture
  const navigationModeRef = useRef(navigationMode);
  // Auto-recenter timer handle — cleared on re-pan, nav exit, or unmount
  const autoRecenterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Theme management — follows VeeGo app theme (isDarkMode from ServiceContext) ─
  const { isDarkMode, setIsDarkMode } = useService();
  const effectiveTheme: 'dark' | 'light' = isDarkMode ? 'dark' : 'light';
  const mapStyle = effectiveTheme === 'dark' ? DARK_MAP_STYLE : LIGHT_MAP_STYLE;

  const insets = useSafeAreaInsets();

  const handleThemeToggle = useCallback(() => {
    setIsDarkMode(!isDarkMode);
  }, [isDarkMode, setIsDarkMode]);

  // ── Initial camera center ────────────────────────────────────────────────
  const initialCenter = useMemo(() => {
    if (driverLocation) return { latitude: driverLocation.latitude, longitude: driverLocation.longitude };
    if (routePolyline?.length) return routePolyline[0];
    if (pickup) return pickup;
    return DEFAULT_CENTER;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bearing tracking (with EMA smoothing) ────────────────────────────────
  useEffect(() => {
    if (!driverLocation) return;
    const prev = prevPosRef.current;
    let rawBearing: number | null = null;
    if (
      prev &&
      (prev.latitude !== driverLocation.latitude || prev.longitude !== driverLocation.longitude)
    ) {
      rawBearing = calcBearing(prev, driverLocation);
    } else if (driverLocation.heading != null && driverLocation.heading !== 0) {
      rawBearing = driverLocation.heading;
    }
    if (rawBearing !== null) {
      const smoothed = smoothAngle(smoothedBearingRef.current, rawBearing, 0.35);
      smoothedBearingRef.current = smoothed;
      setCurrentBearing(smoothed);
    }
    prevPosRef.current = { latitude: driverLocation.latitude, longitude: driverLocation.longitude };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  // ── Sync navigationMode prop into ref (used by stable callbacks) ────────
  useEffect(() => {
    navigationModeRef.current = navigationMode;
    // Reset camera position tracking on navigation mode entry so the first
    // GPS fix after entering nav mode always triggers a camera update.
    if (navigationMode) prevCameraPositionRef.current = null;
  }, [navigationMode]);

  // ── Cancel auto-recenter timer when nav mode ends or on unmount ──────────
  useEffect(() => {
    if (!navigationMode) {
      if (autoRecenterTimerRef.current !== null) {
        clearTimeout(autoRecenterTimerRef.current);
        autoRecenterTimerRef.current = null;
      }
    }
    return () => {
      if (autoRecenterTimerRef.current !== null) {
        clearTimeout(autoRecenterTimerRef.current);
        autoRecenterTimerRef.current = null;
      }
    };
  }, [navigationMode]);

  // ── Navigation mode camera follow (look-ahead offset) ────────────────────
  // The camera centre is placed 100 m ahead of the driver in the direction of
  // the smoothed bearing so the driver marker sits in the lower portion of the
  // visible map and more road is shown ahead — the Uber/Careem look.
  //
  // Camera decision priority (explicit):
  //   1. focusTarget — when set, its dedicated effect owns the camera and this
  //      effect yields immediately. focusTarget is read without being added to
  //      deps because its own effect handles the camera on focusTarget changes;
  //      this guard only prevents nav-follow from overriding it on GPS ticks.
  //   2. Navigation follow (this effect) — fires on GPS ticks while navigating.
  //   3. Initial fit — fitToCoordinates, handled by a separate effect below.
  //
  // Minimum-movement gate: animateCamera is skipped when the driver has moved
  // less than NAV_CAMERA_MIN_MOVE_M since the last camera update. This stops
  // stationary GPS noise and back-to-back 1 Hz ticks from queuing overlapping
  // animations that produce visible camera stutter.
  //
  // Bearing note: read from smoothedBearingRef (updated synchronously by the
  // bearing effect above) instead of currentBearing state, preventing a second
  // animateCamera call per GPS tick when setCurrentBearing causes a re-render.
  const NAV_CAMERA_MIN_MOVE_M = 3;
  useEffect(() => {
    if (!navigationMode || !driverLocation || userPannedRef.current || !mapReady) return;
    // Priority 1: focusTarget owns the camera — yield.
    if (focusTarget) return;
    // Skip if the driver hasn't moved far enough to justify a new camera frame.
    if (prevCameraPositionRef.current) {
      const moved = haversineMeters(
        prevCameraPositionRef.current.latitude,
        prevCameraPositionRef.current.longitude,
        driverLocation.latitude,
        driverLocation.longitude,
      );
      if (moved < NAV_CAMERA_MIN_MOVE_M) return;
    }
    const bearing = smoothedBearingRef.current ?? 0;
    const center = offsetCoord(
      { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
      bearing,
      100,
    );
    prevCameraPositionRef.current = { latitude: driverLocation.latitude, longitude: driverLocation.longitude };
    mapRef.current?.animateCamera(
      {
        center,
        heading: bearing,
        pitch: 50,
        zoom: 18,
        altitude: 160,
      },
      { duration: animDurationMs },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.latitude, driverLocation?.longitude, navigationMode, mapReady]);
  // focusTarget intentionally omitted — its own effect handles the camera when
  // focusTarget changes; this effect only guards against firing alongside it.
  // currentBearing intentionally omitted — bearing is read from smoothedBearingRef.

  // ── Focus target camera control ──────────────────────────────────────────
  useEffect(() => {
    if (!focusTarget || !mapReady) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: focusTarget.latitude, longitude: focusTarget.longitude },
        zoom: focusTarget.zoom ?? (navigationMode ? 18 : 16),
        pitch: navigationMode ? 50 : 0,
        altitude: navigationMode ? 160 : 500,
      },
      { duration: 800 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.latitude, focusTarget?.longitude]);

  // ── Mark the map ready; initial fitting runs when ride points are available ─
  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  // ── Auto-fetch route for non-nav on-demand rides ─────────────────────────
  useEffect(() => {
    if (navigationMode || !pickup || !dropoff) return;
    const base = process.env.EXPO_PUBLIC_API_URL ?? '';
    const url =
      `${base}/directions` +
      `?origin=${pickup.latitude},${pickup.longitude}` +
      `&destination=${dropoff.latitude},${dropoff.longitude}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    getToken()
      .then(token =>
        fetch(url, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token ?? ''}` },
        }),
      )
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (Array.isArray(data?.polyline) && data.polyline.length >= 2) {
          setAutoPolyline(data.polyline);
        } else if (pickup && dropoff) {
          // Backend returned no usable polyline — fall back to straight line
          setAutoPolyline([pickup, dropoff]);
        }
      })
      .catch(() => {
        // Network / timeout error — straight-line fallback keeps route visible
        if (pickup && dropoff) setAutoPolyline([pickup, dropoff]);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, navigationMode]);

  // ── User pan detection + auto-recenter timer ─────────────────────────────
  const handlePanDrag = useCallback(() => {
    if (!userPannedRef.current) {
      userPannedRef.current = true;
      setUserPanned(true);
    }
    // Reset the timer on every pan gesture so 8 s is always counted from
    // the last interaction, not from when the user first touched the map.
    if (autoRecenterTimerRef.current !== null) {
      clearTimeout(autoRecenterTimerRef.current);
      autoRecenterTimerRef.current = null;
    }
    if (navigationModeRef.current) {
      autoRecenterTimerRef.current = setTimeout(() => {
        autoRecenterTimerRef.current = null;
        userPannedRef.current = false;
        setUserPanned(false); // re-enables camera follow on the next GPS tick
      }, 8_000);
    }
  }, []);

  // ── Recenter (manual button + called by auto-recenter) ───────────────────
  const handleRecenter = useCallback(() => {
    // Cancel any pending auto-recenter timer since we're recentering now
    if (autoRecenterTimerRef.current !== null) {
      clearTimeout(autoRecenterTimerRef.current);
      autoRecenterTimerRef.current = null;
    }
    userPannedRef.current = false;
    setUserPanned(false);
    if (!driverLocation) return;
    // In nav mode use the same look-ahead offset as the follow camera so the
    // view is identical whether the user pressed Recenter or it fired automatically.
    const center = navigationMode
      ? offsetCoord(
          { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
          currentBearing,
          100,
        )
      : { latitude: driverLocation.latitude, longitude: driverLocation.longitude };
    mapRef.current?.animateCamera(
      {
        center,
        heading: navigationMode ? currentBearing : 0,
        pitch: navigationMode ? 50 : 0,
        zoom: navigationMode ? 18 : 16,
        altitude: navigationMode ? 160 : 500,
      },
      { duration: 800 },
    );
  }, [driverLocation, navigationMode, currentBearing]);

  // ── Approach circle coords for dashed Polyline ───────────────────────────
  const approachCircleCoords = useMemo(
    () => (approachCircle ? circleCoords(approachCircle, approachCircle.radius) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [approachCircle?.latitude, approachCircle?.longitude, approachCircle?.radius],
  );

  // ── Route line: road-snapped → auto-fetched → null ───────────────────────
  const displayRouteCoords = roadPolyline?.length
    ? roadPolyline
    : autoPolyline?.length
    ? autoPolyline
    : null;

  // ── One-shot initial ride framing (non-nav mode) ─────────────────────────
  // Include the driver when it is already available, but do not refit as the
  // driver moves. The user, navigation mode, and focusTarget retain control
  // over the camera.
  const initialFitPoints = useMemo(
    () => [
      ...(displayRouteCoords ?? []),
      driverLocation
        ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude }
        : undefined,
      pickup,
      dropoff,
    ].filter(Boolean) as Array<{ latitude: number; longitude: number }>,
    [
      displayRouteCoords,
      driverLocation?.latitude,
      driverLocation?.longitude,
      pickup?.latitude,
      pickup?.longitude,
      dropoff?.latitude,
      dropoff?.longitude,
    ],
  );

  useEffect(() => {
    if (
      !mapReady ||
      navigationMode ||
      focusTarget ||
      userPanned ||
      initialFitDoneRef.current ||
      initialFitPoints.length < 2
    ) {
      return;
    }

    // Delay slightly so the MapView has painted its first frame. The effect
    // cleanup cancels this if navigation/focus/user interaction takes over.
    const timer = setTimeout(() => {
      if (navigationMode || focusTarget || userPannedRef.current) return;
      initialFitDoneRef.current = true;
      mapRef.current?.fitToCoordinates(initialFitPoints, {
        edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [mapReady, navigationMode, focusTarget, userPanned, initialFitPoints]);

  // ── One-shot recenter onto the driver's first GPS fix (no ride active) ───
  // initialCenter/initialCamera only run at mount, when a real fix has often
  // not arrived yet, so the map opens on DEFAULT_CENTER (Cairo). The fit-to-
  // coordinates effect above only engages once there are 2+ points (a ride),
  // so a plain idle Home view would otherwise stay on that fallback forever.
  // This fires once the first fix lands to bring the camera onto the driver.
  const initialLocationCenterRef = useRef(false);
  useEffect(() => {
    if (
      !mapReady ||
      !driverLocation ||
      navigationMode ||
      focusTarget ||
      userPanned ||
      initialFitDoneRef.current ||
      initialLocationCenterRef.current ||
      initialFitPoints.length >= 2
    ) {
      return;
    }
    initialLocationCenterRef.current = true;
    mapRef.current?.animateCamera(
      {
        center: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        heading: 0,
        pitch: 0,
        zoom: 16,
        altitude: 500,
      },
      { duration: 500 },
    );
  }, [mapReady, driverLocation?.latitude, driverLocation?.longitude, navigationMode, focusTarget, userPanned, initialFitPoints.length]);

  // Station markers are drawn when routePolyline holds station coordinates + statuses
  const hasStations = (routePolyline?.length ?? 0) >= 2 && !!stationStatuses;

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyle}
        initialCamera={{
          center: initialCenter,
          pitch: navigationMode ? 50 : 0,
          heading: 0,
          zoom: navigationMode ? 18 : 13,
          altitude: navigationMode ? 160 : 2000,
        }}
        onMapReady={handleMapReady}
        onPanDrag={handlePanDrag}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
      >
        {/* ── Route line (road-snapped or auto-fetched) ────────────────── */}
        {displayRouteCoords && (
          <>
            <Polyline
              coordinates={displayRouteCoords}
              strokeColor="rgba(255,255,255,0.15)"
              strokeWidth={8}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={displayRouteCoords}
              strokeColor="#3b82f6"
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* ── Approach circle: filled area + dashed border ─────────────── */}
        {approachCircle && approachCircleCoords && (
          <>
            <Circle
              center={{ latitude: approachCircle.latitude, longitude: approachCircle.longitude }}
              radius={approachCircle.radius}
              fillColor="rgba(245,158,11,0.10)"
              strokeWidth={0}
            />
            <Polyline
              coordinates={approachCircleCoords}
              strokeColor="#f59e0b"
              strokeWidth={2.5}
              lineDashPattern={[8, 6]}
            />
          </>
        )}

        {/* ── Surge zones ──────────────────────────────────────────────── */}
        {surgeZones.map(z => (
          <React.Fragment key={z.id}>
            <Circle
              center={{ latitude: z.latitude, longitude: z.longitude }}
              radius={z.radius}
              fillColor={surgeColor(z.multiplier)}
              strokeColor={surgeStrokeColor(z.multiplier)}
              strokeWidth={1.5}
            />
            <Marker
              coordinate={{ latitude: z.latitude, longitude: z.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              flat
            >
              <View style={styles.surgeLabel}>
                <Text style={styles.surgeLabelFlash}>⚡</Text>
                <Text style={styles.surgeLabelText}>{z.multiplier.toFixed(1)}×</Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}

        {/* ── Shuttle station markers ───────────────────────────────────── */}
        {hasStations &&
          routePolyline!.map((pt, idx) => {
            const status = stationStatuses![idx] ?? 'pending';
            const label = String(idx + 1);
            if (status === 'current') {
              return (
                <Marker key={`st-${idx}`} coordinate={pt} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={styles.stationCurrent}>
                    <View style={styles.stationCurrentInner}>
                      <Text style={styles.stationCurrentText}>{label}</Text>
                    </View>
                  </View>
                </Marker>
              );
            }
            if (status === 'completed') {
              return (
                <Marker key={`st-${idx}`} coordinate={pt} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={styles.stationCompleted}>
                    <Text style={styles.stationCompletedText}>{label}</Text>
                  </View>
                </Marker>
              );
            }
            return (
              <Marker key={`st-${idx}`} coordinate={pt} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={styles.stationPending}>
                  <Text style={styles.stationPendingText}>{label}</Text>
                </View>
              </Marker>
            );
          })}

        {/* ── Pickup marker ─────────────────────────────────────────────── */}
        {pickup && (
          <Marker coordinate={pickup} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <View style={styles.pinWrapper}>
              <View style={styles.pickupCircle}>
                <Text style={styles.pinLabel}>P</Text>
              </View>
              <View style={[styles.pinStem, { backgroundColor: '#22c55e' }]} />
            </View>
          </Marker>
        )}

        {/* ── Dropoff marker ────────────────────────────────────────────── */}
        {dropoff && (
          <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <View style={styles.pinWrapper}>
              <View style={styles.dropoffCircle}>
                <Text style={styles.pinLabel}>D</Text>
              </View>
              <View style={[styles.pinStem, { backgroundColor: '#ef4444' }]} />
            </View>
          </Marker>
        )}

        {/* ── Driver marker (nav + idle) — rendered by AnimatedDriverMarker ── */}
        {/* AnimatedDriverMarker owns its own animation state so that the     */}
        {/* ~60 fps coord updates during each GPS-tick tween only re-render   */}
        {/* that small component, not the entire MapView + overlays.          */}
        {driverLocation && (
          <AnimatedDriverMarker
            driverLocation={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
            navigationMode={navigationMode}
            currentBearing={currentBearing}
            animDurationMs={animDurationMs}
          />
        )}
      </MapView>

      {/* ── Theme toggle button — bottom right ───────────────────────────── */}
      <Pressable
        onPress={handleThemeToggle}
        style={[styles.themeToggleBtn, { bottom: insets.bottom + 162 }]}
        accessibilityLabel={effectiveTheme === 'dark' ? 'Switch to light map' : 'Switch to dark map'}
      >
        <Text style={styles.themeToggleIcon}>
          {effectiveTheme === 'dark' ? '☀️' : '🌙'}
        </Text>
      </Pressable>

      {/* ── Recenter button — always visible, bottom right below theme toggle */}
      <Pressable
        onPress={handleRecenter}
        style={[styles.recenterBtn, { bottom: insets.bottom + 110 }]}
        accessibilityLabel="Recenter map"
      >
        <Text style={styles.recenterIcon}>⊕</Text>
      </Pressable>
    </View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Driver nav marker (car image, rotated by bearing)
  driverNavOuter: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarkerImage: {
    width: 72,
    height: 72,
  },
  // Driver idle marker (blue circle)
  driverIdleMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2563eb',
    borderWidth: 2.5,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverIdleInner: {
    width: 16,
    height: 10,
    backgroundColor: 'white',
    borderRadius: 3,
  },
  // Pickup / dropoff pin markers
  pinWrapper: { alignItems: 'center' },
  pickupCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#22c55e',
    borderWidth: 2.5,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropoffCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    borderWidth: 2.5,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinLabel: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  pinStem: { width: 2, height: 8, borderRadius: 1 },
  // Station markers
  stationCurrent: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(245,158,11,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationCurrentInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f59e0b',
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationCurrentText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  stationCompleted: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#374151',
    borderWidth: 1.5,
    borderColor: '#4b5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationCompletedText: { color: '#6b7280', fontSize: 8, fontWeight: 'bold' },
  stationPending: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1e293b',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationPendingText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  // Surge zone label
  surgeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(20,20,30,0.82)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(213,178,61,0.6)',
  },
  surgeLabelFlash: { fontSize: 11, color: '#D5B23D' },
  surgeLabelText: { fontSize: 11, fontWeight: 'bold', color: 'white' },
  // Theme toggle button — bottom right, above recenter
  themeToggleBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,15,25,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleIcon: { fontSize: 16, lineHeight: 20 },
  // Recenter button — bottom right, always visible
  recenterBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,15,25,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterIcon: { color: '#3b82f6', fontSize: 20, lineHeight: 22 },
});
