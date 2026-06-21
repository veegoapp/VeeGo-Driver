import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { DARK_MAP_STYLE } from '@/constants/mapStyle';
import { getToken } from '@/lib/auth';

export interface SurgeZone {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  multiplier: number;
}

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

// ── Component ──────────────────────────────────────────────────────────────────

export function MapBackdrop({
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
  animDurationMs = 1200,
}: MapBackdropProps) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userPanned, setUserPanned] = useState(false);
  const [currentBearing, setCurrentBearing] = useState(0);
  const [autoPolyline, setAutoPolyline] = useState<Array<{ latitude: number; longitude: number }> | null>(null);

  const prevPosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const userPannedRef = useRef(false);

  // ── Initial camera center ────────────────────────────────────────────────
  const initialCenter = useMemo(() => {
    if (driverLocation) return { latitude: driverLocation.latitude, longitude: driverLocation.longitude };
    if (routePolyline?.length) return routePolyline[0];
    if (pickup) return pickup;
    return DEFAULT_CENTER;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bearing tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!driverLocation) return;
    const prev = prevPosRef.current;
    if (
      prev &&
      (prev.latitude !== driverLocation.latitude || prev.longitude !== driverLocation.longitude)
    ) {
      setCurrentBearing(calcBearing(prev, driverLocation));
    } else if (driverLocation.heading != null && driverLocation.heading !== 0) {
      setCurrentBearing(driverLocation.heading);
    }
    prevPosRef.current = { latitude: driverLocation.latitude, longitude: driverLocation.longitude };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  // ── Navigation mode camera follow ────────────────────────────────────────
  useEffect(() => {
    if (!navigationMode || !driverLocation || userPannedRef.current || !mapReady) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        heading: currentBearing,
        pitch: 50,
        zoom: 16,
        altitude: 500,
      },
      { duration: animDurationMs },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.latitude, driverLocation?.longitude, currentBearing, navigationMode, mapReady]);

  // ── Focus target camera control ──────────────────────────────────────────
  useEffect(() => {
    if (!focusTarget || !mapReady) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: focusTarget.latitude, longitude: focusTarget.longitude },
        zoom: focusTarget.zoom ?? 16,
        pitch: navigationMode ? 50 : 0,
        altitude: 500,
      },
      { duration: 800 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.latitude, focusTarget?.longitude]);

  // ── Auto-fit all points on map ready (non-nav mode) ─────────────────────
  const handleMapReady = useCallback(() => {
    setMapReady(true);
    if (navigationMode) return;
    const pts = [
      ...(routePolyline ?? []),
      pickup,
      dropoff,
    ].filter(Boolean) as Array<{ latitude: number; longitude: number }>;
    if (pts.length < 2) return;
    // Delay slightly so the MapView has painted its first frame
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, navigationMode]);

  // ── User pan detection ───────────────────────────────────────────────────
  const handlePanDrag = useCallback(() => {
    if (!userPannedRef.current) {
      userPannedRef.current = true;
      setUserPanned(true);
    }
  }, []);

  // ── Recenter ─────────────────────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    userPannedRef.current = false;
    setUserPanned(false);
    if (!driverLocation) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        heading: navigationMode ? currentBearing : 0,
        pitch: navigationMode ? 50 : 0,
        zoom: 16,
        altitude: 500,
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

  // Station markers are drawn when routePolyline holds station coordinates + statuses
  const hasStations = (routePolyline?.length ?? 0) >= 2 && !!stationStatuses;

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={DARK_MAP_STYLE}
        initialCamera={{
          center: initialCenter,
          pitch: navigationMode ? 50 : 0,
          heading: 0,
          zoom: navigationMode ? 16 : 13,
          altitude: navigationMode ? 500 : 2000,
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

        {/* ── Driver marker — navigation mode (arrow, flat, rotates) ─────── */}
        {driverLocation && navigationMode && (
          <Marker
            coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={currentBearing}
            tracksViewChanges={false}
          >
            <View style={styles.driverNavOuter}>
              <View style={styles.driverNavGlow} />
              <View style={styles.driverNavInner}>
                {/* Up-pointing triangle — rotation prop handles actual heading */}
                <View style={styles.driverNavArrow} />
              </View>
            </View>
          </Marker>
        )}

        {/* ── Driver marker — idle mode (car icon) ──────────────────────── */}
        {driverLocation && !navigationMode && (
          <Marker
            coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.driverIdleMarker}>
              <View style={styles.driverIdleInner} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── Recenter button ───────────────────────────────────────────────── */}
      {userPanned && (
        <Pressable onPress={handleRecenter} style={styles.recenterBtn}>
          <Text style={styles.recenterIcon}>⊕</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Driver nav marker (arrow pointing up, rotated by bearing)
  driverNavOuter: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverNavGlow: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(37,99,235,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  driverNavInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1d4ed8',
    borderWidth: 2.5,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverNavArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 13,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    marginTop: -2,
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
  // Recenter button
  recenterBtn: {
    position: 'absolute',
    bottom: 72,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,15,25,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterIcon: { color: '#3b82f6', fontSize: 20, lineHeight: 22 },
});
