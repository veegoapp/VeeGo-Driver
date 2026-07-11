import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navUtils';
import {
  AlertTriangle, Check, ChevronLeft, Clock, Navigation2, Share2, Users, X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Dimensions, Linking, Platform, Pressable, ScrollView,
  Share, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapBackdrop } from '@/components/MapBackdrop';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useDriverLocation, haversineMeters } from '@/hooks/useDriverLocation';
import { useRoadEta } from '@/hooks/useRoadEta';
import { useRoadPolyline } from '@/hooks/useRoadPolyline';
import { useActiveLocationTracking } from '@/hooks/useActiveLocationTracking';
import { useShuttle } from '@/lib/shuttleContext';
import { useI18n } from '@/lib/i18nContext';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { api, endpoints, type ShuttleCompleteResponse } from '@/lib/api';

// ── Constants ────────────────────────────────────────────────────────────────
const APPROACH_THRESHOLD_M = 250;
const STOP_DURATION_S = 60;
const { height: SCREEN_H } = Dimensions.get('window');

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
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const { socket } = useSocket();
  const shuttleCtx = useShuttle();
  const {
    activeLine, stops, currentStopIndex, passengers, nextStop, stationCoords,
  } = shuttleCtx;

  const currentStop = stops[currentStopIndex] ?? null;
  const nextCoords = stationCoords[currentStopIndex] ?? null;
  const isLastStop = currentStopIndex >= stops.length - 1;
  const tripId = activeLine?.tripId;
  const stationId = currentStop?.id;

  useActiveLocationTracking({
    enabled: !!activeLine,
    tripId: tripId != null ? Number(tripId) : null,
  });

  // ── GPS ────────────────────────────────────────────────────────────────────
  const { position: gpsPos } = useDriverLocation(!!activeLine);
  const effectivePos = gpsPos;

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

  const animDurationMs = 1200;
  const [stopTimer, setStopTimer] = useState(STOP_DURATION_S);
  const [timerActive, setTimerActive] = useState(false);
  const [passengerStatuses, setPassengerStatuses] = useState<Record<string, PassengerStatus>>({});
  const [isArrivingLoading, setIsArrivingLoading] = useState(false);
  const [isNextLoading, setIsNextLoading] = useState(false);
  const [failedStationActions, setFailedStationActions] = useState<{ id: string; name: string; action: 'boarded' | 'no_show' }[]>([]);
  const [focusTarget, setFocusTarget] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareLink, setShareLink] = useState<{ id: number; url: string } | null>(null);
  const timeoutProcessingRef = useRef(false);
  const isFinishingRef = useRef(false);
  const lastStopProcessingRef = useRef(false);
  const [stationTimeoutVisible, setStationTimeoutVisible] = useState(false);

  // Map always fills full height — both sheets are absolute overlays

  // ── Phase transitions (GPS-driven, uses haversine for reliability) ─────────
  useEffect(() => {
    if (phase === 'at_stop') return;
    if (proximityM !== null) {
      const next: TripPhase = proximityM <= APPROACH_THRESHOLD_M ? 'approaching' : 'en_route';
      if (next !== phase) setPhase(next);
    }
  }, [proximityM]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Approaching alert sound — plays 3× when driver enters 250m zone ───────
  useEffect(() => {
    if (phase !== 'approaching') return;
    let cancelled = false;
    (async () => {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      for (let i = 0; i < 3; i++) {
        if (cancelled) break;
        const { sound } = await Audio.Sound.createAsync(
          require('@/assets/sounds/approaching.wav'),
          { shouldPlay: false, volume: 1.0, rate: 0.25, shouldCorrectPitch: true },
        );
        await sound.playAsync();
        await new Promise<void>(res => setTimeout(res, 2400));
        sound.unloadAsync();
      }
    })();
    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── GPS location updates to backend every 10 s during active trip ─────────
  useEffect(() => {
    if (!effectivePos || !tripId || (phase !== 'en_route' && phase !== 'approaching')) return;
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
    setFailedStationActions([]);
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
    return { latitude: nextCoords.latitude, longitude: nextCoords.longitude, radius: 100 };
  }, [phase, nextCoords?.latitude, nextCoords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Exit guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeLine) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (isFinishingRef.current) return; // intentional finish — let it through
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
      if (!data.tripId || data.tripId !== tripId) return;
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
      if (tripId) await endpoints.trips.stationArrived(tripId, stationId);
      setPhase('at_stop');
      setTimerActive(true);
      if (nextCoords) setFocusTarget({ latitude: nextCoords.latitude, longitude: nextCoords.longitude, zoom: 16 });
    } catch {
      if (tripId) Alert.alert(t.error, t.station_action_error);
    } finally {
      setIsArrivingLoading(false);
    }
  }, [tripId, stationId, isArrivingLoading, nextCoords, t]);

  const handleNextStop = useCallback(async (retryOnly?: { id: string; action: 'boarded' | 'no_show' }[]) => {
    if (isNextLoading) return;
    setIsNextLoading(true);
    try {
      if (tripId && stationId) {
        const boardedIds = retryOnly
          ? retryOnly.filter(r => r.action === 'boarded').map(r => r.id)
          : Object.entries(passengerStatuses).filter(([, s]) => s === 'boarded').map(([id]) => id);
        const absentIds = retryOnly
          ? retryOnly.filter(r => r.action === 'no_show').map(r => r.id)
          : Object.entries(passengerStatuses).filter(([, s]) => s === 'no_show').map(([id]) => id);

        const boardResults = await Promise.allSettled(boardedIds.map(id => {
          const p = passengers.find(px => px.id === id);
          const cashPayload = p?.paymentMethod === 'cash'
            ? { cashCollected: true, amountCollected: p.fareAmount }
            : {};
          return endpoints.shuttle.boardBooking(id, { stationId, ...cashPayload });
        }));
        const absentResults = await Promise.allSettled(absentIds.map(id => endpoints.shuttle.noShowBooking(id)));

        // Task: surface per-passenger failures instead of silently continuing
        const failed: { id: string; name: string; action: 'boarded' | 'no_show' }[] = [];
        boardResults.forEach((r, i) => {
          if (r.status === 'rejected') {
            const id = boardedIds[i];
            failed.push({ id, name: passengers.find(px => px.id === id)?.name ?? id, action: 'boarded' });
          }
        });
        absentResults.forEach((r, i) => {
          if (r.status === 'rejected') {
            const id = absentIds[i];
            failed.push({ id, name: passengers.find(px => px.id === id)?.name ?? id, action: 'no_show' });
          }
        });

        if (failed.length > 0) {
          setFailedStationActions(failed);
          Alert.alert(
            t.boarding_partial_fail_title,
            t.boarding_partial_fail_msg.replace('{names}', failed.map(f => f.name).join(', ')),
            [
              { text: t.cancel, style: 'cancel' },
              { text: t.retry_label, onPress: () => { handleNextStop(failed); } },
            ]
          );
          return;
        }

        setFailedStationActions([]);
        await endpoints.trips.stationCompleted(tripId, stationId);
      }
      nextStop();
    } catch {
      Alert.alert(t.error, t.station_action_error);
      return;
    } finally {
      setIsNextLoading(false);
    }
  }, [isNextLoading, tripId, stationId, passengerStatuses, passengers, nextStop, t]);

  const handleFinishRoute = useCallback(async () => {
    if (!activeLine) return;
    isFinishingRef.current = true;
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
          tripId: activeLine.tripId ?? '',
        },
      });
    } catch {
      router.replace('/shuttle/trip-complete' as any);
    }
  }, [activeLine]);

  const updatePassengerStatus = useCallback((passengerId: string, status: PassengerStatus) => {
    setPassengerStatuses(prev => ({ ...prev, [passengerId]: status }));
  }, []);

  // ── SOS / Safety button ────────────────────────────────────────────────────
  const handleSOS = useCallback(async () => {
    const raw = await AsyncStorage.getItem('veego_emergency_contact');
    const ec = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;

    Alert.alert(
      t.sos_confirm_title,
      t.sos_confirm_body,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.sos_call_122,
          onPress: () => Linking.openURL('tel:122').catch(() => {}),
        },
        {
          text: t.sos_whatsapp_alert,
          style: 'destructive',
          onPress: async () => {
            if (!ec?.phone) {
              Alert.alert(t.sos_confirm_title, t.sos_no_contact_set);
              return;
            }
            try {
              const loc = effectivePos;
              const mapLink = loc ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}` : '';
              // Passenger PII excluded — emergency responders must look up details server-side
              const lines = [
                '🚨 SOS ALERT 🚨',
                `Trip #${tripId ?? '—'} | Stop ${currentStopIndex + 1}/${stops.length}`,
                mapLink ? `📍 Location: ${mapLink}` : '📍 Location unavailable',
              ].join('\n\n');
              const phoneClean = ec.phone.replace(/\D/g, '');
              await Linking.openURL(`whatsapp://send?phone=${phoneClean}&text=${encodeURIComponent(lines)}`);
              if (tripId) {
                // NOTE: backend must implement POST /shuttle/trips/:tripId/sos
                api.post(`/shuttle/trips/${tripId}/sos`, {
                  latitude: loc?.latitude ?? 0,
                  longitude: loc?.longitude ?? 0,
                }).catch(() => {});
              }
            } catch {
              Alert.alert(t.sos_confirm_title, t.whatsapp_emergency_no_contact);
            }
          },
        },
      ]
    );
  }, [effectivePos, passengers, activeLine, tripId, currentStop, currentStopIndex, stops.length, t]);

  // ── Share Trip ───────────────────────────────────────────────────────────────
  const handleShareTrip = useCallback(async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      if (shareLink) {
        await endpoints.tripShare.revoke(shareLink.id);
        setShareLink(null);
        Alert.alert(t.trip_share_revoked_title, t.trip_share_revoked_msg);
      } else {
        const numericTripId = tripId != null ? Number(tripId) : undefined;
        if (numericTripId == null || isNaN(numericTripId)) return;
        const result = await endpoints.tripShare.create({ tripId: numericTripId });
        setShareLink({ id: result.id, url: result.url });
        Alert.alert(t.trip_share_created_title, t.trip_share_created_msg, [
          { text: t.trip_share_copy_btn, onPress: async () => {
              const Clipboard = await import('expo-clipboard');
              await Clipboard.setStringAsync(result.url);
            } },
          { text: t.ok, style: 'default', onPress: () => { Share.share({ message: result.url }).catch(() => {}); } },
        ]);
      }
    } catch {
      Alert.alert(t.error, shareLink ? t.trip_share_revoke_error : t.trip_share_error);
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy, shareLink, tripId, t]);

  // ── Progress dots ──────────────────────────────────────────────────────────
  const progressDots = (
    <View style={styles.progressDots}>
      {stops.map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < currentStopIndex && { backgroundColor: '#4f46e5' },
            i === currentStopIndex && { backgroundColor: '#f59e0b', width: 24 },
            i > currentStopIndex && { backgroundColor: 'rgba(255,255,255,0.18)' },
          ]}
        />
      ))}
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Map — fills full screen, both sheets overlay on top ──────────── */}
      <View style={StyleSheet.absoluteFill}>
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
              onPress={() => safeBack('/(shuttle)')}
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

            {/* Share Trip button */}
            <Pressable
              onPress={handleShareTrip}
              disabled={shareBusy}
              style={({ pressed }) => [
                styles.shareTripBtn,
                { opacity: shareBusy ? 0.6 : 1, transform: [{ scale: pressed ? 0.93 : 1 }] },
              ]}
              accessibilityLabel="Share Trip"
            >
              <Share2 size={14} color={colors.foreground} strokeWidth={2.5} />
            </Pressable>

            {/* SOS button */}
            <Pressable
              onPress={handleSOS}
              style={({ pressed }) => [
                styles.sosBtn,
                { transform: [{ scale: pressed ? 0.93 : 1 }] },
              ]}
            >
              <AlertTriangle size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.sosBtnText}>SOS</Text>
            </Pressable>

          </View>

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
      </View>

      {/* ── Bottom sheet ─────────────────────────────────────────────────── */}
      {phase === 'at_stop' ? (
        /* ═══ AT STOP — bottom overlay sheet ═══════════════════════════ */
        <View style={[styles.atStopSheet, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: SCREEN_H * 0.68 }]}>
          {/* Header: stop name + timer */}
          <View style={styles.atStopHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.stopModeBadge}>
                <View style={styles.stopModeDot} />
                <Text style={[styles.stopModeLabel, { fontFamily: 'Inter_700Bold' }]}>STOP MODE</Text>
              </View>
              <Text style={[styles.atStopName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                {currentStop?.name ?? '—'}
              </Text>
            </View>
            <View style={[styles.timerBlock, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Clock size={13} color={stopTimer > 15 ? '#f59e0b' : '#ef4444'} strokeWidth={2} />
              <Text style={[styles.timerText, { fontFamily: 'Inter_700Bold', color: stopTimer > 15 ? '#f59e0b' : '#ef4444' }]}>
                {formatTimer(stopTimer)}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.atStopDivider, { backgroundColor: colors.border }]} />

          {/* Station timeout banner */}
          {stationTimeoutVisible && (
            <View style={styles.timeoutBanner}>
              <AlertTriangle size={13} color="#f59e0b" strokeWidth={2} />
              <Text style={[styles.timeoutText, { fontFamily: 'Inter_400Regular', flex: 1 }]}>{t.station_timeout_msg}</Text>
              <Pressable onPress={() => setStationTimeoutVisible(false)}><X size={13} color="#f59e0b" strokeWidth={2} /></Pressable>
            </View>
          )}

          {/* Passenger list */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.passengerList, { paddingBottom: insets.bottom + 8 }]} showsVerticalScrollIndicator={false}>
            {passengers.length === 0 ? (
              <View style={styles.emptyPassengers}>
                <Users size={26} color={colors.mutedForeground} strokeWidth={1.5} />
                <Text style={[styles.emptyPassengersText, { fontFamily: 'Inter_400Regular', color: colors.mutedForeground }]}>No passengers at this stop</Text>
              </View>
            ) : (
              passengers.map(p => {
                const status: PassengerStatus = passengerStatuses[p.id] ?? 'not_arrived';
                const isBoarded = status === 'boarded';
                const isNoShow = status === 'no_show';
                return (
                  <View key={p.id} style={[
                    styles.passengerRow,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    isBoarded && { borderColor: '#22c55e66', backgroundColor: '#22c55e0a' },
                    isNoShow  && { borderColor: '#ef444466', backgroundColor: '#ef44440a' },
                  ]}>
                    <View style={[styles.passengerAvatar, { backgroundColor: colors.secondary }, isBoarded && { backgroundColor: '#22c55e22' }, isNoShow && { backgroundColor: '#ef444422' }]}>
                      <Text style={[styles.passengerInitial, { fontFamily: 'Inter_700Bold', color: isBoarded ? '#22c55e' : isNoShow ? '#ef4444' : colors.foreground }]}>
                        {(p.name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.passengerName, { fontFamily: 'Inter_600SemiBold', color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                      <Text style={[styles.passengerPhone, { fontFamily: 'Inter_400Regular', color: colors.mutedForeground }]}>{p.phone}</Text>
                      {p.paymentMethod === 'cash' ? (
                        <View style={styles.paymentCashBadge}>
                          <Text style={[styles.paymentBadgeText, { fontFamily: 'Inter_700Bold', color: '#d97706' }]}>
                            💵 {p.fareAmount > 0 ? `${p.fareAmount} EGP` : 'Cash'}
                          </Text>
                        </View>
                      ) : p.paymentMethod === 'card' || p.paymentMethod === 'online' ? (
                        <View style={styles.paymentPaidBadge}>
                          <Text style={[styles.paymentBadgeText, { fontFamily: 'Inter_600SemiBold', color: '#16a34a' }]}>✓ Paid</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.statusBtns}>
                      <Pressable
                        onPress={() => updatePassengerStatus(p.id, isBoarded ? 'not_arrived' : 'boarded')}
                        style={[styles.statusBtn, isBoarded ? { backgroundColor: '#22c55e', borderColor: '#22c55e' } : { borderColor: 'rgba(34,197,94,0.5)' }]}
                      >
                        <Check size={18} color={isBoarded ? '#fff' : '#22c55e'} strokeWidth={2.5} />
                      </Pressable>
                      <Pressable
                        onPress={() => updatePassengerStatus(p.id, isNoShow ? 'not_arrived' : 'no_show')}
                        style={[styles.statusBtn, isNoShow ? { backgroundColor: '#ef4444', borderColor: '#ef4444' } : { borderColor: 'rgba(239,68,68,0.5)' }]}
                      >
                        <X size={18} color={isNoShow ? '#fff' : '#ef4444'} strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}

            {/* Action button */}
            <View style={{ marginTop: 12 }}>
              {isLastStop ? (
                <Pressable
                  disabled={lastStopProcessingRef.current || isNextLoading}
                  onPress={async () => {
                    if (lastStopProcessingRef.current) return;
                    lastStopProcessingRef.current = true;
                    try {
                      await handleFinishRoute();
                    } finally {
                      lastStopProcessingRef.current = false;
                    }
                  }}
                  style={[styles.primaryBtn, { opacity: (lastStopProcessingRef.current || isNextLoading) ? 0.6 : 1 }]}
                >
                  <LinearGradient colors={['#16a34a', '#22c55e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGrad}>
                    <Check size={18} color="#fff" strokeWidth={2.5} />
                    <Text style={[styles.primaryBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.finish_route}</Text>
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable
                  disabled={lastStopProcessingRef.current || isNextLoading}
                  onPress={async () => {
                    if (lastStopProcessingRef.current) return;
                    lastStopProcessingRef.current = true;
                    try {
                      await handleNextStop(failedStationActions.length > 0 ? failedStationActions : undefined);
                    } finally {
                      lastStopProcessingRef.current = false;
                    }
                  }}
                  style={[styles.primaryBtn, { opacity: (lastStopProcessingRef.current || isNextLoading) ? 0.6 : 1 }]}
                >
                  <LinearGradient colors={['#4f46e5', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGrad}>
                    <Navigation2 size={18} color="#fff" strokeWidth={2} />
                    <Text style={[styles.primaryBtnText, { fontFamily: 'Inter_700Bold' }]}>
                      {isNextLoading ? '…' : failedStationActions.length > 0 ? `Retry Failed (${failedStationActions.length}) →` : 'Depart to Next Stop →'}
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      ) : (
        /* ═══ EN ROUTE / APPROACHING — glass overlay card ══════════════ */
        <View style={[styles.enRouteSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.enRouteHandle} />

          {/* Progress dots */}
          {progressDots}

          {/* Next stop card */}
          {currentStop && (
            <View style={[styles.nextStopCard, { borderColor: phase === 'approaching' ? '#f59e0b66' : 'rgba(255,255,255,0.12)' }]}>
              <View style={styles.nextStopCardHeader}>
                <View style={[styles.stopIndexBadge, { backgroundColor: phase === 'approaching' ? '#f59e0b22' : 'rgba(255,255,255,0.1)' }]}>
                  <Text style={[styles.stopIndexText, { color: phase === 'approaching' ? '#f59e0b' : 'rgba(255,255,255,0.7)', fontFamily: 'Inter_700Bold' }]}>
                    {currentStopIndex + 1}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.nextStopLabel, { color: phase === 'approaching' ? '#f59e0b' : 'rgba(255,255,255,0.5)', fontFamily: 'Inter_600SemiBold' }]}>
                    {phase === 'approaching' ? '⚠ Approaching' : 'Next Stop'}
                  </Text>
                  <Text style={[styles.nextStopName, { color: '#fff', fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                    {currentStop.name}
                  </Text>
                </View>
                <View style={styles.distanceBadge}>
                  <Text style={[styles.distanceText, { color: phase === 'approaching' ? '#f59e0b' : 'rgba(255,255,255,0.9)', fontFamily: 'Inter_700Bold' }]}>
                    {distanceLabel(distanceM)}
                  </Text>
                  {roadEta.etaSeconds !== null && (
                    <Text style={[styles.etaText, { color: phase === 'approaching' ? '#f59e0b99' : 'rgba(255,255,255,0.45)', fontFamily: 'Inter_400Regular' }]}>
                      {etaLabel(roadEta.etaSeconds)}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.passengerCountRow}>
                <Users size={13} color="rgba(255,255,255,0.4)" strokeWidth={2} />
                <Text style={[styles.passengerCountText, { color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular' }]}>
                  {passengers.length} passenger{passengers.length !== 1 ? 's' : ''} at this stop
                </Text>
              </View>
            </View>
          )}

          {/* Station timeout banner */}
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
              colors={phase === 'approaching' ? ['#d97706', '#f59e0b'] : ['#4f46e5', '#6366f1']}
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
              style={[styles.finishBtn, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: '#22c55e' }]}
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

  // At stop sheet — absolute bottom overlay, height fits content
  atStopSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1 },
  atStopDivider: { height: 1, marginHorizontal: 16 },

  // En route sheet — glass overlay at bottom of screen
  enRouteSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(12,12,22,0.82)',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  enRouteHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },

  // Progress dots
  progressDots: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  dot: { height: 8, width: 14, borderRadius: 4 },

  // Next stop card
  nextStopCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
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
  atStopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14 },
  stopModeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#ef444418', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#ef444440' },
  stopModeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  stopModeLabel: { fontSize: 10, letterSpacing: 1.2, color: '#ef4444' },
  atStopName: { fontSize: 18 },
  timerBlock: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  timerText: { fontSize: 18, letterSpacing: 2 },

  // Timeout banner
  timeoutBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, marginBottom: 0,
    backgroundColor: '#f59e0b12', borderColor: '#f59e0b44', borderWidth: 1,
    borderRadius: 12, padding: 10,
  },
  timeoutText: { fontSize: 13, color: '#d97706', lineHeight: 18 },

  // Passenger list
  passengerList: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  emptyPassengers: { paddingVertical: 32, alignItems: 'center', gap: 10 },
  emptyPassengersText: { fontSize: 14, textAlign: 'center' },
  passengerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 16, borderWidth: 1,
    marginBottom: 8,
  },
  passengerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  passengerInitial: { fontSize: 16 },
  passengerName: { fontSize: 14, marginBottom: 2 },
  passengerPhone: { fontSize: 12 },
  statusBtns: { flexDirection: 'row', gap: 8 },
  statusBtn: { width: 44, height: 44, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Share Trip button
  shareTripBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,10,20,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },

  // SOS button
  sosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#dc2626', borderRadius: 18,
    paddingHorizontal: 11, paddingVertical: 7,
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 6, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(255,100,100,0.35)',
  },
  sosBtnText: {
    fontSize: 12, color: '#fff', fontFamily: 'Inter_700Bold', letterSpacing: 0.5,
  },

  // Primary action button
  paymentCashBadge: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#fcd34d' },
  paymentPaidBadge: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#86efac' },
  paymentBadgeText: { fontSize: 11 },
  primaryBtn: { borderRadius: 18, overflow: 'hidden' },
  primaryBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { fontSize: 15, color: '#fff' },
});
