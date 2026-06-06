import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronUp, MessageCircle, Navigation, Phone, Shield, Star } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { Animated, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { endpoints } from '@/lib/api';

type Phase = 'to_pickup' | 'arrived' | 'in_trip' | 'completed';

const PHASE_COPY: Record<Phase, { label: string; cta: string; next: Phase }> = {
  to_pickup: { label: 'Heading to pickup', cta: 'Arrived at pickup', next: 'arrived' },
  arrived: { label: 'Pick up rider', cta: 'Start trip', next: 'in_trip' },
  in_trip: { label: 'Drop off', cta: 'Complete trip', next: 'completed' },
  completed: { label: 'Trip completed', cta: 'Done', next: 'completed' },
};

type RideData = {
  id: string;
  rider: { name: string; rating: number; avatar: string };
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

export default function RideScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [phase, setPhase] = useState<Phase>('to_pickup');
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const hasRecovered = useRef(false);

  const { data: rideRaw } = useQuery({
    queryKey: ['ride-active', rideId],
    queryFn: () => endpoints.rides.getById(rideId ?? ''),
    enabled: !!rideId,
  });

  useEffect(() => {
    if (!rideRaw || hasRecovered.current) return;
    hasRecovered.current = true;
    const r = rideRaw as RideData & { status?: string };
    const statusMap: Partial<Record<string, Phase>> = {
      arrived: 'arrived',
      in_trip: 'in_trip',
      active: 'in_trip',
      in_progress: 'in_trip',
      completed: 'completed',
    };
    setPhase(r.status ? (statusMap[r.status] ?? 'to_pickup') : 'to_pickup');
  }, [rideRaw]);

  const r = rideRaw as RideData | undefined;
  const p = PHASE_COPY[phase];

  function getPhaseEta(): string {
    if (phase === 'to_pickup') {
      const parts: string[] = [];
      if (r?.pickup?.eta) parts.push(r.pickup.eta);
      if (r?.pickup?.distance) parts.push(r.pickup.distance);
      return parts.length > 0 ? parts.join(' · ') : 'Calculating...';
    }
    if (phase === 'arrived') return 'Waiting for rider';
    if (phase === 'in_trip') {
      const parts: string[] = [];
      if (r?.duration) parts.push(r.duration);
      if (r?.dropoff?.distance) parts.push(r.dropoff.distance);
      return parts.length > 0 ? parts.join(' · ') : 'Calculating...';
    }
    return '';
  }

  const sheetAnim = useRef(new Animated.Value(100)).current;
  const completedAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.5)).current;

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

  const handleNext = async () => {
    if (phase === 'completed') {
      router.replace('/(tabs)');
      return;
    }
    setBusy(true);
    try {
      if (phase === 'to_pickup') await endpoints.rides.arrived(rideId ?? '');
      else if (phase === 'arrived') await endpoints.rides.start(rideId ?? '');
      else if (phase === 'in_trip') await endpoints.rides.complete(rideId ?? '');
    } catch {
      // best-effort — proceed regardless
    } finally {
      setBusy(false);
    }
    setPhase(p.next);
  };

  const handleDone = async () => {
    if (rating > 0) {
      try {
        await endpoints.rides.rateRider(rideId ?? '', rating);
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

        {phase !== 'completed' && (
          <View style={styles.dirHint}>
            <GlassView style={styles.dirHintInner} borderRadius={12}>
              <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>In 220m</Text>
              <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }]}> turn right onto </Text>
              <Text style={[{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }]} numberOfLines={1}>Rue de la Liberté</Text>
            </GlassView>
          </View>
        )}
      </View>

      {phase === 'completed' && (
        <Animated.View style={[styles.completedOverlay, { opacity: completedAnim, backgroundColor: colors.background + 'CC' }]}>
          <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.checkCircleGrad}>
              <Check size={48} color={colors.primaryForeground} strokeWidth={3} />
            </LinearGradient>
          </Animated.View>
          <Text style={[styles.completedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Trip completed!</Text>
          {/* FIX #4: parseFloat — backend returns fare as string */}
          <Text style={[styles.fareEarned, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>+{parseFloat(String(r?.fare ?? 0)).toFixed(2)} DT</Text>
          <Text style={[styles.fareNote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Added to today's earnings</Text>

          <GlassView style={styles.ratingCard} borderRadius={16}>
            <Text style={[styles.ratingCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Rate {r?.rider.name ?? 'rider'}</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} onPress={() => setRating(n)}>
                  <Star size={36} color={n <= rating ? colors.accent : colors.accent + '60'} fill={n <= rating ? colors.accent : 'transparent'} strokeWidth={2} />
                </Pressable>
              ))}
            </View>
          </GlassView>

          <Pressable onPress={handleDone} style={styles.doneBtn}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.doneBtnGrad}>
              <Text style={[styles.doneBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Back to driving</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {phase !== 'completed' && (
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
          <GlassView strong style={styles.sheetCard} borderRadius={24}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={styles.riderRow}>
              <Image source={{ uri: r?.rider.avatar ?? 'https://i.pravatar.cc/100?img=47' }} style={styles.riderAvatar} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.riderName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{r?.rider.name ?? '—'}</Text>
                <View style={styles.riderMeta}>
                  <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                  {/* FIX #4: parseFloat — backend returns fare and rating as strings */}
                  <Text style={[styles.riderMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {r?.rider.rating != null ? parseFloat(String(r.rider.rating)).toFixed(1) : '—'} · {r?.payment ?? '—'} · {parseFloat(String(r?.fare ?? 0)).toFixed(2)} DT
                  </Text>
                </View>
              </View>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.primary + '26' }]}
                onPress={() => router.push('/messages')}
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

            <Text style={[styles.phaseLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{p.label}</Text>

            <Pressable onPress={handleNext} disabled={busy} style={styles.ctaBtn}>
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.ctaBtnGrad, { opacity: busy ? 0.7 : 1 }]}>
                <ChevronUp size={20} color={colors.primaryForeground} strokeWidth={2} />
                <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{p.cta}</Text>
              </LinearGradient>
            </Pressable>

            <View style={styles.safetyRow}>
              <Shield size={14} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.safetyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Safety toolkit · Trip recorded</Text>
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
  dirHint: { paddingHorizontal: 16, marginTop: 8 },
  dirHintInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
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
  riderAvatar: { width: 48, height: 48, borderRadius: 24 },
  riderName: { fontSize: 16 },
  riderMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  riderMetaText: { fontSize: 12 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  phaseLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 16 },
  ctaBtn: { marginTop: 12, borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  ctaBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaBtnText: { fontSize: 16 },
  safetyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  safetyText: { fontSize: 12 },
});
