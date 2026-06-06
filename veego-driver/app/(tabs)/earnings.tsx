import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronRight, Download, Zap } from 'lucide-react-native';
import { FeatherIcon } from '@/lib/iconMap';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type WeekDay = { day: string; amount: string | number };
// FIX #5: updated to match spec response shape
type EarningsSummary = {
  driverId: string;
  summary: {
    totalEarnings: string;
    totalPaid: string;
    totalPending: string;
    totalConfirmed: string;
  };
  recentEarnings: { amount: string; [key: string]: unknown }[];
};
type DriverData = { level: string };

const TAB_BAR_HEIGHT = 96;

export default function EarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: weeklyRaw, isLoading: weeklyLoading, isError: weeklyError } = useQuery({
    queryKey: ['earnings-weekly'],
    queryFn: () => endpoints.earnings.weekly(),
  });
  const { data: summaryRaw, isLoading: summaryLoading, isError: summaryError } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: () => endpoints.earnings.summary(),
  });
  const { data: driverRaw } = useQuery({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me,
  });

  // FIX #5: spec returns { weeklyBreakdown[] }, not a direct array
  const weekEarnings = ((weeklyRaw as { weeklyBreakdown?: WeekDay[] } | undefined)?.weeklyBreakdown ?? []);
  const summary = summaryRaw as EarningsSummary | undefined;
  const driverData = driverRaw as DriverData | undefined;
  // FIX #4: parseFloat — backend returns amount as string
  const WEEK_TOTAL = weekEarnings.reduce((s, d) => s + parseFloat(String(d.amount)), 0);
  const MAX = weekEarnings.length ? Math.max(...weekEarnings.map(d => parseFloat(String(d.amount)))) : 1;

  const barAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const promoAnims = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  const heroAnim = useRef(new Animated.Value(0)).current;

  const isLoading = weeklyLoading || summaryLoading;
  const isError = weeklyError || summaryError;

  useEffect(() => {
    if (!weekEarnings.length) return;
    Animated.parallel([
      Animated.spring(heroAnim, { toValue: 1, useNativeDriver: true, stiffness: 200, damping: 20 }),
      Animated.stagger(50, weekEarnings.map((d, i) =>
        Animated.spring(barAnims[i], { toValue: parseFloat(String(d.amount)) / MAX, useNativeDriver: false, stiffness: 200 })
      )),
      ...promoAnims.map((a, i) => Animated.timing(a, { toValue: [68, 33][i] / 100, duration: 800, delay: 200 + i * 100, useNativeDriver: false })),
    ]).start();
  }, [weekEarnings.length]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>Failed to load earnings. Please try again.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { flexDirection: R }]}>
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.earnings}</Text>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.this_week}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/wallet')}>
            <GlassView style={[styles.cashOutBtn, { flexDirection: R }]} borderRadius={20}>
              <Download size={14} color={colors.foreground} strokeWidth={2} />
              <Text style={[styles.cashOutText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{t.cash_out}</Text>
            </GlassView>
          </Pressable>
        </View>

        <Animated.View style={[styles.heroCard, { opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <LinearGradient colors={['#2d2d42', '#D5B23D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGrad}>
            <View style={styles.heroBlobTop} />
            <View style={styles.heroContent}>
              <Text style={[styles.heroLabel, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.total_this_week}</Text>
              <View style={[styles.heroAmountRow, { flexDirection: R }]}>
                <Text style={[styles.heroAmount, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{WEEK_TOTAL.toFixed(2)}</Text>
                <Text style={[styles.heroCurrency, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold' }]}>DT</Text>
              </View>
              <Text style={[styles.heroChange, { color: colors.primaryForeground + 'E6', fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>+18% vs last week</Text>

              <View style={[styles.barChart, { flexDirection: R }]}>
                {weekEarnings.map((d, i) => (
                  <View key={d.day} style={styles.barWrapper}>
                    <Animated.View style={[styles.bar, {
                      backgroundColor: colors.primaryForeground + 'D9',
                      height: barAnims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    }]} />
                    <Text style={[styles.barDay, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold' }]}>{d.day}</Text>
                  </View>
                ))}
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* FIX #5: spec returns summary.{ totalEarnings, totalPaid, totalPending, totalConfirmed } */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.today} · {summary?.recentEarnings?.length ?? 0} {t.trips}</Text>
        <GlassView style={styles.summaryCard} borderRadius={20}>
          <View style={styles.summaryInner}>
            {/* FIX #4: parseFloat — all summary amounts come as strings from DB */}
            <EarningsRow icon="dollar-sign" label="Confirmed" value={`${parseFloat(String(summary?.summary?.totalConfirmed ?? 0)).toFixed(2)} DT`} colors={colors} isRTL={isRTL} />
            <EarningsRow icon="credit-card" label="Pending" value={`${parseFloat(String(summary?.summary?.totalPending ?? 0)).toFixed(2)} DT`} colors={colors} isRTL={isRTL} />
            <EarningsRow icon="star" label="Paid Out" value={`${parseFloat(String(summary?.summary?.totalPaid ?? 0)).toFixed(2)} DT`} accent colors={colors} isRTL={isRTL} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <EarningsRow label={t.net_earnings} value={`${parseFloat(String(summary?.summary?.totalEarnings ?? 0)).toFixed(2)} DT`} bold colors={colors} isRTL={isRTL} />
          </View>
        </GlassView>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.active_promotions}</Text>
        <View style={{ gap: 8 }}>
          <PromoCard title="Weekend boost" subtitle="Earn +25% on Sat & Sun" progress={68} anim={promoAnims[0]} colors={colors} isRTL={isRTL} />
          <PromoCard title="3 trips before 11 AM" subtitle="Bonus: 15 DT · 1 of 3 done" progress={33} anim={promoAnims[1]} colors={colors} isRTL={isRTL} />
        </View>

        <Pressable onPress={() => router.push('/ratings')} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], marginTop: 20 }]}>
          <GlassView style={[styles.levelCard, { flexDirection: R }]} borderRadius={20}>
            <LinearGradient colors={['#2d2d42', '#D5B23D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelIcon}>
              <Zap size={24} color={colors.primaryForeground} strokeWidth={2} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.levelTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{driverData?.level ?? '—'} {t.driver_suffix}</Text>
              <Text style={[styles.levelSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>12 more trips to reach Platinum</Text>
            </View>
            <ChevronRight size={20} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </GlassView>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function EarningsRow({ icon, label, value, accent, bold, colors, isRTL }: { icon?: string; label: string; value: string; accent?: boolean; bold?: boolean; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <View style={[styles.earningsRow, { flexDirection: R }]}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: colors.secondary + 'B3' }]}>
          <FeatherIcon name={icon} size={16} color={colors.mutedForeground} />
        </View>
      )}
      <Text style={[styles.rowLabel, { color: bold ? colors.foreground : colors.mutedForeground, fontFamily: bold ? 'Inter_700Bold' : 'Inter_400Regular', flex: 1, textAlign: TA }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: accent ? colors.primary : colors.foreground, fontFamily: 'Inter_700Bold', fontSize: bold ? 16 : 14 }]}>{value}</Text>
    </View>
  );
}

function PromoCard({ title, subtitle, progress, anim, colors, isRTL }: { title: string; subtitle: string; progress: number; anim: Animated.Value; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <GlassView style={styles.promoCard} borderRadius={20}>
      <View style={[styles.promoHeader, { flexDirection: R }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.promoTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{title}</Text>
          <Text style={[styles.promoSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{subtitle}</Text>
        </View>
        <Text style={[styles.promoPct, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{progress}%</Text>
      </View>
      <View style={[styles.promoTrack, { backgroundColor: colors.secondary }]}>
        <Animated.View style={[styles.promoFill, {
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          alignSelf: isRTL ? 'flex-end' : 'flex-start',
        }]}>
          <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  cashOutBtn: { alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  cashOutText: { fontSize: 12 },
  heroCard: { marginTop: 20, borderRadius: 24, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
  heroGrad: { padding: 20, position: 'relative', overflow: 'hidden' },
  heroBlobTop: { position: 'absolute', top: -32, right: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroContent: {},
  heroLabel: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  heroAmountRow: { alignItems: 'flex-end', gap: 8, marginTop: 4 },
  heroAmount: { fontSize: 48, lineHeight: 52 },
  heroCurrency: { fontSize: 20, marginBottom: 4 },
  heroChange: { fontSize: 12, marginTop: 4 },
  barChart: { alignItems: 'flex-end', height: 96, marginTop: 24, gap: 4 },
  barWrapper: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barDay: { fontSize: 10, marginTop: 6 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: 24, marginBottom: 12 },
  summaryCard: {},
  summaryInner: { padding: 16, gap: 12 },
  earningsRow: { alignItems: 'center', gap: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14 },
  divider: { height: 1, marginVertical: 4 },
  promoCard: { padding: 16 },
  promoHeader: { alignItems: 'center', justifyContent: 'space-between' },
  promoTitle: { fontSize: 14 },
  promoSub: { fontSize: 12, marginTop: 2 },
  promoPct: { fontSize: 12 },
  promoTrack: { height: 6, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  promoFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  levelCard: { alignItems: 'center', gap: 12, padding: 16 },
  levelIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  levelTitle: { fontSize: 14 },
  levelSub: { fontSize: 12, marginTop: 2 },
});
