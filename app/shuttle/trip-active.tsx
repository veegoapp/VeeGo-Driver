import { showAlert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/navUtils';
import {
  AlertTriangle, ArrowRight, Banknote, Check, ChevronLeft, Clock, MapPin, Share2, Users, X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Dimensions, Image, Linking, Platform, Pressable, ScrollView,
  Share, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapBackdrop } from '@/components/MapBackdrop';
import { useNavigation } from 'expo-router';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useDriverLocation, haversineMeters } from '@/hooks/useDriverLocation';
import { useGPSPermissionRecheck } from '@/hooks/useGPSProvider';
import { useRoadEta } from '@/hooks/useRoadEta';
import { useRoadPolyline } from '@/hooks/useRoadPolyline';
import { useActiveLocationTracking } from '@/hooks/useActiveLocationTracking';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import { setActiveShuttleTripId } from '@/lib/backgroundLocationTask';
import { useShuttle, type ShuttleStop, type BoardingPassenger } from '@/lib/shuttleContext';
import { useActiveSession } from '@/lib/activeSessionContext';
import { useI18n } from '@/lib/i18nContext';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { endpoints, type ShuttleCompleteResponse, type StationEtaResponse } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';
import { SosSheet } from '@/components/SosSheet';

// ── Navigation constants ──────────────────────────────────────────────────────
/**
 * Configurable thresholds for the shuttle trip active screen.
 * Centralised here so they can be adjusted without hunting through logic code.
 */
const SHUTTLE_TRIP_CONFIG = {
  /** Haversine distance (metres) at which the driver transitions en_route → approaching. */
  APPROACH_THRESHOLD_M: 250,
  /** Dwell time (seconds) the per-stop countdown is initialised to on arrival. */
  STOP_DURATION_S: 60,
} as const;

const { height: SCREEN_H } = Dimensions.get('window');

