import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronRight, Download, Tag, Zap } from 'lucide-react-native';
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
import { endpoints, type DriverPromotion } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

type WeekDay = { week_start: string; trip_count: number; total_earned: number; paid?: number; pending?: number; confirmed?: number };
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
  const topPad = insets.top;

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
  const { data: promotionsRaw } = useQuery({
    queryKey: ['driver-promotions'],
    queryFn: () => endpoints.driver.promotions(),
    retry: false,
  });
  const promotions: DriverPromotion[] = Array.isArray(promotionsRaw)
    ? promotionsRaw as DriverPromotion[]
    : Array.isArray((promotionsRaw as any)?.data)
      ? (promotionsRaw as any).data as DriverPromotion[]
      : [];

  const weekEarnings = ((weeklyRaw as { weeklyBreakdown?: WeekDay[] } | undefined)?.weeklyBreakdown ?? []);
  const summary = summaryRaw as EarningsSummary | undefined;
  const driverData = driverRaw as DriverData | undefined;
  const WEEK_TOTAL = weekEarnings.reduce((s, d) => s + (d.total_earned ?? 0), 0);
  const MAX = weekEarnings.length ? Math.max(...weekEarnings.map(d => d.total_earned ?? 0)) : 1;

  const barAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const heroAnim = useRef(new Animated.Value(0)).current;

  const isLoading = weeklyLoading || summaryLoading;
  const isError = weeklyError || summaryError;

  useEffect(() => {
    if (!weekEarnings.length) return;
    Animated.parallel([
      Animated.spring(heroAnim, { toValue: 1, useNativeDriver: true, stiffness: 200, damping: 20 }),
      Animated.stagger(50, weekEarnings.map((d, i) =>
        Animated.spring(barAnims[i], { toValue: (d.total_earned ?? 0) / MAX, useNativeDriver: false, stiffness: 200 })
      )),
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
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>Failed to load earnings. Please try again.</Text>
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
          <LinearGradient colors={['#2d2d42', '#55c49a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGrad}>
            <View style={styles.heroBlobTop} />
            <View style={styles.heroContent}>
              <Text style={[styles.heroLabel, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.total_this_week}</Text>
              <View style={[styles.heroAmountRow, { flexDirection: R }]}>
                <Text style={[styles.heroAmount, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{WEEK_TOTAL.toFixed(2)}</Text>
                <Text style={[styles.heroCurrency, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold' }]}>{t.egp}</Text>
              </View>

              <View style={[styles.barChart, { flexDirection: R }]}>
                {weekEarnings.map((d, i) => (
                  <View key={d.week_start ?? String(i)} style={styles.barWrapper}>
                    <Animated.View style={[styles.bar, {
                      backgroundColor: colors.primaryForeground + 'D9',
                      height: barAnims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    }]} />
                    <Text style={[styles.barDay, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold' }]}>{(d.week_start ?? '').slice(5)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.today} · {summary?.recentEarnings?.length ?? 0} {t.trips}</Text>
        <GlassView style={styles.summaryCard} borderRadius={20}>
          <View style={styles.summaryInner}>
            <EarningsRow icon="dollar-sign" label="Confirmed" value={`${parseFloat(String(summary?.summary?.totalConfirmed ?? 0)).toFixed(2)} ${t.egp}`} colors={colors} isRTL={isRTL} />
            <EarningsRow icon="credit-card" label="Pending" value={`${parseFloat(String(summary?.summary?.totalPending ?? 0)).toFixed(2)} ${t.egp}`} colors={colors} isRTL={isRTL} />
            <EarningsRow icon="star" label="Paid Out" value={`${parseFloat(String(summary?.summary?.totalPaid ?? 0)).toFixed(2)} ${t.egp}`} accent colors={colors} isRTL={isRTL} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <EarningsRow label={t.net_earnings} value={`${parseFloat(String(summary?.summary?.totalEarnings ?? 0)).toFixed(2)} ${t.egp}`} bold colors={colors} isRTL={isRTL} />
          </View>
        </GlassView>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.active_promotions}</Text>
        {promotions.length === 0 ? (
          <GlassView style={{ padding: 20, alignItems: 'center' }} borderRadius={20}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>No active promotions</Text>
          </GlassView>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {promotions.filter(p => p.isActive).map(promo => (
              <GlassView key={promo.id} style={styles.promoCard} borderRadius={20}>
                <View style={[styles.promoIcon, { backgroundColor: colors.primary + '26' }]}>
                  <Tag size={18} color={colors.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{promo.title}</Text>
                  <Text style={[styles.promoDesc, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{promo.description}</Text>
                  {(promo.bonusPercentage != null || promo.bonusAmount != null) && (
                    <Text style={[styles.promoBonus, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                      {promo.bonusPercentage != null ? `+${promo.bonusPercentage}% bonus` : `+${promo.bonusAmount} ${t.egp} bonus`}
                      {promo.targetRides != null ? ` · ${promo.targetRides} trips` : ''}
                    </Text>
                  )}
                  {promo.validUntil && (
                    <Text style={[styles.promoExpiry, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      Valid until {new Date(promo.validUntil).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </GlassView>
            ))}
          </View>
        )}

        <Pressable onPress={() => router.push('/ratings')} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], marginTop: 20 }]}>
          <GlassView style={[styles.levelCard, { flexDirection: R }]} borderRadius={20}>
            <LinearGradient colors={['#2d2d42', '#55c49a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelIcon}>
              <Zap size={24} color={colors.primaryForeground} strokeWidth={2} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.levelTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{driverData?.level ?? '—'} {t.driver_suffix}</Text>
              <Text style={[styles.levelSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>Tap to view ratings &amp; reviews</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  cashOutBtn: { alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  cashOutText: { fontSize: Typography.size.xs },
  heroCard: { marginTop: 20, borderRadius: Radius.xl, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
  heroGrad: { padding: 20, position: 'relative', overflow: 'hidden' },
  heroBlobTop: { position: 'absolute', top: -32, right: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroContent: {},
  heroLabel: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  heroAmountRow: { alignItems: 'flex-end', gap: Spacing.sm, marginTop: Spacing.xs },
  heroAmount: { fontSize: 48, lineHeight: 52 },
  heroCurrency: { fontSize: 20, marginBottom: Spacing.xs },
  heroChange: { fontSize: Typography.size.xs, marginTop: Spacing.xs },
  barChart: { alignItems: 'flex-end', height: 96, marginTop: Spacing.xl, gap: Spacing.xs },
  barWrapper: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barDay: { fontSize: 10, marginTop: 6 },
  sectionTitle: { fontSize: Typography.size.xs, letterSpacing: 2, textTransform: 'uppercase', marginTop: Spacing.xl, marginBottom: Spacing.md },
  summaryCard: {},
  summaryInner: { padding: Spacing.lg, gap: Spacing.md },
  earningsRow: { alignItems: 'center', gap: Spacing.md },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: Typography.size.sm },
  rowValue: { fontSize: Typography.size.sm },
  divider: { height: 1, marginVertical: Spacing.xs },
  levelCard: { alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  levelIcon: { width: 48, height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  levelTitle: { fontSize: Typography.size.sm },
  levelSub: { fontSize: Typography.size.xs, marginTop: 2 },
  promoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.lg },
  promoIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  promoTitle: { fontSize: Typography.size.sm },
  promoDesc: { fontSize: Typography.size.xs, marginTop: 2 },
  promoBonus: { fontSize: 13, marginTop: 6 },
  promoExpiry: { fontSize: 11, marginTop: Spacing.xs },
});
