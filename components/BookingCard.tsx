import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Calendar, Clock } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { type ShuttleBooking } from '@/lib/shuttleContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { getWeekBucket, formatWeekRange } from '@/app/(shuttle)/bookings';

// Extracted verbatim from app/(shuttle)/bookings.tsx — pure presentational
// booking list item, no behavior change.
export function BookingCard({
  booking, colors, onPress,
}: {
  booking: ShuttleBooking;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const { t, isRTL } = useI18n();
  const locale = isRTL ? 'ar-EG' : 'en-GB';
  // hasRenewal is display-only (pill badge) — driven by backend status
  const hasRenewal = booking.status === 'pending_renewal';

  const bucket = getWeekBucket(booking.weekStart);
  const weekLabel =
    bucket === 'current' ? t.current_week :
    bucket === 'next' ? t.next_week_label : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[styles.bookingCard, { backgroundColor: '#fff', borderColor: colors.border }]}>
        <View style={styles.bookingCardAccent} />
        <View style={{ flex: 1, gap: 5 }}>
          <Text
            style={[styles.bookingCardRoute, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {booking.routeName}
          </Text>
          <View style={styles.metaRow}>
            <Clock size={11} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {booking.departureTime}
            </Text>
            <Text style={[styles.dot, { color: colors.border }]}>·</Text>
            <Calendar size={11} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {formatWeekRange(booking.weekStart, booking.weekEnd, locale)}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {weekLabel ? (
            <View style={[styles.weekPill, { backgroundColor: '#1e1e2812' }]}>
              <Text style={[styles.weekPillText, { color: colors.primary }]}>
                {weekLabel}
              </Text>
            </View>
          ) : null}
          {booking.trip ? (
            !booking.trip.thresholdMet ? (
              <View style={[styles.renewalPill, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1 }]}>
                <Text style={[styles.renewalPillText, { color: '#92400E' }]}>
                  {t.status_pending}
                </Text>
              </View>
            ) : (
              <View style={[styles.renewalPill, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', borderWidth: 1 }]}>
                <Text style={[styles.renewalPillText, { color: '#166534' }]}>
                  {t.active}
                </Text>
              </View>
            )
          ) : null}
          {hasRenewal && (
            <View style={[styles.renewalPill, { backgroundColor: '#FEF3C718' }]}>
              <AlertTriangle size={9} color="#D97706" strokeWidth={2.5} />
              <Text style={styles.renewalPillText}>{t.renew_label}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bookingCardAccent: {
    width: 4,
    height: 36,
    borderRadius: 2,
    backgroundColor: '#1e1e28',
  },
  bookingCardRoute: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'flex-end' },
  metaText: { fontSize: Typography.size.xs, fontFamily: 'Inter_400Regular' },
  dot: { fontSize: Typography.size.xs },
  weekPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  weekPillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  renewalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  renewalPillText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#D97706',
  },
});
