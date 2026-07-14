import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Clock, Download, TrendingUp } from 'lucide-react-native';
import React, { useRef, useState, useEffect, useCallback } from 'react';
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
import { Animation } from '@/constants/animations';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import {
  type RawTrip,
  extractRouteName,
  extractDate,
  extractEarning,
  extractPassengerCount,
} from '@/lib/shuttleHistoryHelpers';

const PAGE_LIMIT = 20;

// ── Shape normalisation ────────────────────────────────────────────────────────
type NormalizedTrip = {
  id: string;
  bookingId: string | null;
  routeName: string;
  completedAt: Date | null;
  earnedAmount: number | null;
  passengerCount: number | null;
};

function extractBookingId(raw: RawTrip): string | null {
  const val =
    raw.bookingId ?? raw.routeBookingId ?? raw.route_booking_id ?? raw.shuttleBookingId;
  if (val == null) return null;
  return String(val);
}

function normalizePage(raw: unknown): { trips: NormalizedTrip[]; total: number } {
  let arr: RawTrip[] = [];
  let total = 0;

  if (Array.isArray(raw)) {
    arr = raw as RawTrip[];
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.total === 'number') total = obj.total;
    const inner = obj.trips ?? obj.data;
    if (Array.isArray(inner)) {
      arr = inner as RawTrip[];
    } else if (inner && typeof inner === 'object') {
      const nested = (inner as Record<string, unknown>).trips;
      if (Array.isArray(nested)) arr = nested as RawTrip[];
    }
  }

  const trips = arr.map((item, idx) => ({
    id: String(item.id ?? idx),
    bookingId: extractBookingId(item),
    routeName: extractRouteName(item),
    completedAt: extractDate(item),
    earnedAmount: extractEarning(item),
    passengerCount: extractPassengerCount(item),
  }));

  return { trips, total: total || trips.length };
}

// ── Formatters ─────────────────────────────────────────────────────────────────
function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Africa/Cairo',
  });
}

