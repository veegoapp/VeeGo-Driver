import { showAlert } from '@/lib/alert';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Check, ChevronUp, Clock, Delete, Map, MessageCircle, Navigation, Phone, Share2, Shield, Star } from 'lucide-react-native';
import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
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

// Fixed brand treatment for the post-trip fare/payment UI (completed overlay's
// rating card + fare-breakdown sheet) — solid charcoal fills and gold fare
// emphasis instead of theme-token glass panels, independent of light/dark
// theme. Mirrors the Passenger app's TripCompletedSheet/FareBreakdownModal,
// which itself was originally ported from this screen's structure.
const GOLD = '#C8A535';
const CHARCOAL = '#1C1C1E';
const CHARCOAL_SURFACE = '#26262A';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

// "C" light palette for the redesigned post-trip fare page + rating card, and
// the "D" change-confirm card — matching the approved passenger-app designs.
const C_BG = '#EEF0F2';
const C_SURF = '#FFFFFF';
const C_INK = '#14151A';
const C_INK_SOFT = '#6B7178';
const C_CAP = '#9AA0A6';
const C_HAIR = '#EEF0F1';
const C_TEAL = '#0E9F8E';
const C_MINT = '#3DDC97';
const C_STARC = '#F5A623';
const C_CAP_ON_DARK = '#8A9096';
const C_RED = '#D92D20';

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
  const { serviceType } = useService();
  // DELIVERY carries a package, not a person — the to_pickup/arrived copy
  // ("heading to the rider" / "pick up rider") is wrong for that case, so it
  // gets its own wording ("heading to pickup point" / "collect order").
  const isDelivery = serviceType === 'DELIVERY';
  const PHASE_COPY: Record<Phase, PhaseCopy> = {
    to_pickup: {
      label: isDelivery ? t.phase_to_pickup_delivery : t.phase_to_pickup,
      cta: isDelivery ? t.phase_to_pickup_cta_delivery : t.phase_to_pickup_cta,
      next: 'arrived',
    },
    arrived: {
      label: isDelivery ? t.phase_arrived_delivery : t.phase_arrived,
      cta: isDelivery ? t.phase_arrived_cta_delivery : t.phase_arrived_cta,
      next: 'in_trip',
    },
    in_trip: { label: t.phase_in_trip, cta: t.phase_in_trip_cta, next: 'completed' },
    completed: { label: t.phase_completed_label, cta: t.phase_done_btn, next: 'completed' },
  };
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
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
  // Post-trip two-step: full-screen fare page → rating card (approved design).
  const [completedStep, setCompletedStep] = useState<'fare' | 'rating'>('fare');
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
  // Falls back to initials if the signed avatar URL fails to load (e.g. expired
  // before first paint) — reset whenever the URL itself changes.
  const [riderAvatarFailed, setRiderAvatarFailed] = useState(false);
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
  // reached via a live socket event (cancelled by driver/system, timeout,
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
  // socket handler funnels through this one function (or silentExitRide
  // below). So this is the single choke point to enforce "completion is
  // terminal": once completedRef is set, nothing here may show an alert or
  // navigate away.
  //
  // isCompletingRef guard: completedRef is only set once the completion
  // request resolves, which leaves a window — between the "Complete trip" tap
  // and that response landing — where a cancellation-family socket event for
  // this ride can still slip through. Checking isCompletingRef here (not just
  // in the session-null effect) closes that window for every handler at once.
  const exitRide = (title: string, message: string) => {
    if (hasExitedRef.current || completedRef.current || isCompletingRef.current) return;
    hasExitedRef.current = true;
    setIsExiting(true);
    showAlert(
      title,
      message,
      [{ text: t.ok, onPress: () => router.replace('/(tabs)/home') }],
    );
  };

  // Same terminal-exit guard as exitRide, but with no alert: used when the
  // rider cancels while the ride is in progress, and by the session-null
  // fallback — the driver is moved off the dead ride silently, with no
  // "Ride Cancelled" (or any other) popup.
  const silentExitRide = () => {
    if (hasExitedRef.current || completedRef.current || isCompletingRef.current) return;
    hasExitedRef.current = true;
    setIsExiting(true);
    router.replace('/(tabs)/home');
  };

  // Ride lifecycle socket events (backend-confirmed). Status-changing events
  // resync via the ActiveSession phase sync below; terminal events
  // (cancelled by rider, cancelled by driver/system, timeout, no-show) exit
  // the ride safely; deviation warning is surfaced without ever throwing.
  useEffect(() => {
    if (!socket || !rideId) return;

    // Fails closed: every ride-lifecycle event this screen listens for
    // (backend-confirmed) always carries a rideId, so a payload without one —
    // malformed, or from an unrelated event shape — must never be treated as
    // a match. Matching on a missing rideId would let a stale/mismatched
    // event (e.g. a cancellation for a different ride) fire this screen's
    // exitRide() alert.
    const matchesThisRide = (data: unknown): boolean => {
      const payloadRideId = (data && typeof data === 'object')
        ? (data as { rideId?: string | number }).rideId
        : undefined;
      return payloadRideId != null && String(payloadRideId) === rideId;
    };

    // The rider cancelling mid-ride exits the screen silently — no alert.
    const handleCancelled = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      silentExitRide();
    };

    const handleDriverCancelled = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      exitRide(t.ride_ended_title, t.ride_driver_cancelled_msg);
    };

    const handleTimeout = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      exitRide(t.ride_timeout_title, t.ride_timeout_msg);
    };

    const handleNoShowCancelled = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      exitRide(t.ride_ended_title, t.ride_no_show_msg);
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
  // This effect detects that transition and exits via silentExitRide(),
  // which is already guarded by hasExitedRef to prevent duplicate exits
  // alongside the socket-event paths. This is a fallback for the same
  // rider-cancels-mid-ride case handleCancelled above also covers, so it
  // stays silent too — no alert.
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
    silentExitRide();
  // silentExitRide is stable within the component lifecycle and intentionally
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
  const passengerAvatar = rideSession?.passenger?.avatar ?? null;
  useEffect(() => { setRiderAvatarFailed(false); }, [passengerAvatar]);
  const passengerInitials = passengerName
    ? passengerName.trim().split(/\s+/).map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : '?';
  // Small label above the destination in the nav card. No time/distance (kept
  // off deliberately to avoid spending Google Directions on live ETA).
  const navLabel =
    phase === 'arrived'
      ? (isDelivery ? t.waiting_for_pickup_delivery : t.waiting_for_rider)
      : phase === 'in_trip' ? t.phase_in_trip : t.navigate;

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
        // landing in that gap would otherwise read a stale
        // `completedRef.current === false` and exit the just-shown Trip
        // Completed / rating screen (silently for RIDE_CANCELLED, with an
        // alert for the driver-cancelled/timeout/no-show variants).
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
      setCompletedStep('rating');
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
        <Animated.View style={[styles.completedOverlayC, { opacity: completedAnim }]}>
          {completedStep === 'fare' ? (
            /* ── STEP 1 · Fare page (C) — dark hero band + white body ── */
            <View style={{ flex: 1 }}>
              <View style={[styles.heroC, { paddingTop: insets.top + 24 }]}>
                <Animated.View style={[styles.checkCircleC, { transform: [{ scale: checkScale }] }]}>
                  <Check size={32} color="#ffffff" strokeWidth={3} />
                </Animated.View>
                <Text style={styles.pageTitleC}>{t.trip_done_title}</Text>

                {completionResult != null && (
                  <>
                    <Text style={styles.heroCapC}>
                      {completionResult.netCashPayable > 0 ? t.cash_to_collect : t.added_to_earnings}
                    </Text>
                    <View style={styles.heroRowC}>
                      <Text style={styles.heroAmountC}>
                        {(completionResult.netCashPayable > 0 ? completionResult.netCashPayable : completionResult.driverCut).toFixed(2)}
                      </Text>
                      <Text style={styles.heroCurC}>{t.egp}</Text>
                    </View>
                    {completionResult.netCashPayable > 0 && (
                      <Text style={styles.heroNoteC}>
                        {t.added_to_earnings} · {completionResult.driverCut.toFixed(2)} {t.egp}
                      </Text>
                    )}
                    <Pressable onPress={() => setViewDetailsOpen(true)} style={styles.viewDetailsBtnC} accessibilityLabel={t.view_details}>
                      <Text style={styles.viewDetailsTxtC}>{t.view_details}</Text>
                    </Pressable>
                  </>
                )}
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 22, paddingBottom: 24 }}
              >
                {creditedChange > 0 && (
                  <Text style={styles.bodyNoteC}>
                    {t.change_credited_note.replace('{amount}', creditedChange.toFixed(2)).replace('{egp}', t.egp)}
                  </Text>
                )}
              </ScrollView>
              <View style={[styles.footerC, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable onPress={() => setCompletedStep('rating')} style={styles.primaryBtnC}>
                  <Text style={styles.primaryBtnTxtC}>{'Continue'}</Text>
                </Pressable>
                {paymentMethod === 'cash' && (
                  <Pressable
                    onPress={handleOpenAmountSheet}
                    disabled={busy}
                    style={[styles.otherAmountBtnC, { marginTop: 10, opacity: busy ? 0.6 : 1 }]}
                    accessibilityLabel={t.other_amount_btn}
                  >
                    <Text style={styles.otherAmountBtnTextC}>{t.other_amount_btn}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            /* ── STEP 2 · Rating card (C) — dark header row + white body ── */
            <View style={styles.ratingWrapC}>
              <View style={styles.ratingCardC}>
                <View style={styles.ratingHeaderC}>
                  {passengerAvatar && !riderAvatarFailed ? (
                    <Image source={{ uri: passengerAvatar }} style={styles.ratingAvatarC} resizeMode="cover" />
                  ) : (
                    <View style={[styles.ratingAvatarC, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#26272E' }]}>
                      <Text style={{ color: '#ffffff', fontSize: 18, fontFamily: 'Inter_700Bold' }}>{passengerInitials}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.ratingCapC}>{t.trip_done_title}</Text>
                    <Text style={styles.ratingTitleC} numberOfLines={1}>
                      {t.rate_rider_label.replace('{name}', passengerName ?? '—')}
                    </Text>
                  </View>
                </View>

                <View style={styles.ratingBodyC}>
                  <View style={styles.starsRowC}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Pressable key={n} onPress={() => setRating(n)}>
                        <Star size={38} color={n <= rating ? C_STARC : '#D3D6DA'} fill={n <= rating ? C_STARC : 'transparent'} strokeWidth={n <= rating ? 0 : 1.4} />
                      </Pressable>
                    ))}
                  </View>
                  {rating > 0 && (
                    <TextInput
                      style={styles.commentInputC}
                      placeholder={t.rating_comment_placeholder}
                      placeholderTextColor={C_CAP}
                      value={ratingComment}
                      onChangeText={setRatingComment}
                      maxLength={500}
                      multiline
                    />
                  )}
                  <Pressable
                    onPress={handleSubmitRating}
                    disabled={rating === 0 || ratingSubmitting}
                    style={[styles.primaryBtnC, { marginTop: 20, opacity: rating === 0 || ratingSubmitting ? 0.5 : 1 }]}
                  >
                    {ratingSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryBtnTxtC}>{t.submit_rating_btn}</Text>}
                  </Pressable>
                  <Pressable onPress={handleSkipRating} disabled={ratingSubmitting} style={styles.skipBtnC}>
                    <Text style={styles.skipTxtC}>{t.skip_btn}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
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
          <View style={styles.splitCard}>
            <View style={styles.leftPanelC}>
              <Pressable
                onPress={toggleSheet}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel={sheetCollapsed ? t.expand_trip_card_label : t.collapse_trip_card_label}
              >
                <View style={styles.sheetHandleC} />
              </Pressable>
              <View style={styles.statusRowC}>
                <View style={styles.statusDotC} />
                <Text style={styles.leftLabelC} numberOfLines={2}>{p.label}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Text style={styles.leftCapC}>{t.fare_label}</Text>
              <Text style={styles.leftFareValC} numberOfLines={1}>{fareAmount.toFixed(2)} {t.egp}</Text>
            </View>

            <View style={styles.rightPanelC}>
              <View style={styles.riderRowC}>
                {passengerAvatar && !riderAvatarFailed ? (
                  <Image
                    source={{ uri: passengerAvatar }}
                    style={styles.riderAvatarC}
                    resizeMode="cover"
                    onError={() => setRiderAvatarFailed(true)}
                  />
                ) : (
                  <View style={[styles.riderAvatarC, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F3' }]}>
                    <Text style={{ color: C_INK, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{passengerInitials}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.riderNameC} numberOfLines={1}>{passengerName ?? '—'}</Text>
                  <Text style={styles.riderMetaC} numberOfLines={1}>
                    {paymentMethod ?? '—'} · {fareAmount.toFixed(2)} {t.egp}
                  </Text>
                </View>
                <Pressable
                  style={styles.actionBtnC}
                  onPress={() => router.push({ pathname: '/ride/chat', params: { rideId: rideId ?? '' } } as any)}
                  accessibilityLabel={t.message_rider_title}
                >
                  <MessageCircle size={16} color={C_INK} strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  style={styles.actionBtnC}
                  onPress={() => {
                    const phone = passengerPhone;
                    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
                  }}
                  accessibilityLabel={t.call_rider_label}
                >
                  <Phone size={16} color={C_INK} strokeWidth={1.8} />
                </Pressable>
              </View>

              {/* Waiting charge ticker — visible only in 'arrived' phase */}
              {phase === 'arrived' && waitingCharge != null && (
                <Animated.View
                  style={[
                    styles.waitingTickerC,
                    {
                      backgroundColor: waitingCharge.capped ? '#F0F2F3' : '#D5B23D18',
                      borderColor: waitingCharge.capped ? C_HAIR : '#D5B23D55',
                      opacity: waitingCharge.capped ? 1 : pulseAnim,
                    },
                  ]}
                >
                  <Clock size={13} color={waitingCharge.capped ? C_INK_SOFT : '#D5B23D'} strokeWidth={2.5} />
                  <Text style={[styles.waitingTickerTextC, { color: waitingCharge.capped ? C_INK_SOFT : '#D5B23D' }]}>
                    {`Waiting fee: +${waitingCharge.amount.toFixed(2)} ${t.egp} · ${waitingCharge.minutes} min`}
                  </Text>
                  {waitingCharge.capped && (
                    <View style={styles.cappedBadgeC}>
                      <Text style={styles.cappedTextC}>{t.capped_badge}</Text>
                    </View>
                  )}
                </Animated.View>
              )}

              <Pressable onPress={handleNext} disabled={busy} style={[styles.ctaBtnC, { opacity: busy ? 0.7 : 1 }]}>
                <ChevronUp size={16} color="#ffffff" strokeWidth={2.5} />
                <Text style={styles.ctaBtnTextC}>{p.cta}</Text>
              </Pressable>

              {(phase === 'to_pickup' || phase === 'arrived') && (
                <Pressable
                  onPress={handleCancelRide}
                  disabled={cancelling}
                  style={[styles.cancelRideBtnC, { opacity: cancelling ? 0.6 : 1 }]}
                  accessibilityLabel={t.cancel_ride}
                >
                  {cancelling ? (
                    <ActivityIndicator size="small" color={C_RED} />
                  ) : (
                    <Text style={styles.cancelRideBtnTextC}>{t.cancel_ride}</Text>
                  )}
                </Pressable>
              )}

              <View style={styles.hairC} />

              <View style={styles.bottomRowC}>
                <View style={styles.safetyRowC}>
                  <Shield size={13} color={C_INK_SOFT} strokeWidth={2} />
                  <Text style={styles.safetyTextC} numberOfLines={1}>{t.safety_toolkit_trip}</Text>
                </View>
                <View style={styles.bottomActionsC}>
                  <Pressable
                    onPress={handleShareTrip}
                    disabled={shareBusy}
                    style={[styles.shareBtnC, { opacity: shareBusy ? 0.6 : 1 }]}
                    accessibilityLabel={t.share_trip_label}
                  >
                    <Share2 size={13} color={C_INK} strokeWidth={2} />
                    <Text style={styles.shareBtnTextC}>
                      {shareLink ? t.trip_share_revoke_btn : t.trip_share_btn}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSOS}
                    disabled={sosBusy}
                    style={[styles.sosBtnC, { opacity: sosBusy ? 0.6 : 1 }]}
                    accessibilityLabel={t.send_sos_label}
                  >
                    <AlertTriangle size={13} color={C_RED} strokeWidth={2} />
                    <Text style={styles.sosBtnTextC}>{t.sos_label}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ── "Other amount" numeric keypad ─────────────────────────────── */}
      <Modal visible={amountSheetOpen} transparent animationType="slide" onRequestClose={handleKeypadCancel}>
        <View style={styles.modalBackdropC}>
          <View style={styles.keypadCardC}>
            <View style={styles.sheetHandleDarkC} />
            <Text style={styles.keypadCapC}>{t.amount_received_title}</Text>
            <Text style={styles.keypadAmountC}>
              {amountInput || '0'} <Text style={styles.keypadAmountCurC}>{t.egp}</Text>
            </Text>

            <View style={styles.keypadGridC}>
              {KEYPAD_ROWS.map((row, ri) => (
                <View key={ri} style={styles.keypadRowC}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => (key === 'back' ? handleKeypadBackspace() : handleKeypadDigit(key))}
                      style={styles.keypadKeyC}
                    >
                      {key === 'back' ? (
                        <Delete size={20} color={C_INK} strokeWidth={1.8} />
                      ) : (
                        <Text style={styles.keypadKeyTextC}>{key}</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.keypadActionsRowC}>
              <Pressable onPress={handleKeypadCancel} style={styles.keypadCancelBtnC}>
                <Text style={styles.keypadCancelTxtC}>{t.cancel}</Text>
              </Pressable>
              <Pressable
                onPress={handleKeypadOk}
                disabled={parsedAmountReceived <= 0}
                style={[styles.keypadOkBtnC, { opacity: parsedAmountReceived <= 0 ? 0.5 : 1 }]}
              >
                <Text style={styles.keypadOkTxtC}>{t.ok}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Confirm change → wallet ────────────────────────────────────── */}
      <Modal visible={confirmChangeOpen} transparent animationType="fade" onRequestClose={handleCancelConfirmChange}>
        <View style={styles.modalBackdrop}>
          <View style={styles.changeCardC}>
            <View style={styles.changeHeroC}>
              <Text style={styles.changeCapC}>{t.change_to_wallet_label}</Text>
              <View style={styles.changeHeroRow}>
                <Text style={styles.changeHeroAmt}>{Math.max(0, computedChange).toFixed(2)}</Text>
                <Text style={styles.changeHeroCur}>{t.egp}</Text>
              </View>
            </View>
            <View style={styles.changeBodyC}>
              <View style={styles.cRow}>
                <Text style={styles.cLabel}>{t.amount_received_label}</Text>
                <Text style={styles.cVal}>{parsedAmountReceived.toFixed(2)}</Text>
              </View>
              <View style={styles.cHair} />
              <View style={styles.cRow}>
                <Text style={styles.cLabel}>{t.ride_amount_label}</Text>
                <Text style={styles.cVal}>{fareAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.cActionsRow}>
                <Pressable onPress={handleCancelConfirmChange} disabled={submittingChange} style={[styles.cCancelBtn, { opacity: submittingChange ? 0.6 : 1 }]}>
                  <Text style={styles.cCancelTxt}>{t.cancel}</Text>
                </Pressable>
                <Pressable onPress={handleConfirmChange} disabled={submittingChange} style={[styles.cConfirmBtn, { opacity: submittingChange ? 0.7 : 1 }]}>
                  {submittingChange ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.cConfirmTxt}>{t.confirm}</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Fare breakdown ("View details") — fixed charcoal/gold treatment,
          matching the Passenger app's FareBreakdownModal for this same
          payment moment. ─────────────────────────────────────────────── */}
      <Modal visible={viewDetailsOpen} transparent animationType="fade" onRequestClose={() => setViewDetailsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: CHARCOAL,
                borderColor: CARD_BORDER,
                borderWidth: 1,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: CARD_BORDER }]} />
            <Text style={[styles.modalTitle, { color: '#ffffff', fontFamily: 'Inter_700Bold' }]}>{t.fare_breakdown_title}</Text>

            {completionResult != null && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: '#B0B0B5', fontFamily: 'Inter_400Regular' }]}>{t.gross_fare_label}</Text>
                  <Text style={[styles.summaryValue, { color: '#ffffff', fontFamily: 'Inter_600SemiBold' }]}>{completionResult.grossFare.toFixed(2)} {t.egp}</Text>
                </View>
                {completionResult.promoDiscount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: '#B0B0B5', fontFamily: 'Inter_400Regular' }]}>{t.promo_discount_label}</Text>
                    <Text style={[styles.summaryValue, { color: '#22c55e', fontFamily: 'Inter_600SemiBold' }]}>-{completionResult.promoDiscount.toFixed(2)} {t.egp}</Text>
                  </View>
                )}
                {completionResult.walletDeduction > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: '#B0B0B5', fontFamily: 'Inter_400Regular' }]}>{t.wallet_deduction_label}</Text>
                    <Text style={[styles.summaryValue, { color: '#ffffff', fontFamily: 'Inter_600SemiBold' }]}>-{completionResult.walletDeduction.toFixed(2)} {t.egp}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.summaryRowTotal, { borderTopColor: CARD_BORDER }]}>
                  <Text style={[styles.summaryLabel, { color: '#ffffff', fontFamily: 'Inter_700Bold' }]}>{t.net_cash_payable_label}</Text>
                  <Text style={[styles.summaryValueHighlight, { color: GOLD, fontFamily: 'Inter_700Bold' }]}>{completionResult.netCashPayable.toFixed(2)} {t.egp}</Text>
                </View>
              </>
            )}

            <Pressable onPress={() => setViewDetailsOpen(false)} style={[styles.modalCancelBtn, { backgroundColor: CHARCOAL_SURFACE, borderColor: CARD_BORDER, borderWidth: 1, marginTop: Spacing.md }]}>
              <Text style={[styles.modalCancelBtnText, { color: '#ffffff', fontFamily: 'Inter_700Bold' }]}>{t.close_btn}</Text>
            </Pressable>
          </View>
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
  ratingCard: { padding: Spacing.lg, marginTop: Spacing.xl, width: '100%', borderRadius: Radius.lg, overflow: 'hidden' },
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
  sheetHandle: { width: 48, height: 6, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.lg },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { padding: 20, paddingBottom: 32 },
  modalTitle: { fontSize: Typography.size.md, textAlign: 'center', marginBottom: Spacing.md },
  modalCancelBtn: { flex: 1, height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  modalCancelBtnText: { fontSize: Typography.size.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  summaryRowTotal: { borderTopWidth: 1, marginTop: 4, paddingTop: 14 },
  summaryLabel: { fontSize: Typography.size.sm },
  summaryValue: { fontSize: Typography.size.md },
  summaryValueHighlight: { fontSize: Typography.size.lg },
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
  commentInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular', marginTop: Spacing.md, minHeight: 60, textAlignVertical: 'top' },

  /* ── "C" active-ride split card (to_pickup / arrived / in_trip) ── */
  splitCard: { borderRadius: 24, overflow: 'hidden', flexDirection: 'row', elevation: Shadows.large.elevation, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.16, shadowRadius: 20 },
  leftPanelC: { width: 104, flexShrink: 0, backgroundColor: '#14151A', paddingHorizontal: 12, paddingVertical: 16 },
  sheetHandleC: { width: 32, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 14 },
  statusRowC: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDotC: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C_MINT },
  leftLabelC: { flex: 1, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase' },
  leftCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: C_CAP, textTransform: 'uppercase' },
  leftFareValC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#ffffff', marginTop: 1 },
  rightPanelC: { flex: 1, backgroundColor: '#ffffff', padding: 16, paddingBottom: 14 },
  riderRowC: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  riderAvatarC: { width: 44, height: 44, borderRadius: 22 },
  riderNameC: { fontSize: 13.5, fontFamily: 'Inter_700Bold', color: C_INK },
  riderMetaC: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: C_CAP, marginTop: 1 },
  actionBtnC: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(20,21,26,0.08)', alignItems: 'center', justifyContent: 'center' },
  waitingTickerC: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  waitingTickerTextC: { fontSize: 12, fontFamily: 'Inter_700Bold', flex: 1 },
  cappedBadgeC: { backgroundColor: '#ef444422', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  cappedTextC: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#ef4444', letterSpacing: 0.6 },
  ctaBtnC: { marginTop: 14, height: 48, borderRadius: 24, backgroundColor: '#14151A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaBtnTextC: { fontSize: 13.5, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  otherAmountBtnC: { marginTop: 10, height: 42, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E5E8', alignItems: 'center', justifyContent: 'center' },
  otherAmountBtnTextC: { fontSize: 12.5, fontFamily: 'Inter_700Bold', color: C_INK },
  cancelRideBtnC: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, marginTop: 8 },
  cancelRideBtnTextC: { fontSize: 12.5, fontFamily: 'Inter_700Bold', color: C_RED },
  hairC: { height: 1, backgroundColor: C_HAIR, marginTop: 4, marginBottom: 10 },
  bottomRowC: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  safetyRowC: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, marginRight: 8 },
  safetyTextC: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: C_INK_SOFT, flexShrink: 1 },
  bottomActionsC: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtnC: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#F0F2F3' },
  shareBtnTextC: { fontSize: 11, fontFamily: 'Inter_700Bold', color: C_INK },
  sosBtnC: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5, borderColor: '#F3C6C2' },
  sosBtnTextC: { fontSize: 11, fontFamily: 'Inter_700Bold', color: C_RED },

  /* ── "C" post-trip fare page + rating card — dark panel/band + white body ── */
  completedOverlayC: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C_BG, zIndex: 1000 },
  heroC: { backgroundColor: '#14151A', paddingHorizontal: 26, paddingBottom: 22, alignItems: 'center', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  checkCircleC: { width: 60, height: 60, borderRadius: 30, backgroundColor: C_TEAL, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  pageTitleC: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#ffffff', textAlign: 'center', marginTop: 16 },
  heroCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, color: C_CAP_ON_DARK, textAlign: 'center', marginTop: 22, textTransform: 'uppercase' },
  heroRowC: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 6 },
  heroAmountC: { fontSize: 48, fontFamily: 'Inter_700Bold', color: C_TEAL, lineHeight: 50 },
  heroCurC: { fontSize: 18, fontFamily: 'Inter_700Bold', color: C_TEAL },
  heroNoteC: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#B7BBC2', textAlign: 'center', marginTop: 8 },
  viewDetailsBtnC: { alignSelf: 'center', marginTop: 6, paddingVertical: 4, paddingHorizontal: 8 },
  viewDetailsTxtC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: C_TEAL, textDecorationLine: 'underline' },
  bodyNoteC: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: C_INK_SOFT, textAlign: 'center', marginTop: 4 },
  footerC: { paddingHorizontal: 26, paddingTop: 12, backgroundColor: C_BG },
  primaryBtnC: { height: 54, borderRadius: 15, backgroundColor: '#14151A', alignItems: 'center', justifyContent: 'center' },
  primaryBtnTxtC: { color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  ratingWrapC: { flex: 1, justifyContent: 'flex-end' },
  ratingCardC: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  ratingHeaderC: { backgroundColor: '#14151A', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 24 },
  ratingAvatarC: { width: 52, height: 52, borderRadius: 26 },
  ratingCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, color: C_CAP_ON_DARK, textTransform: 'uppercase' },
  ratingTitleC: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#ffffff', marginTop: 4 },
  ratingBodyC: { backgroundColor: C_SURF, padding: 24 },
  starsRowC: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  commentInputC: { alignSelf: 'stretch', borderWidth: 1, borderColor: C_HAIR, borderRadius: 14, backgroundColor: '#F6F7F8', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 22, minHeight: 60, textAlignVertical: 'top', color: C_INK },
  skipBtnC: { alignSelf: 'center', marginTop: 14, paddingVertical: 6 },
  skipTxtC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: C_CAP },

  /* ── "D" change-confirm card ── */
  changeCardC: { width: '100%', borderRadius: 24, overflow: 'hidden', backgroundColor: C_SURF },
  changeHeroC: { backgroundColor: '#14151A', paddingVertical: 22, alignItems: 'center' },
  changeCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, color: C_CAP, textTransform: 'uppercase' },
  changeHeroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 8 },
  changeHeroAmt: { fontSize: 44, fontFamily: 'Inter_700Bold', color: C_MINT, lineHeight: 46 },
  changeHeroCur: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#8A9096' },
  changeBodyC: { padding: 20 },
  cRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  cLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: C_INK_SOFT },
  cVal: { fontSize: 16, fontFamily: 'Inter_700Bold', color: C_INK },
  cHair: { height: 1, backgroundColor: C_HAIR },
  cActionsRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  cCancelBtn: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D3D6DA', alignItems: 'center', justifyContent: 'center' },
  cCancelTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: C_INK_SOFT },
  cConfirmBtn: { flex: 1.4, height: 50, borderRadius: 14, backgroundColor: '#14151A', alignItems: 'center', justifyContent: 'center' },
  cConfirmTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#ffffff' },

  /* ── "C" Add Remainder keypad ── */
  modalBackdropC: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,21,26,0.4)' },
  keypadCardC: { backgroundColor: C_SURF, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 30 },
  sheetHandleDarkC: { width: 40, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(0,0,0,0.14)', alignSelf: 'center', marginBottom: 18 },
  keypadCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, color: C_CAP, textAlign: 'center', textTransform: 'uppercase' },
  keypadAmountC: { fontSize: 38, fontFamily: 'Inter_700Bold', color: C_INK, textAlign: 'center', marginTop: 8, letterSpacing: -0.5 },
  keypadAmountCurC: { fontSize: 18, fontFamily: 'Inter_700Bold', color: C_CAP },
  keypadGridC: { marginTop: 22, gap: 10 },
  keypadRowC: { flexDirection: 'row', gap: 10 },
  keypadKeyC: { flex: 1, height: 56, borderRadius: 16, backgroundColor: '#F0F2F3', alignItems: 'center', justifyContent: 'center' },
  keypadKeyTextC: { fontSize: 20, fontFamily: 'Inter_700Bold', color: C_INK },
  keypadActionsRowC: { flexDirection: 'row', gap: 12, marginTop: 20 },
  keypadCancelBtnC: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E5E8', alignItems: 'center', justifyContent: 'center' },
  keypadCancelTxtC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: C_INK_SOFT },
  keypadOkBtnC: { flex: 1.4, height: 50, borderRadius: 14, backgroundColor: '#14151A', alignItems: 'center', justifyContent: 'center' },
  keypadOkTxtC: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#ffffff' },
});
