/**
 * ReferralIncomingScreen
 *
 * This screen is shown to the SECOND DRIVER when they receive a trip referral
 * push notification from a colleague (Driver 1).
 *
 * TODO: Backend Integration - This screen should be triggered by:
 *   1. A push notification deep-link when the app is backgrounded/closed.
 *   2. A real-time socket event (e.g., "referral:incoming") when the app is active.
 *      Listen on socket in useRideSocket or a dedicated hook and navigate here.
 *
 * Route params are populated either from the push notification payload or the socket event data.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Check, ChevronLeft, Clock, Users, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { useReferral } from '@/lib/referralContext';

type Params = {
  referralId: string;
  bookingId: string;
  routeName: string;
  departureTime: string;
  fromStation: string;
  toStation: string;
  passengerCount?: string;
  totalSeats?: string;
  lineNumber?: string;
  vehicleType?: string;
  weekStart?: string;
};

export default function ReferralIncomingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const {
    referralId,
    bookingId,
    routeName,
    departureTime,
    fromStation,
    toStation,
    passengerCount,
    totalSeats,
    lineNumber,
    vehicleType,
    weekStart,
  } = useLocalSearchParams<Params>();

  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [resolved, setResolved] = useState<'accepted' | 'declined' | null>(null);

  const { dismissReferral } = useReferral();

  // Auto-clear the badge for this referral as soon as the screen is viewed
  useEffect(() => {
    if (referralId) dismissReferral(referralId);
  }, [referralId]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      // TODO: Backend Integration - POST /shuttle/referrals/:id/accept
      // Backend should: transfer trip ownership, add to Driver 2's upcoming list,
      // send push notification to Driver 1 confirming acceptance,
      // and invalidate shuttle-my-bookings query on Driver 1's side.
      await endpoints.shuttle.acceptReferral(referralId!);
      setResolved('accepted');
    } catch {
      Alert.alert('', t.accept_trip_failed);
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      // TODO: Backend Integration - POST /shuttle/referrals/:id/decline
      // Backend should: close the referral request and send push notification to Driver 1
      // notifying them that Driver 2 has declined the handoff.
      await endpoints.shuttle.declineReferral(referralId!);
      setResolved('declined');
    } catch {
      Alert.alert('', t.decline_trip_failed);
    } finally {
      setDeclining(false);
    }
  };

  if (resolved === 'accepted') {
    return (
      <View style={[styles.container, styles.resolvedWrap, { backgroundColor: colors.background }]}>
        <View style={[styles.resolvedIcon, { backgroundColor: '#dcfce7' }]}>
          <Check size={36} color="#16a34a" strokeWidth={2.5} />
        </View>
        <Text style={[styles.resolvedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.referral_accepted_title}
        </Text>
        <Text style={[styles.resolvedSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          {/* TODO: Backend Integration - The trip will now appear in your upcoming trips list */}
          {t.referral_accepted_sub}
        </Text>
        <Pressable
          onPress={() => router.replace('/(shuttle)/index' as any)}
          style={[styles.resolvedBtn, { backgroundColor: '#16a34a' }]}
        >
          <Text style={[styles.resolvedBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.return_home}</Text>
        </Pressable>
      </View>
    );
  }

  if (resolved === 'declined') {
    return (
      <View style={[styles.container, styles.resolvedWrap, { backgroundColor: colors.background }]}>
        <View style={[styles.resolvedIcon, { backgroundColor: '#FEF2F2' }]}>
          <X size={36} color="#DC2626" strokeWidth={2.5} />
        </View>
        <Text style={[styles.resolvedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.referral_declined_title}
        </Text>
        <Text style={[styles.resolvedSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          {/* TODO: Backend Integration - Driver 1 will be notified of the decline */}
          {t.referral_declined_sub}
        </Text>
        <Pressable
          onPress={() => router.replace('/(shuttle)/index' as any)}
          style={[styles.resolvedBtn, { backgroundColor: '#1e1e28' }]}
        >
          <Text style={[styles.resolvedBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.return_home}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.referral_incoming_title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <GlassView style={[styles.banner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]} borderRadius={16}>
          <Text style={{ fontSize: 28 }}>🔔</Text>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 14, color: '#92400E', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {t.referral_incoming_title}
            </Text>
            <Text style={[{ fontSize: 12, color: '#B45309', fontFamily: 'Inter_400Regular', marginTop: 3, textAlign: TA }]}>
              {t.referral_incoming_sub}
            </Text>
          </View>
        </GlassView>

        {/* Route name */}
        <View style={{ marginTop: 24 }}>
          <Text style={[{ fontSize: 22, color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
            {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
            {routeName ?? '—'}
          </Text>
          <Text style={[{ fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: TA }]}>
            {fromStation ?? '—'} → {toStation ?? '—'}
          </Text>
        </View>

        {/* Info row */}
        <View style={[styles.infoRow, { flexDirection: R, marginTop: 20 }]}>
          <GlassView style={styles.infoCard} borderRadius={16}>
            <Calendar size={16} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.infoCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.date}
            </Text>
            <Text style={[styles.infoCardValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {/* TODO: Backend Integration - Use exact trip date from backend payload */}
              {weekStart ?? '—'}
            </Text>
          </GlassView>
          <GlassView style={styles.infoCard} borderRadius={16}>
            <Clock size={16} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.infoCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.time_label}
            </Text>
            <Text style={[styles.infoCardValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {departureTime ?? '—'}
            </Text>
          </GlassView>
          <GlassView style={styles.infoCard} borderRadius={16}>
            <Users size={16} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.infoCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.passengers_label_count}
            </Text>
            <Text style={[styles.infoCardValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {/* TODO: Backend Integration - Use passenger count from referral payload */}
              {passengerCount ?? '—'} / {totalSeats ?? '—'}
            </Text>
          </GlassView>
        </View>

        {/* Vehicle / Line info */}
        {(vehicleType || lineNumber) && (
          <GlassView style={[styles.vehicleCard, { marginTop: 12 }]} borderRadius={16}>
            <View style={[{ flexDirection: R, alignItems: 'center', gap: 12 }]}>
              <View style={[styles.vehicleIconWrap, { backgroundColor: '#1e1e2810' }]}>
                <Text style={{ fontSize: 22 }}>🚐</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: TA }]}>
                  {t.vehicle_line_label}
                </Text>
                <Text style={[{ fontSize: 15, color: colors.foreground, fontFamily: 'Inter_700Bold', marginTop: 3, textAlign: TA }]}>
                  {/* TODO: Backend Integration - Use vehicle model/plate from referral payload */}
                  {vehicleType ?? '—'} · {lineNumber ?? '—'}
                </Text>
              </View>
            </View>
          </GlassView>
        )}
      </ScrollView>

      {/* Bottom action buttons */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20), borderTopColor: colors.border, backgroundColor: colors.background }]}>
        {/* Decline */}
        <Pressable
          onPress={handleDecline}
          disabled={declining || accepting}
          style={({ pressed }) => [
            styles.declineBtn,
            { borderColor: '#FCA5A5', backgroundColor: pressed ? '#FEF2F2' : 'transparent', opacity: declining ? 0.7 : 1 },
          ]}
        >
          {declining ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Text style={[styles.declineBtnText, { color: '#DC2626', fontFamily: 'Inter_700Bold' }]}>
              {t.referral_decline}
            </Text>
          )}
        </Pressable>

        {/* Accept */}
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={handleAccept}
            disabled={accepting || declining}
            style={({ pressed }) => [{ borderRadius: 16, overflow: 'hidden', opacity: pressed ? 0.88 : accepting ? 0.7 : 1 }]}
          >
            <LinearGradient
              colors={['#16a34a', '#15803d']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.acceptBtn}
            >
              {accepting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Check size={18} color="#fff" strokeWidth={2.5} />
                  <Text style={[styles.acceptBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.referral_accept}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
  },
  infoRow: { gap: 10 },
  infoCard: { flex: 1, alignItems: 'center', padding: 14, gap: 4 },
  infoCardLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  infoCardValue: { fontSize: 15, textAlign: 'center' },
  vehicleCard: { padding: 16 },
  vehicleIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  declineBtn: {
    height: 54,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
  },
  declineBtnText: { fontSize: 15 },
  acceptBtn: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
  },
  acceptBtnText: { color: '#fff', fontSize: 15 },
  resolvedWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  resolvedIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  resolvedTitle: { fontSize: 20, textAlign: 'center' },
  resolvedSub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  resolvedBtn: { marginTop: 8, height: 50, paddingHorizontal: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  resolvedBtnText: { color: '#fff', fontSize: 14 },
});
