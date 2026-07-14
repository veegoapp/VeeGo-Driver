import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Calendar, CheckCircle, Users } from 'lucide-react-native';
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
  const { t } = useI18n();
  const netEarnings = formatCurrency(trip.earnings, t.egp);
  const grossRevenue = trip.revenueAmount != null ? formatCurrency(trip.revenueAmount, t.egp) : null;
  const passengersLabel =
    trip.boardedPassengers != null && trip.totalPassengers != null
      ? `${trip.boardedPassengers} / ${trip.totalPassengers} ${t.pax_one}`
      : trip.boardedPassengers != null
      ? `${trip.boardedPassengers} ${t.pax_one}`
      : '—';

  return (
    <View style={[styles.tripCard, { backgroundColor: '#fff', borderColor: colors.border }]}>
      <View style={[styles.tripCardAccent, { backgroundColor: '#22c55e' }]} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text
          style={[styles.bookingCardRoute, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {trip.routeName ?? t.shuttle_trip_default}
        </Text>
        <View style={styles.metaRow}>
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
        <Text style={[styles.earningsText, { color: '#16a34a' }]}>
          {netEarnings}
        </Text>
        {grossRevenue && (
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {t.gross_revenue} {grossRevenue}
          </Text>
        )}
        <View style={[styles.completedBadge, { backgroundColor: '#22c55e18' }]}>
          <CheckCircle size={9} color="#16a34a" strokeWidth={2.5} />
          <Text style={[styles.completedBadgeText, { color: '#16a34a' }]}>{t.completed_label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bookingCardRoute: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'flex-end' },
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
