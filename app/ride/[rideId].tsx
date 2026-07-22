import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Check, ChevronUp, Clock, MessageCircle, Navigation, Phone, Share2, Shield, Star } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';
import { useColors } from '@/hooks/useColors';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { useService } from '@/lib/serviceContext';
import { useWaitingCharge } from '@/hooks/useWaitingCharge';
import { useActiveLocationTracking } from '@/hooks/useActiveLocationTracking';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import { endpoints } from '@/lib/api';
import { getToken, getUserIdFromToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18nContext';
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
  completed: 'completed',
};

type RideData = {
  id: string;
  rider: { name: string; rating: number; avatar: string; phone?: string };
  pickup: { address: string; distance: string; eta: string };
  dropoff: { address: string; distance: string };
  fare: number;
  type: string;
  payment: string;
  duration: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
};

type DriverData = { id: string };

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
  const hasCheckedOwnership = useRef(false);
  // Guards the cancelled-ride exit (alert + navigate) so it only fires once,
  // whether triggered by the live socket event or a subsequent status refetch.
  const hasExitedRef = useRef(false);

  const { data: rideRaw } = useQuery({
    queryKey: ['ride-active', rideId],
    queryFn: () => endpoints.rides.getById(rideId ?? ''),
    enabled: !!rideId && !isBlocked,
  });

  const { data: driverRaw } = useQuery({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me,
    enabled: !isBlocked,
  });

  const driverData = driverRaw as DriverData | undefined;
  const waitingCharge = useWaitingCharge(driverData?.id, rideId);

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

  // Backend ride status is the source of truth for the displayed phase.
  // This runs on every rideRaw update (not just once) so the screen never
  // gets stuck showing a stale phase after a status change.
  useEffect(() => {
    if (!rideRaw) return;
    const r = rideRaw as RideData & { status?: string; driverId?: string | number };

    if (!hasCheckedOwnership.current) {
      hasCheckedOwnership.current = true;
      // Defense-in-depth: verify this ride belongs to the authenticated driver
      getToken().then(token => {
        const authenticatedDriverId = getUserIdFromToken(token);
        if (authenticatedDriverId && r.driverId && String(r.driverId) !== String(authenticatedDriverId)) {
          console.warn('[Security] Ride does not belong to authenticated driver');
          router.replace('/(tabs)/home');
        }
      });
    }

    if (r.status === 'cancelled') {
      exitRide(t.ride_cancelled_title, t.ride_cancelled_msg);
      return;
    }

    const nextPhase = r.status ? STATUS_TO_PHASE[r.status] : undefined;
    if (nextPhase) setPhase(nextPhase);
    // Unrecognized/unmapped statuses intentionally leave the current phase
    // untouched instead of silently falling back to 'to_pickup'.
  }, [rideRaw]);

  // Ride lifecycle socket events (backend-confirmed). Status-changing events
  // resync via the existing GET-based phase sync above; terminal events
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

    const handleStatusChanged = (data: unknown) => {
      if (!matchesThisRide(data)) return;
      queryClient.invalidateQueries({ queryKey: ['ride-active', rideId] });
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
    socket.on(SOCKET_EVENTS.RIDE_DRIVER_ASSIGNED, handleStatusChanged);
    socket.on(SOCKET_EVENTS.RIDE_DRIVER_ARRIVED, handleStatusChanged);
    socket.on(SOCKET_EVENTS.RIDE_STARTED, handleStatusChanged);
    socket.on(SOCKET_EVENTS.RIDE_DEVIATION_WARNING, handleDeviationWarning);

    return () => {
      socket.off(SOCKET_EVENTS.RIDE_CANCELLED, handleCancelled);
      socket.off(SOCKET_EVENTS.RIDE_DRIVER_CANCELLED, handleDriverCancelled);
      socket.off(SOCKET_EVENTS.RIDE_TIMEOUT, handleTimeout);
      socket.off(SOCKET_EVENTS.RIDE_NO_SHOW_CANCELLED, handleNoShowCancelled);
      socket.off(SOCKET_EVENTS.RIDE_STATUS_UPDATE, handleStatusChanged);
      socket.off(SOCKET_EVENTS.RIDE_DRIVER_ASSIGNED, handleStatusChanged);
      socket.off(SOCKET_EVENTS.RIDE_DRIVER_ARRIVED, handleStatusChanged);
      socket.off(SOCKET_EVENTS.RIDE_STARTED, handleStatusChanged);
      socket.off(SOCKET_EVENTS.RIDE_DEVIATION_WARNING, handleDeviationWarning);
    };
  }, [socket, rideId, queryClient]);

  // All hooks called above — safe to short-circuit for blocked service
  if (isBlocked) {
    return <ServiceBlockedScreen status={serviceStatus} serviceName={SERVICE_NAMES[serviceType] ?? serviceType} />;
  }

  const r = rideRaw as RideData | undefined;
  const p = PHASE_COPY[phase];

  function getPhaseEta(): string {
    if (phase === 'to_pickup') {
      const parts: string[] = [];
      if (r?.pickup?.eta) parts.push(r.pickup.eta);
      if (r?.pickup?.distance) parts.push(r.pickup.distance);
      return parts.length > 0 ? parts.join(' · ') : t.calculating;
    }
    if (phase === 'arrived') return t.waiting_for_rider;
    if (phase === 'in_trip') {
      const parts: string[] = [];
      if (r?.duration) parts.push(r.duration);
      if (r?.dropoff?.distance) parts.push(r.dropoff.distance);
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
      // Re-fetch status before transition to detect concurrent changes
      const expectedStatus: Partial<Record<Phase, string>> = {
        to_pickup: 'driver_assigned',
        arrived: 'driver_arrived',
        in_trip: 'active',
      };
      const freshRide = await endpoints.rides.getById(rideId ?? '') as { status?: string } | null;
      const expected = expectedStatus[phase];
      if (expected && freshRide?.status && freshRide.status !== expected && freshRide.status !== phase) {
        Alert.alert('Status Changed', 'Ride status has changed. Refreshing...');
        queryClient.invalidateQueries({ queryKey: ['ride-active', rideId] });
        setBusy(false);
        return;
      }

      if (phase === 'to_pickup') await endpoints.rides.arrived(rideId ?? '');
      else if (phase === 'arrived') await endpoints.rides.start(rideId ?? '');
      else if (phase === 'in_trip') {
        await endpoints.rides.complete(rideId ?? '');
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
              queryClient.invalidateQueries({ queryKey: ['ride-active'] });
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapBackdrop
        pickup={r?.pickupLatitude != null && r?.pickupLongitude != null
          ? { latitude: Number(r.pickupLatitude), longitude: Number(r.pickupLongitude) }
          : undefined}
        dropoff={r?.dropoffLatitude != null && r?.dropoffLongitude != null
          ? { latitude: Number(r.dropoffLatitude), longitude: Number(r.dropoffLongitude) }
          : undefined}
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
                {phase === 'in_trip' ? (r?.dropoff.address ?? '—') : (r?.pickup.address ?? '—')}
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
          <Text style={[styles.fareEarned, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>+{parseFloat(String(r?.fare ?? 0)).toFixed(2)} {t.egp}</Text>
          <Text style={[styles.fareNote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.added_to_earnings}</Text>

          <GlassView style={styles.ratingCard} borderRadius={16}>
            <View style={styles.ratingCardHeader}>
              <Image source={{ uri: r?.rider.avatar || undefined }} style={styles.ratingAvatar} />
              <Text style={[styles.ratingCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.rate_rider_label.replace('{name}', r?.rider.name ?? '—')}</Text>
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

      {phase !== 'completed' && (
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
          <GlassView strong style={styles.sheetCard} borderRadius={24}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={styles.riderRow}>
              <Image source={{ uri: r?.rider.avatar || undefined }} style={styles.riderAvatar} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.riderName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{r?.rider.name ?? '—'}</Text>
                <View style={styles.riderMeta}>
                  <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                  <Text style={[styles.riderMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {r?.rider.rating != null ? parseFloat(String(r.rider.rating)).toFixed(1) : '—'} · {r?.payment ?? '—'} · {parseFloat(String(r?.fare ?? 0)).toFixed(2)} {t.egp}
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
                  const phone = (r as any)?.rider?.phone;
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
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 10 },
  shareBtnText: { fontSize: Typography.size.xs },
  sosBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: '#ef4444', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 10 },
  sosBtnText: { fontSize: Typography.size.xs },
  commentInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular', marginTop: Spacing.md, minHeight: 60, textAlignVertical: 'top' },
});
