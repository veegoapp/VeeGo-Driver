import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { AnimatedRegion, Circle, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '@/constants/mapStyles';
import { fetchDirectionsRaw } from '@/lib/utils/googleDirections';
import { useService } from '@/lib/serviceContext';
import { useDriverTrackingBuffer } from '@/hooks/map/useDriverTrackingBuffer';
import { useDriverSmoothedHeading } from '@/hooks/map/useDriverSmoothedHeading';
import { useDriverCameraController } from '@/hooks/map/useDriverCameraController';
import { snapPointToRoute, remainingRouteFromPoint } from '@/hooks/map/snapToRoute';
import { haversineMeters } from '@/hooks/useDriverLocation';

// Snap the marker to the road only while it's within this many metres of the
// route. Kept just under useNavigationRoute's 50 m off-route threshold so the
// snap releases to the raw fix a moment before a reroute is triggered — no
// visible snap-back at the boundary.
const SNAP_MAX_M = 45;

// Throttle for the route-line trim (remainingRouteFromPoint): recomputing an
// O(n) route scan AND handing a brand-new coordinates array to the native
// <Polyline> on every raw GPS tick forces react-native-maps to re-upload the
// full route geometry across the bridge every tick — expensive enough on
// mid/low-end devices to show as a visible flicker/redraw, even though the
// line is never actually unmounted. Below this movement/time threshold the
// previous trimmed array (same reference) is reused instead, so the
// `coordinates` prop is unchanged and react-native-maps skips the native
// update entirely.
const TRIM_THROTTLE_MS = 300;
const TRIM_MIN_MOVE_M = 3;


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
}

// ── Utilities ──────────────────────────────────────────────────────────────────
//
// Bearing/heading math (calcBearing, EMA smoothing) now lives in the shared
// useDriverSmoothedHeading hook so the marker and camera use one heading
// source — the previous duplicate copies here were removed (Driver D2).

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

