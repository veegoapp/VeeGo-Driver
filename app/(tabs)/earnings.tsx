import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronRight, Download, TrendingDown, TrendingUp } from 'lucide-react-native';
import { FeatherIcon } from '@/lib/iconMap';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, type RideHistoryItem } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';

type EarningsSummary = {
  driverId: string;
  summary: {
    totalEarnings: string;
    totalPaid: string;
    totalPending: string;
    totalConfirmed: string;
    // Reconciled server-side from financial_snapshots (covers cash + non-cash
    // rides and peak bonuses in one place) — see GET /earnings/summary.
    driverShare: string;
    companyShare: string;
  };
  recentEarnings: { amount: string; [key: string]: unknown }[];
};
type PeriodKey = 'today' | 'this_week' | 'last_week' | 'current_month';
const PERIOD_KEYS: PeriodKey[] = ['today', 'this_week', 'last_week', 'current_month'];
const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  this_week: 'This Week',
  last_week: 'Last Week',
  current_month: 'This Month',
};
const PERIOD_HERO_LABELS: Record<PeriodKey, string> = {
  today: 'TOTAL TODAY',
  this_week: 'TOTAL THIS WEEK',
  last_week: 'TOTAL LAST WEEK',
  current_month: 'TOTAL THIS MONTH',
};

// NaN-safe: a malformed/missing numeric field (bad fare string, absent
// driverEarnings) falls back to 0 instead of poisoning downstream sums.
const toNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

// Africa/Cairo is fixed UTC+2 year-round (no DST since 2014) — the same
// offset the backend uses for its `AT TIME ZONE 'Africa/Cairo'` period
// truncation in GET /earnings/summary. Boundaries here are computed in
// Cairo-local time (not the device's timezone) so a driver's day/week/month
// cutoffs agree with the server's, instead of drifting for anyone whose
// device isn't set to Cairo time. The history endpoint has no date-range
// param, so this is used to filter/paginate ride history client-side (see
// fetchRidesInRange below) for the Trips list only.
const CAIRO_OFFSET_MS = 2 * 60 * 60 * 1000;

function getPeriodRange(period: PeriodKey): { start: Date; end: Date } {
  const now = new Date();
  const cairoNowMs = now.getTime() + CAIRO_OFFSET_MS;
  // Absolute UTC instant of Cairo-local midnight for the day `cairoMs` falls on.
  const startOfCairoDay = (cairoMs: number) => {
    const shifted = new Date(cairoMs);
    const cairoMidnightUtcMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    return new Date(cairoMidnightUtcMs - CAIRO_OFFSET_MS);
  };
  if (period === 'today') {
    return { start: startOfCairoDay(cairoNowMs), end: now };
  }
  const cairoDay = new Date(cairoNowMs).getUTCDay(); // 0 = Sunday, Cairo-local
  const mondayOffset = (cairoDay + 6) % 7;
  const thisMonday = new Date(startOfCairoDay(cairoNowMs).getTime() - mondayOffset * 86_400_000);
  if (period === 'this_week') {
    return { start: thisMonday, end: now };
  }
  if (period === 'last_week') {
    const lastMonday = new Date(thisMonday.getTime() - 7 * 86_400_000);
    return { start: lastMonday, end: new Date(thisMonday.getTime() - 1) };
  }
  const cairoNow = new Date(cairoNowMs);
  const monthStart = new Date(Date.UTC(cairoNow.getUTCFullYear(), cairoNow.getUTCMonth(), 1) - CAIRO_OFFSET_MS);
  return { start: monthStart, end: now };
}

// Ride history is paginated with no date filter, so pages are walked
// newest-first until a ride older than `start` is hit — bounded to 20 pages
// (1000 rides) as a safety cap for exceptionally busy drivers.
async function fetchRidesInRange(start: Date, end: Date): Promise<RideHistoryItem[]> {
  console.log('[Earnings:rides] → fetchRidesInRange', { start: start.toISOString(), end: end.toISOString() });
  const results: RideHistoryItem[] = [];
  const limit = 50;
  for (let page = 1; page <= 20; page++) {
    console.log(`[Earnings:rides] → GET /driver/rides/history?page=${page}&limit=${limit}&status=completed`);
    try {
      const res = await endpoints.rides.history(page, limit, 'completed') as { data?: RideHistoryItem[] };
      const items = res?.data ?? [];
      console.log(`[Earnings:rides] ✓ page ${page}:`, { count: items.length });
      if (items.length === 0) break;
      let hitOlder = false;
      for (const r of items) {
        const d = new Date(r.completedAt);
        if (d >= start && d <= end) results.push(r);
        if (d < start) hitOlder = true;
      }
      if (hitOlder || items.length < limit) break;
    } catch (err: unknown) {
      const e = err as any;
      console.error(`[Earnings:rides] ✗ page ${page} failed:`, { name: e?.name, message: e?.message, status: e?.status, statusText: e?.statusText, body: e?.body, stack: e?.stack }, e);
      throw err;
    }
  }
  console.log('[Earnings:rides] ✓ total collected:', results.length);
  return results;
}

