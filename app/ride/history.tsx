import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft, Clock, MapPin, Star } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
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
import { endpoints, type RideHistoryItem } from '@/lib/api';

type FilterKey = 'all' | 'completed' | 'cancelled';
const FILTER_KEYS: FilterKey[] = ['all', 'completed', 'cancelled'];
const PAGE_LIMIT = 20;
const MAX_ANIM = 50;

export default function RideHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRTL } = useI18n();
  const topPad = insets.top;

  const TA = isRTL ? 'right' as const : 'left' as const;
  const R  = isRTL ? 'row-reverse' as const : 'row' as const;

  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [allRides, setAllRides] = useState<RideHistoryItem[]>([]);

  const cardAnims = useRef(
    Array.from({ length: MAX_ANIM }, () => new Animated.Value(0))
  ).current;

  const statusFilter = filter === 'all' ? undefined : filter;

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['ride-history', filter, page],
    queryFn: () => endpoints.rides.history(page, PAGE_LIMIT, statusFilter),
  });

  const newRides: RideHistoryItem[] = (rawData as { data?: RideHistoryItem[] } | undefined)?.data ?? [];
  const hasMore = newRides.length === PAGE_LIMIT;

  useEffect(() => {
    setPage(1);
    setAllRides([]);
  }, [filter]);

  useEffect(() => {
    if (!rawData) return;
    if (page === 1) {
      setAllRides(newRides);
    } else {
      setAllRides(prev => [...prev, ...newRides]);
    }
  }, [rawData, page]);

  useEffect(() => {
    cardAnims.forEach(a => a.setValue(0));
    Animated.stagger(45, allRides.slice(0, MAX_ANIM).map((_, i) =>
      Animated.timing(cardAnims[i], { toValue: 1, duration: 340, useNativeDriver: true })
    )).start();
  }, [allRides.length, filter]);

  const filterLabels: Record<FilterKey, string> = {
    all: 'All',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={24} color={colors.foreground} strokeWidth={2}
            style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          Ride History
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 16 }}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {FILTER_KEYS.map(key => (
            <Pressable key={key} onPress={() => setFilter(key)}>
              {key === filter ? (
                <LinearGradient
                  colors={['#2d2d42', '#1e1e28']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.chip}
                >
                  <Text style={[styles.chipText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                    {filterLabels[key]}
                  </Text>
                </LinearGradient>
              ) : (
                <GlassView style={styles.chip} borderRadius={20}>
                  <Text style={[styles.chipText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                    {filterLabels[key]}
                  </Text>
                </GlassView>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* List */}
        {isLoading && page === 1 ? (
          <View style={{ marginTop: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={{ marginTop: 60, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 28 }}>⚠️</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' }}>
              Failed to load ride history.{'\n'}Please try again.
            </Text>
          </View>
        ) : allRides.length === 0 ? (
          <View style={{ marginTop: 60, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🚗</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
              No rides yet
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' }}>
              {filter === 'all'
                ? 'Your completed rides will appear here.'
                : `No ${filter} rides found.`}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 10 }}>
            {allRides.map((ride, i) => (
              <Animated.View
                key={ride.id}
                style={{
                  opacity: cardAnims[i] ?? 1,
                  transform: [{
                    translateY: (cardAnims[i] ?? new Animated.Value(1)).interpolate({
                      inputRange: [0, 1], outputRange: [14, 0],
                    }),
                  }],
                }}
              >
                <RideCard ride={ride} colors={colors} isRTL={isRTL} R={R} TA={TA} />
              </Animated.View>
            ))}

            {hasMore && !isLoading && (
              <Pressable
                onPress={() => setPage(p => p + 1)}
                style={{
                  marginTop: 4, marginBottom: 8, alignItems: 'center',
                  paddingVertical: 14, borderRadius: 16,
                  backgroundColor: 'rgba(61,82,213,0.08)',
                }}
              >
                <Text style={{ color: '#3D52D5', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
                  Load more
                </Text>
              </Pressable>
            )}

            {isLoading && page > 1 && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator color="#3D52D5" />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function RideCard({
  ride,
  colors,
  isRTL,
  R,
  TA,
}: {
  ride: RideHistoryItem;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
  R: 'row' | 'row-reverse';
  TA: 'left' | 'right';
}) {
  const isCompleted = ride.status === 'completed';
  const isCancelled = ride.status === 'cancelled';

  const statusBg = isCompleted ? colors.secondary : '#ef444415';
  const statusFg = isCompleted ? colors.mutedForeground : '#ef4444';
  const statusLabel = isCompleted ? 'Completed' : 'Cancelled';

  const fare = typeof ride.fare === 'number' ? ride.fare : parseFloat(String(ride.fare ?? 0));

  const dateStr = (() => {
    try {
      return new Date(ride.completedAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return ride.completedAt ?? '—';
    }
  })();

  return (
    <GlassView style={styles.card} borderRadius={20}>
      {/* Top row: date + status badge */}
      <View style={[{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }]}>
        <View style={[{ flexDirection: R, alignItems: 'center', gap: 6 }]}>
          <Clock size={12} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            {dateStr}
            {ride.duration ? ` · ${ride.duration}` : ''}
            {ride.distance ? ` · ${ride.distance}` : ''}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={[styles.statusText, { color: statusFg, fontFamily: 'Inter_700Bold' }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* Route */}
      <View style={[{ flexDirection: R, gap: 10, alignItems: 'flex-start' }]}>
        {/* Dot line */}
        <View style={styles.routeDots}>
          <View style={[styles.dotTop, { backgroundColor: '#3D52D5' }]} />
          <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
          <View style={[styles.dotBottom, { backgroundColor: colors.accent }]} />
        </View>

        {/* Addresses */}
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.addressText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]} numberOfLines={1}>
            {ride.pickupAddress ?? '—'}
          </Text>
          <Text style={[styles.addressText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]} numberOfLines={1}>
            {ride.dropoffAddress ?? '—'}
          </Text>
        </View>

        {/* Fare + rating */}
        <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }}>
          <Text style={[styles.fareText, { color: isCompleted ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
            {isCompleted ? `${fare.toFixed(2)} DT` : '—'}
          </Text>
          {isCompleted && ride.myRating != null && (
            <View style={[styles.starsRow, { flexDirection: R }]}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <Star
                  key={idx}
                  size={11}
                  color={idx < (ride.myRating ?? 0) ? colors.accent : colors.mutedForeground + '4D'}
                  fill={idx < (ride.myRating ?? 0) ? colors.accent : 'transparent'}
                  strokeWidth={2}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Rider name */}
      {ride.riderName ? (
        <View style={[{ flexDirection: R, alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border + '66' }]}>
          <MapPin size={12} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: TA }]} numberOfLines={1}>
            {ride.riderName}
          </Text>
          {ride.riderRating != null && (
            <View style={[{ flexDirection: R, alignItems: 'center', gap: 3 }]}>
              <Star size={11} color={colors.accent} fill={colors.accent} strokeWidth={2} />
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>
                {ride.riderRating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </GlassView>
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
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  chipText: { fontSize: 12 },
  card: { padding: 16 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusText: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  routeDots: { alignItems: 'center', paddingTop: 4 },
  dotTop: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 1, flex: 1, marginVertical: 3, minHeight: 8 },
  dotBottom: { width: 8, height: 8, borderRadius: 2 },
  addressText: { fontSize: 14 },
  fareText: { fontSize: 16 },
  starsRow: { gap: 2, marginTop: 4 },
});
