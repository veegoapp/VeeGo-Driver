/**
 * TripCompleteScreen
 *
 * Shown immediately after the driver confirms the last stop and the backend
 * marks the trip as completed.  Receives the backend completion payload as
 * route params so the driver sees their earnings before returning to the
 * Shuttle Home tab.
 *
 * TODO: Backend Integration - Payload supplied by endpoints.shuttle.complete()
 * Expected response shape: { earnedAmount: number, walletBalance: number }
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Home, Wallet } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { useShuttle } from '@/lib/shuttleContext';

type Params = {
  earnedAmount?: string;
  walletBalance?: string;
  tripId?: string;
};

export default function TripCompleteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { earnedAmount, walletBalance } = useLocalSearchParams<Params>();
  const { resetTrip } = useShuttle();

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.7)).current;
  const slideAnim  = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, stiffness: 260, damping: 20 }),
      Animated.timing(fadeAnim,  { toValue: 1, useNativeDriver: true, duration: 450 }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, stiffness: 220, damping: 22 }),
    ]).start();
  }, []);

  const earned  = earnedAmount  ? parseFloat(earnedAmount)  : null;
  const balance = walletBalance ? parseFloat(walletBalance) : null;

  const handleReturnHome = () => {
    // Clear all in-trip state (stop index, passengers, startedTripId) before navigating
    resetTrip();
    router.replace('/(shuttle)/' as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.inner}>

        {/* ── Success icon ─────────────────────────────────────────────── */}
        <Animated.View style={[styles.iconWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <LinearGradient
            colors={['#dcfce7', '#bbf7d0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <CheckCircle2 size={56} color="#16a34a" strokeWidth={1.8} />
          </LinearGradient>
        </Animated.View>

        {/* ── Title & subtitle ─────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center', gap: 6, marginTop: 20 }}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
            {t.trip_completed_title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
            {t.trip_completed_sub}
          </Text>
        </Animated.View>

        {/* ── Earnings cards ───────────────────────────────────────────── */}
        <Animated.View style={[styles.cardsWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Earned amount */}
          <GlassView style={styles.earningsCard} borderRadius={20}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#dcfce7' }]}>
              <CheckCircle2 size={22} color="#16a34a" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {/* TODO: Backend Integration - earnedAmount from completion response */}
                {t.trip_earnings_label}
              </Text>
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 6 }]}>
                <Text style={[styles.cardAmount, { color: '#16a34a', fontFamily: 'Inter_700Bold' }]}>
                  {earned != null ? earned.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </Text>
                <Text style={[styles.cardCurrency, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.egp}</Text>
              </View>
            </View>
          </GlassView>

          {/* Wallet balance */}
          <GlassView style={styles.earningsCard} borderRadius={20}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#eff6ff' }]}>
              <Wallet size={22} color="#2563eb" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {/* TODO: Backend Integration - walletBalance from completion response */}
                {t.wallet_balance_label}
              </Text>
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 6 }]}>
                <Text style={[styles.cardAmount, { color: '#2563eb', fontFamily: 'Inter_700Bold' }]}>
                  {balance != null ? balance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </Text>
                <Text style={[styles.cardCurrency, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.egp}</Text>
              </View>
            </View>
          </GlassView>
        </Animated.View>

      </View>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 24), opacity: fadeAnim },
        ]}
      >
        <Pressable
          onPress={handleReturnHome}
          style={({ pressed }) => [{ borderRadius: 18, overflow: 'hidden', opacity: pressed ? 0.88 : 1, width: '100%' }]}
        >
          <LinearGradient
            colors={['#2d2d42', '#1e1e28']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaBtn}
          >
            <Home size={20} color="#fff" strokeWidth={2} />
            <Text style={[styles.ctaBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.return_home}</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  iconWrap: { alignItems: 'center' },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  title: { fontSize: 26, lineHeight: 34 },
  subtitle: { fontSize: 14, lineHeight: 22 },
  cardsWrap: { width: '100%', gap: 12, marginTop: 32 },
  earningsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  cardAmount: { fontSize: 26 },
  cardCurrency: { fontSize: 13, marginBottom: 2 },
  bottomBar: { paddingHorizontal: 20, paddingTop: 12 },
  ctaBtn: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
  },
  ctaBtnText: { color: '#fff', fontSize: 16 },
});