export default function EarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = insets.top;
  const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [period, setPeriod] = useState<PeriodKey>('this_week');

  const { data: summaryRaw, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useQuery({
    queryKey: ['earnings-summary', period],
    queryFn: async () => {
      console.log(`[Earnings:summary] → GET /earnings/summary?period=${period}`);
      try {
        const result = await endpoints.earnings.summary(period);
        console.log('[Earnings:summary] ✓ success:', { totalEarnings: (result as any)?.summary?.totalEarnings, period });
        return result;
      } catch (err: unknown) {
        const e = err as any;
        console.error('[Earnings:summary] ✗ failed:', { name: e?.name, message: e?.message, status: e?.status, statusText: e?.statusText, body: e?.body, stack: e?.stack }, e);
        throw err;
      }
    },
  });
  const { data: periodRides, isLoading: ridesLoading } = useQuery({
    queryKey: ['earnings-period-rides', period],
    queryFn: () => {
      const { start, end } = getPeriodRange(period);
      return fetchRidesInRange(start, end);
    },
  });

  const summary = summaryRaw as EarningsSummary | undefined;
  const rides = periodRides ?? [];

  // Driver's cut vs the company's cut for the selected period — sourced
  // directly from GET /earnings/summary (driverShare/companyShare), which
  // the backend reconciles from financial_snapshots (cash + non-cash rides
  // and peak bonuses all accounted for in one place). Previously this was
  // recomputed client-side from the period-filtered rides list, which could
  // never be made to agree with the hero/Confirmed/Paid-Out cards above it —
  // those come from a different backend source (the wallet ledger, which
  // omits cash-ride earnings since the driver already holds that cash) and a
  // different date-range implementation (device-local vs server Cairo-local).
  const { grossTotal, driverTotal, companyTotal, driverPct, companyPct } = useMemo(() => {
    const driver = toNum(summary?.summary?.driverShare);
    const company = toNum(summary?.summary?.companyShare);
    const gross = driver + company;
    return {
      grossTotal: gross,
      driverTotal: driver,
      companyTotal: company,
      driverPct: gross > 0 ? (driver / gross) * 100 : 0,
      companyPct: gross > 0 ? (company / gross) * 100 : 0,
    };
  }, [summary]);

  const heroAnim = useRef(new Animated.Value(0)).current;

  const isLoading = summaryLoading;
  const isError = summaryError;

  // Debug: log when "Failed to load earnings" screen renders
  useEffect(() => {
    if (summaryError) console.error('[Earnings:screen] summaryError → rendering "Failed to load earnings. Please try again."', { summaryError });
  }, [summaryError]);

  useEffect(() => {
    Animated.spring(heroAnim, { toValue: 1, useNativeDriver: true, stiffness: 200, damping: 20 }).start();
  }, [period]);

  const handleTripPress = (ride: RideHistoryItem) => {
    router.push({
      pathname: '/ride-history/[rideId]',
      params: { rideId: ride.id, ride: JSON.stringify(ride) },
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <AppLoader />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>Failed to load earnings. Please try again.</Text>
        <Pressable onPress={() => refetchSummary()} style={{ paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.secondary }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: tabBarHeight + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { flexDirection: R }]}>
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.earnings}</Text>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{PERIOD_LABELS[period]}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/wallet')}>
            <GlassView style={[styles.cashOutBtn, { flexDirection: R }]} borderRadius={20}>
              <Download size={14} color={colors.foreground} strokeWidth={2} />
              <Text style={[styles.cashOutText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{t.cash_out}</Text>
            </GlassView>
          </Pressable>
        </View>

        {/* Period filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.lg }} contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.xs }}>
          {PERIOD_KEYS.map(key => (
            <Pressable key={key} onPress={() => setPeriod(key)}>
              {key === period ? (
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.periodChip, { elevation: 6, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8 }]}>
                  <Text style={[styles.periodChipText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{PERIOD_LABELS[key]}</Text>
                </LinearGradient>
              ) : (
                <GlassView style={styles.periodChip} borderRadius={20}>
                  <Text style={[styles.periodChipText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{PERIOD_LABELS[key]}</Text>
                </GlassView>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Hero — now strictly reflects the selected period (was pinned to a
            separate 4-week query before, so it never matched the tabs) */}
        <Animated.View style={[styles.heroCard, { opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <LinearGradient colors={['#2d2d42', '#55c49a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGrad}>
            <View style={styles.heroBlobTop} />
            <View style={styles.heroContent}>
              <Text style={[styles.heroLabel, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold', textAlign: TA }]}>{PERIOD_HERO_LABELS[period]}</Text>
              <View style={[styles.heroAmountRow, { flexDirection: R }]}>
                <Text style={[styles.heroAmount, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  {parseFloat(String(summary?.summary?.totalEarnings ?? 0)).toFixed(2)}
                </Text>
                <Text style={[styles.heroCurrency, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold' }]}>{t.egp}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Driver vs company split — derived from real fare/driverEarnings on
            the rides loaded for this period, not an assumed fixed rate. */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>Your Share vs Company</Text>
        <GlassView style={styles.summaryCard} borderRadius={20}>
          <View style={styles.summaryInner}>
            <View style={[styles.splitBarTrack, { backgroundColor: colors.secondary }]}>
              <View style={[styles.splitBarFill, { width: `${grossTotal > 0 ? driverPct : 50}%`, backgroundColor: '#55c49a' }]} />
            </View>
            <SplitRow
              icon={<TrendingUp size={16} color="#16A34A" strokeWidth={2} />}
              iconBg="#F0FDF4"
              label="Your share"
              amount={`${driverTotal.toFixed(2)} ${t.egp}`}
              pct={grossTotal > 0 ? `${driverPct.toFixed(0)}%` : '—'}
              colors={colors}
              isRTL={isRTL}
            />
            <SplitRow
              icon={<TrendingDown size={16} color="#EA580C" strokeWidth={2} />}
              iconBg="#FFF7ED"
              label="Company share"
              amount={`${companyTotal.toFixed(2)} ${t.egp}`}
              pct={grossTotal > 0 ? `${companyPct.toFixed(0)}%` : '—'}
              colors={colors}
              isRTL={isRTL}
            />
          </View>
        </GlassView>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{PERIOD_LABELS[period]} · {summary?.recentEarnings?.length ?? 0} {t.trips}</Text>
        <GlassView style={styles.summaryCard} borderRadius={20}>
          <View style={styles.summaryInner}>
            <EarningsRow icon="check-circle" label="Confirmed" value={`${parseFloat(String(summary?.summary?.totalConfirmed ?? 0)).toFixed(2)} ${t.egp}`} colors={colors} isRTL={isRTL} />
            <EarningsRow icon="credit-card" label="Pending" value={`${parseFloat(String(summary?.summary?.totalPending ?? 0)).toFixed(2)} ${t.egp}`} colors={colors} isRTL={isRTL} />
            <EarningsRow icon="star" label="Paid Out" value={`${parseFloat(String(summary?.summary?.totalPaid ?? 0)).toFixed(2)} ${t.egp}`} accent colors={colors} isRTL={isRTL} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <EarningsRow label={t.net_earnings} value={`${parseFloat(String(summary?.summary?.totalEarnings ?? 0)).toFixed(2)} ${t.egp}`} bold colors={colors} isRTL={isRTL} />
          </View>
        </GlassView>

        {/* Trips — simple per-ride cards for the selected period; tap opens
            the full detail screen (route, payment type, driver/company split). */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.trips}</Text>
        {ridesLoading ? (
          <View style={{ paddingVertical: Spacing.lg, alignItems: 'center' }}>
            <AppLoader />
          </View>
        ) : rides.length === 0 ? (
          <GlassView style={[styles.summaryCard, { padding: Spacing.lg, alignItems: 'center' }]} borderRadius={20}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>No trips in this period.</Text>
          </GlassView>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {rides.map(ride => (
              <Pressable key={ride.id} onPress={() => handleTripPress(ride)}>
                <GlassView style={[styles.tripCard, { flexDirection: R }]} borderRadius={16}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tripDate, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                      {new Date(ride.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={[styles.tripAddress, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]} numberOfLines={1}>
                      {ride.pickupAddress ?? '—'}
                    </Text>
                  </View>
                  <Text style={[styles.tripFare, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {toNum(ride.fare).toFixed(2)} {t.egp}
                  </Text>
                  <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                </GlassView>
              </Pressable>
            ))}
          </View>
        )}

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

function SplitRow({ icon, iconBg, label, amount, pct, colors, isRTL }: {
  icon: React.ReactNode; iconBg: string; label: string; amount: string; pct: string;
  colors: ReturnType<typeof useColors>; isRTL: boolean;
}) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <View style={[styles.earningsRow, { flexDirection: R }]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: TA }]}>{label}</Text>
      <Text style={[styles.splitPct, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{pct}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{amount}</Text>
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
  sectionTitle: { fontSize: Typography.size.xs, letterSpacing: 2, textTransform: 'uppercase', marginTop: Spacing.xl, marginBottom: Spacing.md },
  summaryCard: {},
  summaryInner: { padding: Spacing.lg, gap: Spacing.md },
  earningsRow: { alignItems: 'center', gap: Spacing.md },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: Typography.size.sm },
  rowValue: { fontSize: Typography.size.sm },
  splitPct: { fontSize: 12, marginRight: Spacing.xs },
  splitBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  splitBarFill: { height: '100%', borderRadius: 4 },
  divider: { height: 1, marginVertical: Spacing.xs },
  periodChip: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: 20 },
  periodChipText: { fontSize: Typography.size.xs },
  tripCard: { padding: Spacing.md, alignItems: 'center', gap: Spacing.sm },
  tripDate: { fontSize: 11 },
  tripAddress: { fontSize: Typography.size.sm, marginTop: 2 },
  tripFare: { fontSize: Typography.size.sm },
});
