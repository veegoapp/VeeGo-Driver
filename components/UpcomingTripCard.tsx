import { Calendar, ChevronRight, Clock, Users } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { type ShuttleBooking, type ShuttleLine } from '@/lib/shuttleContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

// Extracted verbatim from app/(shuttle)/home.tsx — pure presentational
// upcoming trip card displayed in the home screen list.
export function UpcomingTripCard({
  booking,
  line,
  colors,
  isRTL,
  onPress,
}: {
  booking: ShuttleBooking;
  line?: ShuttleLine;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <GlassView style={[styles.upcomingCard, { alignItems: 'flex-start' }]} borderRadius={16}>
        <View style={[styles.upcomingAccent, { backgroundColor: '#1e1e28', alignSelf: 'stretch', height: undefined }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.upcomingRouteName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>
            {(isRTL && booking.routeNameAr) ? booking.routeNameAr : booking.routeName}
          </Text>
          {(booking.fromStation || booking.toStation || line) && (
            <Text style={[{ fontSize: Typography.size.xs, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>
              {booking.fromStation ?? line?.from} → {booking.toStation ?? line?.to}
            </Text>
          )}
          {/* Date & Exact Time */}
          <View style={[styles.upcomingMeta, { flexDirection: R }]}>
            <Calendar size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.upcomingMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {booking.trip?.tripDatetimes?.[0]?.split('T')[0] ?? booking.weekStart}
            </Text>
            <Text style={[styles.upcomingMetaDot, { color: colors.border }]}>·</Text>
            <Clock size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.upcomingMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {booking.departureTime}
            </Text>
          </View>
          {/* Vehicle / Line info + Passenger Count */}
          <View style={[{ flexDirection: R, gap: 6, flexWrap: 'wrap', marginTop: 2 }]}>
            {line && line.vehicleType !== 'Unknown' && (
              <View style={[styles.vehicleBadge, { backgroundColor: '#1e1e2810', borderColor: '#1e1e2820' }]}>
                <Text style={[styles.vehicleBadgeText, { color: '#2d2d42', fontFamily: 'Inter_600SemiBold' }]}>
                  {line.vehicleType} · {line.lineNumber}
                </Text>
              </View>
            )}
            {line && (
              <View style={[styles.seatBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Users size={11} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.seatBadgeText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  {t.passengers_label_count}: {line.bookedSeats} / {line.totalSeats}
                </Text>
              </View>
            )}
          </View>
          {/* Passenger progress bar */}
          {line && line.totalSeats > 0 && (
            <View style={styles.paxBarWrap}>
              <View style={[styles.paxBarTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.paxBarFill,
                    {
                      width: `${Math.min(100, Math.round((line.bookedSeats / line.totalSeats) * 100))}%` as any,
                      backgroundColor: booking.trip?.thresholdMet === false ? '#F59E0B' : '#1e1e28',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.paxBarLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {line.bookedSeats}/{line.totalSeats}
              </Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', paddingTop: 2, gap: 6 }}>
          {booking.trip && !booking.trip.thresholdMet ? (
            <View style={[styles.upcomingStatusBadge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
              <Text style={[styles.upcomingStatusText, { color: '#92400E', fontFamily: 'Inter_700Bold' }]}>
                {t.status_pending}
              </Text>
            </View>
          ) : (
            <View style={[styles.upcomingStatusBadge, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
              <Text style={[styles.upcomingStatusText, { color: '#166534', fontFamily: 'Inter_700Bold' }]}>
                {t.active}
              </Text>
            </View>
          )}
          <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </View>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  upcomingCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 14, overflow: 'hidden' },
  upcomingAccent: { width: 4, height: 36, borderRadius: 2 },
  upcomingRouteName: { fontSize: Typography.size.sm },
  upcomingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  upcomingMetaText: { fontSize: Typography.size.xs },
  upcomingMetaDot: { fontSize: Typography.size.sm },
  upcomingStatusBadge: { paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1 },
  upcomingStatusText: { fontSize: 11, letterSpacing: 0.5 },
  paxBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs },
  paxBarTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  paxBarFill: { height: '100%', borderRadius: 2 },
  paxBarLabel: { fontSize: 10, minWidth: 32, textAlign: 'right' },
  vehicleBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1 },
  vehicleBadgeText: { fontSize: 11, letterSpacing: 0.5 },
  seatBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1 },
  seatBadgeText: { fontSize: Typography.size.xs },
});
