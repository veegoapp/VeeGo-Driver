import { router } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import React, { useRef, useEffect } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type RatingEntry = {
  id: number;
  raterId: number;
  rideId?: number | null;
  tripId?: number | null;
  context: 'ride' | 'trip';
  score: number;
  comment?: string | null;
  createdAt: string;
};

type RatingsResponse = {
  rating: number;
  tripCount: number;
  totalEarned: number;
  ratingsCount: number;
  ratings: RatingEntry[];
};

type BreakdownItem = { stars: number; count: number; pct: number };

function buildBreakdown(ratings: RatingEntry[]): BreakdownItem[] {
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of ratings) {
    const s = Math.round(r.score);
    if (s >= 1 && s <= 5) counts[s]++;
  }
  const total = ratings.length || 1;
  return [5, 4, 3, 2, 1].map(stars => ({
    stars,
    count: counts[stars],
    pct: Math.round((counts[stars] / total) * 100),
  }));
}

export default function RatingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: rawData, isLoading, isError } = useQuery<RatingsResponse>({
    queryKey: ['ratings'],
    queryFn: endpoints.driver.ratings as () => Promise<RatingsResponse>,
  });

  const ratings = rawData?.ratings ?? [];
  const breakdown = buildBreakdown(ratings);
  const barAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!breakdown.length) return;
    Animated.stagger(80, breakdown.map((r, i) =>
      Animated.timing(barAnims[i], { toValue: r.pct / 100, duration: 800, useNativeDriver: false })
    )).start();
  }, [ratings.length]);

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
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>Failed to load ratings. Please try again.</Text>
      </View>
    );
  }

  const avgRating = rawData?.rating ?? 0;
  const ratingsCount = rawData?.ratingsCount ?? 0;
  const tripCount = rawData?.tripCount ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        {/* Average rating hero */}
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Text style={[styles.bigRating, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {avgRating ? avgRating.toFixed(2) : '—'}
          </Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <Star key={n} size={20}
                color={colors.accent}
                fill={n <= Math.round(avgRating) ? colors.accent : 'transparent'}
                strokeWidth={2}
              />
            ))}
          </View>
          <Text style={[styles.tripCount, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            {ratingsCount} ratings · {tripCount} trips
          </Text>
        </View>

        {/* Breakdown bars */}
        <GlassView style={styles.breakdownCard} borderRadius={20}>
          {breakdown.map((r, i) => (
            <View key={r.stars} style={styles.breakdownRow}>
              <Text style={[styles.starNum, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{r.stars}</Text>
              <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
              <View style={[styles.barTrack, { backgroundColor: colors.secondary, flex: 1 }]}>
                <Animated.View style={[styles.barFill, {
                  backgroundColor: colors.primary,
                  width: barAnims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                }]} />
              </View>
              <Text style={[styles.countText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{r.count}</Text>
            </View>
          ))}
        </GlassView>

        {/* Reviews list */}
        {ratings.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Recent reviews</Text>
            <View style={{ gap: 8 }}>
              {ratings.slice(0, 20).map(r => (
                <GlassView key={r.id} style={styles.reviewCard} borderRadius={20}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewStars}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={12}
                          color={i < r.score ? colors.accent : colors.mutedForeground + '4D'}
                          fill={i < r.score ? colors.accent : 'transparent'}
                          strokeWidth={2}
                        />
                      ))}
                    </View>
                    <Text style={[styles.reviewContext, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                      {r.context === 'ride' ? 'Ride' : 'Shuttle'}
                    </Text>
                  </View>
                  {r.comment ? (
                    <Text style={[styles.reviewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                      "{r.comment}"
                    </Text>
                  ) : null}
                  <Text style={[styles.reviewDate, { color: colors.mutedForeground + 'B3', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </Text>
                </GlassView>
              ))}
            </View>
          </>
        )}

        {ratings.length === 0 && !isLoading && (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>No reviews yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  bigRating: { fontSize: 64, lineHeight: 68 },
  starsRow: { flexDirection: 'row', gap: 4, marginTop: 8 },
  tripCount: { fontSize: 12, marginTop: 4 },
  breakdownCard: { padding: 16, marginTop: 32, gap: 10 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  starNum: { width: 12, fontSize: 12 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  countText: { width: 48, textAlign: 'right', fontSize: 12 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: 32, marginBottom: 12 },
  reviewCard: { padding: 16, gap: 6 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewStars: { flexDirection: 'row', gap: 2 },
  reviewContext: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  reviewText: { fontSize: 14, lineHeight: 22 },
  reviewDate: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
});
