import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Check, ChevronUp, Clock, MessageCircle, Navigation, Phone, Shield, Star } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { Alert, Animated, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';
import { useColors } from '@/hooks/useColors';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { useWaitingCharge } from '@/hooks/useWaitingCharge';
import { useActiveLocationTracking } from '@/hooks/useActiveLocationTracking';
import { endpoints } from '@/lib/api';
import { getToken, getUserIdFromToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18nContext';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

type Phase = 'to_pickup' | 'arrived' | 'in_trip' | 'completed';
type PhaseCopy = { label: string; cta: string; next: Phase };

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
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { isBlocked, status: serviceStatus } = useServiceGuard('CAR');
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('to_pickup');
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const hasRecovered = useRef(false);

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

  useActiveLocationTracking({
    enabled: !!rideId && phase !== 'completed',
    rideId: rideId ? Number(rideId) : null,
  });

  useEffect(() => {
    if (!rideRaw || hasRecovered.current) return;
    hasRecovered.current = true;
    const r = rideRaw as RideData & { status?: string; driverId?: string | number };

    // Defense-in-depth: verify this ride belongs to the authenticated driver
    getToken().then(token => {
      const authenticatedDriverId = getUserIdFromToken(token);
      if (authenticatedDriverId && r.driverId && String(r.driverId) !== String(authenticatedDriverId)) {
        console.warn('[Security] Ride does not belong to authenticated driver');
        router.replace('/(tabs)');
        return;
      }
    });

    const statusMap: Partial<Record<string, Phase>> = {
      arrived: 'arrived',
      in_trip: 'in_trip',
      active: 'in_trip',
      in_progress: 'in_trip',
      completed: 'completed',
    };
    setPhase(r.status ? (statusMap[r.status] ?? 'to_pickup') : 'to_pickup');
  }, [rideRaw]);

  // Listen for ride cancellation while on this screen
  useEffect(() => {
    if (!socket || !rideId) return;
    const handleCancelled = (data: { rideId?: string | number } | undefined) => {
      const cancelledId = String(data?.rideId ?? '');
      if (cancelledId && cancelledId !== rideId) return;
      Alert.alert(
        t.ride_cancelled_title,
        t.ride_cancelled_msg,
        [{ text: t.ok, onPress: () => router.replace('/(tabs)') }],
      );
    };
    socket.on(SOCKET_EVENTS.RIDE_CANCELLED, handleCancelled);
    return () => { socket.off(SOCKET_EVENTS.RIDE_CANCELLED, handleCancelled); };
  }, [socket, rideId]);

  // All hooks called above — safe to short-circuit for blocked service
  if (isBlocked) {
    return <ServiceBlockedScreen status={serviceStatus} serviceName="Car Rides" />;
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
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [!!waitingCharge, waitingCharge?.capped]);

  const handleNext = async () => {
    if (phase === 'completed') {
      router.replace('/(tabs)');
      return;
    }
    setBusy(true);
    try {
      // Re-fetch status before transition to detect concurrent changes
      const expectedStatus: Partial<Record<Phase, string>> = {
        to_pickup: 'accepted',
        arrived: 'arrived',
        in_trip: 'in_trip',
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
        socket.emit(SOCKET_EVENTS.DRIVER_SOS, { rideId: rideId ?? '', latitude, longitude });
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

  const handleDone = async () => {
    if (rating > 0) {
      try {
        await endpoints.rides.rateRider(rideId ?? '', rating, ratingComment.trim() || undefined);
      } catch {
        // best-effort
      }
    }
    router.replace('/(tabs)');
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
          <Text style={[styles.fareEarned, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>+{parseFloat(String(r?.fare ?? 0)).toFixed(2)} DT</Text>
          <Text style={[styles.fareNote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.added_to_earnings}</Text>

          <GlassView style={styles.ratingCard} borderRadius={16}>
            <Text style={[styles.ratingCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.rate_rider_label.replace('{name}', r?.rider.name ?? '—')}</Text>
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
                placeholder={t.rating_comment_placeholder ?? 'Add a comment (optional)'}
                placeholderTextColor={colors.mutedForeground}
                value={ratingComment}
                onChangeText={setRatingComment}
                maxLength={200}
                multiline
              />
            )}
          </GlassView>

          <Pressable onPress={handleDone} style={styles.doneBtn}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.doneBtnGrad}>
              <Text style={[styles.doneBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.back_to_driving}</Text>
            </LinearGradient>
          </Pressable>
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
                    {r?.rider.rating != null ? parseFloat(String(r.rider.rating)).toFixed(1) : '—'} · {r?.payment ?? '—'} · {parseFloat(String(r?.fare ?? 0)).toFixed(2)} DT
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

            <View style={styles.bottomRow}>
              <View style={styles.safetyRow}>
                <Shield size={14} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.safetyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.safety_toolkit_trip}</Text>
              </View>
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
          </GlassView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { flex: 1 },
  topNav: { paddingHorizontal: 16, paddingTop: 8 },
  navCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  navIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navEta: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  navAddress: { fontSize: 16, marginTop: 2 },
  completedOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 20 },
  checkCircle: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
  checkCircleGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  completedTitle: { fontSize: 24, marginTop: 24 },
  fareEarned: { fontSize: 48, lineHeight: 52 },
  fareNote: { fontSize: 14, marginTop: 8 },
  ratingCard: { padding: 16, marginTop: 24, width: '100%' },
  ratingCardLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  starsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  doneBtn: { marginTop: 24, width: '100%', borderRadius: 16, overflow: 'hidden' },
  doneBtnGrad: { height: 56, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontSize: 16 },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: 12, zIndex: 30 },
  sheetCard: { padding: 20 },
  sheetHandle: { width: 48, height: 6, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e5e5ea' },
  riderName: { fontSize: 16 },
  riderMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  riderMetaText: { fontSize: 12 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  waitingTicker: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  waitingTickerText: { fontSize: 13, flex: 1 },
  cappedBadge: { backgroundColor: '#ef444422', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  cappedText: { fontSize: 9, color: '#ef4444', letterSpacing: 0.8 },
  phaseLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 16 },
  ctaBtn: { marginTop: 12, borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  ctaBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaBtnText: { fontSize: 16 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  safetyText: { fontSize: 12 },
  sosBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  sosBtnText: { fontSize: 12 },
  commentInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 12, minHeight: 60, textAlignVertical: 'top' },
});
