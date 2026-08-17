import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { DRIVER_LOCATION_TASK } from '@/lib/backgroundLocationTask';
import { AlertCircle, Bell, Check, CheckCircle, Star, Tag, TrendingUp, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { Animation } from '@/constants/animations';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showAlert } from '@/lib/alert';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SurgeZone } from '@/lib/types';
import { GlassView } from '@/components/GlassView';
import { MapBackdrop } from '@/components/MapBackdrop';
import { useColors } from '@/hooks/useColors';
import { useDriverLocation } from '@/hooks/useDriverLocation';
import { useGPSPermissionRecheck } from '@/hooks/useGPSProvider';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { maybePromptBatteryOptimization } from '@/lib/batteryOptimization';
import { useRideSocket, type RideRequest } from '@/hooks/useRideSocket';
import { useI18n } from '@/lib/i18nContext';
import { useActiveSession } from '@/lib/activeSessionContext';
import { endpoints } from '@/lib/api';
import { computeDeadlineMinutes, type CheckinRequiredPayload } from '@/lib/checkinDeadline';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';

export const TAB_BAR_HEIGHT = 96;
// Fallback only — used if a ride:offer payload omits expiresInSeconds.
// The backend's actual round timeout is otherwise read from the payload.
const OFFER_TIMEOUT_MS = 12000;

// Foreground GPS is always requested/tracked while Home has focus (not gated
// on "online") so the map can center on the driver's real position instead of
// staying on a fallback. Isolated into its own component (rather than calling
// useDriverLocation directly in HomeScreen) so the ~1 GPS tick/second this
// hook produces only re-renders this small map layer — not the header, stats
// pill, promo card, and request sheet that make up the rest of HomeScreen.
//
// `focused` gates both the GPS subscription and the MapView itself: when an
// active ride screen is pushed over Home, expo-router keeps Home mounted
// underneath it, so without this gate Home's MapView, its AnimatedDriverMarker
// glide loop, and its bearing-tracking effect kept running the entire ride —
// a second full map instance alongside the ride screen's own MapBackdrop.
// Returning null here fully unmounts MapBackdrop (and everything inside it)
// instead of just hiding it, so those loops actually stop.
//
// Foreground permission is requested exactly once, from startLocationTracking()
// when the driver taps GO — this component only ever *checks* status (via
// useDriverLocation -> GPSProvider) and never prompts on its own. It used to
// also fire its own requestForegroundPermissionsAsync() here on every mount,
// racing GPSProvider's own permission check with no synchronization between
// them; removed in favor of GPSProvider re-checking on its own (see
// useGPSProvider.tsx) once startLocationTracking()'s request resolves.
const DriverMapLayer = React.memo(function DriverMapLayer({ surgeZones, focused }: { surgeZones: SurgeZone[]; focused: boolean }) {
  const { position: driverPosition } = useDriverLocation(focused);

  if (!focused) return null;

  return (
    <MapBackdrop
      driverLocation={driverPosition ?? undefined}
      surgeZones={surgeZones}
    />
  );
});