function formatTime(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Cairo',
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function TripHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL, language } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

  const headerAnim = useRef(new Animated.Value(0)).current;

  const [page, setPage] = useState(1);
  const [allTrips, setAllTrips] = useState<NormalizedTrip[]>([]);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: rawData, isLoading, isError, refetch } = useQuery({
    queryKey: ['shuttle-trip-history', page],
    queryFn: () => endpoints.shuttle.history(page, PAGE_LIMIT),
    retry: 1,
  });

  useEffect(() => {
    if (!rawData) return;
    const { trips: newTrips, total } = normalizePage(rawData);
    setServerTotal(total);
    if (page === 1) {
      setAllTrips(newTrips);
    } else {
      setAllTrips(prev => {
        const existingIds = new Set(prev.map(t => t.id));
        const fresh = newTrips.filter(t => !existingIds.has(t.id));
        return [...prev, ...fresh];
      });
    }
    setLoadingMore(false);
  }, [rawData, page]);

  useEffect(() => {
    if (!isLoading && allTrips.length > 0) {
      Animated.spring(headerAnim, { toValue: 1, stiffness: 240, damping: 22, useNativeDriver: true }).start();
    }
  }, [isLoading, allTrips.length]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    setAllTrips([]);
    setServerTotal(null);
    refetch();
  }, [refetch]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    setPage(prev => prev + 1);
  };

  const totalPages = serverTotal != null ? Math.ceil(serverTotal / PAGE_LIMIT) : 1;
  const hasNextPage = page < totalPages;
  const totalEarned = allTrips.reduce((s, trip) => s + (trip.earnedAmount ?? 0), 0);
  const displayTotal = serverTotal ?? allTrips.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: Math.max(insets.bottom, 24) + 32, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={[styles.headerRow, { flexDirection: R, marginBottom: Spacing.xs }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, { backgroundColor: pressed ? colors.secondary : colors.secondary + '99' }]}
          >
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {t.trip_history}
            </Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
              {t.history_subtitle}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/shuttle/history-export' as any)}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, { backgroundColor: pressed ? colors.secondary : colors.secondary + '99' }]}
          >
            <Download size={20} color={colors.foreground} strokeWidth={2} />
          </Pressable>
        </View>

        {/* ── Summary banner ─────────────────────────────────────────── */}
        {!isLoading && !isError && allTrips.length > 0 && (
          <Animated.View style={{ opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }], marginBottom: 20 }}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
              <View style={[styles.summaryRow, { flexDirection: R }]}>
                <View style={styles.summaryIconWrap}>
                  <TrendingUp size={22} color="#fff" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryLabel, { fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    {displayTotal} {t.history_subtitle}
                  </Text>
                  <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }]}>
                    <Text style={[styles.summaryAmount, { fontFamily: 'Inter_700Bold' }]}>
                      {totalEarned.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.summaryCurrency, { fontFamily: 'Inter_600SemiBold' }]}>{t.egp}</Text>
                  </View>
                  {serverTotal != null && allTrips.length < serverTotal && (
                    <Text style={[{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: TA }]}>
                      {allTrips.length} / {serverTotal} {t.loaded_label}
                    </Text>
                  )}
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* ── Initial loading ───────────────────────────────────────────── */}
        {isLoading && page === 1 && (
          <View style={styles.centered}>
            <AppLoader />
          </View>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {isError && !isLoading && allTrips.length === 0 && (
          <GlassView style={styles.emptyCard} borderRadius={20}>
            <Clock size={40} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
              {t.load_failed}
            </Text>
            <Pressable onPress={handleRefresh} style={({ pressed }) => [styles.retryBtn, { backgroundColor: pressed ? '#1e1e2820' : '#1e1e2812', borderColor: '#1e1e2825' }]}>
              <Text style={[{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#2d2d42' }]}>{t.back}</Text>
            </Pressable>
          </GlassView>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!isLoading && !isError && allTrips.length === 0 && (
          <GlassView style={styles.emptyCard} borderRadius={20}>
            <Clock size={40} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: Spacing.lg }]}>
              {t.no_trip_history}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 6 }]}>
              {t.no_trip_history_sub}
            </Text>
          </GlassView>
        )}

        {/* ── Trip cards ────────────────────────────────────────────────── */}
        {allTrips.length > 0 && (
          <View style={{ gap: 10 }}>
            {allTrips.map((trip, idx) => (
              <TripCard
                key={trip.id}
                trip={trip}
                idx={idx}
                locale={locale}
                isRTL={isRTL}
                colors={colors}
                t={t}
              />
            ))}

            {/* ── Load More ───────────────────────────────────────────── */}
            {hasNextPage && (
              <Pressable
                onPress={handleLoadMore}
                disabled={loadingMore}
                style={({ pressed }) => [
                  styles.loadMoreBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.secondary : 'transparent',
                    opacity: loadingMore ? 0.6 : 1,
                  },
                ]}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                ) : (
                  <>
                    <ChevronDown size={16} color={colors.mutedForeground} strokeWidth={2} />
                    <Text style={[styles.loadMoreText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                      {t.load_more_label} · {allTrips.length} / {serverTotal}
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            {/* ── End of list marker ──────────────────────────────────── */}
            {!hasNextPage && allTrips.length > 0 && serverTotal != null && (
              <Text style={[styles.endLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {t.all_trips_shown.replace('{n}', String(serverTotal))}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── TripCard ───────────────────────────────────────────────────────────────────
function TripCard({
  trip,
  idx,
  locale,
  isRTL,
  colors,
  t,
}: {
  trip: NormalizedTrip;
  idx: number;
  locale: string;
  isRTL: boolean;
  colors: ReturnType<typeof useColors>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const slideAnim = useRef(new Animated.Value(24)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, stiffness: 260, damping: 22, useNativeDriver: true, delay: Math.min(idx, 10) * 40 }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: Animation.duration.normal, useNativeDriver: true, delay: Math.min(idx, 10) * 40 }),
    ]).start();
  }, []);

  const handlePress = () => {
    router.push({
      pathname: '/shuttle/history-detail' as any,
      params: {
        tripId: trip.id,
        bookingId: trip.bookingId ?? '',
        routeName: trip.routeName,
        completedAt: trip.completedAt ? trip.completedAt.toISOString() : '',
        earnedAmount: trip.earnedAmount != null ? String(trip.earnedAmount) : '',
        passengerCount: trip.passengerCount != null ? String(trip.passengerCount) : '',
      },
    });
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
      >
        <GlassView style={[styles.card, { flexDirection: R }]} borderRadius={18}>

          {/* Icon */}
          <View style={styles.cardIconWrap}>
            <CheckCircle2 size={22} color="#16a34a" strokeWidth={2} />
          </View>

          {/* Route name + date */}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text
              style={[styles.cardRoute, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}
              numberOfLines={1}
            >
              {trip.routeName}
            </Text>
            {trip.completedAt ? (
              <Text style={[styles.cardDate, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                {formatDate(trip.completedAt, locale)}
              </Text>
            ) : null}
            {trip.completedAt ? (
              <Text style={[styles.cardTime, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {formatTime(trip.completedAt, locale)}
                {trip.passengerCount != null ? ` · ${trip.passengerCount} ${t.pax_one}` : ''}
              </Text>
            ) : null}
          </View>

          {/* Earned amount + chevron */}
          <View style={[styles.earnedWrap, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
            {trip.earnedAmount != null ? (
              <>
                <Text style={[styles.earnedAmount, { color: '#16a34a', fontFamily: 'Inter_700Bold' }]}>
                  +{trip.earnedAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={[styles.earnedCurrency, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                  {t.history_earned} · {t.egp}
                </Text>
              </>
            ) : (
              <Text style={[styles.earnedDash, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>—</Text>
            )}
            <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={2} style={{ marginTop: Spacing.xs, transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </View>

        </GlassView>
      </Pressable>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
  pageTitle: { fontSize: 24, lineHeight: 30 },
  pageSubtitle: { fontSize: 13, marginTop: 2 },
  summaryCard: { borderRadius: 20, padding: 20 },
  summaryRow: { alignItems: 'center', gap: 14 },
  summaryIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: Typography.size.xs, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.6 },
  summaryAmount: { fontSize: Typography.size.xxl, color: '#fff' },
  summaryCurrency: { fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  centered: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { alignItems: 'center', padding: 40, gap: 0 },
  emptyTitle: { fontSize: Typography.size.md },
  emptySub: { fontSize: 13, lineHeight: 20 },
  retryBtn: { marginTop: Spacing.lg, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1 },
  card: { alignItems: 'center', padding: Spacing.lg, gap: 14 },
  cardIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  cardRoute: { fontSize: Typography.size.sm },
  cardDate: { fontSize: Typography.size.xs, lineHeight: 18 },
  cardTime: { fontSize: 11 },
  earnedWrap: { minWidth: 80 },
  earnedAmount: { fontSize: 17 },
  earnedCurrency: { fontSize: 10, marginTop: 2 },
  earnedDash: { fontSize: Typography.size.lg },
  loadMoreBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  loadMoreText: { fontSize: 13 },
  endLabel: { fontSize: Typography.size.xs, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xs },
});
