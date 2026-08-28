import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Calendar, CheckCircle, XCircle, Users } from 'lucide-react-native';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { formatCurrency } from '@/app/(shuttle)/bookings';

import type { DriverTrip } from '@/lib/types';

// Extracted verbatim from app/(shuttle)/bookings.tsx — pure presentational
// completed-trip list item, no behavior change.
export function CompletedTripCard({
  trip, colors,
}: {
  trip: DriverTrip;
  colors: ReturnType<typeof useColors>;
}) {
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;
  const netEarnings = formatCurrency(trip.earnings, t.egp);
  // trip.status carries the real backend status — a cancelled/no-show trip
  // used to render hardcoded green "Completed" with an earnings figure
  // attached regardless. Only "completed" gets the green treatment.
  const isCancelled = trip.status === 'cancelled';
  const statusColor = isCancelled ? '#ef4444' : '#22c55e';
  const statusColorDark = isCancelled ? '#dc2626' : '#16a34a';
  const StatusIcon = isCancelled ? XCircle : CheckCircle;
  const statusLabel = isCancelled ? t.status_cancelled : t.completed_label;
  const grossRevenue = trip.revenueAmount != null ? formatCurrency(trip.revenueAmount, t.egp) : null;
  const passengersLabel =
    trip.boardedPassengers != null && trip.totalPassengers != null
      ? `${trip.boardedPassengers} / ${trip.totalPassengers} ${t.pax_one}`
      : trip.boardedPassengers != null
      ? `${trip.boardedPassengers} ${t.pax_one}`
      : '—';

  return (
    <Pressable
      onPress={() => router.push({
        pathname: '/shuttle/history-detail' as any,
        params: {
          tripId: trip.id,
          routeName: trip.routeName ?? '',
          completedAt: trip.date ?? '',
          earnedAmount: trip.earnings != null ? String(trip.earnings) : '',
          passengerCount: trip.boardedPassengers != null ? String(trip.boardedPassengers) : '',
        },
      })}
    >
    <GlassView style={styles.tripCard} borderRadius={14}>
      <View style={[styles.tripCardAccent, { backgroundColor: statusColor }]} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text
          style={[styles.bookingCardRoute, { color: colors.foreground, textAlign: TA }]}
          numberOfLines={1}
        >
          {trip.routeName ?? t.shuttle_trip_default}
        </Text>
        {!!trip.direction && (
          <Text style={[styles.metaText, { color: colors.mutedForeground, textAlign: TA }]} numberOfLines={1}>
            {trip.direction === 'outbound' ? t.direction_outbound
              : trip.direction === 'return' ? t.direction_return
              : trip.direction}
          </Text>
        )}
        <View style={[styles.metaRow, { flexDirection: R }]}>
          {trip.date && (
            <>
              <Calendar size={11} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {trip.date}
              </Text>
              <Text style={[styles.dot, { color: colors.border }]}>·</Text>
            </>
          )}
          <Users size={11} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {passengersLabel}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: Spacing.xs }}>
        <Text style={[styles.earningsText, { color: statusColorDark }]}>
          {netEarnings}
        </Text>
        {grossRevenue && (
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {t.gross_revenue} {grossRevenue}
          </Text>
        )}
        <View style={[styles.completedBadge, { backgroundColor: `${statusColor}18` }]}>
          <StatusIcon size={9} color={statusColorDark} strokeWidth={2.5} />
          <Text style={[styles.completedBadgeText, { color: statusColorDark }]}>{statusLabel}</Text>
        </View>
      </View>
    </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bookingCardRoute: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: Typography.size.xs, fontFamily: 'Inter_400Regular' },
  dot: { fontSize: Typography.size.xs },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tripCardAccent: { width: 4, height: 36, borderRadius: 2 },
  earningsText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  completedBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
});
