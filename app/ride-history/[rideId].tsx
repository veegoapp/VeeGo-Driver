import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, HelpCircle, MapPin, Star, TrendingDown, TrendingUp } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { StaticRouteMap } from '@/components/shared/StaticRouteMap';
import { AppLoader } from '@/components/ui/AppLoader';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { rtlIconStyle } from '@/lib/rtlUtils';
import { useService } from '@/lib/serviceContext';
import { endpoints } from '@/lib/api';
import type { RideHistoryItem } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

// Read-only detail view for a completed/cancelled ride, opened from the Ride
// History list. Reuses the RideHistoryItem the driver already tapped —
// passed as a serialized param — instead of a dedicated backend fetch, since
// history.tsx already holds the full record for every visible card.
export default function RideHistoryDetailScreen() {
  const { rideId, ride: rideParam } = useLocalSearchParams<{ rideId: string; ride?: string }>();
  const colors = useColors();
  const { isDarkMode } = useService();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const ride: RideHistoryItem | null = useMemo(() => {
    if (!rideParam) return null;
    try {
      return JSON.parse(rideParam);
    } catch {
      return null;
    }
  }, [rideParam]);

  // The history list item (`ride` above) has no coordinates — fetch the full
  // ride record for the map preview's pickup/dropoff lat/lng, the same
  // GET /rides/:id endpoint app/trips/[tripId].tsx uses for its live map.
  const { data: fullRide, isLoading: mapLoading } = useQuery<any>({
    queryKey: ['ride-detail-coords', rideId],
    queryFn: () => endpoints.rides.getById(rideId),
    enabled: !!rideId,
  });

  const mapCoords = useMemo(() => {
    if (!fullRide) return null;
    const pickup = fullRide.pickup ?? {};
    const dropoff = fullRide.dropoff ?? {};
    const pickupLat = fullRide.pickupLatitude ?? pickup.latitude ?? null;
    const pickupLng = fullRide.pickupLongitude ?? pickup.longitude ?? null;
    const dropoffLat = fullRide.dropoffLatitude ?? dropoff.latitude ?? null;
    const dropoffLng = fullRide.dropoffLongitude ?? dropoff.longitude ?? null;
    if (pickupLat == null && dropoffLat == null) return null;
    return { pickupLat, pickupLng, dropoffLat, dropoffLng };
  }, [fullRide]);

  if (!ride) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
          </Pressable>
          <GlassView style={styles.centeredState} borderRadius={20}>
            <Text style={[styles.stateTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Could not load trip
            </Text>
          </GlassView>
        </View>
      </View>
    );
  }

  const isCompleted = ride.status === 'completed';
  const fare = typeof ride.fare === 'number' ? ride.fare : parseFloat(String(ride.fare ?? 0));
  const earnedAmount = ride.driverEarnings != null
    ? (typeof ride.driverEarnings === 'number' ? ride.driverEarnings : parseFloat(String(ride.driverEarnings)))
    : fare;

  const dateStr = (() => {
    try {
      return new Date(ride.completedAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return ride.completedAt ?? '—';
    }
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 48, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }]}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
          </Pressable>
          <View style={[styles.statusBadge, { backgroundColor: isCompleted ? colors.secondary : '#ef444415' }]}>
            <Text style={[styles.statusText, { color: isCompleted ? colors.mutedForeground : '#ef4444', fontFamily: 'Inter_700Bold' }]}>
              {isCompleted ? 'Completed' : 'Cancelled'}
            </Text>
          </View>
        </View>

        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.trip_details_title}
        </Text>
        <View style={[{ flexDirection: R, alignItems: 'center', gap: 6, marginTop: Spacing.xs }]}>
          <Clock size={13} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {dateStr}
          </Text>
        </View>

        {/* Map preview — pickup/dropoff coordinates come from the dedicated
            GET /rides/:id fetch above; the history list item alone has no
            lat/lng. Falls back to rendering nothing if the fetch fails or
            the ride has no coordinates. */}
        {mapLoading ? (
          <View style={[styles.mapCard, styles.mapSkeleton, { backgroundColor: colors.secondary }]}>
            <AppLoader />
          </View>
        ) : mapCoords ? (
          <View style={styles.mapCard}>
            <StaticRouteMap
              pickup={mapCoords.pickupLat != null && mapCoords.pickupLng != null ? { latitude: mapCoords.pickupLat, longitude: mapCoords.pickupLng } : undefined}
              dropoff={mapCoords.dropoffLat != null && mapCoords.dropoffLng != null ? { latitude: mapCoords.dropoffLat, longitude: mapCoords.dropoffLng } : undefined}
              darkMode={isDarkMode}
              style={{ borderRadius: 20 }}
            />
          </View>
        ) : null}

        {/* Route */}
        <GlassView style={styles.card} borderRadius={20}>
          <View style={[{ flexDirection: R, gap: 10, alignItems: 'flex-start' }]}>
            <View style={styles.routeDots}>
              <View style={[styles.dotTop, { backgroundColor: '#55c49a' }]} />
              <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
              <View style={[styles.dotBottom, { backgroundColor: colors.accent }]} />
            </View>
            <View style={{ flex: 1, gap: Spacing.md }}>
              <Text style={[styles.addressText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                {ride.pickupAddress ?? '—'}
              </Text>
              <Text style={[styles.addressText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                {ride.dropoffAddress ?? '—'}
              </Text>
            </View>
          </View>
        </GlassView>

        {/* Stats */}
        <GlassView style={[styles.card, { flexDirection: R }]} borderRadius={20}>
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {ride.distance ?? '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              {t.ride_distance}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {ride.duration ?? '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              Duration
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {isCompleted ? `${earnedAmount.toFixed(2)} ${t.egp}` : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              {t.net_earnings}
            </Text>
          </View>
        </GlassView>

        {/* Payment method + driver/company split — split % is computed from
            this ride's own fare/driverEarnings, not an assumed fixed rate. */}
        {isCompleted && (
          <GlassView style={styles.card} borderRadius={20}>
            <View style={[{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={[{ fontSize: Typography.size.sm, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                Payment method
              </Text>
              <Text style={[{ fontSize: Typography.size.sm, color: colors.foreground, fontFamily: 'Inter_700Bold', textTransform: 'capitalize' }]}>
                {ride.paymentMethod ?? '—'}
              </Text>
            </View>

            <View style={[styles.splitRow, { flexDirection: R }]}>
              <View style={[styles.rowIcon, { backgroundColor: '#F0FDF4' }]}>
                <TrendingUp size={15} color="#16A34A" strokeWidth={2} />
              </View>
              <Text style={[{ flex: 1, fontSize: Typography.size.sm, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                Your share {fare > 0 ? `(${((earnedAmount / fare) * 100).toFixed(0)}%)` : ''}
              </Text>
              <Text style={[{ fontSize: Typography.size.sm, color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {earnedAmount.toFixed(2)} {t.egp}
              </Text>
            </View>
            <View style={[styles.splitRow, { flexDirection: R }]}>
              <View style={[styles.rowIcon, { backgroundColor: '#FFF7ED' }]}>
                <TrendingDown size={15} color="#EA580C" strokeWidth={2} />
              </View>
              <Text style={[{ flex: 1, fontSize: Typography.size.sm, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                Company share {fare > 0 ? `(${(100 - (earnedAmount / fare) * 100).toFixed(0)}%)` : ''}
              </Text>
              <Text style={[{ fontSize: Typography.size.sm, color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {Math.max(0, fare - earnedAmount).toFixed(2)} {t.egp}
              </Text>
            </View>
          </GlassView>
        )}

        {/* Rider */}
        {ride.riderName && (
          <GlassView style={[styles.card, { flexDirection: R, alignItems: 'center', gap: Spacing.sm }]} borderRadius={20}>
            <MapPin size={14} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[{ flex: 1, fontSize: Typography.size.sm, color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
              {ride.riderName}
            </Text>
            {ride.riderRating != null && (
              <View style={[{ flexDirection: R, alignItems: 'center', gap: 3 }]}>
                <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>
                  {ride.riderRating.toFixed(1)}
                </Text>
              </View>
            )}
          </GlassView>
        )}

        {/* My rating of the rider */}
        {isCompleted && ride.myRating != null && (
          <GlassView style={[styles.card, { flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }]} borderRadius={20}>
            <Text style={[{ fontSize: Typography.size.sm, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              Your rating
            </Text>
            <View style={[{ flexDirection: R, gap: 2 }]}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <Star
                  key={idx}
                  size={16}
                  color={idx < (ride.myRating ?? 0) ? colors.accent : colors.mutedForeground + '4D'}
                  fill={idx < (ride.myRating ?? 0) ? colors.accent : 'transparent'}
                  strokeWidth={2}
                />
              ))}
            </View>
          </GlassView>
        )}

        {/* Need Help — always available from a ride's history detail */}
        <Pressable onPress={() => router.push('/support')}>
          <GlassView style={[styles.card, { flexDirection: R, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm }]} borderRadius={20}>
            <HelpCircle size={16} color={colors.foreground} strokeWidth={2} />
            <Text style={{ fontSize: Typography.size.sm, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
              Need Help?
            </Text>
          </GlassView>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: Spacing.xl },
  pageSubtitle: { fontSize: 13 },
  card: { padding: Spacing.lg, marginTop: Spacing.lg },
  mapCard: {
    marginTop: Spacing.lg,
    borderRadius: 20,
    overflow: 'hidden',
    height: 200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  mapSkeleton: { alignItems: 'center', justifyContent: 'center' },
  routeDots: { alignItems: 'center', paddingTop: Spacing.xs },
  dotTop: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 1, flex: 1, marginVertical: 3, minHeight: 20 },
  dotBottom: { width: 8, height: 8, borderRadius: 2 },
  addressText: { fontSize: Typography.size.sm },
  statCell: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  statDivider: { width: 1, alignSelf: 'stretch' },
  statValue: { fontSize: 15 },
  statLabel: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  centeredState: { marginTop: 40, alignItems: 'center', padding: Spacing.xxl, gap: 10 },
  stateTitle: { fontSize: Typography.size.md, textAlign: 'center' },
  splitRow: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  rowIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