// "C" split-panel palette — matches the ride screens' design language.
const C_MINT = '#3DDC97';
const C_AMBER = '#F5A623';
const C_RED = '#D92D20';

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
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const { socket } = useSocket();
  const navigation = useNavigation();
  const shuttleCtx = useShuttle();
  const {
    activeLine, stops, currentStopIndex, passengers, nextStop, stationCoords,
  } = shuttleCtx;

  // ── ActiveSession (Phase 1 migration) ──────────────────────────────────────
  // DriverShuttleSession is the preferred source for display/read-only fields.
  // Mutations and ShuttleContext-computed state (stops, currentStopIndex,
  // passengers, stationCoords, nextStop) are not yet migrated.
  const { session } = useActiveSession();
  const shuttleSession = session?.sessionType === 'shuttle_trip' ? session : null;

  const currentStop = stops[currentStopIndex] ?? null;
  const nextCoords = stationCoords[currentStopIndex] ?? null;
  const isLastStop = stops.length > 0 && currentStopIndex >= stops.length - 1;
  // Prefer session tripId (authoritative); fall back to ShuttleContext while
  // DriverShuttleSession is not yet initialized or not yet providing a value.
  // Route param set by the Start Trip flow (app/shuttle/trip-details.tsx) —
  // takes priority over ShuttleContext's ambient "activeLine" (first line
  // with status in-progress), which can still be stale or resolve to a
  // different trip right after Start and would join live-tracking to the
  // wrong trip. Normalize to string | undefined to preserve compatibility
  // with API endpoints and socket comparisons that expect a string.
  const { tripId: routeTripId } = useLocalSearchParams<{ tripId?: string }>();
  const _rawTripId = shuttleSession?.tripId ?? routeTripId ?? activeLine?.tripId;
  const tripId: string | undefined = _rawTripId != null ? String(_rawTripId) : undefined;
  // Prefer session direction for display; fall back to ShuttleContext.
  const direction = shuttleSession?.direction ?? activeLine?.direction;
  // Prefer session station count for display (badge, SOS text, progress dots);
  // fall back to ShuttleContext. isLastStop intentionally keeps stops.length
  // (ShuttleContext computed) to avoid rendering the Finish button prematurely
  // before the session initialises.
  const totalStops = shuttleSession?.stations.length ?? stops.length;
  const stationId = currentStop?.id;

  useActiveLocationTracking({
    enabled: !!activeLine || !!shuttleSession,
    tripId: tripId != null ? Number(tripId) : null,
  });

  // Real-time driver location broadcast (socket, with REST fallback) — same
  // infrastructure used on the shuttle home/idle screen, kept alive through
  // the active trip so passenger-facing tracking doesn't go stale.
  useLocationBroadcast({
    enabled: !!activeLine || !!shuttleSession,
    tripId: tripId ?? null,
  });

  // Lets the background location task (DRIVER_LOCATION_TASK) know which
  // shuttle trip is active — mirrors setActiveRideId in app/ride/[rideId].tsx
  // — so a backgrounded update during this trip (screen locked, app not
  // foregrounded) still carries tripId instead of falling back to the
  // untagged idle-online ping. Cleared on unmount and whenever the trip
  // stops being active (session/line become null), which covers completion,
  // cancellation, and navigating away alike (D6-1/D8-1).
  useEffect(() => {
    const active = !!activeLine || !!shuttleSession;
    setActiveShuttleTripId(active && tripId ? Number(tripId) : null);
    return () => setActiveShuttleTripId(null);
  }, [activeLine, shuttleSession, tripId]);

  // ── GPS ────────────────────────────────────────────────────────────────────
  const tripIsLive = !!activeLine || !!shuttleSession;
  const { position: gpsPos, permissionDenied: gpsPermissionDenied } = useDriverLocation(tripIsLive);
  const effectivePos = gpsPos;
  const recheckGpsPermission = useGPSPermissionRecheck();

  // Haversine used only for proximity-based phase transitions (fast, no network)
  const proximityM = useMemo(() => {
    if (!effectivePos || !nextCoords) return null;
    return haversineMeters(effectivePos.latitude, effectivePos.longitude, nextCoords.latitude, nextCoords.longitude);
  }, [effectivePos?.latitude, effectivePos?.longitude, nextCoords?.latitude, nextCoords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase state (declared early — referenced by useRoadEta below) ───────────
  const [phase, setPhase] = useState<TripPhase>('en_route');

  // Road-accurate distance + ETA via OSRM (throttled, with fallback)
  const roadEta = useRoadEta(effectivePos, nextCoords, phase !== 'at_stop' && (!!activeLine || !!shuttleSession));
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

  const [stopTimer, setStopTimer] = useState<number>(SHUTTLE_TRIP_CONFIG.STOP_DURATION_S);
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
  // Fix 3: track whether an active shuttle session was ever present on this screen
  const hasHadSessionRef = useRef(false);
  const sessionTerminatedNavRef = useRef(false);
  const [stationTimeoutVisible, setStationTimeoutVisible] = useState(false);
  // Stable identity (unlike an inline arrow function) so it doesn't defeat
  // AtStopSheet's React.memo on every parent re-render (e.g. each GPS tick).
  const dismissStationTimeout = useCallback(() => setStationTimeoutVisible(false), []);
  const [stationEtas, setStationEtas] = useState<StationEtaResponse | null>(null);

  // Map always fills full height — both sheets are absolute overlays

  // ── Phase transitions (GPS-driven, uses haversine for reliability) ─────────
  useEffect(() => {
    if (phase === 'at_stop') return;
    if (proximityM !== null) {
      const next: TripPhase = proximityM <= SHUTTLE_TRIP_CONFIG.APPROACH_THRESHOLD_M ? 'approaching' : 'en_route';
      if (next !== phase) setPhase(next);
    }
  }, [proximityM]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset all per-stop state when the active stop changes
  useEffect(() => {
    setPhase('en_route');
    setPassengerStatuses({});
    setStopTimer(SHUTTLE_TRIP_CONFIG.STOP_DURATION_S);
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
    if (!activeLine && !shuttleSession) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (isFinishingRef.current) return; // intentional finish — let it through
      e.preventDefault();
      showAlert(
        t.trip_active_exit_title,
        t.trip_active_exit_body,
        [
          { text: t.cancel, style: 'cancel' },
          { text: t.exit_label, style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsub;
  }, [navigation, activeLine, shuttleSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fix 3: Navigate home when active session is terminated by the backend ──
  // Triggers only after a session was previously seen (not during initial load).
  useEffect(() => {
    if (shuttleSession) {
      hasHadSessionRef.current = true;
      return;
    }
    // shuttleSession is null here
    if (!hasHadSessionRef.current) return; // never had a session; skip (initial load)
    if (sessionTerminatedNavRef.current) return; // already navigating; prevent duplicates
    sessionTerminatedNavRef.current = true;
    isFinishingRef.current = true; // bypass the exit guard alert
    router.replace('/(shuttle)' as any);
  }, [shuttleSession]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const handler = async (data: { tripId?: number | string }) => {
      // D5-1: server sends a numeric tripId; local tripId is normalized to a
      // string (see comment above its declaration) — coerce both sides for
      // comparison, matching the sibling BOOKING_PASSENGER_UPDATED handler.
      if (!data.tripId || String(data.tripId) !== String(tripId)) return;
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

  // ── Station ETAs — fetched from backend on mount and after each transition ─
  const fetchStationEtas = useCallback(async () => {
    if (!tripId) return;
    try {
      const result = await endpoints.trips.stationsEta(tripId) as StationEtaResponse;
      setStationEtas(result);
    } catch {
      // Best-effort; OSRM local estimate serves as fallback when unavailable.
    }
  }, [tripId]);

  // Fetch ETAs once on mount / whenever the active trip changes.
  useEffect(() => {
    fetchStationEtas();
  }, [fetchStationEtas]);

  const handleArrived = useCallback(async () => {
    if (!stationId || isArrivingLoading) return;
    setIsArrivingLoading(true);
    try {
      if (tripId) await endpoints.trips.stationArrived(tripId, stationId);
      void fetchStationEtas(); // refresh ETAs after recording arrival
      setPhase('at_stop');
      setTimerActive(true);
      if (nextCoords) setFocusTarget({ latitude: nextCoords.latitude, longitude: nextCoords.longitude, zoom: 16 });
    } catch {
      if (tripId) showAlert(t.error, t.station_action_error);
    } finally {
      setIsArrivingLoading(false);
    }
  }, [tripId, stationId, isArrivingLoading, nextCoords, t, fetchStationEtas]);

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
          showAlert(
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
        // A dropped network here (after per-passenger boarding/no-show calls
        // already succeeded) used to fall through to the generic outer catch
        // with no retry — a plain re-tap would then re-run those already-
        // successful per-passenger calls too. Retry just this call instead.
        try {
          await endpoints.trips.stationCompleted(tripId, stationId);
        } catch {
          showAlert(
            t.error,
            t.station_action_error,
            [
              { text: t.cancel, style: 'cancel' },
              { text: t.retry_label, onPress: () => { handleNextStop([]); } },
            ]
          );
          return;
        }
        void fetchStationEtas(); // refresh ETAs after recording completion
      }
      nextStop();
    } catch {
      showAlert(t.error, t.station_action_error);
      return;
    } finally {
      setIsNextLoading(false);
    }
  }, [isNextLoading, tripId, stationId, passengerStatuses, passengers, nextStop, t, fetchStationEtas]);

  const handleFinishRoute = useCallback(async () => {
    // Use the screen's own resolved tripId (session → route param →
    // ShuttleContext fallback) — activeLine.tripId alone can be stale or
    // point at a different trip than the one actually on screen, which used
    // to leave Finish Route silently doing nothing (or completing the wrong
    // trip) when the route's data was missing from the routes list.
    if (!tripId) return;
    isFinishingRef.current = true;
    try {
      // PATCH /driver/trips/:id/complete performs the status transition and
      // broadcasts SHUTTLE_TRIP_STATUS/ADMIN_TRACK_TRIP itself — the
      // DRIVER_TRIP_COMPLETE socket emit that used to duplicate this
      // broadcast was removed (D5-6/D8-4: dead handler, payload mismatch).
      const result = await endpoints.trips.complete(tripId) as ShuttleCompleteResponse;
      const earned = result?.earnedAmount ?? result?.data?.earnedAmount;
      const balance = result?.walletBalance ?? result?.data?.walletBalance;
      router.replace({
        pathname: '/shuttle/trip-complete' as any,
        params: {
          earnedAmount: earned != null ? String(earned) : '',
          walletBalance: balance != null ? String(balance) : '',
          tripId,
        },
      });
    } catch {
      // The completion request failed server-side — do NOT navigate to the
      // success screen. Restore the exit guard and let the driver retry.
      isFinishingRef.current = false;
      showAlert(t.error, t.trip_complete_error);
    }
  }, [tripId, t]);

  const updatePassengerStatus = useCallback((passengerId: string, status: PassengerStatus) => {
    setPassengerStatuses(prev => ({ ...prev, [passengerId]: status }));
  }, []);

  // ── SOS / Safety button ────────────────────────────────────────────────────
  // Same SosSheet as the ride screen — 3 actions (call 122, call 123, share
  // on WhatsApp), each always reporting to the backend before the local
  // action. The WhatsApp message carries the route (from → to) and trip
  // number instead of passenger data — a shuttle trip has several
  // passengers, so there's no single "who" to name.
  const [sosOpen, setSosOpen] = useState(false);
  const handleSOS = useCallback(() => setSosOpen(true), []);

  // ── Share Trip ───────────────────────────────────────────────────────────────
  const copyShareLink = useCallback(async (url: string) => {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(url);
  }, []);

  const handleRevokeShareTrip = useCallback(async () => {
    if (!shareLink || shareBusy) return;
    setShareBusy(true);
    try {
      await endpoints.tripShare.revoke(shareLink.id);
      setShareLink(null);
      showAlert(t.trip_share_revoked_title, t.trip_share_revoked_msg);
    } catch {
      showAlert(t.error, t.trip_share_revoke_error);
    } finally {
      setShareBusy(false);
    }
  }, [shareLink, shareBusy, t]);

  const handleShareTrip = useCallback(async () => {
    if (shareBusy) return;

    if (shareLink) {
      // A link is already active — offer to copy/share it again or stop
      // sharing, instead of silently revoking on tap.
      showAlert(t.trip_share_active_title, t.trip_share_active_msg, [
        { text: t.trip_share_copy_btn, onPress: () => { copyShareLink(shareLink.url); } },
        { text: t.trip_share_send_btn, onPress: () => { Share.share({ message: shareLink.url }).catch(() => {}); } },
        { text: t.trip_share_revoke_btn, style: 'destructive', onPress: handleRevokeShareTrip },
        { text: t.cancel, style: 'cancel' },
      ]);
      return;
    }

    setShareBusy(true);
    try {
      const numericTripId = tripId != null ? Number(tripId) : undefined;
      if (numericTripId == null || isNaN(numericTripId)) return;
      const result = await endpoints.tripShare.create({ tripId: numericTripId });
      setShareLink({ id: result.id, url: result.url });
      showAlert(t.trip_share_created_title, t.trip_share_created_msg, [
        { text: t.trip_share_copy_btn, onPress: () => { copyShareLink(result.url); } },
        { text: t.ok, style: 'default', onPress: () => { Share.share({ message: result.url }).catch(() => {}); } },
      ]);
    } catch {
      showAlert(t.error, t.trip_share_error);
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy, shareLink, tripId, t, copyShareLink, handleRevokeShareTrip]);

  // ── Progress dots ──────────────────────────────────────────────────────────
  const progressDots = (
    <View style={styles.progressDots}>
      {(shuttleSession?.stations ?? stops).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < currentStopIndex && { backgroundColor: S.teal },
            i === currentStopIndex && { backgroundColor: S.ink, width: 24 },
            i > currentStopIndex && { backgroundColor: S.hair },
          ]}
        />
      ))}
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* GPS permission is required to run a trip — an empty map with no
          location broadcast to passengers used to fail completely silently.
          Block trip actions entirely until it's granted. */}
      {tripIsLive && gpsPermissionDenied && (
        <View style={[StyleSheet.absoluteFill, styles.gpsBlockOverlay, { paddingTop: topPad }]}>
          <GlassView strong style={styles.gpsBlockCard} borderRadius={24}>
            <AlertTriangle size={32} color="#ef4444" strokeWidth={2} />
            <Text style={[styles.gpsBlockTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {t.gps_permission_required_title}
            </Text>
            <Text style={[styles.gpsBlockBody, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.gps_permission_required_body}
            </Text>
            <Pressable
              style={[styles.gpsBlockBtn, { backgroundColor: '#3D52D5' }]}
              onPress={() => Linking.openSettings().catch(() => {})}
            >
              <Text style={[styles.gpsBlockBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.open_settings}</Text>
            </Pressable>
            <Pressable style={styles.gpsBlockRetryBtn} onPress={recheckGpsPermission}>
              <Text style={[styles.gpsBlockRetryText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                {t.ive_enabled_it}
              </Text>
            </Pressable>
          </GlassView>
        </View>
      )}

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

            {!!direction && (
              <GlassView style={styles.tripBadge} borderRadius={20}>
                <Text style={[styles.badgeText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {direction === 'outbound' ? t.direction_outbound
                    : direction === 'return' ? t.direction_return
                    : direction}
                </Text>
              </GlassView>
            )}

            <GlassView style={styles.tripBadge} borderRadius={20}>
              <Users size={13} color={colors.foreground} strokeWidth={2} />
              <Text style={[styles.badgeText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {currentStopIndex + 1}/{totalStops}
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
              accessibilityLabel={t.share_trip_label}
            >
              <Share2 size={14} color={colors.foreground} strokeWidth={2.5} />
            </Pressable>

            {/* SOS button */}
            <Pressable
              onPress={handleSOS}
              style={({ pressed }) => [
                styles.sosBtn,
                { backgroundColor: colors.destructive, shadowColor: colors.destructive },
                { transform: [{ scale: pressed ? 0.93 : 1 }] },
              ]}
            >
              <AlertTriangle size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.sosBtnText}>{t.sos_label}</Text>
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
                <Text style={[styles.hudLabel, { fontFamily: 'Inter_400Regular' }]}>{t.unit_kmh}</Text>
              </View>

              <View style={styles.hudSep} />

              {/* Distance to next station */}
              <View style={styles.hudCell}>
                <Text style={[styles.hudPrimary, { fontFamily: 'Inter_700Bold' }]}>
                  {distanceM !== null ? distanceLabel(distanceM) : '—'}
                </Text>
                <Text style={[styles.hudLabel, { fontFamily: 'Inter_400Regular' }]}>{t.hud_distance_label}</Text>
              </View>

              <View style={styles.hudSep} />

              {/* ETA — prefer backend-calculated value; fall back to OSRM estimate */}
              <View style={styles.hudCell}>
                <Text style={[styles.hudPrimary, { fontFamily: 'Inter_700Bold' }]}>
                  {stationEtas?.nextStation?.etaMinutes != null
                    ? `~${stationEtas.nextStation.etaMinutes} min`
                    : roadEta.etaSeconds !== null ? etaLabel(roadEta.etaSeconds) : '—'}
                </Text>
                <Text style={[styles.hudLabel, { fontFamily: 'Inter_400Regular' }]}>{t.home_eta}</Text>
              </View>
            </View>
          )}

          {/* Approaching banner — sits at bottom of map area */}
          {phase === 'approaching' && currentStop && (
            <View style={styles.approachBannerWrapper} pointerEvents="none">
              <View style={styles.approachBanner}>
                <AlertTriangle size={16} color="#f59e0b" strokeWidth={2} />
                <Text style={[styles.approachText, { fontFamily: 'Inter_700Bold' }]}>
                  {t.approaching_stop_msg.replace('{name}', currentStop.name)}
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
        <AtStopSheet
          t={t}
          isRTL={isRTL}
          insetsBottom={insets.bottom}
          currentStop={currentStop}
          stopTimer={stopTimer}
          stationTimeoutVisible={stationTimeoutVisible}
          onDismissTimeout={dismissStationTimeout}
          passengers={passengers}
          passengerStatuses={passengerStatuses}
          onUpdatePassengerStatus={updatePassengerStatus}
          isLastStop={isLastStop}
          isNextLoading={isNextLoading}
          failedStationActions={failedStationActions}
          lastStopProcessingRef={lastStopProcessingRef}
          onFinishRoute={handleFinishRoute}
          onNextStop={handleNextStop}
        />
      ) : (
        /* ═══ EN ROUTE / APPROACHING — C split panel ══════════════ */
        <View style={[styles.enRouteWrapC, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.splitCardC}>
            <View style={styles.leftPanelC}>
              <View style={styles.statusRowC}>
                <View style={[styles.statusDotC, { backgroundColor: phase === 'approaching' ? C_AMBER : C_MINT }]} />
                <Text style={styles.leftLabelC} numberOfLines={2}>
                  {phase === 'approaching' ? t.approaching_label : t.next_stop_label}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <Text style={styles.leftCapC}>{t.home_eta}</Text>
              <Text style={styles.leftEtaValC} numberOfLines={1}>
                {stationEtas?.nextStation?.etaMinutes != null
                  ? `${stationEtas.nextStation.etaMinutes} min`
                  : roadEta.etaSeconds !== null ? etaLabel(roadEta.etaSeconds).replace('~', '') : '—'}
              </Text>
            </View>

            <View style={styles.rightPanelC}>
              {progressDots}

              {currentStop && (
                <View style={styles.stopRowC}>
                  <View style={[styles.stopIndexBadgeC, phase === 'approaching' && { backgroundColor: '#FCEBD1' }]}>
                    <Text style={[styles.stopIndexTextC, phase === 'approaching' && { color: C_AMBER }]}>
                      {currentStopIndex + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.stopCapC}>
                      {(phase === 'approaching' ? t.approaching_label : t.next_stop_label)} · {distanceLabel(distanceM)}
                    </Text>
                    <Text style={styles.stopNameC} numberOfLines={1}>{currentStop.name}</Text>
                  </View>
                </View>
              )}

              <View style={styles.passengerCountRowC}>
                <Users size={13} color={S.cap} strokeWidth={2} />
                <Text style={styles.passengerCountTextC}>
                  {t.passengers_at_stop_msg
                    .replace('{count}', String(passengers.length))
                    .replace('{pax}', passengers.length === 1 ? t.pax_one : t.pax_many)}
                </Text>
              </View>

              {/* Station timeout banner */}
              {stationTimeoutVisible && (
                <View style={styles.timeoutBannerC}>
                  <AlertTriangle size={14} color="#d97706" strokeWidth={2} />
                  <Text style={styles.timeoutTextC}>{t.station_timeout_msg}</Text>
                  <Pressable onPress={() => setStationTimeoutVisible(false)}>
                    <X size={14} color="#d97706" strokeWidth={2} />
                  </Pressable>
                </View>
              )}

              {/* Mark Arrived button */}
              <Pressable
                onPress={handleArrived}
                disabled={isArrivingLoading || !currentStop}
                style={[styles.arrivedBtnC, { opacity: isArrivingLoading ? 0.6 : 1 }]}
              >
                <Check size={16} color="#ffffff" strokeWidth={2.5} />
                <Text style={styles.arrivedBtnTextC}>
                  {isArrivingLoading ? '…' : t.mark_arrived_label}
                </Text>
              </Pressable>

              {/* Finish route if last stop */}
              {isLastStop && (
                <Pressable onPress={handleFinishRoute} style={styles.finishBtnC}>
                  <Check size={16} color={S.teal} strokeWidth={2} />
                  <Text style={styles.finishBtnTextC}>{t.finish_route}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      )}

      <SosSheet
        visible={sosOpen}
        onClose={() => setSosOpen(false)}
        mode="shuttle"
        tripId={tripId}
        routeFrom={activeLine?.from}
        routeTo={activeLine?.to}
        fallbackCoords={effectivePos}
      />
    </View>
  );
}

// ── At-stop passenger sheet ─────────────────────────────────────────────────
// Extracted so this heavy, scrolling passenger list only re-renders when its
// own inputs change (a passenger status, the stop timer, the current stop) —
// not on every ~1 Hz GPS tick from the parent screen, which none of this JSX
// reads. Pure JSX relocation: no change to any boarding/timer/completion logic.
type AtStopSheetProps = {
  t: ReturnType<typeof useI18n>['t'];
  isRTL: boolean;
  insetsBottom: number;
  currentStop: ShuttleStop | null;
  stopTimer: number;
  stationTimeoutVisible: boolean;
  onDismissTimeout: () => void;
  passengers: BoardingPassenger[];
  passengerStatuses: Record<string, PassengerStatus>;
  onUpdatePassengerStatus: (passengerId: string, status: PassengerStatus) => void;
  isLastStop: boolean;
  isNextLoading: boolean;
  failedStationActions: { id: string; name: string; action: 'boarded' | 'no_show' }[];
  lastStopProcessingRef: React.MutableRefObject<boolean>;
  onFinishRoute: () => void | Promise<void>;
  onNextStop: (retryOnly?: { id: string; action: 'boarded' | 'no_show' }[]) => void | Promise<void>;
};

const AtStopSheet = React.memo(function AtStopSheet({
  t, isRTL, insetsBottom, currentStop, stopTimer, stationTimeoutVisible, onDismissTimeout,
  passengers, passengerStatuses, onUpdatePassengerStatus, isLastStop, isNextLoading,
  failedStationActions, lastStopProcessingRef, onFinishRoute, onNextStop,
}: AtStopSheetProps) {
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  return (
    <View style={[styles.atStopSheetC, { maxHeight: SCREEN_H * 0.68 }]}>
      {/* Dark header: stop name + STOP MODE badge + timer */}
      <View style={styles.atStopHeaderC}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.stopModeBadgeC}>
            <View style={styles.stopModeDotC} />
            <Text style={styles.stopModeLabelC}>{t.stop_mode_label}</Text>
          </View>
          <Text style={styles.atStopNameC} numberOfLines={1}>{currentStop?.name ?? '—'}</Text>
        </View>
        <View style={styles.timerBlockC}>
          <Clock size={13} color={stopTimer > 15 ? C_AMBER : '#F3C6C2'} strokeWidth={2} />
          <Text style={[styles.timerTextC, { color: stopTimer > 15 ? C_AMBER : '#F3C6C2' }]}>
            {formatTimer(stopTimer)}
          </Text>
        </View>
      </View>

      {/* White body: timeout banner + passenger list + CTA */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.passengerListC, { paddingBottom: insetsBottom + 8 }]} showsVerticalScrollIndicator={false}>
        {stationTimeoutVisible && (
          <View style={styles.timeoutBannerC}>
            <AlertTriangle size={13} color="#d97706" strokeWidth={2} />
            <Text style={styles.timeoutTextC}>{t.station_timeout_msg}</Text>
            <Pressable onPress={onDismissTimeout}><X size={13} color="#d97706" strokeWidth={2} /></Pressable>
          </View>
        )}

        <Text style={styles.passengerListCapC}>
          {t.passengers_at_stop_msg
            .replace('{count}', String(passengers.length))
            .replace('{pax}', passengers.length === 1 ? t.pax_one : t.pax_many)}
        </Text>

        {passengers.length === 0 ? (
          <View style={styles.emptyPassengersC}>
            <Users size={26} color={S.cap} strokeWidth={1.5} />
            <Text style={styles.emptyPassengersTextC}>{t.no_passengers_at_stop}</Text>
          </View>
        ) : (
          passengers.map(p => {
            const status: PassengerStatus = passengerStatuses[p.id] ?? 'not_arrived';
            const isBoarded = status === 'boarded';
            const isNoShow = status === 'no_show';
            return (
              <View key={p.id} style={styles.passengerRowC}>
                {p.avatar ? (
                  <Image source={{ uri: p.avatar }} style={styles.passengerAvatarImgC} />
                ) : (
                  <View style={[styles.passengerAvatarC, isBoarded && { backgroundColor: '#DDF4EB' }, isNoShow && { backgroundColor: '#F9DEDA' }]}>
                    <Text style={[styles.passengerInitialC, { color: isBoarded ? S.teal : isNoShow ? C_RED : S.ink }]}>
                      {(p.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.passengerNameC} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.passengerPhoneC}>{p.phone}</Text>
                  {p.destinationStationName ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <MapPin size={11} color={S.cap} strokeWidth={2} />
                      <Text style={styles.passengerPhoneC} numberOfLines={1}>
                        {t.drop_off_at}: {p.destinationStationName}
                      </Text>
                    </View>
                  ) : null}
                  {p.paymentMethod === 'cash' ? (
                    <View style={styles.paymentCashBadgeC}>
                      <Banknote size={11} color="#d97706" strokeWidth={2} />
                      <Text style={[styles.paymentBadgeTextC, { color: '#d97706' }]}>
                        {p.fareAmount > 0 ? `${p.fareAmount} ${t.egp}` : t.cash_label}
                      </Text>
                    </View>
                  ) : p.paymentMethod === 'card' || p.paymentMethod === 'online' ? (
                    <View style={styles.paymentPaidBadgeC}>
                      <Text style={[styles.paymentBadgeTextC, { color: S.teal }]}>{t.paid_badge}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.statusBtnsC}>
                  <Pressable
                    onPress={() => onUpdatePassengerStatus(p.id, isBoarded ? 'not_arrived' : 'boarded')}
                    style={[styles.statusBtnC, isBoarded ? { backgroundColor: S.teal, borderColor: S.teal } : { borderColor: '#B9E4DB' }]}
                  >
                    <Check size={16} color={isBoarded ? '#ffffff' : S.teal} strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    onPress={() => onUpdatePassengerStatus(p.id, isNoShow ? 'not_arrived' : 'no_show')}
                    style={[styles.statusBtnC, isNoShow ? { backgroundColor: C_RED, borderColor: C_RED } : { borderColor: '#F3C6C2' }]}
                  >
                    <X size={14} color={isNoShow ? '#ffffff' : C_RED} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {/* Action button */}
        <View style={{ marginTop: Spacing.md }}>
          {isLastStop ? (
            <Pressable
              disabled={lastStopProcessingRef.current || isNextLoading}
              onPress={async () => {
                if (lastStopProcessingRef.current) return;
                lastStopProcessingRef.current = true;
                try {
                  await onFinishRoute();
                } finally {
                  lastStopProcessingRef.current = false;
                }
              }}
              style={[styles.primaryBtnC, { opacity: (lastStopProcessingRef.current || isNextLoading) ? 0.6 : 1 }]}
            >
              <Check size={18} color="#ffffff" strokeWidth={2.5} />
              <Text style={styles.primaryBtnTextC}>{t.finish_route}</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={lastStopProcessingRef.current || isNextLoading}
              onPress={async () => {
                if (lastStopProcessingRef.current) return;
                lastStopProcessingRef.current = true;
                try {
                  await onNextStop(failedStationActions.length > 0 ? failedStationActions : undefined);
                } finally {
                  lastStopProcessingRef.current = false;
                }
              }}
              style={[styles.primaryBtnC, { opacity: (lastStopProcessingRef.current || isNextLoading) ? 0.6 : 1 }]}
            >
              <Text style={styles.primaryBtnTextC}>
                {isNextLoading
                  ? '…'
                  : failedStationActions.length > 0
                  ? t.retry_failed_label.replace('{count}', String(failedStationActions.length))
                  : t.depart_to_next_stop_label}
              </Text>
              {!isNextLoading && (
                <ArrowRight size={16} color="#ffffff" strokeWidth={2.5} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
});

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },

  // GPS permission block
  gpsBlockOverlay: {
    zIndex: 100,
    elevation: 100,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  gpsBlockCard: { padding: Spacing.xl, alignItems: 'center', gap: 10, width: '100%', maxWidth: 360 },
  gpsBlockTitle: { fontSize: Typography.size.lg, textAlign: 'center', marginTop: 4 },
  gpsBlockBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  gpsBlockBtn: { alignSelf: 'stretch', height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  gpsBlockBtnText: { color: '#fff', fontSize: 15 },
  gpsBlockRetryBtn: { paddingVertical: 10 },
  gpsBlockRetryText: { fontSize: 13 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  tripBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: Typography.size.xs },

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
  hudPrimary: { fontSize: Typography.size.lg, color: '#fff', lineHeight: 22 },
  hudLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' },
  hudSep: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Approaching banner
  approachBannerWrapper: { position: 'absolute', bottom: 12, left: 16, right: 16 },
  approachBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(20,18,8,0.88)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
  },
  approachText: { flex: 1, fontSize: 13, color: '#fef3c7' },
  approachBadge: { backgroundColor: '#f59e0b22', borderRadius: 10, paddingHorizontal: Spacing.sm, paddingVertical: 3, alignItems: 'center' },
  approachBadgeText: { fontSize: Typography.size.xs, color: '#f59e0b' },

  // ── "C" en-route / approaching split card ──────────────────────────────
  enRouteWrapC: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing.md, paddingTop: 10 },
  splitCardC: { borderRadius: 24, overflow: 'hidden', flexDirection: 'row', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.16, shadowRadius: 20 },
  leftPanelC: { width: 104, flexShrink: 0, backgroundColor: S.panel, paddingHorizontal: 12, paddingVertical: 16 },
  statusRowC: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDotC: { width: 7, height: 7, borderRadius: 3.5 },
  leftLabelC: { flex: 1, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase' },
  leftCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: S.cap, textTransform: 'uppercase' },
  leftEtaValC: { fontSize: 18, fontFamily: 'Inter_700Bold', color: C_MINT, marginTop: 1 },
  rightPanelC: { flex: 1, backgroundColor: S.card, padding: 16 },
  progressDots: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  dot: { height: 6, width: 14, borderRadius: 3 },
  stopRowC: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stopIndexBadgeC: { width: 32, height: 32, borderRadius: 10, backgroundColor: S.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  stopIndexTextC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: S.ink },
  stopCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, color: S.cap, textTransform: 'uppercase' },
  stopNameC: { fontSize: 14.5, fontFamily: 'Inter_700Bold', color: S.ink, marginTop: 1 },
  passengerCountRowC: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  passengerCountTextC: { fontSize: 11.5, fontFamily: 'Inter_600SemiBold', color: S.cap },
  arrivedBtnC: { marginTop: 14, height: 48, borderRadius: 24, backgroundColor: S.panel, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrivedBtnTextC: { fontSize: 13.5, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  finishBtnC: { marginTop: 10, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: '#B9E4DB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  finishBtnTextC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: S.teal },

  // ── "C" at-stop sheet — dark header band + white body, content-sized ──
  atStopSheetC: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: S.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  atStopHeaderC: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: S.panel, paddingHorizontal: Spacing.lg, paddingTop: 18, paddingBottom: 16 },
  stopModeBadgeC: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginBottom: 6 },
  stopModeDotC: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C_RED },
  stopModeLabelC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, color: '#F3C6C2', textTransform: 'uppercase' },
  atStopNameC: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  timerBlockC: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  timerTextC: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },

  // Timeout banner (light, inside white body)
  timeoutBannerC: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#FCEBD1', borderColor: '#F3D9A8', borderWidth: 1,
    borderRadius: 14, padding: 10, marginTop: Spacing.sm,
  },
  timeoutTextC: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#d97706', lineHeight: 18 },

  // Passenger list
  passengerListC: { paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: Spacing.lg },
  passengerListCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, color: S.cap, textTransform: 'uppercase', marginBottom: 10 },
  emptyPassengersC: { paddingVertical: Spacing.xxl, alignItems: 'center', gap: 10 },
  emptyPassengersTextC: { fontSize: Typography.size.sm, textAlign: 'center', fontFamily: 'Inter_400Regular', color: S.cap },
  passengerRowC: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: 11, borderRadius: 16, backgroundColor: S.surfaceMuted,
    marginBottom: Spacing.sm,
  },
  passengerAvatarC: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: S.surfaceMuted },
  passengerAvatarImgC: { width: 40, height: 40, borderRadius: 20 },
  passengerInitialC: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold' },
  passengerNameC: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold', color: S.ink, marginBottom: 2 },
  passengerPhoneC: { fontSize: Typography.size.xs, fontFamily: 'Inter_400Regular', color: S.cap },
  statusBtnsC: { flexDirection: 'row', gap: Spacing.sm },
  statusBtnC: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Share Trip button
  shareTripBtn: {
    width: 32, height: 32, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,10,20,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },

  // SOS button
  sosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 18,
    paddingHorizontal: 11, paddingVertical: 7,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 6, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(255,100,100,0.35)',
  },
  sosBtnText: {
    fontSize: Typography.size.xs, color: '#fff', fontFamily: 'Inter_700Bold', letterSpacing: 0.5,
  },

  // Payment badges + primary action button (at-stop sheet)
  paymentCashBadgeC: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.xs, backgroundColor: '#FCEBD1', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  paymentPaidBadgeC: { alignSelf: 'flex-start', marginTop: Spacing.xs, backgroundColor: '#DDF4EB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  paymentBadgeTextC: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  primaryBtnC: { height: 52, borderRadius: 16, backgroundColor: S.panel, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  primaryBtnTextC: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  });
}
