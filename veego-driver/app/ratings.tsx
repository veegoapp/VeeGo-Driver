import { router } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import React, { useRef, useEffect } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { endpoints } from '@/lib/api';

type BreakdownItem = { stars: number; count: number; pct: number };
type Review = { id: string; name: string; rating: number; text: string; date: string };
type RatingsData = { rating: number; trips: number; breakdown: BreakdownItem[]; reviews: Review[] };

export default function RatingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['ratings'],
    queryFn: endpoints.driver.ratings,
  });

  const ratingsData = rawData as RatingsData | undefined;
  const breakdown = ratingsData?.breakdown ?? [];
  const reviews = ratingsData?.reviews ?? [];

  const barAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!breakdown.length) return;
    Animated.stagger(80, breakdown.map((r, i) =>
      Animated.timing(barAnims[i], { toValue: r.pct / 100, duration: 800, useNativeDriver: false })
    )).start();
  }, [breakdown.length]);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Text style={[styles.bigRating, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{ratingsData?.rating ?? '—'}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(n => <Star key={n} size={20} color={colors.accent} fill={colors.accent} strokeWidth={2} />)}
          </View>
          <Text style={[styles.tripCount, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Based on {ratingsData?.trips ?? 0} trips</Text>
        </View>

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

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Recent reviews</Text>
        <View style={{ gap: 8 }}>
          {reviews.map(r => (
            <GlassView key={r.id} style={styles.reviewCard} borderRadius={20}>
              <View style={styles.reviewHeader}>
                <Text style={[styles.reviewName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{r.name}</Text>
                <View style={styles.reviewStars}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={12} color={i < r.rating ? colors.accent : colors.mutedForeground + '4D'} fill={i < r.rating ? colors.accent : 'transparent'} strokeWidth={2} />
                  ))}
                </View>
              </View>
              <Text style={[styles.reviewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>"{r.text}"</Text>
              <Text style={[styles.reviewDate, { color: colors.mutedForeground + 'B3', fontFamily: 'Inter_700Bold' }]}>{r.date}</Text>
            </GlassView>
          ))}
        </View>
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
  reviewCard: { padding: 16 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewName: { fontSize: 14 },
  reviewStars: { flexDirection: 'row', gap: 2 },
  reviewText: { fontSize: 14, marginTop: 8, lineHeight: 22 },
  reviewDate: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
});
