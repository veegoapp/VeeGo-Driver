import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import {
  AlertTriangle, Check, ChevronLeft, Clock, Navigation2, Users, X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useDriverLocation, haversineMeters } from '@/hooks/useDriverLocation';
import { useRoadEta } from '@/hooks/useRoadEta';
import { useRoadPolyline } from '@/hooks/useRoadPolyline';
import { useShuttle } from '@/lib/shuttleContext';
import { useDemoMode } from '@/lib/demo';
import { DemoSpeedControl } from '@/lib/demo';
import { useI18n } from '@/lib/i18nContext';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { endpoints, type ShuttleCompleteResponse } from '@/lib/api';

// ── Constants ────────────────────────────────────────────────────────────────
const APPROACH_THRESHOLD_M = 500;
const STOP_DURATION_S = 60;
const { height: SCREEN_H } = Dimensions.get('window');
const MAP_H_EN_ROUTE = Math.round(SCREEN_H * 0.55);
const MAP_H_AT_STOP = Math.round(SCREEN_H * 0.36);

type TripPhase = 'en_route' | 'approaching' | 'at_stop';
type PassengerStatus = 'not_arrived' | 'boarded' | 'no_show';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function distanceLabel(meters: number | null): string {
  if (meters === null) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function etaLabel(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 60) return '< 1 min';
  return `~${Math.round(seconds / 60)} min`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ShuttleTripActiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const { socket } = useSocket();
  const navigation = useNavigation();

  const { isDemoMode, demoSpeed } = useDemoMode();

  const shuttleCtx = useShuttle();
  const {
    activeLine, stops, currentStopIndex, passengers, nextStop, stationCoords,
  } = shuttleCtx;

  const currentStop = stops[currentStopIndex] ?? null;
  const nextCoords = stationCoords[currentStopIndex] ?? null;
  const isLastStop = currentStopIndex >= stops.length - 1;
  const tripId = activeLine?.tripId;
  const stationId = currentStop?.id;

  // ── GPS ────────────────────────────────────────────────────────────────────
  const { position: gpsPos } = useDriverLocation(!isDemoMode && !!activeLine);
  const demoDriverPosition = (shuttleCtx as any).demoDriverPosition as typeof gpsPos | null | undefined;
  const effectivePos = isDemoMode ? (demoDriverPosition ?? null) : gpsPos;

  // Haversine used only for proximity-based phase transitions (fast, no network)
  const proximityM = useMemo(() => {
    if (!effectivePos || !nextCoords) return null;
    return haversineMeters(effectivePos.latitude, effectivePos.longitude, nextCoords.latitude, nextCoords.longitude);
  }, [effectivePos?.latitude, effectivePos?.longitude, nextCoords?.latitude, nextCoords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase state (declared early — referenced by useRoadEta below) ───────────
  const [phase, setPhase] = useState<TripPhase>('en_route');

  // Road-accurate distance + ETA via OSRM (throttled, with fallback)
  const roadEta = useRoadEta(effectivePos, nextCoords, phase !== 'at_stop' && !!activeLine);
  const distanceM = roadEta.distanceM;

  // Segment-only micro-routing: fetch OSRM only for current station → next station.
  // Stable waypoints (station coords, not live position) so it fetches once per stop.
  const segmentWaypoints = useMemo(() => {
    const cur = stationCoords[currentStopIndex];
    const nxt = stationCoords[currentStopIndex + 1];
    if (!cur || !nxt) return null;
    return [cur, nxt];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStopIndex, stationCoords]);

  const { coords: roadPolylineCoords } = useRoadPolyline(segmentWaypoints);

  const animDurationMs = isDemoMode ? Math.round(1500 / demoSpeed) : 1200;
  const [stopTimer, setStopTimer] = useState(STOP_DURATION_S);
  const [timerActive, setTimerActive] = useState(false);
  const [passengerStatuses, setPassengerStatuses] = useState<Record<string, PassengerStatus>>({});
  const [isArrivingLoading, setIsArrivingLoading] = useState(false);
  const [isNextLoading, setIsNextLoading] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);
  const timeoutProcessingRef = useRef(false);
  const [stationTimeoutVisible, setStationTimeoutVisible] = useState(false);

  // ── Map height animation ───────────────────────────────────────────────────
  const mapAnim = useRef(new Animated.Value(1)).current; // 1=en_route, 0=at_stop
  useEffect(() => {
    Animated.spring(mapAnim, {
      toValue: phase === 'at_stop' ? 0 : 1,
      useNativeDriver: false,
      stiffness: 220,
      damping: 28,
    }).start();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapHeight = mapAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [MAP_H_AT_STOP, MAP_H_EN_ROUTE],
  });

  // ── Phase transitions (GPS-driven, uses haversine for reliability) ─────────
  useEffect(() => {
    if (phase === 'at_stop') return;
    if (proximityM !== null) {
      const next: TripPhase = proximityM <= APPROACH_THRESHOLD_M ? 'approaching' : 'en_route';
      if (next !== phase) setPhase(next);
    }
  }, [proximityM]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── GPS location updates to backend every 10 s during active trip ─────────
  useEffect(() => {
    if (isDemoMode || !effectivePos || !tripId || (phase !== 'en_route' && phase !== 'approaching')) return;
    const send = () => {
      endpoints.driver.updateLocation({
        latitude: effectivePos.latitude,
        longitude: effectivePos.longitude,
        speed: effectivePos.speed ?? undefined,
        tripId,
      });
    };
    send();
    const id = setInterval(send, 10_000);
    return () => clearInterval(id);
  }, [effectivePos?.latitude, effectivePos?.longitude, phase, tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset all per-stop state when the active stop changes
  useEffect(() => {
    setPhase('en_route');
    setPassengerStatuses({});
    setStopTimer(STOP_DURATION_S);
    setTimerActive(false);
    setFocusTarget(null);
    setStationTimeoutVisible(false);
    timeoutProcessingRef.current = false;
  }, [currentStopIndex]);

  // Initialise per-stop passenger statuses from context
  useEffect(() => {
    if (!passengers.length) return;
    setPassengerStatuses(prev => {
      const next: Record<string, PassengerStatus> = {};
      passengers.forEach(p => {
        next[p.id] = prev[p.id] ?? (p.checkedIn ? 'boarded' : 'not_arrived');
      });
      return next;
    });
  }, [passengers]);

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timerActive || stopTimer <= 0) {
      if (stopTimer <= 0) setTimerActive(false);
      return;
    }
    const id = setTimeout(() => setStopTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timerActive, stopTimer]);

  // ── Map data ───────────────────────────────────────────────────────────────
  const stationStatuses = useMemo(
    () => stops.map((_, i): 'pending' | 'current' | 'completed' =>
      i < currentStopIndex ? 'completed' : i === currentStopIndex ? 'current' : 'pending'
    ),
    [stops.length, currentStopIndex] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const approachCircle = useMemo(() => {
    if (phase !== 'approaching' || !nextCoords) return null;
    return { latitude: nextCoords.latitude, longitude: nextCoords.longitude, radius: APPROACH_THRESHOLD_M };
  }, [phase, nextCoords?.latitude, nextCoords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Exit guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeLine) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      e.preventDefault();
      Alert.alert(
        t.trip_active_exit_title,
        t.trip_active_exit_body,
        [
          { text: t.cancel, style: 'cancel' },
          { text: t.exit_label, style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsub;
  }, [navigation, activeLine]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket: seat count ─────────────────────────────────────────────────────
  const [liveSeats, setLiveSeats] = useState<{ bookedSeats: number; totalSeats: number } | null>(null);
  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { tripId: number; bookedSeats: number; totalSeats: number }) => {
      if (tripId && String(payload.tripId) !== String(tripId)) return;
      setLiveSeats({ bookedSeats: payload.bookedSeats, totalSeats: payload.totalSeats });
    };
    socket.on(SOCKET_EVENTS.BOOKING_PASSENGER_UPDATED, handler);
    return () => { socket.off(SOCKET_EVENTS.BOOKING_PASSENGER_UPDATED, handler); };
  }, [socket, tripId]);

  // ── Socket: station timeout ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = async (data: { tripId?: string }) => {
      if (data.tripId && data.tripId !== tripId) return;
      if (timeoutProcessingRef.current) return;
      timeoutProcessingRef.current = true;
      try {
        setStationTimeoutVisible(true);
        await nextStop();
      } finally {
        timeoutProcessingRef.current = false;
      }
    };
    socket.on(SOCKET_EVENTS.SHUTTLE_STATION_TIMEOUT, handler);
    return () => { socket.off(SOCKET_EVENTS.SHUTTLE_STATION_TIMEOUT, handler); };
  }, [socket, tripId, nextStop]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleArrived = useCallback(async () => {
    if (!stationId || isArrivingLoading) return;
    setIsArrivingLoading(true);
    try {
      if (!isDemoMode && tripId) await endpoints.trips.stationArrived(tripId, stationId);
      setPhase('at_stop');
      setTimerActive(true);
      if (nextCoords) setFocusTarget({ latitude: nextCoords.latitude, longitude: nextCoords.longitude, zoom: 16 });
    } catch {
      if (tripId) Alert.alert(t.error, t.station_action_error);
    } finally {
      setIsArrivingLoading(false);
    }
  }, [isDemoMode, tripId, stationId, isArrivingLoading, nextCoords, t]);

  const handleNextStop = useCallback(async () => {
    if (isNextLoading) return;
    setIsNextLoading(true);
    try {
      if (!isDemoMode && tripId && stationId) {
        const boardedIds = Object.entries(passengerStatuses).filter(([, s]) => s === 'boarded').map(([id]) => id);
        const absentIds = Object.entries(passengerStatuses).filter(([, s]) => s === 'no_show').map(([id]) => id);
        await Promise.allSettled(boardedIds.map(id => endpoints.shuttle.boardBooking(id)));
        await Promise.allSettled(absentIds.map(id => endpoints.shuttle.noShowBooking(id)));
        await endpoints.trips.stationCompleted(tripId, stationId);
      }
      nextStop();
    } catch {
      Alert.alert(t.error, t.station_action_error);
      setIsNextLoading(false);
      return;
    } finally {
      setIsNextLoading(false);
    }
  }, [isDemoMode, isNextLoading, tripId, stationId, passengerStatuses, nextStop]);

  const handleFinishRoute = useCallback(async () => {
    if (!activeLine) return;
    if (isDemoMode) {
      router.replace('/shuttle/trip-complete' as any);
      return;
    }
    try {
      const id = activeLine.tripId;
      if (!id) throw new Error('No trip ID');
      const result = await endpoints.trips.complete(id) as ShuttleCompleteResponse;
      const earned = result?.earnedAmount ?? result?.data?.earnedAmount;
      const balance = result?.walletBalance ?? result?.data?.walletBalance;
      router.replace({
        pathname: '/shuttle/trip-complete' as any,
        params: {
          earnedAmount: earned != null ? String(earned) : '',
          walletBalance: balance != null ? String(balance) : '',
          tripId: activeLine.id,
        },
      });
    } catch {
      router.replace('/shuttle/trip-complete' as any);
    }
  }, [isDemoMode, activeLine]);

  const updatePassengerStatus = useCallback((passengerId: string, status: PassengerStatus) => {
    setPassengerStatuses(prev => ({ ...prev, [passengerId]: status }));
  }, []);

  // ── Progress dots ──────────────────────────────────────────────────────────
  const progressDots = (
    <View style={styles.progressDots}>
      {stops.map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < currentStopIndex && { backgroundColor: colors.primary },
            i === currentStopIndex && { backgroundColor: colors.accent, width: 24 },
            i > currentStopIndex && { backgroundColor: colors.border },
          ]}
        />
      ))}
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Animated Map ─────────────────────────────────────────────────── */}
      <Animated.View style={{ height: mapHeight, overflow: 'hidden' }}>
        <MapBackdrop
          routePolyline={stationCoords}
          roadPolyline={roadPolylineCoords ?? undefined}
          stationStatuses={stationStatuses}
          approachCircle={approachCircle}
          driverLocation={effectivePos ?? undefined}
          focusTarget={focusTarget}
          navigationMode
          animDurationMs={animDurationMs}
        />

        {/* Floating top bar */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' } as any]}>
          <View style={[styles.topBar, { paddingTop: topPad + 8 }]} pointerEvents="auto">
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: 'rgba(10,10,20,0.72)', borderColor: 'rgba(255,255,255,0.12)' }]}
            >
              <ChevronLeft size={20} color="#fff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </Pressable>

            <GlassView style={styles.tripBadge} borderRadius={20}>
              <Users size={13} color={colors.foreground} strokeWidth={2} />
              <Text style={[styles.badgeText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {currentStopIndex + 1}/{stops.length}
              </Text>
            </GlassView>

            {liveSeats && (
              <GlassView style={styles.tripBadge} borderRadius={20}>
                <Users size={13} color={colors.foreground} strokeWidth={2} />
                <Text style={[styles.badgeText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {liveSeats.bookedSeats}/{liveSeats.totalSeats}
                </Text>
              </GlassView>
            )}

          </View>

          {/* Demo speed control */}
          {isDemoMode && (
            <View style={{ position: 'absolute', top: topPad + 8, right: 16 }} pointerEvents="auto">
              <DemoSpeedControl />
            </View>
          )}

          {/* ── Live Navigation HUD: speed · distance · ETA ─────────────── */}
          {phase === 'en_route' && effectivePos && (
            <View style={styles.hudContainer} pointerEvents="none">
              {/* Speedometer */}
              <View style={styles.hudCell}>
                <Text style={[styles.hudPrimary, { fontFamily: 'Inter_700Bold' }]}>
                  {Math.round((effectivePos.speed ?? 0) * 3.6)}
                </Text>
                <Text style={[styles.hudLabel, { fontFamily: 'Inter_400Regular' }]}>km/h</Text>
              </View>

              <View style={styles.hudSep} />

              {/* Distance to next station */}
              <View style={styles.hudCell}>
                <Text style={[styles.hudPrimary, { fontFamily: 'Inter_700Bold' }]}>
                  {distanceM !== null ? distanceLabel(distanceM) : '—'}
                </Text>
                <Text style={[styles.hudLabel, { fontFamily: 'Inter_400Regular' }]}>distance</Text>
              </View>

              <View style={styles.hudSep} />

              {/* ETA */}
              <View style={styles.hudCell}>
                <Text style={[styles.hudPrimary, { fontFamily: 'Inter_700Bold' }]}>
                  {roadEta.etaSeconds !== null ? etaLabel(roadEta.etaSeconds) : '—'}
                </Text>
                <Text style={[styles.hudLabel, { fontFamily: 'Inter_400Regular' }]}>ETA</Text>
              </View>
            </View>
          )}

          {/* Approaching banner — sits at bottom of map area */}
          {phase === 'approaching' && currentStop && (
            <View style={styles.approachBannerWrapper} pointerEvents="none">
              <View style={styles.approachBanner}>
                <AlertTriangle size={16} color="#f59e0b" strokeWidth={2} />
                <Text style={[styles.approachText, { fontFamily: 'Inter_700Bold' }]}>
                  Approaching {currentStop.name}
                </Text>
                <View style={styles.approachBadge}>
                  <Text style={[styles.approachBadgeText, { fontFamily: 'Inter_700Bold' }]}>
                    {distanceLabel(distanceM)}
                  </Text>
                  {roadEta.etaSeconds !== null && (
                    <Text style={[styles.approachBadgeText, { fontFamily: 'Inter_400Regular', opacity: 0.75 }]}>
                      {etaLabel(roadEta.etaSeconds)}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      </Animated.View>

      {/* ── Bottom sheet ─────────────────────────────────────────────────── */}
      {phase === 'at_stop' ? (
        /* ═══ AT STOP ════════════════════════════════════════════════════ */
        <View style={[styles.atStopSheet, { backgroundColor: colors.background }]}>
          {/* Compact stop header */}
          <View style={[styles.atStopHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <View style={styles.atStopHeaderLeft}>
              <View style={[styles.stopModeBadge, { backgroundColor: '#dc262622' }]}>
                <View style={[styles.stopModeDot, { backgroundColor: '#dc2626' }]} />
                <Text style={[styles.stopModeLabel, { color: '#dc2626', fontFamily: 'Inter_700Bold' }]}>
                  STOP MODE
                </Text>
              </View>
              <Text style={[styles.atStopName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                {currentStop?.name ?? '—'}
              </Text>
            </View>

            <View style={styles.timerBlock}>
              <Clock size={14} color={stopTimer > 15 ? '#f59e0b' : '#ef4444'} strokeWidth={2} />
              <Text style={[
                styles.timerText,
                { fontFamily: 'Inter_700Bold', color: stopTimer > 15 ? '#f59e0b' : '#ef4444' },
              ]}>
                {formatTimer(stopTimer)}
              </Text>
            </View>
          </View>

          {/* Station timeout banner */}
          {stationTimeoutVisible && (
            <View style={styles.timeoutBanner}>
              <AlertTriangle size={14} color="#d97706" strokeWidth={2} />
              <Text style={[styles.timeoutText, { fontFamily: 'Inter_400Regular', flex: 1 }]}>
                {t.station_timeout_msg}
              </Text>
              <Pressable onPress={() => setStationTimeoutVisible(false)}>
                <X size={14} color="#d97706" strokeWidth={2} />
              </Pressable>
            </View>
          )}

          {/* Passenger list */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.passengerList, { paddingBottom: insets.bottom + 16 }]}
            showsVerticalScrollIndicator={false}
          >
            {passengers.length === 0 ? (
              <View style={styles.emptyPassengers}>
                <Users size={28} color={colors.mutedForeground} strokeWidth={1.5} />
                <Text style={[styles.emptyPassengersText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  No passengers assigned to this stop
                </Text>
              </View>
            ) : (
              passengers.map(p => {
                const status: PassengerStatus = passengerStatuses[p.id] ?? 'not_arrived';
                return (
                  <View key={p.id} style={[styles.passengerRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.passengerAvatar, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.passengerInitial, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                        {(p.name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.passengerName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={[styles.passengerPhone, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {p.phone}
                      </Text>
                    </View>
                    <View style={styles.statusBtns}>
                      <Pressable
                        onPress={() => updatePassengerStatus(p.id, 'boarded')}
                        style={[
                          styles.statusBtn,
                          { borderColor: '#22c55e' },
                          status === 'boarded' && { backgroundColor: '#22c55e22' },
                        ]}
                      >
                        <Check size={16} color={status === 'boarded' ? '#22c55e' : colors.mutedForeground} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        onPress={() => updatePassengerStatus(p.id, 'no_show')}
                        style={[
                          styles.statusBtn,
                          { borderColor: '#ef4444' },
                          status === 'no_show' && { backgroundColor: '#ef444422' },
                        ]}
                      >
                        <X size={16} color={status === 'no_show' ? '#ef4444' : colors.mutedForeground} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}

            {/* Bottom action button inside scroll so it's never clipped */}
            <View style={{ marginTop: 16 }}>
              {isLastStop ? (
                <Pressable
                  onPress={handleFinishRoute}
                  style={[styles.primaryBtn, { backgroundColor: '#22c55e', opacity: isNextLoading ? 0.6 : 1 }]}
                >
                  <Check size={18} color="#fff" strokeWidth={2} />
                  <Text style={[styles.primaryBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                    {t.finish_route}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleNextStop}
                  disabled={isNextLoading}
                  style={[styles.primaryBtn, { opacity: isNextLoading ? 0.6 : 1 }]}
                >
                  <LinearGradient
                    colors={['#4f46e5', '#6366f1']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.primaryBtnGrad}
                  >
                    <Navigation2 size={18} color="#fff" strokeWidth={2} />
                    <Text style={[styles.primaryBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                      {isNextLoading ? '…' : `Next Stop →`}
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      ) : (
        /* ═══ EN ROUTE / APPROACHING — floating bottom card ════════════ */
        <View style={[
          styles.enRouteSheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.18,
            shadowRadius: 12,
            elevation: 12,
          },
        ]}>
          <View style={styles.enRouteHandle} />

          {/* Progress dots */}
          {progressDots}

          {/* Next stop card */}
          {currentStop && (
            <View style={[styles.nextStopCard, { backgroundColor: colors.card, borderColor: phase === 'approaching' ? '#f59e0b66' : colors.border }]}>
              <View style={styles.nextStopCardHeader}>
                <View style={[styles.stopIndexBadge, { backgroundColor: phase === 'approaching' ? '#f59e0b22' : colors.secondary }]}>
                  <Text style={[styles.stopIndexText, { color: phase === 'approaching' ? '#f59e0b' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                    {currentStopIndex + 1}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.nextStopLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                    {phase === 'approaching' ? '⚠ Approaching' : 'Next Stop'}
                  </Text>
                  <Text style={[styles.nextStopName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                    {currentStop.name}
                  </Text>
                </View>
                <View style={styles.distanceBadge}>
                  <Text style={[styles.distanceText, { color: phase === 'approaching' ? '#f59e0b' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                    {distanceLabel(distanceM)}
                  </Text>
                  {roadEta.etaSeconds !== null && (
                    <Text style={[styles.etaText, { color: phase === 'approaching' ? '#f59e0b99' : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      {etaLabel(roadEta.etaSeconds)}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.passengerCountRow}>
                <Users size={14} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.passengerCountText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {passengers.length} passenger{passengers.length !== 1 ? 's' : ''} at this stop
                </Text>
              </View>
            </View>
          )}

          {/* Station timeout banner (also shown in en_route phase after auto-advance) */}
          {stationTimeoutVisible && (
            <View style={[styles.timeoutBanner, { marginTop: 0, marginBottom: 8 }]}>
              <AlertTriangle size={14} color="#d97706" strokeWidth={2} />
              <Text style={[styles.timeoutText, { fontFamily: 'Inter_400Regular', flex: 1 }]}>
                {t.station_timeout_msg}
              </Text>
              <Pressable onPress={() => setStationTimeoutVisible(false)}>
                <X size={14} color="#d97706" strokeWidth={2} />
              </Pressable>
            </View>
          )}

          {/* Mark Arrived button */}
          <Pressable
            onPress={handleArrived}
            disabled={isArrivingLoading || !currentStop}
            style={[styles.arrivedBtn, { opacity: isArrivingLoading ? 0.6 : 1 }]}
          >
            <LinearGradient
              colors={phase === 'approaching' ? ['#d97706', '#f59e0b'] : ['#2d2d42', '#1e1e28']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.arrivedBtnGrad}
            >
              <Check size={18} color="#fff" strokeWidth={2} />
              <Text style={[styles.arrivedBtnText, { fontFamily: 'Inter_700Bold' }]}>
                {isArrivingLoading ? '…' : 'Mark Arrived'}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* Finish route if last stop */}
          {isLastStop && (
            <Pressable
              onPress={handleFinishRoute}
              style={[styles.finishBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e' }]}
            >
              <Check size={16} color="#22c55e" strokeWidth={2} />
              <Text style={[styles.finishBtnText, { color: '#22c55e', fontFamily: 'Inter_700Bold' }]}>
                {t.finish_route}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  tripBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12 },

  // Navigation HUD (en_route only)
  hudContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,20,0.82)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  hudCell: { flex: 1, alignItems: 'center', gap: 2 },
  hudPrimary: { fontSize: 18, color: '#fff', lineHeight: 22 },
  hudLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' },
  hudSep: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Approaching banner
  approachBannerWrapper: { position: 'absolute', bottom: 12, left: 16, right: 16 },
  approachBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(20,18,8,0.88)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
  },
  approachText: { flex: 1, fontSize: 13, color: '#fef3c7' },
  approachBadge: { backgroundColor: '#f59e0b22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  approachBadgeText: { fontSize: 12, color: '#f59e0b' },

  // At stop sheet
  atStopSheet: { flex: 1 },

  // En route sheet — floating card style
  enRouteSheet: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  enRouteHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ffffff22', alignSelf: 'center', marginBottom: 12 },

  // Progress dots
  progressDots: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  dot: { height: 8, width: 14, borderRadius: 4 },

  // Next stop card
  nextStopCard: { borderRadius: 20, borderWidth: 1.5, padding: 16, marginBottom: 12 },
  nextStopCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopIndexBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stopIndexText: { fontSize: 14 },
  nextStopLabel: { fontSize: 11, marginBottom: 2 },
  nextStopName: { fontSize: 16 },
  distanceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignItems: 'center' },
  distanceText: { fontSize: 14 },
  etaText: { fontSize: 11, marginTop: 1 },
  passengerCountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  passengerCountText: { fontSize: 13 },

  // Mark arrived button
  arrivedBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  arrivedBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrivedBtnText: { fontSize: 15, color: '#fff' },

  // Finish button (en-route last stop)
  finishBtn: { height: 44, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  finishBtnText: { fontSize: 14 },

  // At stop header
  atStopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  atStopHeaderLeft: { flex: 1, minWidth: 0, gap: 4 },
  stopModeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stopModeDot: { width: 6, height: 6, borderRadius: 3 },
  stopModeLabel: { fontSize: 10, letterSpacing: 1.2 },
  atStopName: { fontSize: 16 },
  timerBlock: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 12 },
  timerText: { fontSize: 20, letterSpacing: 1 },

  // Timeout banner
  timeoutBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, marginBottom: 0,
    backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1,
    borderRadius: 12, padding: 10,
  },
  timeoutText: { fontSize: 13, color: '#92400e', lineHeight: 18 },

  // Passenger list
  passengerList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  emptyPassengers: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  emptyPassengersText: { fontSize: 14, textAlign: 'center' },
  passengerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  passengerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  passengerInitial: { fontSize: 16 },
  passengerName: { fontSize: 14, marginBottom: 2 },
  passengerPhone: { fontSize: 12 },
  statusBtns: { flexDirection: 'row', gap: 8 },
  statusBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Primary action button
  primaryBtn: { borderRadius: 16, overflow: 'hidden' },
  primaryBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { fontSize: 15 },
});
