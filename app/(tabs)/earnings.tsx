import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, type RideHistoryItem } from '@/lib/api';
import { Spacing } from '@/constants/spacing';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';

const C_BG = '#EEF0F2';
const C_SURF = '#FFFFFF';
const C_INK = '#14151A';
const C_CAP = '#9AA0A6';
const C_CAP_ON_DARK = '#8A9096';
const C_MINT = '#3DDC97';
const C_TRACK = '#F0F2F3';

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
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = insets.top;
  const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;
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
  const { grossTotal, driverTotal, driverPct, companyPct } = useMemo(() => {
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

  const isLoading = summaryLoading;
  const isError = summaryError;

  // Debug: log when "Failed to load earnings" screen renders
  useEffect(() => {
    if (summaryError) console.error('[Earnings:screen] summaryError → rendering "Failed to load earnings. Please try again."', { summaryError });
  }, [summaryError]);

  const handleTripPress = (ride: RideHistoryItem) => {
    router.push({
      pathname: '/ride-history/[rideId]',
      params: { rideId: ride.id, ride: JSON.stringify(ride) },
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: C_BG, alignItems: 'center', justifyContent: 'center' }]}>
        <AppLoader />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: C_BG, alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ color: C_CAP, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.earnings_load_fail}</Text>
        <Pressable onPress={() => refetchSummary()} style={{ paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: C_INK }}>
          <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{t.retry_label}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C_BG }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Dark hero — period switch, total, driver/company split, all embedded */}
        <View style={[styles.hero, { paddingTop: topPad + 14 }]}>
          <Text style={[styles.heroCap, { textAlign: TA, fontFamily: 'Inter_700Bold' }]}>{t.earnings}</Text>

          {/* Period segmented control */}
          <View style={styles.segment}>
            {PERIOD_KEYS.map(key => (
              <Pressable key={key} onPress={() => setPeriod(key)} style={[styles.segmentItem, key === period && styles.segmentItemActive]}>
                <Text style={[styles.segmentText, key === period && styles.segmentTextActive, { fontFamily: 'Inter_800ExtraBold' }]} numberOfLines={1}>
                  {PERIOD_LABELS[key]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.heroAmountCap, { textAlign: TA, fontFamily: 'Inter_700Bold' }]}>{PERIOD_HERO_LABELS[period]}</Text>
          <View style={[styles.heroAmountRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.heroAmount, { fontFamily: 'Inter_800ExtraBold' }]}>{driverTotal.toFixed(0)}</Text>
            <Text style={[styles.heroCurrency, { fontFamily: 'Inter_700Bold' }]}>{t.egp}</Text>
          </View>

          <View style={styles.splitTrack}>
            <View style={[styles.splitFill, { width: `${grossTotal > 0 ? driverPct : 50}%` as any }]} />
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { color: C_MINT, fontFamily: 'Inter_800ExtraBold' }]}>
                {grossTotal > 0 ? `${driverPct.toFixed(0)}%` : '—'}
              </Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.your_share_label}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { fontFamily: 'Inter_800ExtraBold' }]}>
                {grossTotal > 0 ? `${companyPct.toFixed(0)}%` : '—'}
              </Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.company_share_label}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { fontFamily: 'Inter_800ExtraBold' }]}>{rides.length}</Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.trips}</Text>
            </View>
          </View>
        </View>

        {/* White body — trip ledger for the selected period */}
        <View style={{ paddingHorizontal: Spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: C_INK, fontFamily: 'Inter_800ExtraBold', textAlign: TA, marginTop: Spacing.xl }]}>{t.trips}</Text>
          {ridesLoading ? (
            <View style={{ paddingVertical: Spacing.lg, alignItems: 'center' }}>
              <AppLoader />
            </View>
          ) : rides.length === 0 ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <Text style={{ color: C_CAP, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.no_trips_period}</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {rides.map(ride => (
                <Pressable key={ride.id} onPress={() => handleTripPress(ride)}>
                  <View style={[styles.tripCard, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tripDate, { color: C_CAP, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                        {new Date(ride.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[styles.tripAddress, { color: C_INK, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>
                        {ride.pickupAddress ?? '—'}
                      </Text>
                    </View>
                    <Text style={[styles.tripFare, { color: C_INK, fontFamily: 'Inter_800ExtraBold' }]}>
                      {toNum(ride.fare).toFixed(2)} {t.egp}
                    </Text>
                    <ChevronRight size={16} color={C_CAP} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { backgroundColor: C_INK, paddingHorizontal: 22, paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  heroCap: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: C_CAP_ON_DARK },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 14, padding: 4, marginTop: 12 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  segmentItemActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 10.5, color: C_CAP_ON_DARK },
  segmentTextActive: { color: C_INK },
  heroAmountCap: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: C_CAP_ON_DARK, marginTop: 20 },
  heroAmountRow: { alignItems: 'flex-end', gap: 8, marginTop: 2 },
  heroAmount: { fontSize: 44, lineHeight: 48, color: '#fff' },
  heroCurrency: { fontSize: 18, color: C_CAP_ON_DARK, marginBottom: 4 },
  splitTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.12)', overflow: 'hidden', marginTop: 16 },
  splitFill: { height: '100%', borderRadius: 3, backgroundColor: C_MINT },
  heroStatsRow: { flexDirection: 'row', marginTop: 16 },
  heroStatCell: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 16, color: '#fff' },
  heroStatCap: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: C_CAP_ON_DARK, marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,.12)' },
  sectionTitle: { fontSize: 15, marginBottom: Spacing.md },
  emptyCard: { padding: Spacing.lg, borderRadius: 20, backgroundColor: C_SURF },
  tripCard: { padding: Spacing.md, alignItems: 'center', gap: Spacing.sm, backgroundColor: C_SURF, borderRadius: 16 },
  tripDate: { fontSize: 11 },
  tripAddress: { fontSize: 13.5, marginTop: 2 },
  tripFare: { fontSize: 13.5 },
});
