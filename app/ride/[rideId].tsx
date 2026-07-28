import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Check, ChevronUp, Clock, Map, MessageCircle, Navigation, Phone, Share2, Shield, Star } from 'lucide-react-native';
import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';
import { useColors } from '@/hooks/useColors';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { useService } from '@/lib/serviceContext';
import { useWaitingCharge } from '@/hooks/useWaitingCharge';
import { useActiveLocationTracking } from '@/hooks/useActiveLocationTracking';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import { setActiveRideId } from '@/lib/backgroundLocationTask';
import { useDriverLocation } from '@/hooks/useDriverLocation';
import { useRoadPolyline } from '@/hooks/useRoadPolyline';
import { useNavigationRoute } from '@/hooks/useNavigationRoute';
import { endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';
import { useActiveSession } from '@/lib/activeSessionContext';
import type { DriverRideSession } from '@/lib/activeSession/types';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

const SERVICE_NAMES: Record<string, string> = {
  CAR: 'Car Rides',
  SCOOTER: 'Scooter',
  DELIVERY: 'Delivery',
};

type Phase = 'to_pickup' | 'arrived' | 'in_trip' | 'completed';
type PhaseCopy = { label: string; cta: string; next: Phase };

// Backend ride-status → UI phase mapping. 'searching' has no representation
// here (this screen is only reached post-acceptance) and 'cancelled' is
// handled separately as a screen exit, not a phase.
const STATUS_TO_PHASE: Partial<Record<string, Phase>> = {
  driver_assigned: 'to_pickup',
  driver_arrived: 'arrived',
  active: 'in_trip',
};


export default function RideScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const PHASE_COPY: Record<Phase, PhaseCopy> = {
    to_pickup: { label: t.phase_to_pickup, cta: t.phase_to_pickup_cta, next: 'arrived' },
    arrived: { label: t.phase_arrived, cta: t.phase_arrived_cta, next: 'in_trip' },
    in_trip: { label: t.phase_in_trip, cta: t.phase_in_trip_cta, next: 'completed' },
    completed: { label: t.phase_completed_label, cta: t.phase_done_btn, next: 'completed' },
  };
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { serviceType } = useService();
  const [phase, setPhase] = useState<Phase>('to_pickup');
  // Suppress useServiceGuard's forced /login redirect while a ride is still
  // in progress — a service becoming blocked mid-trip must not strand the
  // driver away from an active ride; the redirect resumes once completed.
  const { isBlocked, status: serviceStatus } = useServiceGuard(undefined, phase !== 'completed');
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareLink, setShareLink] = useState<{ id: number; url: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Reactive counterpart to hasExitedRef — lets location broadcasting stop
  // as soon as the ride is exiting, without waiting for unmount.
  const [isExiting, setIsExiting] = useState(false);
  // Guards the cancelled-ride exit (alert + navigate) so it only fires once,
  // whether triggered by the live socket event or a subsequent status refetch.
  const hasExitedRef = useRef(false);
  // The ride screen can mount before ActiveSession receives the post-accept
  // snapshot. Do not treat the normal initial null state as termination.
  const hasObservedRideSessionRef = useRef(false);
  // True from the moment "Complete trip" is tapped until the request settles.
  // The backend's completion endpoint and its session:snapshot(null) socket
  // push race independently of the local setPhase('completed') below (which
  // only runs after the request resolves) — if the null snapshot lands first,
  // phase is still 'in_trip' and the termination effect below would otherwise
  // mistake a successful completion for a cancellation.
  const isCompletingRef = useRef(false);

  // A non-completed ride takes priority over a blocked service — only treat
  // the screen as blocked once the ride itself has reached 'completed'.
  const blockedForScreen = isBlocked && phase === 'completed';

  const waitingCharge = useWaitingCharge(undefined, rideId);

  const locationTrackingEnabled = !!rideId && phase !== 'completed' && !isExiting;

  // REST snapshots (5-min interval, offline-queued) — unchanged from before.
  useActiveLocationTracking({
    enabled: locationTrackingEnabled,
    rideId: rideId ? Number(rideId) : null,
  });

  // Real-time ride-scoped location (driver:ride:location, ~5s) — active only
  // for the lifecycle of this ride; stops on completed/cancelled same as above.
  useLocationBroadcast({
    enabled: locationTrackingEnabled,
    rideId: rideId ? Number(rideId) : null,
  });

  // Lets the background location task (DRIVER_LOCATION_TASK) know which ride
  // is active, so a backgrounded update during the ride routes through the
  // ride-scoped tracking channel instead of the generic idle-online one.
  useEffect(() => {
    setActiveRideId(locationTrackingEnabled && rideId ? Number(rideId) : null);
    return () => setActiveRideId(null);
  }, [locationTrackingEnabled, rideId]);

  const { position: driverPosition } = useDriverLocation(locationTrackingEnabled);

  // Shared exit path for a ride that ended outside the driver's own action —
  // reached via a live socket event (cancelled by rider/system, timeout,
  // no-show) or a status refetch discovering the ride is already cancelled
  // (e.g. after app restart/reconnect).
  const exitRide = (title: string, message: string) => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    setIsExiting(true);
    Alert.alert(
      title,
      message,
      [{ text: t.ok, onPress: () => router.replace('/(tabs)/home') }],
    );
  };

  // Ride lifecycle socket events (backend-confirmed). Status-changing events
  // resync via the ActiveSession phase sync below; terminal events
  // (cancelled by rider, cancelled by driver/system, timeout, no-show) exit
  // the ride safely; deviation warning is surfaced without ever throwing.
  useEffect(() => {
    if (!socket || !rideId) return;

    const matchesThisRide = (data: unknown): boolean => {
      const payloadRideId = (data && typeof data === 'object')
        ? (data as { rideId?: string | number }).rideId
        : undefined;
      return payloadRideId == null || String(payloadRideId) === rideId;
    };

    const handleCancelled = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      exitRide(t.ride_cancelled_title, t.ride_cancelled_msg);
    };

    const handleDriverCancelled = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      exitRide(t.ride_cancelled_title, t.ride_driver_cancelled_msg);
    };

    const handleTimeout = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      exitRide(t.ride_timeout_title, t.ride_timeout_msg);
    };

    const handleNoShowCancelled = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      exitRide(t.ride_cancelled_title, t.ride_no_show_msg);
    };

    // Resilience fallback: advance phase directly from socket events in case
    // session:snapshot delivery is delayed. session:snapshot remains primary.
    const handleStatusChanged = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      const payload = data as { status?: string };
      const nextPhase = STATUS_TO_PHASE[payload?.status ?? ''];
      if (nextPhase) setPhase(nextPhase);
    };

    const handleDriverAssigned = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      setPhase('to_pickup');
    };

    const handleDriverArrived = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      setPhase('arrived');
    };

    const handleRideStarted = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      setPhase('in_trip');
    };

    const handleDeviationWarning = (data: unknown) => {
      try {
        if (!matchesThisRide(data)) return;
        Alert.alert(t.route_deviation_title, t.route_deviation_msg);
      } catch {
        // Never let a malformed deviation payload crash the ride screen.
      }
    };

    socket.on(SOCKET_EVENTS.RIDE_CANCELLED, handleCancelled);
    socket.on(SOCKET_EVENTS.RIDE_DRIVER_CANCELLED, handleDriverCancelled);
    socket.on(SOCKET_EVENTS.RIDE_TIMEOUT, handleTimeout);
    socket.on(SOCKET_EVENTS.RIDE_NO_SHOW_CANCELLED, handleNoShowCancelled);
    socket.on(SOCKET_EVENTS.RIDE_STATUS_UPDATE, handleStatusChanged);
    socket.on(SOCKET_EVENTS.RIDE_DRIVER_ASSIGNED, handleDriverAssigned);
    socket.on(SOCKET_EVENTS.RIDE_DRIVER_ARRIVED, handleDriverArrived);
    socket.on(SOCKET_EVENTS.RIDE_STARTED, handleRideStarted);
    socket.on(SOCKET_EVENTS.RIDE_DEVIATION_WARNING, handleDeviationWarning);

    return () => {
      socket.off(SOCKET_EVENTS.RIDE_CANCELLED, handleCancelled);
      socket.off(SOCKET_EVENTS.RIDE_DRIVER_CANCELLED, handleDriverCancelled);
      socket.off(SOCKET_EVENTS.RIDE_TIMEOUT, handleTimeout);
      socket.off(SOCKET_EVENTS.RIDE_NO_SHOW_CANCELLED, handleNoShowCancelled);
      socket.off(SOCKET_EVENTS.RIDE_STATUS_UPDATE, handleStatusChanged);
      socket.off(SOCKET_EVENTS.RIDE_DRIVER_ASSIGNED, handleDriverAssigned);
      socket.off(SOCKET_EVENTS.RIDE_DRIVER_ARRIVED, handleDriverArrived);
      socket.off(SOCKET_EVENTS.RIDE_STARTED, handleRideStarted);
      socket.off(SOCKET_EVENTS.RIDE_DEVIATION_WARNING, handleDeviationWarning);
    };
  }, [socket, rideId, queryClient]);

  // ActiveSession: primary source of truth for all ride display data.
  // Does not affect mutations, socket handlers, or cancellation logic.
  const { session, initialized } = useActiveSession();
  const rideSession: DriverRideSession | null =
    (initialized && session?.sessionType === 'ride')
      ? (session as DriverRideSession)
      : null;

  useEffect(() => {
    if (rideSession && String(rideSession.rideId) === String(rideId)) {
      hasObservedRideSessionRef.current = true;
    }
  }, [rideSession, rideId]);

  // Phase sync from ActiveSession: advances the UI phase whenever the backend
  // pushes a session:snapshot with an updated ride status. Cancellation is handled
  // separately — by socket events and the session→null termination effect.
  // 'completed' is never in DriverRideSession.status so it is never overwritten here.
  useEffect(() => {
    if (!rideSession) return;
    const nextPhase = STATUS_TO_PHASE[rideSession.status];
    if (nextPhase) setPhase(nextPhase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideSession?.status]);

  // ActiveSession termination: when the server ends the ride (cancellation,
  // timeout, admin action), the session:snapshot socket event delivers
  // { data: null }, which sets session = null in ActiveSessionContext.
  // This effect detects that transition and exits via the existing exitRide()
  // path, which is already guarded by hasExitedRef to prevent duplicate exits
  // alongside the socket-event paths.
  //
  // Guards:
  //   initialized — avoids acting on the initial null before the first fetch
  //                 or first socket snapshot has resolved.
  //   hasObservedRideSessionRef — only act after this screen has seen its own
  //                 active ride, not on the normal post-accept initial null.
  //   phase !== 'completed' — the completion/rating flow owns that exit path;
  //                           do not interfere when the ride finishes normally.
  useEffect(() => {
    if (
      !initialized ||
      session !== null ||
      !hasObservedRideSessionRef.current ||
      phase === 'completed' ||
      isCompletingRef.current
    ) return;
    exitRide(t.ride_cancelled_title, t.ride_cancelled_msg);
  // exitRide and t are stable within the component lifecycle and intentionally
  // omitted from deps — consistent with the existing useEffect at line ~177
  // that calls exitRide(t.*) with only [rideRaw] in its dependency array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, session, phase]);

  // ── Navigation route ─────────────────────────────────────────────────────
  // Waypoints are derived from rideSession (available before the early return
  // below) so this hook call is never conditional — React rules satisfied.
  //   to_pickup : driver → pickup
  //   in_trip   : driver → dropoff
  //   arrived / completed : null (no fetch; arrived uses MapBackdrop overview)
  const navWaypoints = useMemo(() => {
    if (!driverPosition) return null;
    if (phase === 'to_pickup') {
      const lat = rideSession?.pickup.latitude;
      const lng = rideSession?.pickup.longitude;
      if (lat == null || lng == null) return null;
      return [
        { latitude: driverPosition.latitude, longitude: driverPosition.longitude },
        { latitude: Number(lat), longitude: Number(lng) },
      ];
    }
    if (phase === 'in_trip') {
      const lat = rideSession?.dropoff.latitude;
      const lng = rideSession?.dropoff.longitude;
      if (lat == null || lng == null) return null;
      return [
        { latitude: driverPosition.latitude, longitude: driverPosition.longitude },
        { latitude: Number(lat), longitude: Number(lng) },
      ];
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, driverPosition?.latitude, driverPosition?.longitude,
      rideSession?.pickup.latitude, rideSession?.pickup.longitude,
      rideSession?.dropoff.latitude, rideSession?.dropoff.longitude]);

  const { coords: roadPolylineCoords } = useRoadPolyline(navWaypoints);

  // ── Phase 3: navigation destination (fixed endpoint for rerouting) ───────
  // Derived independently of driverPosition so it stays stable while driving.
  const navDestination = useMemo(() => {
    if (phase === 'to_pickup') {
      const lat = rideSession?.pickup.latitude;
      const lng = rideSession?.pickup.longitude;
      if (lat == null || lng == null) return null;
      return { latitude: Number(lat), longitude: Number(lng) };
    }
    if (phase === 'in_trip') {
      const lat = rideSession?.dropoff.latitude;
      const lng = rideSession?.dropoff.longitude;
      if (lat == null || lng == null) return null;
      return { latitude: Number(lat), longitude: Number(lng) };
    }
    return null;
  }, [
    phase,
    rideSession?.pickup.latitude, rideSession?.pickup.longitude,
    rideSession?.dropoff.latitude, rideSession?.dropoff.longitude,
  ]);

  const navActive = phase === 'to_pickup' || phase === 'in_trip';
  const { remainingPolyline } = useNavigationRoute(
    roadPolylineCoords,
    driverPosition,
    navDestination,
    navActive,
  );

  // All hooks called above — safe to short-circuit for blocked service.
  // A non-completed ride keeps the driver in the ride flow regardless of
  // service-block state; normal blocking resumes once the ride completes.
  if (blockedForScreen) {
    return <ServiceBlockedScreen status={serviceStatus} serviceName={SERVICE_NAMES[serviceType] ?? serviceType} />;
  }

  const p = PHASE_COPY[phase];

  // ── ActiveSession fields ────────────────────────────────────────────────────
  // All ride display data is sourced exclusively from ActiveSession.
  const passengerName  = rideSession?.passenger?.name;
  const passengerPhone = rideSession?.passenger?.phone;
  const pickupAddress  = rideSession?.pickup.address;
  const pickupLat      = rideSession?.pickup.latitude;
  const pickupLng      = rideSession?.pickup.longitude;
  const dropoffAddress = rideSession?.dropoff.address;
  const dropoffLat     = rideSession?.dropoff.latitude;
  const dropoffLng     = rideSession?.dropoff.longitude;
  const paymentMethod  = rideSession?.paymentMethod;
  const displayFare    = rideSession?.finalPrice ?? rideSession?.estimatedPrice;
  // vehicleType: available for future use; not yet rendered in this screen.
  const vehicleType    = rideSession?.vehicleType;
  // Avatar: DriverRideSession.passenger has no avatar URL — initials derived from name.
  const passengerInitials = passengerName
    ? passengerName.trim().split(/\s+/).map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : '?';
  // duration: formatted client-side from estimatedDurationMinutes (e.g. 15 → "15 min"); null if unavailable.
  const displayDuration = rideSession?.estimatedDurationMinutes != null
    ? `${rideSession.estimatedDurationMinutes} min`
    : null;
  // distanceKm: formatted ride distance (e.g. 1.5 → "1.5 km"); null if unavailable.
  // ActiveSession provides one total distance, not separate pickup/dropoff distances.
  const displayDistance = rideSession?.distanceKm != null
    ? `${rideSession.distanceKm} km`
    : null;

  function getPhaseEta(): string {
    if (phase === 'to_pickup') {
      // ETA is not available in ActiveSession; show distance only if present.
      return displayDistance ?? t.calculating;
    }
    if (phase === 'arrived') return t.waiting_for_rider;
    if (phase === 'in_trip') {
      const parts: string[] = [];
      if (displayDuration) parts.push(displayDuration);
      if (displayDistance) parts.push(displayDistance);
      return parts.length > 0 ? parts.join(' · ') : t.calculating;
    }
    return '';
  }

  const sheetAnim = useRef(new Animated.Value(100)).current;
  const completedAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.5)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(sheetAnim, { toValue: 0, stiffness: 200, damping: 20, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (phase === 'completed') {
      Animated.parallel([
        Animated.timing(completedAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(checkScale, { toValue: 1, stiffness: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [phase]);

  useEffect(() => {
    if (!waitingCharge || waitingCharge.capped) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [!!waitingCharge, waitingCharge?.capped]);

  const handleNext = async () => {
    if (phase === 'completed') {
      router.replace('/(tabs)/home');
      return;
    }
    setBusy(true);
    try {
      // Guard: verify ActiveSession status matches the expected transition
      // before firing the mutation — prevents double-taps or stale phase.
      const expectedStatus: Partial<Record<Phase, string>> = {
        to_pickup: 'driver_assigned',
        arrived: 'driver_arrived',
        in_trip: 'active',
      };
      const expected = expectedStatus[phase];
      if (!rideSession || (expected && rideSession.status !== expected)) {
        Alert.alert('Status Changed', 'Ride status has changed. Refreshing...');
        setBusy(false);
        return;
      }

      if (phase === 'to_pickup') await endpoints.rides.arrived(rideId ?? '');
      else if (phase === 'arrived') await endpoints.rides.start(rideId ?? '');
      else if (phase === 'in_trip') {
        // Set before the request so the session-termination effect above
        // doesn't mistake the backend's own end-of-ride socket push (which
        // can arrive before this await resolves) for a cancellation.
        isCompletingRef.current = true;
        try {
          await endpoints.rides.complete(rideId ?? '');
        } catch (err) {
          isCompletingRef.current = false;
          throw err;
        }
        queryClient.invalidateQueries({ queryKey: ['earnings-summary'] });
        queryClient.invalidateQueries({ queryKey: ['earnings-weekly'] });
      }
      setPhase(p.next);
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string } })?.body;
      Alert.alert(t.action_failed_title, body?.error ?? t.try_again_msg);
    } finally {
      setBusy(false);
    }
  };

  // Driver-initiated cancel — only reachable while phase is 'to_pickup' or
  // 'arrived' (see the CTA sheet below); once the ride is 'in_trip' this
  // action is not offered.
  const handleCancelRide = () => {
    if (cancelling) return;
    Alert.alert(
      t.cancel_ride,
      t.cancel_ride_confirm_msg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.cancel_ride_confirm_btn,
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await endpoints.rides.cancel(rideId ?? '');
              hasExitedRef.current = true;
              setIsExiting(true);
              router.replace('/(tabs)/home');
            } catch (err: unknown) {
              const body = (err as { body?: { error?: string } })?.body;
              Alert.alert(t.action_failed_title, body?.error ?? t.try_again_msg);
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  const handleSOS = async () => {
    if (sosBusy) return;
    setSosBusy(true);
    try {
      let latitude = 0;
      let longitude = 0;
      try {
        const Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      } catch {
        // location unavailable — backend will use last known position
      }

      if (socket?.connected) {
        const numericRideId = rideId ? Number(rideId) : undefined;
        socket.emit(SOCKET_EVENTS.DRIVER_SOS, {
          ...(numericRideId != null && !isNaN(numericRideId) ? { rideId: numericRideId } : {}),
          latitude,
          longitude,
        });
      } else {
        await endpoints.rides.sos(rideId ?? '', { latitude, longitude });
      }
      Alert.alert(t.sos_sent_title, t.sos_sent_msg);
    } catch {
      Alert.alert(t.sos_failed_title, t.sos_failed_msg);
    } finally {
      setSosBusy(false);
    }
  };

  const copyShareLink = async (url: string) => {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(url);
  };

  const handleRevokeShareTrip = async () => {
    if (!shareLink || shareBusy) return;
    setShareBusy(true);
    try {
      await endpoints.tripShare.revoke(shareLink.id);
      setShareLink(null);
      Alert.alert(t.trip_share_revoked_title, t.trip_share_revoked_msg);
    } catch {
      Alert.alert(t.action_failed_title, t.trip_share_revoke_error);
    } finally {
      setShareBusy(false);
    }
  };

  const handleShareTrip = async () => {
    if (shareBusy) return;

    if (shareLink) {
      // A link is already active — offer to copy/share it again or stop
      // sharing, instead of silently revoking on tap.
      Alert.alert(t.trip_share_active_title, t.trip_share_active_msg, [
        { text: t.trip_share_copy_btn, onPress: () => { copyShareLink(shareLink.url); } },
        { text: t.trip_share_send_btn, onPress: () => { Share.share({ message: shareLink.url }).catch(() => {}); } },
        { text: t.trip_share_revoke_btn, style: 'destructive', onPress: handleRevokeShareTrip },
        { text: t.cancel, style: 'cancel' },
      ]);
      return;
    }

    setShareBusy(true);
    try {
      const numericRideId = rideId ? Number(rideId) : undefined;
      if (numericRideId == null || isNaN(numericRideId)) return;
      const result = await endpoints.tripShare.create({ rideId: numericRideId });
      setShareLink({ id: result.id, url: result.url });
      Alert.alert(t.trip_share_created_title, t.trip_share_created_msg, [
        { text: t.trip_share_copy_btn, onPress: () => { copyShareLink(result.url); } },
        { text: t.ok, style: 'default', onPress: () => { Share.share({ message: result.url }).catch(() => {}); } },
      ]);
    } catch {
      Alert.alert(t.action_failed_title, t.trip_share_error);
    } finally {
      setShareBusy(false);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0 || ratingSubmitting) return;
    setRatingSubmitting(true);
    try {
      await endpoints.rides.ratePassenger(rideId ?? '', rating, ratingComment.trim() || undefined);
    } catch {
      // Best-effort: already-rated (409), not-your-ride (403), or not-completed (422)
      // all just mean the rating didn't go through — don't block the driver from returning home.
    } finally {
      setRatingSubmitting(false);
    }
    router.replace('/(tabs)/home');
  };

  const handleSkipRating = () => {
    router.replace('/(tabs)/home');
  };

  // ── Google Maps deep link ────────────────────────────────────────────────
  // During to_pickup / arrived → navigate to pickup; during in_trip → dropoff.
  const handleNavigate = useCallback(() => {
    const target =
      phase === 'in_trip'
        ? (dropoffLat != null && dropoffLng != null
            ? { lat: Number(dropoffLat), lng: Number(dropoffLng) }
            : null)
        : (pickupLat != null && pickupLng != null
            ? { lat: Number(pickupLat), lng: Number(pickupLng) }
            : null);

    if (!target) return;
    const { lat, lng } = target;

    // Android: native intent → web fallback
    // iOS: URL scheme → web fallback
    const androidUrl = `google.navigation:q=${lat},${lng}`;
    const iosSchemeUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
    const webFallback = `https://maps.google.com/?daddr=${lat},${lng}`;

    if (Platform.OS === 'android') {
      Linking.canOpenURL(androidUrl)
        .then(supported =>
          Linking.openURL(supported ? androidUrl : webFallback),
        )
        .catch(() => Linking.openURL(webFallback).catch(() => {}));
    } else {
      Linking.canOpenURL(iosSchemeUrl)
        .then(supported =>
          Linking.openURL(supported ? iosSchemeUrl : webFallback),
        )
        .catch(() => Linking.openURL(webFallback).catch(() => {}));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapBackdrop
        pickup={pickupLat != null && pickupLng != null
          ? { latitude: Number(pickupLat), longitude: Number(pickupLng) }
          : undefined}
        dropoff={dropoffLat != null && dropoffLng != null
          ? { latitude: Number(dropoffLat), longitude: Number(dropoffLng) }
          : undefined}
        driverLocation={driverPosition ?? undefined}
        roadPolyline={remainingPolyline ?? undefined}
        navigationMode={phase === 'to_pickup' || phase === 'in_trip'}
      />

      <View style={[styles.overlay, { paddingTop: topPad }]}>
        <View style={styles.topNav}>
          <GlassView strong style={styles.navCard} borderRadius={20}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.navIcon}>
              <Navigation size={20} color={colors.primaryForeground} strokeWidth={2} />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.navEta, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{getPhaseEta()}</Text>
              <Text style={[styles.navAddress, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                {phase === 'in_trip' ? (dropoffAddress ?? '—') : (pickupAddress ?? '—')}
              </Text>
            </View>
          </GlassView>
        </View>
      </View>

      {phase === 'completed' && (
        <Animated.View style={[styles.completedOverlay, { opacity: completedAnim, backgroundColor: colors.background + 'CC' }]}>
          <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.checkCircleGrad}>
              <Check size={48} color={colors.primaryForeground} strokeWidth={3} />
            </LinearGradient>
          </Animated.View>
          <Text style={[styles.completedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.trip_done_title}</Text>
          <Text style={[styles.fareEarned, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>+{parseFloat(String(displayFare ?? 0)).toFixed(2)} {t.egp}</Text>
          <Text style={[styles.fareNote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.added_to_earnings}</Text>

          <GlassView style={styles.ratingCard} borderRadius={16}>
            <View style={styles.ratingCardHeader}>
              <View style={[styles.ratingAvatar, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.secondary }]}>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_700Bold' }}>{passengerInitials}</Text>
              </View>
              <Text style={[styles.ratingCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.rate_rider_label.replace('{name}', passengerName ?? '—')}</Text>
            </View>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} onPress={() => setRating(n)}>
                  <Star size={36} color={n <= rating ? colors.accent : colors.accent + '60'} fill={n <= rating ? colors.accent : 'transparent'} strokeWidth={2} />
                </Pressable>
              ))}
            </View>
            {rating > 0 && (
              <TextInput
                style={[styles.commentInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
                placeholder={t.rating_comment_placeholder}
                placeholderTextColor={colors.mutedForeground}
                value={ratingComment}
                onChangeText={setRatingComment}
                maxLength={500}
                multiline
              />
            )}
          </GlassView>

          <View style={styles.ratingActionsRow}>
            <Pressable onPress={handleSkipRating} disabled={ratingSubmitting} style={[styles.skipBtn, { borderColor: colors.border }]}>
              <Text style={[styles.skipBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.skip_btn}</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitRating}
              disabled={rating === 0 || ratingSubmitting}
              style={[styles.doneBtn, { opacity: rating === 0 || ratingSubmitting ? 0.5 : 1 }]}
            >
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.doneBtnGrad}>
                {ratingSubmitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.doneBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.submit_rating_btn}</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* ── Floating Google Maps navigation button ────────────────────── */}
      {phase !== 'completed' && (
        <Pressable
          onPress={handleNavigate}
          style={[styles.floatingNavBtn, { bottom: insets.bottom + 360 }]}
          accessibilityLabel="Open in Google Maps"
        >
          <Map size={22} color="#3b82f6" strokeWidth={2} />
        </Pressable>
      )}

      {phase !== 'completed' && (
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
          <GlassView strong style={styles.sheetCard} borderRadius={24}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={styles.riderRow}>
              <View style={[styles.riderAvatar, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.secondary }]}>
                <Text style={{ color: colors.mutedForeground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>{passengerInitials}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.riderName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{passengerName ?? '—'}</Text>
                <View style={styles.riderMeta}>
                  <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                  <Text style={[styles.riderMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {'—'} · {paymentMethod ?? '—'} · {parseFloat(String(displayFare ?? 0)).toFixed(2)} {t.egp}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.primary + '26' }]}
                onPress={() => router.push({ pathname: '/ride/chat', params: { rideId: rideId ?? '' } } as any)}
                accessibilityLabel="Message rider"
              >
                <MessageCircle size={20} color={colors.primary} strokeWidth={2} />
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.primary + '26' }]}
                onPress={() => {
                  const phone = passengerPhone;
                  if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
                }}
                accessibilityLabel="Call rider"
              >
                <Phone size={20} color={colors.primary} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Waiting charge ticker — visible only in 'arrived' phase */}
            {phase === 'arrived' && waitingCharge != null && (
              <Animated.View
                style={[
                  styles.waitingTicker,
                  {
                    backgroundColor: waitingCharge.capped ? colors.secondary : '#D5B23D18',
                    borderColor: waitingCharge.capped ? colors.border : '#D5B23D55',
                    opacity: waitingCharge.capped ? 1 : pulseAnim,
                  },
                ]}
              >
                <Clock size={13} color={waitingCharge.capped ? colors.mutedForeground : '#D5B23D'} strokeWidth={2.5} />
                <Text style={[styles.waitingTickerText, { color: waitingCharge.capped ? colors.mutedForeground : '#D5B23D', fontFamily: 'Inter_700Bold' }]}>
                  {`Waiting fee: +${waitingCharge.amount.toFixed(2)} ${t.egp} · ${waitingCharge.minutes} min`}
                </Text>
                {waitingCharge.capped && (
                  <View style={styles.cappedBadge}>
                    <Text style={[styles.cappedText, { fontFamily: 'Inter_700Bold' }]}>CAPPED</Text>
                  </View>
                )}
              </Animated.View>
            )}

            <Text style={[styles.phaseLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{p.label}</Text>

            <Pressable onPress={handleNext} disabled={busy} style={styles.ctaBtn}>
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.ctaBtnGrad, { opacity: busy ? 0.7 : 1 }]}>
                <ChevronUp size={20} color={colors.primaryForeground} strokeWidth={2} />
                <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{p.cta}</Text>
              </LinearGradient>
            </Pressable>

            {(phase === 'to_pickup' || phase === 'arrived') && (
              <Pressable
                onPress={handleCancelRide}
                disabled={cancelling}
                style={[styles.cancelRideBtn, { opacity: cancelling ? 0.6 : 1 }]}
                accessibilityLabel="Cancel ride"
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <Text style={[styles.cancelRideBtnText, { color: colors.destructive, fontFamily: 'Inter_600SemiBold' }]}>{t.cancel_ride}</Text>
                )}
              </Pressable>
            )}

            <View style={styles.bottomRow}>
              <View style={styles.safetyRow}>
                <Shield size={14} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.safetyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.safety_toolkit_trip}</Text>
              </View>
              <View style={styles.bottomActions}>
                <Pressable
                  onPress={handleShareTrip}
                  disabled={shareBusy}
                  style={[styles.shareBtn, { backgroundColor: colors.secondary, opacity: shareBusy ? 0.6 : 1 }]}
                  accessibilityLabel="Share Trip"
                >
                  <Share2 size={14} color={colors.foreground} strokeWidth={2} />
                  <Text style={[styles.shareBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {shareLink ? t.trip_share_revoke_btn : t.trip_share_btn}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSOS}
                  disabled={sosBusy}
                  style={[styles.sosBtn, { opacity: sosBusy ? 0.6 : 1 }]}
                  accessibilityLabel="Send SOS"
                >
                  <AlertTriangle size={14} color={colors.destructiveForeground} strokeWidth={2} />
                  <Text style={[styles.sosBtnText, { color: colors.destructiveForeground, fontFamily: 'Inter_700Bold' }]}>SOS</Text>
                </Pressable>
              </View>
            </View>
          </GlassView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { flex: 1 },
  topNav: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  navCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  navIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navEta: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  navAddress: { fontSize: Typography.size.md, marginTop: 2 },
  completedOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, zIndex: 20 },
  checkCircle: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
  checkCircleGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  completedTitle: { fontSize: 24, marginTop: Spacing.xl },
  fareEarned: { fontSize: 48, lineHeight: 52 },
  fareNote: { fontSize: Typography.size.sm, marginTop: Spacing.sm },
  ratingCard: { padding: Spacing.lg, marginTop: Spacing.xl, width: '100%' },
  ratingCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ratingAvatar: { width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: '#e5e5ea' },
  ratingCardLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', flexShrink: 1 },
  starsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  ratingActionsRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl, width: '100%' },
  skipBtn: { flex: 1, height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  skipBtnText: { fontSize: Typography.size.md },
  doneBtn: { flex: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  doneBtnGrad: { height: 56, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontSize: Typography.size.md },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, zIndex: 30 },
  sheetCard: { padding: 20 },
  sheetHandle: { width: 48, height: 6, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.lg },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  riderAvatar: { width: 48, height: 48, borderRadius: Radius.xl, backgroundColor: '#e5e5ea' },
  riderName: { fontSize: Typography.size.md },
  riderMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: 2 },
  riderMetaText: { fontSize: Typography.size.xs },
  actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  waitingTicker: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1,
  },
  waitingTickerText: { fontSize: 13, flex: 1 },
  cappedBadge: { backgroundColor: '#ef444422', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  cappedText: { fontSize: 9, color: '#ef4444', letterSpacing: 0.8 },
  phaseLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: Spacing.lg },
  ctaBtn: { marginTop: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  ctaBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  ctaBtnText: { fontSize: Typography.size.md },
  cancelRideBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: Spacing.xs },
  cancelRideBtnText: { fontSize: Typography.size.sm },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md },
  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  safetyText: { fontSize: Typography.size.xs },
  bottomActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  floatingNavBtn: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(15,15,25,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 10 },
  shareBtnText: { fontSize: Typography.size.xs },
  sosBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: '#ef4444', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 10 },
  sosBtnText: { fontSize: Typography.size.xs },
  commentInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular', marginTop: Spacing.md, minHeight: 60, textAlignVertical: 'top' },
});
