import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2, Clock, MapPin, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
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

type Params = {
  tripId: string;
  bookingId: string;
  routeName: string;
  completedAt: string;
  earnedAmount: string;
  passengerCount: string;
};

type Station = {
  id: number;
  name: string;
  order: number;
  eta: string;
};

export default function HistoryDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL, language } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

  const { bookingId, routeName, completedAt, earnedAmount, passengerCount } =
    useLocalSearchParams<Params>();

  const hasBookingId = !!bookingId;

  const { data: tripDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['shuttle-trip-detail', bookingId],
    queryFn: () => endpoints.shuttle.tripDetail(bookingId!),
    enabled: hasBookingId,
    retry: 1,
  });

  const completedDate = useMemo(() => {
    if (!completedAt) return null;
    const d = new Date(completedAt);
    return isNaN(d.getTime()) ? null : d;
  }, [completedAt]);

  const formattedDate = completedDate
    ? completedDate.toLocaleDateString(locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'Africa/Cairo',
      })
    : '—';

  const formattedTime = completedDate
    ? completedDate.toLocaleTimeString(locale, {
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Africa/Cairo',
      })
    : null;

  const earned = earnedAmount ? parseFloat(earnedAmount) : null;
  const paxCount = passengerCount ? parseInt(passengerCount, 10) : null;

  const stations: Station[] = tripDetail?.stations ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.trip_detail_title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Route name ───────────────────────────────────────────── */}
        <View style={{ marginTop: 24 }}>
          <View style={[styles.completedBadge, { flexDirection: R }]}>
            <CheckCircle2 size={14} color="#16a34a" strokeWidth={2} />
            <Text style={[styles.completedText, { fontFamily: 'Inter_700Bold' }]}>{t.completed_label}</Text>
          </View>
          <Text style={[styles.routeName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 8 }]}>
            {routeName ?? '—'}
          </Text>
          <Text style={[styles.routeDate, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA, marginTop: 4 }]}>
            {formattedDate}{formattedTime ? ` · ${formattedTime}` : ''}
          </Text>
        </View>

        {/* ── Stats row ─────────────────────────────────────────────── */}
        <View style={[styles.statsRow, { flexDirection: R, marginTop: 20 }]}>
          {/* Earnings */}
          <GlassView style={styles.statCard} borderRadius={16}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.history_earned}
            </Text>
            {earned != null ? (
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 4 }]}>
                <Text style={[styles.statValue, { color: '#16a34a', fontFamily: 'Inter_700Bold' }]}>
                  +{earned.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                  {t.egp}
                </Text>
              </View>
            ) : (
              <Text style={[styles.statValue, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>—</Text>
            )}
          </GlassView>

          {/* Passengers */}
          <GlassView style={styles.statCard} borderRadius={16}>
            <Users size={16} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.passengers_label_count}
            </Text>
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {paxCount != null ? String(paxCount) : '—'}
            </Text>
          </GlassView>

          {/* Time */}
          {formattedTime && (
            <GlassView style={styles.statCard} borderRadius={16}>
              <Clock size={16} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                {t.time_label}
              </Text>
              <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {formattedTime}
              </Text>
            </GlassView>
          )}
        </View>

        {/* ── Station timeline ──────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 28 }]}>
          {t.route_timeline}
        </Text>

        {detailLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : stations.length > 0 ? (
          <GlassView style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16 }} borderRadius={16}>
            {stations.map((st, idx) => (
              <View
                key={st.id}
                style={[
                  styles.stationRow,
                  { flexDirection: R },
                  idx < stations.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                {/* Timeline indicator */}
                <View style={styles.stationIndicator}>
                  <View style={[
                    styles.stationDot,
                    {
                      backgroundColor: idx === 0 || idx === stations.length - 1 ? '#1e1e28' : colors.secondary,
                      borderColor: '#1e1e2840',
                    },
                  ]} />
                  {idx < stations.length - 1 && (
                    <View style={[styles.stationLine, { backgroundColor: colors.border }]} />
                  )}
                </View>

                {/* Station name + ETA */}
                <View style={{ flex: 1, paddingVertical: 12 }}>
                  <Text style={[{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                    {st.name}
                  </Text>
                  {st.eta ? (
                    <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: TA }]}>
                      {st.eta}
                    </Text>
                  ) : null}
                </View>

                {/* Terminal badge */}
                {(idx === 0 || idx === stations.length - 1) && (
                  <View style={[
                    styles.terminalBadge,
                    {
                      backgroundColor: idx === 0 ? '#1e1e2812' : '#dcfce7',
                      borderColor: idx === 0 ? '#1e1e2825' : '#86efac',
                    },
                  ]}>
                    <Text style={[{ fontSize: 10, fontFamily: 'Inter_700Bold', color: idx === 0 ? '#2d2d42' : '#16a34a' }]}>
                      {idx === 0 ? t.from.toUpperCase() : t.to.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </GlassView>
        ) : !hasBookingId ? (
          <GlassView style={[styles.emptyStations, { marginTop: 12 }]} borderRadius={16}>
            <MapPin size={24} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8 }]}>
              {t.no_station_details}
            </Text>
          </GlassView>
        ) : (
          <GlassView style={[styles.emptyStations, { marginTop: 12 }]} borderRadius={16}>
            <MapPin size={24} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8 }]}>
              {t.no_trip_history_sub}
            </Text>
          </GlassView>
        )}
      </ScrollView>
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
  completedBadge: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  completedText: { fontSize: 11, color: '#16a34a' },
  routeName: { fontSize: 22, lineHeight: 30 },
  routeDate: { fontSize: 13, lineHeight: 20 },
  statsRow: { gap: 10 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    gap: 4,
  },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  statValue: { fontSize: 15, textAlign: 'center' },
  sectionTitle: { fontSize: 16 },
  loadingWrap: { height: 80, alignItems: 'center', justifyContent: 'center' },
  stationRow: { gap: 12, alignItems: 'flex-start' },
  stationIndicator: { width: 20, alignItems: 'center', paddingTop: 14 },
  stationDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  stationLine: { width: 2, flex: 1, minHeight: 16, marginTop: 4 },
  terminalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  emptyStations: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