// Module-level: survives HomeScreen remounts (e.g. returning from a completed
// ride). React state resets to its initial value on every remount — this
// variable lets the component start with the last known online state so the
// driver doesn't have to re-tap GO after every trip.
let _persistedOnline: boolean | null = null;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const recheckGPSPermission = useGPSPermissionRecheck();
  const [online, setOnline] = useState<boolean>(() => _persistedOnline ?? false);
  // Whether Home currently has navigation focus — used to gate the idle-online
  // realtime location broadcast below so it never overlaps with the ride
  // screen's own driver:ride:location broadcast once a ride is accepted.
  const [homeFocused, setHomeFocused] = useState(true);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [acceptingRide, setAcceptingRide] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [request, setRequest] = useState<RideRequest | null>(null);
  const [surgeZones, setSurgeZones] = useState<SurgeZone[]>([]);
  const [countdown, setCountdown] = useState(12);
  const [promoDismissed, setPromoDismissed] = useState(false);
  const topPad = insets.top;
  // Issue B: realtime socket location while Online and idle (no active ride).
  // Reuses the existing driver:location:update channel via useLocationBroadcast
  // — the same hook the ride screen uses for driver:ride:location — with no
  // rideId, so it always takes the general/idle branch. Gated on homeFocused
  // so it stops the instant the driver navigates to an active ride, leaving
  // driver:ride:location as the sole live channel during a ride.
  useLocationBroadcast({ enabled: online && homeFocused });

  // ── Proactive foreground GPS permission (idle map) ─────────────────────
  // Foreground permission was previously only ever requested from
  // startLocationTracking() (the driver's first GO tap) — until then the
  // idle map's GPS subscription (DriverMapLayer -> useDriverLocation ->
  // GPSProvider) only *checks* permission and never prompts on its own (see
  // useGPSProvider.tsx), so a first-time driver saw no blue dot / driver
  // marker on the idle map and the recenter button silently no-op'd (no fix
  // to recenter onto). Request it here too, once, as soon as Home mounts —
  // but only when status is genuinely 'undetermined', so a driver who has
  // already declined isn't re-prompted every time they open the app.
  // recheckGPSPermission() mirrors what startLocationTracking() already does
  // after its own request: it forces GPSProvider's one-time check to re-run
  // against the fresh grant instead of staying permanently concluded
  // "denied" for this mount — the same race DriverMapLayer's comment above
  // documents avoiding by not firing an unsynchronized permission request
  // from this component.
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'undetermined') return;
      await Location.requestForegroundPermissionsAsync();
      recheckGPSPermission();
    })();
  }, [recheckGPSPermission]);

  // Socket event UI state
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'warning' | 'success'>('warning');
  const lastSubmittedStatusRef = useRef<string | null>(null);
  const toastAnim = useRef(new Animated.Value(-80)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against double-navigating to /selfie when both the live socket event
  // and the GET /driver/checkin/status poll fire for the same pending check-in.
  const checkinPromptedRef = useRef(false);
  // Persistent ref for the trip-request alert sound — keeps the Sound object
  // alive (preventing premature GC under JSI/New Architecture on Android) and
  // allows the previous instance to be unloaded before a new one is created.
  const tripRequestSoundRef = useRef<Audio.Sound | null>(null);

  // Ride IDs the driver has already declined this session — guards against the
  // same offer being re-shown by a late/duplicate ride:offer emit (e.g. a
  // round that was already in flight when the decline was processed).
  const declinedRideIdsRef = useRef<Set<string>>(new Set());

  const [unreadCount, setUnreadCount] = useState(0);
  const { socket } = useSocket();

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: driverRaw, isLoading: driverLoading, isError: driverError, refetch: refetchDriver } = useQuery({
    queryKey: ['driver'],
    queryFn: async () => {
      console.log('[Home:driver] → GET /driver/me');
      try {
        const result = await endpoints.driver.me();
        console.log('[Home:driver] ✓ success:', { id: (result as any)?.id, name: (result as any)?.name, rating: (result as any)?.rating });
        return result;
      } catch (err: unknown) {
        const e = err as any;
        console.error('[Home:driver] ✗ failed:', { name: e?.name, message: e?.message, status: e?.status, statusText: e?.statusText, body: e?.body, stack: e?.stack }, e);
        throw err;
      }
    },
  });
  const { data: earningsRaw, isLoading: earningsLoading, isError: earningsError, refetch: refetchEarnings } = useQuery({
    queryKey: ['earnings-summary', 'today'],
    queryFn: async () => {
      console.log('[Home:earnings] → GET /earnings/summary?period=today');
      try {
        const result = await endpoints.earnings.summary('today');
        console.log('[Home:earnings] ✓ success:', { totalEarnings: (result as any)?.summary?.totalEarnings, online: (result as any)?.summary?.online });
        return result;
      } catch (err: unknown) {
        const e = err as any;
        console.error('[Home:earnings] ✗ failed:', { name: e?.name, message: e?.message, status: e?.status, statusText: e?.statusText, body: e?.body, stack: e?.stack }, e);
        throw err;
      }
    },
  });
  // The earnings-summary response has no trips count (only totalEarnings/
  // totalPaid/etc — see EarningsSummary type in earnings.tsx), so the Home
  // stats pill's TRIPS figure is derived here instead: fetch completed ride
  // history and count entries whose completedAt falls on today's local date.
  const { data: tripHistoryRaw } = useQuery({
    queryKey: ['today-trips-history'],
    queryFn: () => endpoints.rides.history(1, 100, 'completed'),
    staleTime: 30000,
  });
  const todayTripsCount = useMemo(() => {
    const items = (tripHistoryRaw as { data?: { completedAt: string }[] } | undefined)?.data;
    if (!Array.isArray(items)) return null;
    const now = new Date();
    return items.filter((r) => {
      const d = new Date(r.completedAt);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length;
  }, [tripHistoryRaw]);
  const { data: promotionsRaw } = useQuery({
    queryKey: ['driver-promotions'],
    queryFn: () => endpoints.driver.promotions(),
    retry: false,
    staleTime: 60000,
  });
  const _now = new Date();
  const activePromo: { id: string; title: string; description?: string; bonusPercentage?: number; bonusAmount?: number; targetRides?: number; validUntil?: string } | null =
    (Array.isArray(promotionsRaw) ? promotionsRaw as any[] : Array.isArray((promotionsRaw as any)?.data) ? (promotionsRaw as any).data : [])
      .find((p: any) => p.isActive === true && (!p.validUntil || new Date(p.validUntil) > _now)) ?? null;

  const { data: notificationsRaw, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => endpoints.notifications.list() as Promise<{ id: string; read?: boolean; isRead?: boolean }[]>,
    staleTime: 30000,
  });
  // Cold-start / reconnect gate check — catches a pending check-in the driver
  // missed while the app was closed (the live DRIVER_CHECKIN_REQUIRED socket
  // event only reaches an app that's already open and connected).
  const { data: checkinStatusRaw, refetch: refetchCheckinStatus } = useQuery({
    queryKey: ['driver-checkin-status'],
    queryFn: endpoints.driver.checkinStatus,
    retry: false,
  });

  const driverData = driverRaw as any;
  const earningsData = earningsRaw as any;
  const statsLoading = driverLoading || earningsLoading;
  const statsError = driverError || earningsError;

  // Header avatar: falls back to initials-on-tint when there's no photo yet
  // or the signed URL fails to load (e.g. expired) — never a blank/broken
  // image. Re-armed whenever the avatar URL itself changes.
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [driverData?.avatar]);
  const driverInitials = (driverData?.name ?? '')
    .split(' ').filter(Boolean).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '—';

  // Debug: log when the "Failed to load. Tap to retry." pill renders
  useEffect(() => {
    if (driverError) console.error('[Home:stats-pill] driverError → rendering "Failed to load. Tap to retry."', { driverError });
    if (earningsError) console.error('[Home:stats-pill] earningsError → rendering "Failed to load. Tap to retry."', { earningsError });
  }, [driverError, earningsError]);

  // ActiveSession: navigate to the active ride on cold-start recovery.
  // Waits for initialized before acting so a null session is not mistaken
  // for "no active session" during the initial fetch.
  const { session: activeSession, initialized: activeSessionInitialized } = useActiveSession();
  useEffect(() => {
    if (!activeSessionInitialized) return;
    // Only redirect while Home actually has focus (real recovery: cold start,
    // reconnect, or backing out to Home while a session is still active). If
    // the ride screen already has focus — e.g. right after the driver's own
    // accept, before this session:snapshot arrives — Home is already where
    // it would be redirecting from, so skip to avoid a duplicate navigation
    // into a second ride-screen instance with its own duplicate listeners.
    if (!homeFocused) return;
    if (activeSession?.sessionType === 'ride') {
      router.replace(`/ride/${activeSession.rideId}`);
    }
  }, [activeSessionInitialized, activeSession, homeFocused]);

  const queryClient = useQueryClient();

  useEffect(() => {
    const notifs = Array.isArray(notificationsRaw) ? notificationsRaw : [];
    const count = notifs.filter(n => !(n.read ?? n.isRead ?? false)).length;
    setUnreadCount(count);
  }, [notificationsRaw]);

  // Tracks whether Home is the focused screen — see useLocationBroadcast call
  // above. Fires immediately on navigation, well before any server round trip,
  // so the idle broadcast stops as soon as the ride screen takes over.
  //
  // Also reconciles local `online` state, the checkin-required prompt, and
  // the background GPS task's registration against the server on every visit
  // — not just once at cold start. This runs every time Home regains focus
  // (returning from a completed ride, backing out of /selfie, reconnect,
  // etc.), so drift between local state and the server (e.g. the background
  // task not actually running even though the driver is marked online) gets
  // caught and corrected each time, instead of only on the very first check.
  //
  // refetchCheckinStatus()'s resolved value is used directly here rather than
  // relying on the reactive checkinStatusRaw dependency: react-query's
  // structural sharing keeps the same object reference when a refetch
  // returns data that's deeply equal to what's already cached, which would
  // silently skip this reconciliation (including the task-registration
  // check, which is orthogonal to whether isOnline's value itself changed).
  useFocusEffect(
    useCallback(() => {
      setHomeFocused(true);
      refetchNotifications();
      // Returning to this screen — allow another check-in prompt.
      checkinPromptedRef.current = false;

      refetchCheckinStatus().then((result) => {
        const status = result.data as { isOnline?: boolean; checkInRequired?: boolean; checkInDeadline?: string | null } | undefined;
        if (!status) return;

        if (status.isOnline != null) {
          _persistedOnline = status.isOnline;
          setOnline(status.isOnline);
          if (status.isOnline) {
            TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK)
              .then((isRegistered) => {
                if (!isRegistered) startLocationTracking(false);
              })
              .catch(() => {});
          }
        }

        if (status.checkInRequired && !checkinPromptedRef.current) {
          checkinPromptedRef.current = true;
          router.push({
            pathname: '/selfie',
            params: { deadlineMinutes: String(computeDeadlineMinutes(status.checkInDeadline)) },
          });
        }
      }).catch(() => {});

      return () => setHomeFocused(false);
    }, [refetchNotifications, refetchCheckinStatus])
  );

  // The reconnect-triggered refetchCheckinStatus() below (fired on socketConnected,
  // independent of focus) is fire-and-forget — this reactive effect is what
  // actually acts on that refetched data to show the prompt, without
  // duplicating the focus-driven fetch above.
  useEffect(() => {
    const status = checkinStatusRaw as { checkInRequired?: boolean; checkInDeadline?: string | null } | undefined;
    if (!status?.checkInRequired || checkinPromptedRef.current) return;
    checkinPromptedRef.current = true;
    router.push({
      pathname: '/selfie',
      params: { deadlineMinutes: String(computeDeadlineMinutes(status.checkInDeadline)) },
    });
  }, [checkinStatusRaw]);

  useEffect(() => {
    if (!socket) return;
    const handleNotificationNew = (data?: { title?: string; body?: string }) => {
      setUnreadCount(prev => prev + 1);
      const msg = data?.title
        ? data.body
          ? `${data.title}: ${data.body}`
          : data.title
        : data?.body ?? null;
      if (msg) {
        showToastRef.current?.(msg, 'success');
      }
    };
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
    return () => { socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew); };
  }, [socket]);

  const pulseScale = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const sheetAnim = useRef(new Animated.Value(300)).current;
  const timerAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<Animated.CompositeAnimation | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demandAnim = useRef(new Animated.Value(60)).current;
  const demandOpacity = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(-200)).current;
  // True once the socket has connected at least once this session.
  // Prevents a false-positive "Reconnecting" banner during the initial
  // socket handshake — the banner should only appear when a previously
  // established connection drops while the driver is online.
  const socketEverConnectedRef = useRef(false);
  const showRequestRef = useRef<((r: RideRequest) => void) | null>(null);
  const dismissRequestRef = useRef<(() => void) | null>(null);
  const dismissSilentlyRef = useRef<(() => void) | null>(null);
  const showToastRef = useRef<((msg: string, type: 'warning' | 'success') => void) | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (online) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 2.4, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 0.8, duration: 0, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      pulse.start();
      Animated.parallel([
        Animated.spring(demandAnim, { toValue: 0, useNativeDriver: true }),
        Animated.timing(demandOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      return () => pulse.stop();
    }
  }, [online]);

  const showRequest = (r: RideRequest) => {
    // Ignore an overlapping ride:offer while one is already showing — the
    // first offer stays active until accepted, declined, expired, or
    // dismissed, instead of being silently replaced (and left un-declined).
    if (request !== null) return;

    // Stop any existing timer before showing new request
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);

    const offerDurationMs = (r.expiresInSeconds != null && r.expiresInSeconds > 0)
      ? r.expiresInSeconds * 1000
      : OFFER_TIMEOUT_MS;

    setRequest(r);
    setDeclining(false);
    setCountdown(Math.round(offerDurationMs / 1000));
    timerAnim.setValue(1);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    // Play ride-request alert sound
    (async () => {
      try {
        // Unload any previous instance before creating a new one so the Sound
        // object is not left dangling and the ref always holds the current one.
        if (tripRequestSoundRef.current) {
          await tripRequestSoundRef.current.unloadAsync().catch(() => {});
          tripRequestSoundRef.current = null;
        }
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          require('@/assets/sounds/trip_request.wav'),
          { shouldPlay: true, volume: 1.0 },
        );
        // Store in ref to keep the object alive (prevents GC under JSI/New Arch).
        tripRequestSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(status => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            if (tripRequestSoundRef.current === sound) tripRequestSoundRef.current = null;
          }
        });
      } catch (e) {
        if (__DEV__) console.error('[VeeGo] trip_request sound error:', e);
      }
    })();

    Animated.spring(sheetAnim, { toValue: 0, stiffness: 320, damping: 32, useNativeDriver: true }).start();
    timerRef.current = Animated.timing(timerAnim, { toValue: 0, duration: offerDurationMs, useNativeDriver: true });
    timerRef.current.start(({ finished }) => { if (finished) dismissRequest(); });

    // Numeric countdown
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      tripRequestSoundRef.current?.unloadAsync().catch(() => {});
      tripRequestSoundRef.current = null;
    };
  }, []);

  showRequestRef.current = showRequest;

  const { token, fcmToken } = usePushNotifications(useCallback(() => {}, []));

  const handleRideOffer = useCallback((ride: RideRequest) => {
    if (declinedRideIdsRef.current.has(ride.id)) return;
    showRequestRef.current?.(ride);
  }, []);

  const handleOfferExpired = useCallback(() => {
    // Server already expired the offer — clear local state only, no decline
    // call (mirrors handleRideNoLongerAvailable's silent-dismiss path).
    dismissSilentlyRef.current?.();
  }, []);

  const handleRideNoLongerAvailable = useCallback(() => {
    dismissSilentlyRef.current?.();
    showToastRef.current?.('Ride is no longer available', 'warning');
  }, []);

  // Periodic ("long_shift") check-in prompt — same capture screen as the shuttle
  // trip check-in, just no tripId and a deadline derived from the payload.
  const handleCheckinRequired = useCallback((data: CheckinRequiredPayload) => {
    if (checkinPromptedRef.current) return;
    checkinPromptedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    router.push({
      pathname: '/selfie',
      params: { deadlineMinutes: String(computeDeadlineMinutes(data?.deadline)) },
    });
  }, []);

  // Selfie.tsx already reacts to these directly while it's mounted (closes on
  // approved / prompts a retake on rejected) — this is just an ambient
  // notification for when the driver isn't on that screen anymore.
  const handleCheckinApproved = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToastRef.current?.('Check-in approved — you can keep receiving requests.', 'success');
  }, []);

  const handleCheckinRejected = useCallback(() => {
    showToastRef.current?.('Check-in was not confirmed. You have been taken offline.', 'warning');
  }, []);

  const handleCooldownCleared = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['driver'] });
    showToastRef.current?.('Your cooldown has been lifted, you can receive rides again', 'success');
  }, [queryClient]);

  const handleSurgeUpdated = useCallback((zones: SurgeZone[]) => {
    setSurgeZones(zones);
  }, []);

  const { connected: socketConnected } = useRideSocket({
    driverId: driverData?.id as string | undefined,
    onRideOffer: handleRideOffer,
    onOfferExpired: handleOfferExpired,
    onRideNoLongerAvailable: handleRideNoLongerAvailable,
    onCheckinRequired: handleCheckinRequired,
    onCheckinApproved: handleCheckinApproved,
    onCheckinRejected: handleCheckinRejected,
    onCooldownCleared: handleCooldownCleared,
    onSurgeUpdated: handleSurgeUpdated,
  });

  // Re-check the gate on reconnect too — covers a dropped connection that
  // missed the live DRIVER_CHECKIN_REQUIRED event while it was down.
  useEffect(() => {
    if (socketConnected) refetchCheckinStatus();
  }, [socketConnected, refetchCheckinStatus]);

  // Push token registration happens on login, not just when going online
  useEffect(() => {
    if (token) {
      endpoints.pushTokens.register(token, Platform.OS as 'ios' | 'android' | 'web', fcmToken).catch(() => {});
    }
  }, [token, fcmToken]);

  // Start GPS tracking using background location task — returns false if permission denied.
  // Check-first: only calls the request* (OS-prompting) APIs when the stored
  // status isn't already 'granted', instead of unconditionally requesting on
  // every GO tap.
  const startLocationTracking = async (promptOnMissing = true): Promise<boolean> => {
    let fgStatus = (await Location.getForegroundPermissionsAsync()).status;
    const fgAlreadyGranted = fgStatus === 'granted';
    if (!fgAlreadyGranted) {
      fgStatus = (await Location.requestForegroundPermissionsAsync()).status;
    }
    if (fgStatus !== 'granted') {
      setLocationError('Location permission is required to receive rides. Please enable it in Settings.');
      return false;
    }
    setLocationError(null);
    if (!fgAlreadyGranted) {
      // Signal GPSProvider to re-check immediately — closes the race where its
      // one-time check (on consumer registration) ran before this request
      // resolved and permanently concluded "denied" for this mount. Skipped
      // when permission was already granted coming in (the common case after
      // the Home-mount proactive request above, or a driver's 2nd+ GO tap
      // this session) — GPSProvider's subscription is already running then,
      // so there's nothing to re-check.
      recheckGPSPermission();
    }
    // ── HARD GATE: background location is REQUIRED to go online ──────────────
    // A driver with only "while using the app" stops broadcasting the moment
    // VeeGo is backgrounded (screen off, or navigating in Google Maps), so the
    // rider loses them. So "Allow all the time" is mandatory to receive rides.
    //
    // Request once when undetermined (on Android 11+ this opens the settings
    // page rather than a dialog). If it's still not granted, explain why and
    // send the driver to Settings, and BLOCK going online (return false) until
    // they enable it and tap GO again. The OS never lets us grant it in code —
    // the user must pick "Allow all the time" themselves — so a gate + a clear
    // Settings shortcut is the strongest we can enforce.
    let bgStatus = (await Location.getBackgroundPermissionsAsync()).status;
    if (bgStatus === 'undetermined') {
      try {
        bgStatus = (await Location.requestBackgroundPermissionsAsync()).status;
      } catch {
        // keep the previous status; handled by the gate below
      }
    }
    if (bgStatus !== 'granted') {
      if (promptOnMissing) {
        showAlert(t.bg_loc_required_title, t.bg_loc_required_msg, [
          { text: t.open_settings, onPress: () => { Linking.openSettings().catch(() => {}); } },
          { text: t.cancel, style: 'cancel' },
        ]);
      }
      return false;
    }
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK);
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
          // High (not Balanced): this is the driver's broadcast position while
          // online/dispatching — it's what nearby-driver markers on the
          // passenger's booking map are built from, and what a passenger sees
          // for the assigned driver right after acceptance, before the ride
          // screen's own high-accuracy GPS provider (useGPSProvider) takes
          // over. Balanced accuracy on Android is allowed to resolve from
          // cell/WiFi positioning instead of the GPS chip, which can land the
          // driver's shown location a couple of streets off from where they
          // actually are (same reasoning as CarMap.tsx's pickup-fix comment).
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 50,
          foregroundService: {
            notificationTitle: 'VeeGo Driver',
            notificationBody: "You're online — receiving ride requests.",
            notificationColor: '#2d2d42',
          },
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          showsBackgroundLocationIndicator: true,
        });
      }
    } catch {
      // Expo Go / task manager unavailable — fall back to interval-based tracking
      const sendLocation = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          // D6-9: convert raw m/s (Expo Location) to km/h — matches the unit
          // every other caller of this same PATCH /driver/location endpoint
          // sends (useLocationBroadcast.ts, backgroundLocationTask.ts idle
          // branch), so the backend never receives mixed units for the same field.
          await endpoints.driver.updateLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            speed: loc.coords.speed != null && loc.coords.speed >= 0 ? Math.round(loc.coords.speed * 3.6) : undefined,
            heading: loc.coords.heading ?? undefined,
          });
        } catch {
          // best-effort
        }
      };
      sendLocation();
      locationIntervalRef.current = setInterval(sendLocation, 10000);
    }
    return true;
  };

  const stopLocationTracking = () => {
    // Stop background location task
    TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK)
      .then((registered) => {
        if (registered) Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => {});
      })
      .catch(() => {});
    // Clear any Expo Go fallback interval
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  };

  // Stop location tracking on unmount
  useEffect(() => () => {
    stopLocationTracking();
  }, []);

  // Track whether the socket has ever reached a connected state this session.
  // Must run before the banner effect so the ref is updated first.
  useEffect(() => {
    if (socketConnected) {
      socketEverConnectedRef.current = true;
    }
  }, [socketConnected]);

  // Reconnecting banner — slide down only when socket drops after having been
  // connected. Never show during the initial connection handshake, which would
  // produce a false positive: REST API can be healthy while the socket is still
  // completing its first handshake.
  useEffect(() => {
    const show = online && !socketConnected && socketEverConnectedRef.current;
    Animated.spring(bannerAnim, {
      toValue: show ? 0 : -200,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  }, [online, socketConnected]);

  const handleToggleOnline = async () => {
    if (togglingOnline) return;
    const next = !online;
    const nextStatus = next ? 'online' : 'offline';

    // Guard: drop if the same status was already submitted successfully and
    // the local state hasn't changed since (prevents a second tap while the
    // previous API round-trip is still resolving — togglingOnline handles
    // the in-flight case, this covers the instant-re-tap after success).
    if (nextStatus === lastSubmittedStatusRef.current) return;

    setTogglingOnline(true);
    try {
      await (next ? endpoints.driver.goOnline() : endpoints.driver.goOffline());
      lastSubmittedStatusRef.current = nextStatus;
      if (next) {
        // Request location permission and start tracking; revert status if denied
        const ok = await startLocationTracking();
        if (!ok) {
          await endpoints.driver.goOffline().catch(() => {});
          // Without this, lastSubmittedStatusRef stays 'online' (set above)
          // while `online` state itself never flipped true — the next GO tap
          // computes nextStatus === 'online' again, matches the stale ref,
          // and the idempotency guard above silently no-ops it forever, even
          // after the driver later grants permission.
          lastSubmittedStatusRef.current = 'offline';
          return;
        }
        // Advisory only — never blocks going online. Aggressive OEM battery
        // managers (MIUI, ColorOS, etc.) can suspend the app and throttle
        // background push delivery even with a correctly-configured
        // high-priority FCM/Expo payload; this is the one mitigation left
        // that requires the driver's own action.
        maybePromptBatteryOptimization({
          title: t.battery_optim_title,
          message: t.battery_optim_msg,
          openSettingsLabel: t.open_settings,
          dontAskLabel: t.battery_optim_dont_ask,
          laterLabel: t.later,
        }).catch(() => {});
      } else {
        stopLocationTracking();
        setLocationError(null);
      }
      _persistedOnline = next;
      setOnline(next);
      // Keep the cached driver-checkin-status in sync with what we just told
      // the server. Without this, the cache keeps whatever isOnline value it
      // last held (often "false" from before the driver ever went online,
      // since nothing here invalidated it) — and because react-query returns
      // cached data synchronously, a Home remount (e.g. returning from a
      // completed ride) reads that stale "false" before the focus-triggered
      // refetch resolves. The one-time online-state sync effect below then
      // locks in that stale value, which is exactly why the toggle showed
      // Offline and needed a manual re-tap.
      queryClient.setQueryData(['driver-checkin-status'], (old: unknown) => ({
        ...(old && typeof old === 'object' ? old : {}),
        isOnline: next,
      }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (err) {
      // API failed — revert to previous state and notify driver
      console.error('[StatusToggle] Failed to update driver status:', err);
      showToastRef.current?.('Failed to update status. Please try again.', 'warning');
    } finally {
      setTogglingOnline(false);
    }
  };

  const showToast = (msg: string, type: 'warning' | 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    setToastType(type);
    Animated.spring(toastAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: -80, duration: Animation.duration.normal, useNativeDriver: true }).start(() => setToastMsg(null));
    }, 3500);
  };
  showToastRef.current = showToast;

  const dismissSilently = () => {
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);
    Animated.timing(sheetAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => setRequest(null));
  };
  dismissSilentlyRef.current = dismissSilently;

  const dismissRequest = () => {
    if (declining) return;
    setDeclining(true);
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Stop the ringtone immediately — don't let it keep playing while the
    // decline call is in flight or the sheet is animating out.
    const activeSound = tripRequestSoundRef.current;
    tripRequestSoundRef.current = null;
    if (activeSound) {
      activeSound.stopAsync().catch(() => {}).finally(() => {
        activeSound.unloadAsync().catch(() => {});
      });
    }

    if (request) {
      declinedRideIdsRef.current.add(request.id);
      endpoints.rides.decline(request.id).catch(() => {});
    }
    Animated.timing(sheetAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => {
      setRequest(null);
      setDeclining(false);
    });
  };
  dismissRequestRef.current = dismissRequest;

  const acceptRequest = async () => {
    if (!request || acceptingRide) return;
    const rideId = request.id;
    setAcceptingRide(true);
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await endpoints.rides.accept(rideId);
      Animated.timing(sheetAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => {
        setRequest(null);
        setAcceptingRide(false);
        router.push(`/ride/${rideId}`);
      });
    } catch {
      // Backend rejected the accept (ride already taken/unavailable, etc.) —
      // the countdown/timer above are already stopped, so leaving `request`
      // set would freeze a dead offer card. Clear it (no decline call — the
      // ride is already invalid) so the driver is immediately ready for the
      // next offer, instead of restarting a countdown for a rejected ride.
      setAcceptingRide(false);
      showToastRef.current?.('Failed to accept ride. Please try again.', 'warning');
      timerAnim.setValue(0);
      Animated.timing(sheetAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => {
        setRequest(null);
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <DriverMapLayer surgeZones={surgeZones} focused={homeFocused} />

      {/* Reconnecting banner */}
      <Animated.View
        style={{
          position: 'absolute',
          top: topPad,
          left: 0,
          right: 0,
          zIndex: 99,
          transform: [{ translateY: bannerAnim }],
        }}
        pointerEvents="none"
      >
        <View style={{
          marginHorizontal: Spacing.lg,
          borderRadius: Radius.md,
          backgroundColor: '#e67e22',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          paddingVertical: 9,
          paddingHorizontal: Spacing.lg,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: Shadows.medium.elevation,
        }}>
          <AlertCircle size={14} color="#fff" strokeWidth={2.5} />
          <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 }}>
            {t.reconnecting_server}
          </Text>
        </View>
      </Animated.View>

      {/* Event toast — ride:no_longer_available / driver:cooldown:cleared */}
      {toastMsg != null && (
        <Animated.View
          style={[styles.toastWrap, { top: topPad + 52, transform: [{ translateY: toastAnim }] }]}
          pointerEvents="none"
        >
          <View style={[styles.toastInner, { backgroundColor: toastType === 'success' ? '#22c55e' : '#e67e22' }]}>
            {toastType === 'success'
              ? <CheckCircle size={14} color="#fff" strokeWidth={2.5} />
              : <AlertCircle size={14} color="#fff" strokeWidth={2.5} />
            }
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </Animated.View>
      )}

      <View style={[styles.overlay, { paddingTop: topPad }]}>
        <View style={[styles.header, { flexDirection: R }]}>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatarPill}>
            <GlassView style={styles.avatarPillGlass} borderRadius={24}>
              <View style={[styles.avatarPillInner, { flexDirection: R }]}>
                {driverData?.avatar && !avatarFailed ? (
                  <Image
                    source={{ uri: driverData.avatar }}
                    style={[styles.avatar, { borderColor: colors.primary + '66' }]}
                    contentFit="cover"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback, { borderColor: colors.primary + '66', backgroundColor: colors.secondary }]}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_700Bold' }}>{driverInitials}</Text>
                  </View>
                )}
                <View>
                  <Text style={[styles.hiText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.hi}, {(driverData?.name ?? '—').split(' ')[0]}</Text>
                  <View style={[styles.ratingRow, { flexDirection: R }]}>
                    <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                    {/* backend returns rating as a string — parseFloat for numeric display */}
                    <Text style={[styles.ratingText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{driverData?.rating != null ? parseFloat(String(driverData.rating)).toFixed(1) : '—'}</Text>
                  </View>
                </View>
              </View>
            </GlassView>
          </Pressable>

          <View style={[styles.headerActions, { flexDirection: R }]}>
            <Pressable
              style={styles.iconBtn}
              accessibilityLabel={t.notifications}
              onPress={() => router.push('/messages')}
            >
              <GlassView style={styles.iconBtnGlass} borderRadius={20}>
                <Bell size={18} color={colors.foreground} strokeWidth={2} />
                {unreadCount > 0 && (
                  <View style={[styles.notifDot, { backgroundColor: colors.destructive }]}>
                    <Text style={styles.notifDotText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                  </View>
                )}
              </GlassView>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsPillWrap}>
          <GlassView strong style={styles.statsPill} borderRadius={20}>
            {statsLoading ? (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : statsError ? (
              <Pressable onPress={() => { refetchDriver(); refetchEarnings(); }} style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>{t.stats_load_fail}</Text>
              </Pressable>
            ) : (
              <View style={[styles.statsPillInner, { flexDirection: R }]}>
                {/* backend returns totalEarnings as a string — parseFloat for numeric formatting */}
                <StatItem label={t.today} value={`${parseFloat(String(earningsData?.summary?.totalEarnings ?? 0)).toFixed(2)} ${t.egp}`} highlight colors={colors} isRTL={isRTL} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <StatItem label={t.trips} value={todayTripsCount != null ? String(todayTripsCount) : '—'} colors={colors} isRTL={isRTL} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <StatItem
                  label={t.online_status}
                  value={
                    typeof earningsData?.summary?.online === 'number'
                      ? `${Math.floor(Math.round(earningsData.summary.online * 60) / 60)}h ${Math.round(earningsData.summary.online * 60) % 60}m`
                      : '—'
                  }
                  colors={colors}
                  isRTL={isRTL}
                />
              </View>
            )}
          </GlassView>
        </View>

        {/* ── Active Promotions card — session-dismissible ─────────────── */}
        {!promoDismissed && activePromo !== null && (
          <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.sm }}>
            <GlassView strong style={styles.promoHomeInner} borderRadius={16}>
              <View style={[styles.promoHomeBody, { flexDirection: R }]}>
                <View style={[styles.promoHomeIcon, { backgroundColor: colors.primary + '26' }]}>
                  <Tag size={16} color={colors.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.promoHomeTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>{activePromo.title}</Text>
                  {(activePromo.bonusPercentage != null || activePromo.bonusAmount != null) && (
                    <Text style={[styles.promoHomeBonus, { color: colors.accent, fontFamily: 'Inter_700Bold' }]}>
                      {activePromo.bonusPercentage != null
                        ? `+${activePromo.bonusPercentage}% bonus`
                        : `+${activePromo.bonusAmount} ${t.egp} bonus`}
                      {activePromo.targetRides != null ? ` · ${activePromo.targetRides} trips` : ''}
                    </Text>
                  )}
                  {activePromo.validUntil && (
                    <Text style={[styles.promoHomeExpiry, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      Valid until {new Date(activePromo.validUntil).toLocaleDateString(isRTL ? 'ar-EG' : 'en-EG')}
                    </Text>
                  )}
                </View>
                <Pressable onPress={() => setPromoDismissed(true)} style={styles.promoHomeClose} hitSlop={8}>
                  <X size={14} color={colors.mutedForeground} strokeWidth={2} />
                </Pressable>
              </View>
            </GlassView>
          </View>
        )}

        {surgeZones.length > 0 && online && (
          <Animated.View style={[styles.demandCard, { transform: [{ translateX: demandAnim }], opacity: demandOpacity }]}>
            <GlassView strong style={styles.demandCardInner} borderRadius={16}>
              <View style={[styles.demandHeader, { flexDirection: R }]}>
                <TrendingUp size={14} color={colors.accent} strokeWidth={2} />
                <Text style={[styles.demandTitle, { color: colors.accent, fontFamily: 'Inter_700Bold' }]}>{t.high_demand}</Text>
              </View>
              <Text style={[styles.demandText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                {surgeZones.length === 1
                  ? `${surgeZones[0].multiplier.toFixed(1)}× surge active nearby — head there for more trips.`
                  : `${surgeZones.length} surge zones active in your area.`}
              </Text>
            </GlassView>
          </Animated.View>
        )}
      </View>

      {/* Surge zone badge */}
      {surgeZones.length > 0 && (
        <View style={[styles.surgeBadge, { bottom: TAB_BAR_HEIGHT + (locationError ? 180 : 140) }]}>
          <Text style={{ fontSize: 13, color: '#D5B23D' }}>⚡</Text>
          <Text style={{ fontSize: Typography.size.xs, fontFamily: 'Inter_700Bold', color: '#D5B23D', letterSpacing: 0.3 }}>
            {surgeZones.length === 1
              ? `${surgeZones[0].multiplier.toFixed(1)}× surge zone`
              : `${surgeZones.length} surge zones active`}
          </Text>
        </View>
      )}

      {/* Location permission error banner */}
      {locationError && (
        <View style={[styles.locationErrorBanner, { bottom: TAB_BAR_HEIGHT + 130, backgroundColor: '#ef444415', borderColor: '#ef444430' }]}>
          <AlertCircle size={14} color="#ef4444" strokeWidth={2} />
          <Text style={[styles.locationErrorText, { color: '#ef4444', fontFamily: 'Inter_400Regular' }]}>{locationError}</Text>
        </View>
      )}

      {!request && (
        <View style={[styles.onlineToggleWrap, { bottom: TAB_BAR_HEIGHT + 60 }]}>
          <View style={styles.pulseContainer}>
            {online && (
              <Animated.View style={[styles.pulseRing, {
                backgroundColor: colors.primary + '40',
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              }]} />
            )}
            <Pressable
              onPress={handleToggleOnline}
              disabled={togglingOnline}
              accessibilityLabel={online ? t.go_offline_label : t.go_online_label}
              style={({ pressed }) => [styles.onlineBtn, { transform: [{ scale: pressed ? 0.95 : 1 }], opacity: togglingOnline ? 0.7 : 1 }]}
            >
              {online ? (
                <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.onlineBtnGrad}>
                  <Text style={[styles.onlineBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.online_status}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.onlineBtnOff, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Text style={[styles.onlineBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.go}</Text>
                </View>
              )}
            </Pressable>
          </View>
          <GlassView style={styles.statusPill} borderRadius={20}>
            <Text style={[styles.statusPillText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }]}>
              {togglingOnline ? '...' : online ? t.youre_online : t.youre_offline}
            </Text>
          </GlassView>
        </View>
      )}

      {request && (
        <Animated.View style={[styles.requestSheet, { paddingBottom: TAB_BAR_HEIGHT_BASE + insets.bottom + Spacing.md, transform: [{ translateY: sheetAnim }] }]}>
          <GlassView strong style={[styles.requestCard, { borderColor: colors.primary + '4D' }]} borderRadius={24}>
            <View style={[styles.requestHeader, { flexDirection: R }]}>
              <View style={[styles.requestHeaderLeft, { flexDirection: R }]}>
                <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.requestType, { color: colors.accent, fontFamily: 'Inter_700Bold' }]}>
                  {t.new_trip} · {request.type}
                </Text>
              </View>
              <View style={[styles.requestHeaderRight, { flexDirection: R }]}>
                <Text style={[styles.countdownText, { color: colors.destructive, fontFamily: 'Inter_700Bold' }]}>
                  {countdown}s
                </Text>
                <Pressable
                  onPress={dismissRequest}
                  disabled={declining}
                  style={[styles.closeBtn, { backgroundColor: colors.secondary, opacity: declining ? 0.7 : 1 }]}
                >
                  <X size={16} color={colors.foreground} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            <View style={[styles.requestFareRow, { flexDirection: R }]}>
              <View>
                <Text style={[styles.fareAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                  {(request.fare ?? 0).toFixed(2)} <Text style={[styles.fareCurrency, { color: colors.mutedForeground }]}>{t.egp}</Text>
                </Text>
                <Text style={[styles.fareDetails, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                  {request.payment} · {request.duration}
                </Text>
              </View>
              <View style={[styles.riderInfo, { flexDirection: R }]}>
                <Image source={{ uri: request.rider.avatar }} style={styles.riderAvatar} contentFit="cover" />
                <View>
                  <Text style={[styles.riderName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{request.rider.name}</Text>
                  {request.rider.rating != null && (
                    <View style={[styles.riderRatingRow, { flexDirection: R }]}>
                      <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                      <Text style={[styles.riderRating, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{request.rider.rating}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View style={[styles.routeContainer, { flexDirection: R }]}>
              <View style={styles.routeDots}>
                <View style={[styles.routeDotTop, { backgroundColor: colors.primary }]} />
                <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
                <View style={[styles.routeDotBottom, { backgroundColor: colors.accent }]} />
              </View>
              <View style={styles.routeAddresses}>
                <View>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    PICKUP · {request.pickup.distance} · {request.pickup.eta}
                  </Text>
                  <Text style={[styles.routeAddress, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>{request.pickup.address}</Text>
                </View>
                <View>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    DROPOFF · {request.dropoff.distance}
                  </Text>
                  <Text style={[styles.routeAddress, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>{request.dropoff.address}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.requestActions, { flexDirection: R }]}>
              <Pressable
                onPress={dismissRequest}
                disabled={declining}
                style={[styles.declineBtn, { backgroundColor: colors.secondary, opacity: declining ? 0.7 : 1 }]}
                accessibilityLabel={t.decline_ride_label}
              >
                {declining
                  ? <ActivityIndicator size="small" color={colors.foreground} />
                  : <Text style={[styles.declineBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.decline}</Text>
                }
              </Pressable>
              <Pressable
                onPress={acceptRequest}
                disabled={acceptingRide}
                style={[styles.acceptBtn, { opacity: acceptingRide ? 0.7 : 1 }]}
                accessibilityLabel={t.accept_ride_label}
              >
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.acceptBtnGrad, { flexDirection: R }]}>
                  {acceptingRide
                    ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                    : <Check size={20} color={colors.primaryForeground} strokeWidth={2} />
                  }
                  <Text style={[styles.acceptBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.accept_trip}</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <Animated.View style={[styles.timerBar, {
              backgroundColor: colors.destructive,
              transform: [{ scaleX: timerAnim }],
            }]} />
          </GlassView>
        </Animated.View>
      )}
    </View>
  );
}

function StatItem({ label, value, highlight, colors, isRTL }: { label: string; value: string; highlight?: boolean; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>{label}</Text>
      {/* colors.primary is a dark-navy brand color meant for button
          backgrounds, not text — on the dark-mode glass card (also dark
          navy) it was rendering as nearly invisible dark-on-dark. accent
          (brand green) is the token already used elsewhere for "this number
          should pop" emphasis and reads clearly in both themes. */}
      <Text style={[styles.statValue, { color: highlight ? colors.accent : colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { flex: 1, position: 'relative' },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  avatarPill: {},
  avatarPillGlass: {},
  avatarPillInner: { alignItems: 'center', gap: 10, paddingLeft: Spacing.xs, paddingRight: Spacing.md, paddingVertical: Spacing.xs },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  hiText: { fontSize: Typography.size.xs },
  ratingRow: { alignItems: 'center', gap: Spacing.xs },
  ratingText: { fontSize: Typography.size.xs },
  headerActions: { gap: Spacing.sm },
  iconBtn: {},
  iconBtnGlass: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifDotText: { fontSize: 7, color: '#fff', fontFamily: 'Inter_700Bold' },
  statsPillWrap: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  statsPill: {},
  statsPillInner: { alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.sm },
  statLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  statValue: { fontSize: Typography.size.md, marginTop: 2 },
  divider: { width: 1, height: 32 },
  demandCard: { position: 'absolute', top: 120, right: 16 },
  demandCardInner: { padding: Spacing.md, width: 144 },
  demandHeader: { alignItems: 'center', gap: 6 },
  demandTitle: { fontSize: Typography.size.xs },
  demandText: { fontSize: 11, marginTop: Spacing.xs, lineHeight: 16 },
  locationErrorBanner: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: 14, borderWidth: 1 },
  surgeBadge: { position: 'absolute', alignSelf: 'center', left: 20, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(213,178,61,0.12)', borderWidth: 1, borderColor: 'rgba(213,178,61,0.45)', borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: 7 },
  locationErrorText: { flex: 1, fontSize: Typography.size.xs, lineHeight: 16 },
  onlineToggleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: Spacing.md },
  pulseContainer: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40 },
  onlineBtn: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 20 },
  onlineBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onlineBtnOff: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  onlineBtnText: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  statusPill: { paddingHorizontal: Spacing.lg, paddingVertical: 6 },
  statusPillText: { fontSize: Typography.size.xs },
  requestSheet: { position: 'absolute', bottom: 24, left: 0, right: 0, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, zIndex: 50 },
  requestCard: { padding: 20, borderWidth: 2 },
  requestHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  requestHeaderLeft: { alignItems: 'center', gap: Spacing.sm },
  requestHeaderRight: { alignItems: 'center', gap: Spacing.sm },
  countdownText: { fontSize: Typography.size.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  requestType: { fontSize: Typography.size.xs, letterSpacing: 1, textTransform: 'uppercase' },
  closeBtn: { width: 32, height: 32, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  requestFareRow: { alignItems: 'flex-end', justifyContent: 'space-between' },
  fareAmount: { fontSize: 36, lineHeight: 42 },
  fareCurrency: { fontSize: Typography.size.lg },
  fareDetails: { fontSize: Typography.size.xs, marginTop: 2 },
  riderInfo: { alignItems: 'center', gap: Spacing.sm },
  riderAvatar: { width: 40, height: 40, borderRadius: 20 },
  riderName: { fontSize: Typography.size.sm },
  riderRatingRow: { alignItems: 'center', gap: Spacing.xs },
  riderRating: { fontSize: Typography.size.xs },
  routeContainer: { gap: Spacing.md, marginTop: Spacing.lg },
  routeDots: { alignItems: 'center', paddingTop: Spacing.xs },
  routeDotTop: { width: 12, height: 12, borderRadius: 6 },
  routeLine: { width: 1, flex: 1, marginVertical: Spacing.xs },
  routeDotBottom: { width: 12, height: 12, borderRadius: 3 },
  routeAddresses: { flex: 1, gap: Spacing.md },
  routeLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  routeAddress: { fontSize: Typography.size.sm, marginTop: 2 },
  requestActions: { gap: Spacing.sm, marginTop: 20 },
  declineBtn: { flex: 2, height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  declineBtnText: { fontSize: 15 },
  acceptBtn: { flex: 3, height: 56, borderRadius: Radius.lg, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  acceptBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  acceptBtnText: { fontSize: 15 },
  timerBar: { height: 4, width: '100%', borderRadius: 2, marginTop: Spacing.md, transformOrigin: '0% 50%' },
  // Active Promotions card
  promoHomeInner: {},
  promoHomeBody: { alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md },
  promoHomeIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  promoHomeTitle: { fontSize: Typography.size.sm },
  promoHomeBonus: { fontSize: 12, marginTop: 2 },
  promoHomeExpiry: { fontSize: 11, marginTop: Spacing.xs },
  promoHomeClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  // Toast banner — ride:no_longer_available / driver:cooldown:cleared
  toastWrap: { position: 'absolute', left: 0, right: 0, zIndex: 100, paddingHorizontal: Spacing.lg },
  toastInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: Spacing.lg, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  toastText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1, lineHeight: 18 },
});