// ── AnimatedDriverMarker ────────────────────────────────────────────────────────
//
// Pill/circle dot — route-blue fill, white halo ring, no rotation (a
// symmetrical dot has no facing direction, unlike the previous nav-mode
// arrow/car icon). Position comes from `animatedCoord`, the one interpolated
// AnimatedRegion that also drives the follow camera; motion happens natively
// via AnimatedRegion, so this barely re-renders (previously the ValueXY JS
// listener re-rendered it ~30 fps per tick).
//
// tracksViewChanges is a flat `false` here (unlike the old arrow marker,
// which had to keep it `true` until a double-rAF confirmed its <Svg> child
// had actually painted on Android — see git history). A plain View with no
// Svg/image content paints synchronously with its first snapshot, so that
// paint-timing workaround no longer applies.
const AnimatedDriverMarker = React.memo(function AnimatedDriverMarker({
  animatedCoord,
}: {
  animatedCoord: AnimatedRegion;
}) {
  return (
    <MarkerAnimated coordinate={animatedCoord} anchor={{ x: 0.5, y: 0.5 }} rotation={0} tracksViewChanges={false}>
      <View style={styles.driverDot} />
    </MarkerAnimated>
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
}: MapBackdropProps) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userPanned, setUserPanned] = useState(false);
  const [autoPolyline, setAutoPolyline] = useState<Array<{ latitude: number; longitude: number }> | null>(null);

  const userPannedRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  // Ref mirror of the navigationMode prop — lets callbacks read current value without closure capture
  const navigationModeRef = useRef(navigationMode);
  // Auto-recenter timer handle — cleared on re-pan, nav exit, or unmount
  const autoRecenterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Snap-to-road (map-matching) ────────────────────────────────────────────
  // Project the raw GPS fix onto the active road route so the marker and camera
  // follow the street instead of GPS multipath jitter. Only while navigating
  // and within SNAP_MAX_M of the route; beyond that the raw fix is kept so a
  // genuinely off-route driver still shows their real position and the reroute
  // logic engages. Feeds BOTH the position buffer and the heading hook, so the
  // smoothed course also comes from the on-road path, not the noisy raw track.
  const snapRoute =
    roadPolyline && roadPolyline.length >= 2
      ? roadPolyline
      : autoPolyline && autoPolyline.length >= 2
      ? autoPolyline
      : null;

  const effectiveDriverLocation = useMemo(() => {
    if (!driverLocation || !navigationMode || !snapRoute) return driverLocation;
    const snapped = snapPointToRoute(driverLocation, snapRoute, SNAP_MAX_M);
    if (!snapped) return driverLocation;
    return { ...driverLocation, latitude: snapped.latitude, longitude: snapped.longitude };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.latitude, driverLocation?.longitude, driverLocation?.heading, driverLocation?.speed, navigationMode, snapRoute]);

  // ── Unified tracking source (Driver D1/D2) ────────────────────────────────
  // POSITION is snapped to the road (effectiveDriverLocation) so the marker and
  // camera centre glide along the street. HEADING, however, is computed from the
  // RAW fix (driverLocation): snapping collapses lateral movement onto the route
  // line, which starves the positional-bearing calculation (consecutive snapped
  // points barely advance / can jitter along a segment), leaving the smoothed
  // heading stale — so the follow camera stayed locked at its seed orientation
  // (north-up) for the whole trip and only corrected on an app restart (which
  // re-seeds heading from the device course). Raw movement keeps the course-up
  // heading live throughout the ride.
  const { animatedCoord, positionRef } = useDriverTrackingBuffer(effectiveDriverLocation);
  const { headingRef } = useDriverSmoothedHeading(driverLocation);

  // ── Continuous follow camera (Driver D3) ──────────────────────────────────
  // rAF setCamera loop reading the shared positionRef + headingRef, keeping the
  // existing look-ahead offset, pitch, zoom, pan suspension, and focusTarget
  // priority. Replaces the old per-tick animateCamera nav-follow effect.
  useDriverCameraController({
    mapRef,
    positionRef,
    headingRef,
    enabled: navigationMode && mapReady,
    userPannedRef,
    focusActive: !!focusTarget,
    pitch: 25,
    zoom: 18,
    altitude: 160,
    lookAheadM: 100,
  });

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

  // Bearing tracking moved to the shared useDriverSmoothedHeading hook
  // (Driver D2) — headingRef feeds both the marker rotation and the camera.

  // ── Sync navigationMode prop into ref (used by stable callbacks) ────────
  useEffect(() => {
    navigationModeRef.current = navigationMode;
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

  // Navigation-mode follow is now a continuous rAF setCamera loop
  // (useDriverCameraController, wired above) reading the shared interpolated
  // positionRef + smoothed headingRef, keeping the 100 m look-ahead offset,
  // pitch, zoom, pan suspension, and focusTarget priority. The old per-GPS-tick
  // animateCamera(raw driverLocation) effect was removed (Driver D3).

  // ── Focus target camera control ──────────────────────────────────────────
  useEffect(() => {
    if (!focusTarget || !mapReady) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: focusTarget.latitude, longitude: focusTarget.longitude },
        zoom: focusTarget.zoom ?? (navigationMode ? 18 : 16),
        pitch: navigationMode ? 25 : 0,
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    fetchDirectionsRaw(pickup, dropoff, { signal: ctrl.signal })
      .then(result => {
        if (result && result.polyline.length >= 2) {
          setAutoPolyline(result.polyline);
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
    // Guard against the same class of bug the other camera-triggering effects
    // in this file already guard against (focus-target effect, initial-fit
    // effect, first-fix recenter effect): react-native-maps silently discards
    // animateCamera calls made before the native MapView has finished
    // initialising. The recenter button renders and is tappable immediately,
    // so without this a tap in that brief window did nothing with no
    // feedback — reading as "unresponsive".
    if (!mapReady) return;
    // Cancel any pending auto-recenter timer since we're recentering now
    if (autoRecenterTimerRef.current !== null) {
      clearTimeout(autoRecenterTimerRef.current);
      autoRecenterTimerRef.current = null;
    }
    userPannedRef.current = false;
    setUserPanned(false);
    // Recenter onto the shared interpolated position + smoothed heading so the
    // discrete recenter matches exactly what the continuous follow camera does.
    const pos = positionRef.current ?? (driverLocation
      ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude }
      : null);
    if (!pos) return;
    const bearing = headingRef.current;
    const center = navigationMode ? offsetCoord(pos, bearing, 100) : pos;
    mapRef.current?.animateCamera(
      {
        center,
        heading: navigationMode ? bearing : 0,
        pitch: navigationMode ? 25 : 0,
        zoom: navigationMode ? 18 : 16,
        altitude: navigationMode ? 160 : 500,
      },
      { duration: 800 },
    );
  }, [driverLocation, navigationMode, mapReady]);

  // ── Approach circle coords for dashed Polyline ───────────────────────────
  const approachCircleCoords = useMemo(
    () => (approachCircle ? circleCoords(approachCircle, approachCircle.radius) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [approachCircle?.latitude, approachCircle?.longitude, approachCircle?.radius],
  );

  // ── Route line: road-snapped → auto-fetched → null ───────────────────────
  // While navigating, start the line at the driver's snapped position and drop
  // the driven portion (remainingRouteFromPoint) so the line stays glued to the
  // marker and recedes continuously, instead of trimming to the nearest route
  // vertex — which recedes in coarse jumps every few metres and lets the
  // smoothly-interpolated marker run ahead of the line. Off-route (or non-nav)
  // falls back to the full route.
  const baseRouteCoords = roadPolyline?.length
    ? roadPolyline
    : autoPolyline?.length
    ? autoPolyline
    : null;

  // Cache of the last actual trim computation, keyed to the route currently
  // being trimmed — see TRIM_THROTTLE_MS/TRIM_MIN_MOVE_M above. Cleared
  // whenever the route identity changes or nav mode drops out, so a genuine
  // route swap always recomputes immediately (only the same-route, same-mode,
  // barely-moved case is throttled).
  const trimCacheRef = useRef<{
    baseRouteCoords: NonNullable<typeof baseRouteCoords>;
    lat: number;
    lng: number;
    ts: number;
    result: Array<{ latitude: number; longitude: number }>;
  } | null>(null);

  const displayRouteCoords = useMemo(() => {
    if (!baseRouteCoords) {
      trimCacheRef.current = null;
      return null;
    }
    if (!navigationMode || !effectiveDriverLocation) {
      trimCacheRef.current = null;
      return baseRouteCoords;
    }

    const cache = trimCacheRef.current;
    if (cache && cache.baseRouteCoords === baseRouteCoords) {
      const elapsedMs = Date.now() - cache.ts;
      const movedM = haversineMeters(
        cache.lat, cache.lng,
        effectiveDriverLocation.latitude, effectiveDriverLocation.longitude,
      );
      if (elapsedMs < TRIM_THROTTLE_MS && movedM < TRIM_MIN_MOVE_M) {
        return cache.result; // same reference as last render — skips the native Polyline update
      }
    }

    const glued = remainingRouteFromPoint(effectiveDriverLocation, baseRouteCoords, SNAP_MAX_M);
    const result = glued && glued.length >= 2 ? glued : baseRouteCoords;
    trimCacheRef.current = {
      baseRouteCoords,
      lat: effectiveDriverLocation.latitude,
      lng: effectiveDriverLocation.longitude,
      ts: Date.now(),
      result,
    };
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRouteCoords, navigationMode, effectiveDriverLocation?.latitude, effectiveDriverLocation?.longitude]);

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

  // ── Recenter onto the driver's first GPS fix (no ride active) ────────────
  // initialCenter/initialCamera only run at mount, when a real fix has often
  // not arrived yet, so the map opens on DEFAULT_CENTER (Cairo). The fit-to-
  // coordinates effect above only engages once there are 2+ points (a ride),
  // so a plain idle Home view would otherwise stay on that fallback forever.
  // This fires once a fix lands to bring the camera onto the driver.
  //
  // Re-arms (rather than firing only once ever) whenever driverLocation goes
  // back to null: e.g. permission was denied when this mounted and granted
  // moments later (GPSProvider now re-checks and delivers a fix once that
  // happens — see useGPSProvider.tsx), or GPS was briefly lost and regained.
  // Without the re-arm, only the very first null->value transition in this
  // component's lifetime would ever recenter the camera.
  const initialLocationCenterRef = useRef(false);
  useEffect(() => {
    if (!driverLocation) {
      initialLocationCenterRef.current = false;
      return;
    }
    if (
      !mapReady ||
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
          pitch: navigationMode ? 25 : 0,
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
        showsBuildings={false}
        showsIndoors={false}
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

        {/* ── Driver marker — pill/circle dot, rendered by AnimatedDriverMarker ── */}
        {/* Position comes from the shared tracking source (animatedCoord), the  */}
        {/* same source that drives the follow camera. Motion is native          */}
        {/* (AnimatedRegion), so this barely re-renders.                         */}
        {driverLocation && (
          <AnimatedDriverMarker animatedCoord={animatedCoord} />
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
  // Driver marker — pill/circle dot. Route-blue fill (matches the Polyline's
  // #3b82f6 stroke), solid white halo ring, subtle elevation so it reads as
  // sitting slightly above the route line. Symmetrical, so it never needs to
  // rotate with heading (see AnimatedDriverMarker's rotation={0}).
  driverDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3b82f6',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
