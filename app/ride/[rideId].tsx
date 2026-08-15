import { showAlert } from '@/lib/alert';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Check, ChevronUp, Clock, Delete, Map, MessageCircle, Navigation, Phone, Share2, Shield, Star } from 'lucide-react-native';
import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { RideMap } from '@/components/RideMap';
import { GlassView } from '@/components/GlassView';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';
import { useColors } from '@/hooks/useColors';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { useService } from '@/lib/serviceContext';
import { useWaitingCharge } from '@/hooks/useWaitingCharge';
import { useActiveLocationTracking } from '@/hooks/useActiveLocationTracking';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import { setActiveRideId } from '@/lib/backgroundLocationTask';
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

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
];


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
  // "Other amount" change flow (cash rides only — see handleCompleteWithChange).
  const [amountSheetOpen, setAmountSheetOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [confirmChangeOpen, setConfirmChangeOpen] = useState(false);
  const [submittingChange, setSubmittingChange] = useState(false);
  const [creditedChange, setCreditedChange] = useState(0);
  // Captured directly from the completion API response — ActiveSession is
  // nulled out (session:snapshot { data: null }) the moment the ride
  // completes, so rideSession/displayFare can't be trusted for the
  // completed-phase display; this is the actual source of truth for it.
  const [completionResult, setCompletionResult] = useState<{
    finalPrice: number;
    driverCut: number;
    grossFare: number;
    promoDiscount: number;
    walletDeduction: number;
    netCashPayable: number;
  } | null>(null);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  // Reactive counterpart to hasExitedRef — lets location broadcasting stop
  // as soon as the ride is exiting, without waiting for unmount.
  const [isExiting, setIsExiting] = useState(false);
  // Google-Maps-style navigation: the trip card collapses to a peek at the
  // bottom while actively driving (to_pickup / in_trip) so the car marker sits
  // in the lower third and the road ahead fills the screen. It auto-expands
  // when waiting for the rider ('arrived') and can be re-expanded by tapping
  // the card handle (e.g. on reaching the destination to end the ride).
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
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
  // Latched true once the ride has reached 'completed'. Completion is terminal:
  // once we're showing the fare/rating screen, NOTHING may revert the phase
  // (e.g. a late/stale ActiveSession snapshot still carrying status 'active',
  // which the reconnect flow can deliver out of order) or fire the
  // cancelled-exit path. Unlike `phase`, a ref is immune to stale-closure reads
  // inside the socket handlers. This is the invariant that keeps the rating
  // card from vanishing and the false "Trip cancelled" alert from appearing.
  const completedRef = useRef(false);

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

  // Shared exit path for a ride that ended outside the driver's own action —
  // reached via a live socket event (cancelled by rider/system, timeout,
  // no-show) or a status refetch discovering the ride is already cancelled
  // (e.g. after app restart/reconnect).
  //
  // completedRef guard: the backend's cancellation path is an atomic
  // compare-and-swap (UPDATE ... WHERE status IN (pre-completion statuses)),
  // so it is IMPOSSIBLE for a ride to be cancelled in the database after this
  // driver's own "Complete trip" tap has already succeeded — that update only
  // ever emits ride:cancelled when it wins a genuine race against completion.
  // But a cancellation attempted moments before completion can still emit its
  // socket event AFTER the local phase has already flipped to 'completed'
  // (ordinary event-delivery timing, not a data bug) — and every terminal
  // socket handler (handleCancelled, handleDriverCancelled, handleTimeout,
  // handleNoShowCancelled) funnels through this one function. So this is the
  // single choke point to enforce "completion is terminal": once
  // completedRef is set, nothing here may show an alert or navigate away.
  const exitRide = (title: string, message: string) => {
    if (hasExitedRef.current || completedRef.current) return;
    hasExitedRef.current = true;
    setIsExiting(true);
    showAlert(
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
      if (completedRef.current) return; // completion is terminal — never revert
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
        showAlert(t.route_deviation_title, t.route_deviation_msg);
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
    // Completion is terminal — never let a late/stale snapshot (e.g. one still
    // carrying status 'active', re-delivered out of order after a reconnect)
    // drag the screen back out of the fare/rating overlay into 'in_trip'.
    if (completedRef.current) return;
    if (!rideSession) return;
    const nextPhase = STATUS_TO_PHASE[rideSession.status];
    if (nextPhase) setPhase(nextPhase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideSession?.status]);

  // Latch the terminal 'completed' state so the guards above/below (which read a
  // ref, immune to stale closures) can never be bypassed by a later re-render.
  useEffect(() => {
    if (phase === 'completed') completedRef.current = true;
  }, [phase]);


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
      completedRef.current ||
      isCompletingRef.current
    ) return;
    exitRide(t.ride_cancelled_title, t.ride_cancelled_msg);
  // exitRide and t are stable within the component lifecycle and intentionally
  // omitted from deps — consistent with the existing useEffect at line ~177
  // that calls exitRide(t.*) with only [rideRaw] in its dependency array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, session, phase]);

  // ── Navigation route ─────────────────────────────────────────────────────
  // Route fetching (initial leg fetch + off-route reroute) is fully owned by
  // useNavigationRoute, called from <RideMap> — not here. That hook, and the
  // GPS subscription feeding it (useDriverLocation), moved into RideMap so a
  // GPS tick re-renders only that small subtree instead of this whole screen
  // (see components/RideMap.tsx). navDestination/navActive below are the only
  // navigation inputs this screen still derives and passes down as stable props.
  //   to_pickup : driver → pickup
  //   in_trip   : driver → dropoff
  //   arrived / completed : no destination (no fetch; arrived uses MapBackdrop overview)

  // ── Phase 3: navigation destination (fixed endpoint for rerouting) ───────
  // Derived independently of driverPosition so it stays stable while driving.
  const navDestination = useMemo(() => {
    // driver_assigned (to_pickup) AND driver_arrived (arrived) both route the
    // directions polyline driver → pickup. Keeping 'arrived' in this branch
    // prevents MapBackdrop's non-nav autoPolyline (pickup → dropoff) from
    // drawing the full trip route while the driver is still at/near pickup.
    if (phase === 'to_pickup' || phase === 'arrived') {
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

  const navActive = phase === 'to_pickup' || phase === 'arrived' || phase === 'in_trip';

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
  // Small label above the destination in the nav card. No time/distance (kept
  // off deliberately to avoid spending Google Directions on live ETA).
  const navLabel =
    phase === 'arrived' ? t.waiting_for_rider : phase === 'in_trip' ? t.phase_in_trip : t.navigate;

  const sheetAnim = useRef(new Animated.Value(100)).current;
  // 0 = expanded, 1 = collapsed. Drives the extra downward translate that
  // hides all of the card except the top peek during active navigation.
  const collapseAnim = useRef(new Animated.Value(0)).current;
  const completedAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.5)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(sheetAnim, { toValue: 0, stiffness: 200, damping: 20, useNativeDriver: true }).start();
  }, []);

  const toggleSheet = useCallback(() => setSheetCollapsed((c) => !c), []);

  // Auto-collapse while actively navigating (to_pickup / in_trip); auto-expand
  // when arrived (waiting for rider) so the phase controls are reachable.
  useEffect(() => {
    setSheetCollapsed(phase === 'to_pickup' || phase === 'in_trip');
  }, [phase]);

  useEffect(() => {
    Animated.spring(collapseAnim, {
      toValue: sheetCollapsed ? 1 : 0,
      stiffness: 200,
      damping: 24,
      useNativeDriver: true,
    }).start();
  }, [sheetCollapsed]);

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
        showAlert(t.ride_status_changed_title, t.ride_status_changed_msg);
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
        let completeResult;
        try {
          completeResult = await endpoints.rides.complete(rideId ?? '');
        } catch (err) {
          isCompletingRef.current = false;
          throw err;
        }
        // Set synchronously the instant completion is confirmed — not inside
        // the `useEffect` keyed on `phase` below, which only latches this
        // after the next render commits. A cancellation-family socket event
        // (RIDE_CANCELLED etc.) landing in that gap would otherwise read a
        // stale `completedRef.current === false` and pop the "Ride Cancelled"
        // alert over the just-shown Trip Completed / rating screen.
        completedRef.current = true;
        setCompletionResult({
          finalPrice: completeResult.data.finalPrice,
          driverCut: completeResult.data.driverCut,
          grossFare: completeResult.data.grossFare,
          promoDiscount: completeResult.data.promoDiscount,
          walletDeduction: completeResult.data.walletDeduction,
          netCashPayable: completeResult.data.netCashPayable,
        });
        queryClient.invalidateQueries({ queryKey: ['earnings-summary'] });
        queryClient.invalidateQueries({ queryKey: ['earnings-weekly'] });
      }
      setPhase(p.next);
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string } })?.body;
      showAlert(t.action_failed_title, body?.error ?? t.try_again_msg);
    } finally {
      setBusy(false);
    }
  };

  // "Other amount" flow: driver received more cash than the fare and has no
  // change on hand — the difference gets credited to the rider's wallet
  // instead. Server re-derives and caps the change (1–99 EGP, cash rides
  // only); the client-side numbers below are display-only.
  const fareAmount = parseFloat(String(displayFare ?? 0));
  const parsedAmountReceived = parseFloat(amountInput) || 0;
  const computedChange = Math.round((parsedAmountReceived - fareAmount) * 100) / 100;

  const handleOpenAmountSheet = () => {
    setAmountInput('');
    setAmountSheetOpen(true);
  };

  const handleKeypadDigit = (d: string) => {
    setAmountInput((prev) => {
      if (d === '.' && prev.includes('.')) return prev;
      if (prev.length >= 7) return prev;
      return prev + d;
    });
  };

  const handleKeypadBackspace = () => setAmountInput((prev) => prev.slice(0, -1));

  const handleKeypadCancel = () => {
    setAmountSheetOpen(false);
    setAmountInput('');
  };

  const handleKeypadOk = () => {
    if (parsedAmountReceived <= 0) return;
    setAmountSheetOpen(false);
    setConfirmChangeOpen(true);
  };

  const handleCancelConfirmChange = () => {
    setConfirmChangeOpen(false);
    setAmountInput('');
  };

  const handleConfirmChange = async () => {
    setSubmittingChange(true);
    try {
      isCompletingRef.current = true;
      let result;
      try {
        result = await endpoints.rides.complete(rideId ?? '', parsedAmountReceived);
      } catch (err) {
        isCompletingRef.current = false;
        throw err;
      }
      // See the matching comment in handleNext — must be set synchronously
      // here, not deferred to the `phase`-keyed useEffect, to close the race
      // window where a stale cancellation event could still show the alert.
      completedRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['earnings-summary'] });
      queryClient.invalidateQueries({ queryKey: ['earnings-weekly'] });
      setCreditedChange(result.data.changeAmount ?? 0);
      setCompletionResult({
        finalPrice: result.data.finalPrice,
        driverCut: result.data.driverCut,
        grossFare: result.data.grossFare,
        promoDiscount: result.data.promoDiscount,
        walletDeduction: result.data.walletDeduction,
        netCashPayable: result.data.netCashPayable,
      });
      setConfirmChangeOpen(false);
      setAmountInput('');
      setPhase('completed');
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string } })?.body;
      showAlert(t.action_failed_title, body?.error ?? t.try_again_msg);
    } finally {
      setSubmittingChange(false);
    }
  };

  // Driver-initiated cancel — only reachable while phase is 'to_pickup' or
  // 'arrived' (see the CTA sheet below); once the ride is 'in_trip' this
  // action is not offered.
  const handleCancelRide = () => {
    if (cancelling) return;
    showAlert(
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
              showAlert(t.action_failed_title, body?.error ?? t.try_again_msg);
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
      showAlert(t.sos_sent_title, t.sos_sent_msg);
    } catch {
      showAlert(t.sos_failed_title, t.sos_failed_msg);
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
      showAlert(t.trip_share_revoked_title, t.trip_share_revoked_msg);
    } catch {
      showAlert(t.action_failed_title, t.trip_share_revoke_error);
    } finally {
      setShareBusy(false);
    }
  };

  const handleShareTrip = async () => {
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
      const numericRideId = rideId ? Number(rideId) : undefined;
      if (numericRideId == null || isNaN(numericRideId)) return;
      const result = await endpoints.tripShare.create({ rideId: numericRideId });
      setShareLink({ id: result.id, url: result.url });
      showAlert(t.trip_share_created_title, t.trip_share_created_msg, [
        { text: t.trip_share_copy_btn, onPress: () => { copyShareLink(result.url); } },
        { text: t.ok, style: 'default', onPress: () => { Share.share({ message: result.url }).catch(() => {}); } },
      ]);
    } catch {
      showAlert(t.action_failed_title, t.trip_share_error);
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

  // ── Navigation-choice prompt ─────────────────────────────────────────────
  // When the driver starts heading to pickup, and again when the trip starts,
  // offer Google Maps (recommended for smooth turn-by-turn) vs staying on the
  // in-app map. Shown at most once per phase per screen mount.
  //
  // Choosing Google Maps is safe: VeeGo keeps tracking independently in the
  // background — useActiveLocationTracking (REST snapshots) and the
  // DRIVER_LOCATION_TASK foreground service (ride-scoped, set via setActiveRideId
  // above) keep broadcasting the driver's position and the ride stays in sync,
  // so returning to the app mid-trip or at the end never shows stale state.
  const navPromptedPhasesRef = useRef<Set<Phase>>(new Set());
  useEffect(() => {
    if (phase !== 'to_pickup' && phase !== 'in_trip') return;
    if (navPromptedPhasesRef.current.has(phase)) return;
    const hasTarget =
      phase === 'in_trip'
        ? dropoffLat != null && dropoffLng != null
        : pickupLat != null && pickupLng != null;
    if (!hasTarget) return; // wait until the destination coords are known
    navPromptedPhasesRef.current.add(phase);
    showAlert(t.nav_choice_title, t.nav_choice_msg, [
      { text: t.nav_choice_google, onPress: handleNavigate },
      { text: t.nav_choice_app, style: 'cancel' },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  // Stable object identity so MapBackdrop's React.memo isn't defeated by a
  // fresh {latitude,longitude} literal on every RideScreen re-render (this
  // screen re-renders often — GPS ticks, busy-state toggles, etc. — even
  // when the pickup/dropoff coordinates themselves haven't changed).
  const mapPickup = useMemo(
    () => (pickupLat != null && pickupLng != null
      ? { latitude: Number(pickupLat), longitude: Number(pickupLng) }
      : undefined),
    [pickupLat, pickupLng],
  );
  const mapDropoff = useMemo(
    () => (dropoffLat != null && dropoffLng != null
      ? { latitude: Number(dropoffLat), longitude: Number(dropoffLng) }
      : undefined),
    [dropoffLat, dropoffLng],
  );

  // ── Arrived-phase camera reset ─────────────────────────────────────────────
  // When the driver arrives at pickup the screen transitions from navigationMode
  // (zoom 18, 50° pitch, look-ahead) to a static overview. Without an explicit
  // camera command the map stays locked at the nav-mode zoom and heading.
  // Passing focusTarget to MapBackdrop on 'arrived' triggers its focusTarget
  // effect: animateCamera to zoom 15, pitch 0, centred on the pickup pin —
  // a clean, stable view while the driver waits for the rider.
  const arrivedFocusTarget = useMemo(
    () => (phase === 'arrived' && pickupLat != null && pickupLng != null
      ? { latitude: Number(pickupLat), longitude: Number(pickupLng), zoom: 17 }
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, pickupLat, pickupLng],
  );

  // Short-circuit render for a blocked service ONLY here — after every hook
  // above has run unconditionally. Bailing out earlier (before hooks like
  // the completedAnim/checkScale effects, handleNavigate, mapPickup,
  // mapDropoff, arrivedFocusTarget) called a different number of hooks
  // between renders whenever isBlocked flipped true in the same render that
  // phase reached 'completed' — a hard "Rendered fewer hooks than expected"
  // React crash on exactly the trip-completion/rating screen. A non-completed
  // ride still keeps the driver in the ride flow regardless of service-block
  // state; normal blocking resumes once the ride completes.
  if (blockedForScreen) {
    return <ServiceBlockedScreen status={serviceStatus} serviceName={SERVICE_NAMES[serviceType] ?? serviceType} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <RideMap
        locationTrackingEnabled={locationTrackingEnabled}
        pickup={mapPickup}
        dropoff={mapDropoff}
        navDestination={navDestination}
        navActive={navActive}
        navigationMode={phase === 'to_pickup' || phase === 'in_trip'}
        focusTarget={arrivedFocusTarget}
      />

      <View style={[styles.overlay, { paddingTop: topPad }]}>
        <View style={styles.topNav}>
          <GlassView strong style={styles.navCard} borderRadius={20}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.navIcon}>
              <Navigation size={20} color={colors.primaryForeground} strokeWidth={2} />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.navEta, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{navLabel}</Text>
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
          <Text style={[styles.fareEarned, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
            {completionResult != null ? `${completionResult.netCashPayable.toFixed(2)} ${t.egp}` : '—'}
          </Text>
          <Text style={[styles.fareNote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {completionResult != null && completionResult.netCashPayable > 0 ? t.cash_to_collect : t.added_to_earnings}
          </Text>
          {completionResult != null && (
            <Pressable onPress={() => setViewDetailsOpen(true)} style={styles.viewDetailsBtn} accessibilityLabel={t.view_details}>
              <Text style={[styles.viewDetailsBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>{t.view_details}</Text>
            </Pressable>
          )}
          {creditedChange > 0 && (
            <Text style={[styles.fareNote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.change_credited_note.replace('{amount}', creditedChange.toFixed(2)).replace('{egp}', t.egp)}
            </Text>
          )}

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
          accessibilityLabel={t.open_in_maps_label}
        >
          <Map size={22} color="#3b82f6" strokeWidth={2} />
        </Pressable>
      )}

      {phase !== 'completed' && (
        <Animated.View
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            {
              transform: [
                { translateY: sheetAnim },
                {
                  translateY: collapseAnim.interpolate({
                    inputRange: [0, 1],
                    // Slide the card down until only the top peek (handle +
                    // rider row) remains visible above the bottom edge.
                    outputRange: [0, Math.max(0, sheetHeight - 120)],
                  }),
                },
              ],
            },
          ]}
        >
          <GlassView strong style={styles.sheetCard} borderRadius={24}>
            <Pressable
              onPress={toggleSheet}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel={sheetCollapsed ? t.expand_trip_card_label : t.collapse_trip_card_label}
            >
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </Pressable>

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
                accessibilityLabel={t.message_rider_title}
              >
                <MessageCircle size={20} color={colors.primary} strokeWidth={2} />
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.primary + '26' }]}
                onPress={() => {
                  const phone = passengerPhone;
                  if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
                }}
                accessibilityLabel={t.call_rider_label}
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
                    <Text style={[styles.cappedText, { fontFamily: 'Inter_700Bold' }]}>{t.capped_badge}</Text>
                  </View>
                )}
              </Animated.View>
            )}

            <Text style={[styles.phaseLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{p.label}</Text>

            <Pressable onPress={handleNext} disabled={busy} style={styles.ctaBtn}>
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.ctaBtnGrad, { opacity: busy ? 0.7 : 1 }]}>
                <ChevronUp size={20} color={colors.primaryForeground} strokeWidth={2} />
                <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{p.cta}</Text>
                {phase === 'in_trip' && (
                  <Text style={[styles.ctaBtnFare, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                    · {fareAmount.toFixed(2)} {t.egp}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {phase === 'in_trip' && paymentMethod === 'cash' && (
              <Pressable
                onPress={handleOpenAmountSheet}
                disabled={busy}
                style={[styles.otherAmountBtn, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}
                accessibilityLabel={t.other_amount_btn}
              >
                <Text style={[styles.otherAmountBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{t.other_amount_btn}</Text>
              </Pressable>
            )}

            {(phase === 'to_pickup' || phase === 'arrived') && (
              <Pressable
                onPress={handleCancelRide}
                disabled={cancelling}
                style={[styles.cancelRideBtn, { opacity: cancelling ? 0.6 : 1 }]}
                accessibilityLabel={t.cancel_ride}
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
                  accessibilityLabel={t.share_trip_label}
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
                  accessibilityLabel={t.send_sos_label}
                >
                  <AlertTriangle size={14} color={colors.destructiveForeground} strokeWidth={2} />
                  <Text style={[styles.sosBtnText, { color: colors.destructiveForeground, fontFamily: 'Inter_700Bold' }]}>{t.sos_label}</Text>
                </Pressable>
              </View>
            </View>
          </GlassView>
        </Animated.View>
      )}

      {/* ── "Other amount" numeric keypad ─────────────────────────────── */}
      <Modal visible={amountSheetOpen} transparent animationType="slide" onRequestClose={handleKeypadCancel}>
        <View style={styles.modalBackdrop}>
          <GlassView strong style={styles.modalCard} borderRadius={24}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.amount_received_title}</Text>
            <Text style={[styles.amountDisplay, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {amountInput || '0'} {t.egp}
            </Text>

            {KEYPAD_ROWS.map((row, ri) => (
              <View key={ri} style={styles.keypadRow}>
                {row.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => (key === 'back' ? handleKeypadBackspace() : handleKeypadDigit(key))}
                    style={[styles.keypadKey, { backgroundColor: colors.secondary }]}
                  >
                    {key === 'back' ? (
                      <Delete size={20} color={colors.foreground} strokeWidth={2} />
                    ) : (
                      <Text style={[styles.keypadKeyText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{key}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={styles.modalActionsRow}>
              <Pressable onPress={handleKeypadCancel} style={[styles.modalCancelBtn, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.modalCancelBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.cancel}</Text>
              </Pressable>
              <Pressable
                onPress={handleKeypadOk}
                disabled={parsedAmountReceived <= 0}
                style={[styles.modalConfirmBtn, { opacity: parsedAmountReceived <= 0 ? 0.5 : 1 }]}
              >
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalConfirmBtnGrad}>
                  <Text style={[styles.modalConfirmBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.ok}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </GlassView>
        </View>
      </Modal>

      {/* ── Confirm change → wallet ────────────────────────────────────── */}
      <Modal visible={confirmChangeOpen} transparent animationType="fade" onRequestClose={handleCancelConfirmChange}>
        <View style={styles.modalBackdrop}>
          <GlassView strong style={styles.modalCard} borderRadius={24}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.confirm_change_title}</Text>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.ride_amount_label}</Text>
              <Text style={[styles.summaryValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{fareAmount.toFixed(2)} {t.egp}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.amount_received_label}</Text>
              <Text style={[styles.summaryValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{parsedAmountReceived.toFixed(2)} {t.egp}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.change_to_wallet_label}</Text>
              <Text style={[styles.summaryValue, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{Math.max(0, computedChange).toFixed(2)} {t.egp}</Text>
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable onPress={handleCancelConfirmChange} disabled={submittingChange} style={[styles.modalCancelBtn, { backgroundColor: colors.secondary, opacity: submittingChange ? 0.6 : 1 }]}>
                <Text style={[styles.modalCancelBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.cancel}</Text>
              </Pressable>
              <Pressable onPress={handleConfirmChange} disabled={submittingChange} style={[styles.modalConfirmBtn, { opacity: submittingChange ? 0.7 : 1 }]}>
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalConfirmBtnGrad}>
                  {submittingChange ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.modalConfirmBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.confirm}</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </GlassView>
        </View>
      </Modal>

      {/* ── Fare breakdown ("View details") ───────────────────────────── */}
      <Modal visible={viewDetailsOpen} transparent animationType="fade" onRequestClose={() => setViewDetailsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <GlassView strong style={styles.modalCard} borderRadius={24}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.fare_breakdown_title}</Text>

            {completionResult != null && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.gross_fare_label}</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{completionResult.grossFare.toFixed(2)} {t.egp}</Text>
                </View>
                {completionResult.promoDiscount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.promo_discount_label}</Text>
                    <Text style={[styles.summaryValue, { color: '#22c55e', fontFamily: 'Inter_700Bold' }]}>-{completionResult.promoDiscount.toFixed(2)} {t.egp}</Text>
                  </View>
                )}
                {completionResult.walletDeduction > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.wallet_deduction_label}</Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>-{completionResult.walletDeduction.toFixed(2)} {t.egp}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.summaryRowTotal, { borderTopColor: colors.border }]}>
                  <Text style={[styles.summaryLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.net_cash_payable_label}</Text>
                  <Text style={[styles.summaryValueHighlight, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{completionResult.netCashPayable.toFixed(2)} {t.egp}</Text>
                </View>
              </>
            )}

            <Pressable onPress={() => setViewDetailsOpen(false)} style={[styles.modalCancelBtn, { backgroundColor: colors.secondary, marginTop: Spacing.md }]}>
              <Text style={[styles.modalCancelBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.close_btn}</Text>
            </Pressable>
          </GlassView>
        </View>
      </Modal>
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
  ctaBtnFare: { fontSize: Typography.size.md },
  otherAmountBtn: { marginTop: Spacing.sm, height: 44, borderRadius: Radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  otherAmountBtnText: { fontSize: Typography.size.sm },
  cancelRideBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: Spacing.xs },
  cancelRideBtnText: { fontSize: Typography.size.sm },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { padding: 20, paddingBottom: 32 },
  modalTitle: { fontSize: Typography.size.md, textAlign: 'center', marginBottom: Spacing.md },
  amountDisplay: { fontSize: 34, textAlign: 'center', marginBottom: Spacing.lg },
  keypadRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  keypadKey: { flex: 1, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  keypadKeyText: { fontSize: Typography.size.lg },
  modalActionsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  modalCancelBtn: { flex: 1, height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  modalCancelBtnText: { fontSize: Typography.size.md },
  modalConfirmBtn: { flex: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  modalConfirmBtnGrad: { height: 52, alignItems: 'center', justifyContent: 'center' },
  modalConfirmBtnText: { fontSize: Typography.size.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  summaryRowTotal: { borderTopWidth: 1, marginTop: 4, paddingTop: 14 },
  summaryLabel: { fontSize: Typography.size.sm },
  summaryValue: { fontSize: Typography.size.md },
  summaryValueHighlight: { fontSize: Typography.size.lg },
  viewDetailsBtn: { marginTop: Spacing.xs, paddingVertical: 6, paddingHorizontal: 10 },
  viewDetailsBtnText: { fontSize: Typography.size.sm, textDecorationLine: 'underline' },
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
