/**
 * TripCompleteScreen
 *
 * Shown immediately after the driver confirms the last stop and the backend
 * marks the trip as completed.  Receives the backend completion payload as
 * route params so the driver sees their earnings before returning to the
 * Shuttle Home tab.
 *
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Banknote, Check, CreditCard, Home, Smartphone, Star, Wallet } from 'lucide-react-native';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { useShuttle } from '@/lib/shuttleContext';
import { endpoints, type TripRevenueSummary } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

// "C" split-panel palette — matches the ride/en-route screens.
const C_MINT = '#3DDC97';

type Params = {
  earnedAmount?: string;
  walletBalance?: string;
  tripId?: string;
};

export default function TripCompleteScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { earnedAmount, walletBalance, tripId } = useLocalSearchParams<Params>();
  const { resetTrip } = useShuttle();

  const [revenue, setRevenue] = useState<TripRevenueSummary | null>(null);

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

  useEffect(() => {
    if (!tripId) return;
    endpoints.shuttle.revenueSummary(tripId)
      .then(setRevenue)
      .catch(() => {});
  }, [tripId]);

  const earned  = earnedAmount  ? parseFloat(earnedAmount)  : null;
  const balance = walletBalance ? parseFloat(walletBalance) : null;

  const handleReturnHome = () => {
    // Clear all in-trip state (stop index, passengers, startedTripId) before navigating
    resetTrip();
    router.replace('/(shuttle)/home' as any);
  };

  const handleRatePassengers = () => {
    router.push({ pathname: '/shuttle/rate-passengers', params: { tripId: String(tripId ?? '') } } as any);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>

        {/* ── Dark hero band ────────────────────────────────────────────── */}
        <Animated.View style={[styles.heroC, { opacity: fadeAnim }]}>
          <Animated.View style={[styles.checkCircleC, { transform: [{ scale: scaleAnim }] }]}>
            <Check size={28} color="#ffffff" strokeWidth={3} />
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
            <Text style={styles.titleC}>{t.trip_completed_title}</Text>
            <Text style={styles.subtitleC}>{t.trip_completed_sub}</Text>

            <Text style={styles.heroCapC}>{t.trip_earnings_label}</Text>
            <View style={styles.heroRowC}>
              <Text style={styles.heroAmountC}>
                {earned != null ? earned.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </Text>
              <Text style={styles.heroCurC}>{t.egp}</Text>
            </View>
          </Animated.View>
        </Animated.View>

        {/* ── White body ────────────────────────────────────────────────── */}
        <Animated.View style={[styles.bodyWrapC, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Wallet balance */}
          <View style={styles.walletRowC}>
            <View style={[styles.iconWrapC, { backgroundColor: '#EAF2FF' }]}>
              <Wallet size={18} color="#2563eb" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.capC}>{t.wallet_balance_label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
                <Text style={styles.walletAmountC}>
                  {balance != null ? balance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </Text>
                <Text style={styles.walletCurC}>{t.egp}</Text>
              </View>
            </View>
          </View>

          {/* Payment breakdown (from revenue-summary endpoint) */}
          {revenue && (
            <>
              <Text style={[styles.capC, { marginTop: 22, marginBottom: 8, textAlign: TA }]}>تفاصيل المدفوعات</Text>
              <View style={styles.breakdownCardC}>
                <View style={styles.breakdownRowC}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Banknote size={15} color="#d97706" strokeWidth={2} />
                    <Text style={styles.breakdownLabelC}>كاش محصّل</Text>
                  </View>
                  <Text style={[styles.breakdownValC, { color: '#d97706' }]}>
                    {revenue.cashCollected.toLocaleString('ar-EG')} {t.egp}
                  </Text>
                </View>
                {revenue.cashShortfall > 0 && (
                  <Text style={[styles.shortfallTextC, { textAlign: TA }]}>
                    ناقص {revenue.cashShortfall} {t.egp} من {revenue.cashExpected} {t.egp}
                  </Text>
                )}

                {revenue.cardTotal > 0 && (
                  <>
                    <View style={styles.hairC} />
                    <View style={styles.breakdownRowC}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <CreditCard size={15} color="#2563eb" strokeWidth={2} />
                        <Text style={styles.breakdownLabelC}>كارت / بطاقة</Text>
                      </View>
                      <Text style={[styles.breakdownValC, { color: '#2563eb' }]}>
                        {revenue.cardTotal.toLocaleString('ar-EG')} {t.egp}
                      </Text>
                    </View>
                  </>
                )}

                {revenue.walletTotal > 0 && (
                  <>
                    <View style={styles.hairC} />
                    <View style={styles.breakdownRowC}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Smartphone size={15} color={S.teal} strokeWidth={2} />
                        <Text style={styles.breakdownLabelC}>محفظة / أونلاين</Text>
                      </View>
                      <Text style={[styles.breakdownValC, { color: S.teal }]}>
                        {revenue.walletTotal.toLocaleString('ar-EG')} {t.egp}
                      </Text>
                    </View>
                  </>
                )}

                <View style={[styles.hairC, { height: 2, backgroundColor: S.ink }]} />
                <View style={styles.breakdownRowC}>
                  <Text style={styles.totalLabelC}>إجمالي الرحلة</Text>
                  <Text style={styles.totalAmountC}>{revenue.totalExpected.toLocaleString('ar-EG')} {t.egp}</Text>
                </View>
              </View>
            </>
          )}

        </Animated.View>

      </ScrollView>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.bottomBarC,
          { paddingBottom: Math.max(insets.bottom, 24), opacity: fadeAnim },
        ]}
      >
        {tripId != null && (
          <Pressable
            onPress={handleRatePassengers}
            style={({ pressed }) => [styles.rateBtnC, { opacity: pressed ? 0.88 : 1 }]}
          >
            <Star size={18} color={S.ink} strokeWidth={2} />
            <Text style={styles.rateBtnTextC}>{t.rate_passengers_btn}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleReturnHome}
          style={({ pressed }) => [styles.ctaBtnC, { opacity: pressed ? 0.88 : 1 }]}
        >
          <Home size={20} color="#ffffff" strokeWidth={2} />
          <Text style={styles.ctaBtnTextC}>{t.return_home}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: S.bg },
  inner: { paddingBottom: Spacing.xl },

  // ── Dark hero band ──────────────────────────────────────────────────
  heroC: { backgroundColor: S.ink, alignItems: 'center', paddingHorizontal: 28, paddingTop: 36, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  checkCircleC: { width: 60, height: 60, borderRadius: 30, backgroundColor: S.teal, alignItems: 'center', justifyContent: 'center' },
  titleC: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#ffffff', textAlign: 'center', marginTop: 16 },
  subtitleC: { fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular', color: '#B7BBC2', textAlign: 'center', marginTop: 4 },
  heroCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, color: S.capOnDark, textAlign: 'center', marginTop: 22, textTransform: 'uppercase' },
  heroRowC: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 6 },
  heroAmountC: { fontSize: 42, fontFamily: 'Inter_700Bold', color: C_MINT, lineHeight: 44 },
  heroCurC: { fontSize: 16, fontFamily: 'Inter_700Bold', color: C_MINT },

  // ── White body ──────────────────────────────────────────────────────
  bodyWrapC: { paddingHorizontal: 22, paddingTop: 20 },
  capC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, color: S.cap, textTransform: 'uppercase' },
  iconWrapC: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  walletRowC: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: S.card, borderRadius: 18, padding: 14 },
  walletAmountC: { fontSize: 16, fontFamily: 'Inter_700Bold', color: S.ink },
  walletCurC: { fontSize: 12, fontFamily: 'Inter_700Bold', color: S.cap },
  breakdownCardC: { backgroundColor: S.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  breakdownRowC: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  breakdownLabelC: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold', color: S.inkSoft },
  breakdownValC: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  shortfallTextC: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#ef4444', marginTop: -8, marginBottom: 8 },
  hairC: { height: 1, backgroundColor: S.hair },
  totalLabelC: { fontSize: 15, fontFamily: 'Inter_700Bold', color: S.ink },
  totalAmountC: { fontSize: 17, fontFamily: 'Inter_700Bold', color: S.teal },

  // ── Bottom CTA ──────────────────────────────────────────────────────
  bottomBarC: { paddingHorizontal: 22, paddingTop: Spacing.md, gap: 10 },
  rateBtnC: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D3D6DA',
  },
  rateBtnTextC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: S.ink },
  ctaBtnC: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 15,
    backgroundColor: S.ink,
  },
  ctaBtnTextC: { color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  });
}
